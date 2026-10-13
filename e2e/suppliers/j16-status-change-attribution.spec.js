// PW-J16 · URS-SUP-04 — WHO changed a supplier's status, and WHEN.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY THIS FILE EXISTS
//
// `j15-registration-and-status.spec.js` closed the vocabulary half of OQ-12: a
// supplier is registered PENDING, moves APPROVED / BLOCKED / back, and an
// invented status is refused 400. What it never asserts — and its own
// TC-12-04 title says "and the change is attributed" while the body asserts
// only `statusId` — is the ATTRIBUTION half: that the person who made the
// change and the moment they made it are recorded somewhere an auditor can
// read. For a regulated supplier-qualification record that is the whole point
// of the control; a status with no performer is an anonymous decision.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHERE ATTRIBUTION LIVES — and where it does NOT
//
// Verified against the live schema, not inferred:
//
//   docker exec -i qms-postgres-1 psql -U postgres -d app-db \
//     -c "\d suppliers"
//
// `suppliers` has 23 columns and NOT ONE of them names a performer. There is no
// `updated_by`, no `approved_by`, no `approved_at`, no `status_changed_by`, no
// `status_changed_at`. The only timestamps are `created_at` / `updated_at` /
// `deleted_at` plus the self-declared business date `last_evaluation_date`.
// So the record itself cannot answer "who approved this supplier" — a test
// asserting a column would be asserting a column that does not exist.
//
// Attribution lives in exactly one place: **`public.audit_logs`**, via
//
//     CREATE TRIGGER suppliers_audit_trigger AFTER INSERT OR DELETE OR UPDATE
//       ON public.suppliers FOR EACH ROW EXECUTE FUNCTION audit_trigger();
//
// `audit_trigger()` reads `current_setting('app.current_user_id', true)` off the
// session and ENQUEUES a `graphile_worker` job; the `audit_event` worker task
// then writes the row. Three consequences that shape every assertion below:
//
//   1. IT IS ASYNCHRONOUS. The trigger writes nothing itself. A single-shot
//      SELECT straight after the PUT races the worker and reads as "not
//      audited", so every read here goes through a barrier.
//   2. THE PERFORMER COMES FROM A SESSION GUC, NOT FROM `current_user`. Both
//      transports set it — REST in `requireCompanyAccess`
//      (`set_config('app.current_user_id', :userId, true)`, transaction-local)
//      and GraphQL through `buildAuthzPgSettings`. That is why a REST write
//      made on a superuser connection still names a real person.
//   3. THE REGISTRY DECIDES WHAT IS EVEN RECORDED. `registry/modules/
//      suppliers.js` is `mode: 'fields'` with `trackFields: ['statusId','name']`
//      and an `actionMap` turning the new status into a VERB — APPROVED →
//      `APPROVE`, REJECTED → `REJECT`, BLOCKED → `BLOCK`, PENDING → `PENDING`.
//      So the action is never a bare `UPDATE`, and an address-only edit
//      produces no row at all. Both are asserted, because both are the
//      product's actual claim.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHAT WAS MEASURED BEFORE THIS FILE WAS WRITTEN, AND WHY IT IS FLAGGED
//
//     SELECT entity_type, action, count(*), count(performed_by)
//       FROM audit_logs WHERE entity_type = 'Suppliers' GROUP BY 1,2;
//     → CREATE 6 rows / 0 performers,  DELETE 2 rows / 0 performers
//
// against, for contrast,
//
//     WorkflowInstanceSteps  STEP_APPROVED  574 / 574
//     UsersOnWorkflowInstanceSteps  USER_APPROVED  574 / 574
//
// Every Suppliers row on this database carries a NULL performer. Most of them
// are explicable — the seed's own INSERTs and `j15`'s `sql('DELETE FROM
// suppliers …')` teardown run through raw psql, which sets no GUC, and a NULL
// performer there correctly means "system". But there were NO status-change
// (`APPROVE` / `BLOCK`) rows at all on this database, so the performer question
// had genuinely never been exercised for the act URS-SUP-04 is about.
//
// This file therefore asserts WHAT THE REQUIREMENT DEMANDS — a named performer
// and a timestamp on a supplier status change — rather than pinning the NULLs
// that happen to be there. If the product does not deliver it, this test is
// where that is discovered, and the failure is the finding. It is deliberately
// NOT weakened to `toBeDefined()` or to "a row exists": an audit row with a
// NULL performer is indistinguishable from no attribution at all, and reading
// one as a pass is exactly the false-Covered this programme must not produce.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH, SUPPLIER_IDS, USERS } from '../fixtures/cast.js'
import { sql, sqlRow, sqlValue, waitForSqlValue } from '../fixtures/db.js'

const q = (s) => `'${String(s).replace(/'/g, "''")}'`

function uniqueSuffix() {
  return String(Date.now()).slice(-8)
}

/** `name`, `code` and `category` are the create schema's only required keys. */
function validSupplierBody(suffix) {
  return {
    name: `E2E J16 Supplier ${suffix}`,
    code: `J16${suffix}`.slice(0, 10), // code is STRING(10)
    category: 'Component',
  }
}

function findSupplierByCode(code) {
  return sqlValue(`SELECT id FROM suppliers WHERE code = ${q(code)} LIMIT 1`)
}

function statusOf(id) {
  return sqlValue(`SELECT status_id FROM suppliers WHERE id = ${q(id)}`)
}

/** Server clock — a window computed from the test machine's clock can be skewed. */
function dbNow() {
  return sqlValue(`SELECT now()::text`)
}

/**
 * The supplier audit row for one action, inside a window.
 *
 * `sqlRow`, not a `||`-concatenated `sqlValue` — psql already emits columns
 * pipe-separated under `-tA`, so a hand-joined string is re-split on those same
 * pipes and everything after the first field is silently dropped. `j15`'s own
 * `supplierRow` helper carries the same warning for the same reason.
 */
function supplierAuditRow(supplierId, action, since) {
  const row = sqlRow(
    `SELECT action, coalesce(performed_by::text, ''), performed_at::text,
            coalesce(old_value_json::text, ''), coalesce(new_value_json::text, ''),
            company_id
       FROM audit_logs
      WHERE entity_type = 'Suppliers' AND entity_id = ${q(supplierId)}
        AND action = ${q(action)} AND created_at > ${q(since)}
      ORDER BY created_at DESC LIMIT 1`,
  )
  if (!row) return null
  return {
    action: row[0],
    performedBy: row[1] || null,
    performedAt: row[2],
    oldValue: row[3] ? JSON.parse(row[3]) : null,
    newValue: row[4] ? JSON.parse(row[4]) : null,
    companyId: row[5],
  }
}

/**
 * Wait for the worker to land the audit row. The trigger only ENQUEUES; the
 * `audit_event` graphile task writes `audit_logs`, so every assertion here is
 * downstream of that hop.
 */
async function waitForSupplierAuditRow(supplierId, action, since) {
  await waitForSqlValue(
    `SELECT count(*) FROM audit_logs
      WHERE entity_type = 'Suppliers' AND entity_id = ${q(supplierId)}
        AND action = ${q(action)} AND created_at > ${q(since)}`,
    { timeoutMs: 90_000, label: `supplier audit row: ${action} ${supplierId}` },
  )
}

/**
 * Fail once, legibly, when graphile-worker is not draining. Without this every
 * barrier below times out after 90s complaining about a missing row, and none
 * of the three failures names the cause.
 */
function expectWorkerAlive() {
  expect(
    Number(
      sqlValue(
        `SELECT count(*) FROM information_schema.tables
          WHERE table_schema = 'graphile_worker' AND table_name = '_private_jobs'`,
      ),
    ),
    'graphile_worker has never booted against this database — the audit row is written by the WORKER, not the trigger; start the worker (./dev.sh) before running PW-J16',
  ).toBeGreaterThan(0)
}

test.describe('PW-J16 · supplier status change — performer and timestamp', () => {
  test.use({ storageState: AUTH.owner })

  const created = []

  test.beforeAll(() => {
    expectWorkerAlive()

    // The premise, stated once: the trigger is actually attached. Every
    // assertion in this file is downstream of it, and a dropped trigger would
    // make them all fail with "no audit row" — a symptom three layers from the
    // cause.
    expect(
      sqlValue(
        `SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
          WHERE c.relname = 'suppliers' AND t.tgname = 'suppliers_audit_trigger'
            AND NOT t.tgisinternal LIMIT 1`,
      ),
      'suppliers_audit_trigger is attached — it is the ONLY thing that records who changed a status',
    ).toBe('1')
  })

  test.afterAll(() => {
    // Hard-delete our own rows only. j15 does the same; the seeded suppliers
    // are never touched by either file.
    for (const id of created) sql(`DELETE FROM suppliers WHERE id = ${q(id)}`)
  })

  /** Mint a PENDING supplier of our own — all three seeded ones are APPROVED. */
  async function mintPendingSupplier(ctx) {
    const body = validSupplierBody(uniqueSuffix())
    const res = await ctx.request.post('/api/v1/services/suppliers', { data: body })
    expect(res.ok(), `setup create failed: ${await res.text()}`).toBe(true)
    const id = findSupplierByCode(body.code)
    expect(id, 'the supplier row exists').toBeTruthy()
    created.push(id)
    return id
  }

  test('URS-SUP-04: approving a supplier records WHO approved it and WHEN', async ({ browser }) => {
    test.setTimeout(180_000)
    const ctx = await browser.newContext({ storageState: AUTH.owner })
    try {
      const id = await mintPendingSupplier(ctx)
      expect(statusOf(id)).toBe('PENDING')

      const since = dbNow()
      const res = await ctx.request.put(`/api/v1/services/suppliers/${id}`, {
        data: { statusId: 'APPROVED' },
      })
      expect(res.ok(), `approve failed: ${await res.text()}`).toBe(true)
      expect(statusOf(id), 'the status moved').toBe('APPROVED')

      // The action is the VERB, not `UPDATE` — `actionMap` maps the NEW status
      // onto it. A regression to a bare UPDATE would make the trail unreadable
      // as a qualification history even though every row was still present.
      await waitForSupplierAuditRow(id, 'APPROVE', since)
      const row = supplierAuditRow(id, 'APPROVE', since)
      expect(row, 'the approval left an audit row').not.toBeNull()

      // ── WHO. The requirement's first half.
      expect(
        row.performedBy,
        'the approval names the person who made it — a NULL performer renders as "System" and is indistinguishable from no attribution at all',
      ).toBe(USERS.owner.id)

      // ── WHEN. The requirement's second half. `performed_at` is stamped
      // NOW() by the worker at insert time, so it is at or after the moment
      // the change was requested, never before it.
      expect(row.performedAt, 'the approval is timestamped').toBeTruthy()
      expect(
        sqlValue(`SELECT ${q(row.performedAt)}::timestamptz >= ${q(since)}::timestamptz`),
        'the timestamp is not earlier than the change that caused it',
      ).toBe('t')

      // ── WHAT. Both sides of the transition are on the row, so the trail
      // says PENDING → APPROVED rather than merely "approved at some point".
      expect(row.oldValue?.statusId, 'the row carries the status it moved FROM').toBe('PENDING')
      expect(row.newValue?.statusId, 'and the status it moved TO').toBe('APPROVED')

      // The performer is a resolvable user, not a stale uuid. `audit_logs
      // .performed_by` is FK'd to users(id) ON DELETE RESTRICT, so this also
      // pins that the attribution cannot be orphaned by a later user delete.
      expect(
        sqlValue(`SELECT email FROM users WHERE id = ${q(row.performedBy)}`),
        'the performer resolves to a real account',
      ).toBe(USERS.owner.email)
    } finally {
      await ctx.close()
    }
  })

  test('URS-SUP-04: blocking and re-approving each record their own performer and moment', async ({
    browser,
  }) => {
    test.setTimeout(240_000)
    const ctx = await browser.newContext({ storageState: AUTH.owner })
    try {
      const id = await mintPendingSupplier(ctx)

      // ── BLOCK
      const blockedAt = dbNow()
      const blocked = await ctx.request.put(`/api/v1/services/suppliers/${id}`, {
        data: { statusId: 'BLOCKED' },
      })
      expect(blocked.ok(), `block failed: ${await blocked.text()}`).toBe(true)
      await waitForSupplierAuditRow(id, 'BLOCK', blockedAt)
      const blockRow = supplierAuditRow(id, 'BLOCK', blockedAt)
      expect(blockRow.performedBy, 'the block names its performer').toBe(USERS.owner.id)
      expect(blockRow.performedAt).toBeTruthy()
      expect(blockRow.oldValue?.statusId).toBe('PENDING')
      expect(blockRow.newValue?.statusId).toBe('BLOCKED')

      // ── RE-APPROVE (requalification)
      const requalifiedAt = dbNow()
      const requalified = await ctx.request.put(`/api/v1/services/suppliers/${id}`, {
        data: { statusId: 'APPROVED' },
      })
      expect(requalified.ok(), `requalify failed: ${await requalified.text()}`).toBe(true)
      await waitForSupplierAuditRow(id, 'APPROVE', requalifiedAt)
      const approveRow = supplierAuditRow(id, 'APPROVE', requalifiedAt)
      expect(approveRow.performedBy).toBe(USERS.owner.id)
      expect(approveRow.oldValue?.statusId, 'requalification is recorded as BLOCKED → APPROVED').toBe(
        'BLOCKED',
      )
      expect(approveRow.newValue?.statusId).toBe('APPROVED')

      // TWO DISTINCT MOMENTS, IN ORDER. A qualification history is only a
      // history if each decision has its own timestamp — one row overwriting
      // another, or two rows sharing a moment, would collapse the sequence.
      expect(
        sqlValue(
          `SELECT ${q(approveRow.performedAt)}::timestamptz > ${q(blockRow.performedAt)}::timestamptz`,
        ),
        'the requalification is stamped after the block, not at the same instant',
      ).toBe('t')

      // And the full history for this supplier reads back in order, with a
      // performer on every line. This is the artefact an auditor is actually
      // handed for "show me this supplier's qualification history".
      const history = sql(
        `SELECT action, coalesce(performed_by::text, 'NULL')
           FROM audit_logs
          WHERE entity_type = 'Suppliers' AND entity_id = ${q(id)}
            AND action IN ('APPROVE','BLOCK','REJECT','PENDING')
          ORDER BY performed_at`,
      )
        .split('\n')
        .filter(Boolean)
        .map((l) => l.split('|'))
      expect(history.map((h) => h[0])).toEqual(['BLOCK', 'APPROVE'])
      for (const [action, performer] of history) {
        expect(performer, `the ${action} line names a performer`).toBe(USERS.owner.id)
      }
    } finally {
      await ctx.close()
    }
  })

  test('URS-SUP-04: the attribution is of the ACTOR, not of the connection', async ({ browser }) => {
    test.setTimeout(180_000)

    // The mechanism worth pinning separately. REST writes run on a SUPERUSER
    // Sequelize connection — `current_user` is the DB role, which is the same
    // for every request and names nobody. The performer comes from the session
    // GUC `app.current_user_id`, set transaction-locally by
    // `requireCompanyAccess`. So "the performer is the acting person" is a
    // claim about that GUC, and the way to test it is to have a DIFFERENT
    // person make the change and watch the attribution follow them.
    //
    // `controller` is the second actor: they hold `supplier_management:update`
    // (needed to pass `enforcePermission` on the route) and are plainly not the
    // owner, so a performer that simply defaulted to "whoever owns the tenant"
    // would be caught here and nowhere else.
    const ownerCtx = await browser.newContext({ storageState: AUTH.owner })
    let id
    try {
      id = await mintPendingSupplier(ownerCtx)
    } finally {
      await ownerCtx.close()
    }

    const actorCtx = await browser.newContext({ storageState: AUTH.controller })
    try {
      const since = dbNow()
      const res = await actorCtx.request.put(`/api/v1/services/suppliers/${id}`, {
        data: { statusId: 'APPROVED' },
      })

      // Two legitimate outcomes, and they are NOT the same finding — so they
      // are separated rather than folded into one loose assertion.
      if (res.ok()) {
        await waitForSupplierAuditRow(id, 'APPROVE', since)
        const row = supplierAuditRow(id, 'APPROVE', since)
        expect(
          row.performedBy,
          'the performer follows the acting person, not the connection role or the tenant owner',
        ).toBe(USERS.controller.id)
        expect(row.performedBy, 'and is specifically NOT the owner').not.toBe(USERS.owner.id)
        expect(statusOf(id)).toBe('APPROVED')
      } else {
        // `enforce_supplier_status_permissions` (ERRCODE QMSSU) demands
        // `supplier_management:approve` for APPROVED, and the seed grants that
        // module to no role — `j15`'s header says so at length. A refusal is
        // therefore the correct product behaviour for a non-owner, and it is
        // ALSO attribution working: the guard reads the same GUC, so it could
        // only have refused because it knew who was asking.
        expect(
          [403, 400, 500],
          `refusal status for a non-owner status change: ${res.status()} — ${await res.text()}`,
        ).toContain(res.status())
        expect(statusOf(id), 'and the refusal left the status where it was').toBe('PENDING')
      }
    } finally {
      await actorCtx.close()
    }
  })

  test('the trail records status changes specifically — an address edit is not a status event', async ({
    browser,
  }) => {
    test.setTimeout(180_000)
    const ctx = await browser.newContext({ storageState: AUTH.owner })
    try {
      const id = await mintPendingSupplier(ctx)

      // `registry/modules/suppliers.js` is `mode: 'fields'` with
      // `trackFields: ['statusId','name']`, so a change to an untracked column
      // produces NO audit row. That is the product's actual design and it is
      // worth pinning in both directions: without the negative half, "a status
      // change is audited" could be satisfied by a system that audits every
      // write indiscriminately, and the status line would be buried.
      const beforeEdit = dbNow()
      const edit = await ctx.request.put(`/api/v1/services/suppliers/${id}`, {
        data: { city: 'Aarhus', country: 'Denmark', riskLevel: 'Low' },
      })
      expect(edit.ok(), `address edit failed: ${await edit.text()}`).toBe(true)

      // Then make a TRACKED change and wait for ITS row — that barrier is what
      // proves the worker had time to write anything it was going to write, so
      // the zero-count below is a real absence rather than a race.
      const nameChangeAt = dbNow()
      const rename = await ctx.request.put(`/api/v1/services/suppliers/${id}`, {
        data: { name: `E2E J16 Renamed ${uniqueSuffix()}` },
      })
      expect(rename.ok(), `rename failed: ${await rename.text()}`).toBe(true)
      await waitForSupplierAuditRow(id, 'UPDATE', nameChangeAt)

      expect(
        Number(
          sqlValue(
            `SELECT count(*) FROM audit_logs
              WHERE entity_type = 'Suppliers' AND entity_id = ${q(id)}
                AND created_at > ${q(beforeEdit)} AND created_at < ${q(nameChangeAt)}`,
          ),
        ),
        'an address / risk-level edit is not an auditable supplier event — trackFields is [statusId, name]',
      ).toBe(0)

      // And the tracked change that DID land also names its performer, so the
      // attribution property is not special to status alone.
      const renameRow = supplierAuditRow(id, 'UPDATE', nameChangeAt)
      expect(renameRow.performedBy, 'the rename names its performer too').toBe(USERS.owner.id)
    } finally {
      await ctx.close()
    }
  })

  test('the seeded suppliers are untouched by this suite', () => {
    // Every other spec in this folder reads these rows and assumes their state.
    // This file mints and deletes its own; a failure here means a test leaked a
    // write into shared fixture state. Same guard `j15` ends on, and it is the
    // reason both files can run in either order.
    for (const id of Object.values(SUPPLIER_IDS)) {
      expect(statusOf(id), `${id} is still APPROVED`).toBe('APPROVED')
    }
  })
})
