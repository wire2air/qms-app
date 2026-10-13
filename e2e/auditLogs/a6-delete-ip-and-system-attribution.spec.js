// ALD-A6 — URS-SEC-07, the three halves of the audit record that ALD-A3 left
// untested: DELETE capture, the IP address, and system-vs-person attribution.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY A SECOND FILE RATHER THAN MORE ASSERTIONS IN ALD-A3
//
// ALD-A3 proves that a CREATE and a tracked UPDATE reach `audit_logs` carrying
// the right diff, and that the row renders. URS-SEC-07 asks for more than that:
// "changes are recorded with user, timestamp and old/new values" is only a
// complete control if REMOVAL is recorded too, if the record says WHERE the
// actor was, and if an act with no interactive actor is distinguishable from
// one with a person behind it. All three run through code paths ALD-A3 never
// touches, and each has already failed silently once in this codebase.
//
// ─────────────────────────────────────────────────────────────────────────────
// PART 1 — DELETE (the destructive act, which is the one worth recording)
//
// Two mechanically different operations both have to land, and only one of them
// is a SQL DELETE:
//
//   HARD DELETE  `departments` is not paranoid on the probe path — the fixture's
//                `removeProbeDepartment` issues a literal `DELETE FROM
//                departments`. That fires `audit_trigger()`'s TG_OP = 'DELETE'
//                branch, whose payload carries `old` and a NULL `new`, and
//                `buildAuditValues` (worker/services/audit/diffUtils.js:98)
//                returns `{ oldValueJson: filterRow(old), newValueJson: null }`
//                — the full tracked snapshot of what was destroyed.
//
//   SOFT DELETE  every paranoid table in this schema deletes by UPDATE-ing
//                `deleted_at`, which arrives as TG_OP = 'UPDATE'. It is recorded
//                as a DELETE only because `departmentSites.js` maps it:
//                `actionMap: { deletedAt: softDeleteAction }`. Before that
//                config existed, `deletedAt` was not in trackFields at all, so
//                `hasRelevantChanges()` returned false and DELETING A DEPARTMENT
//                PRODUCED NO AUDIT ROW WHATSOEVER. That is not hypothetical —
//                it is written up in departmentSitesRegistry.test.js's header as
//                one of the defects that config was created to close.
//
// The unit test pins the mapping against a synthetic payload. This pins it
// against the real trigger → real worker → real table, which is the only place
// the three can disagree.
//
// ─────────────────────────────────────────────────────────────────────────────
// PART 2 — IP ADDRESS, and the one honest thing to say about it
//
// The column is populated from a GUC, not from the worker: `audit_trigger()`
// reads `current_setting('app.current_user_ip', true)` into the payload, and
// `handleDefault` copies it to `entry.ipAddress`. The GUC is set by
// `api/config/authzPgSettings.js:58` on the GraphQL path and by
// `api/utils/permissions.js:510` on the REST path — i.e. only by a real HTTP
// request. A psql-driven probe can set it too, and the test below does exactly
// that, because that is the only way to assert the plumbing END TO END without
// making the assertion a hostage to which port the dev stack bound.
//
// Measured on app-db 2026-09-23, and it is why the browser leg of this test is
// shaped the way it is:
//
//     SELECT count(*), count(ip_address) FROM audit_logs;  → 36853 | 22686
//
// So ~62% of rows carry one and the rest do not, which is consistent with the
// GUC being present on request paths and absent on worker/migration ones.
//
// ⚠ THE IP IS NEVER RENDERED ON SCREEN. Not on `/audit-logs`, not in the
// per-record dialog: `AuditLogsItem.vue` prints `by {{ performerName }}` and the
// timestamp, and `AuditLogsDiffViewer.vue` prints the field diff. Grepping
// `ipAddress` across `src/components/auditLog/` returns exactly one rendering
// site — the CSV export's `'IP Address'` column in `AuditLogDialog.vue:150`.
// This file therefore asserts the IP at the DATABASE and refuses to pretend the
// screen shows it; the export leg is ALD-A7's (URS-SEC-09), where it belongs.
//
// ─────────────────────────────────────────────────────────────────────────────
// PART 3 — SYSTEM vs PERSON, and why a NULL actor is a FEATURE here
//
// `worker/tasks/audit_event.js` used to open with `if (payload.user_id) { … }
// else { warn }`, so every state change made by a cron sweep — periodic reviews,
// training matrix assignment, SLA scans, document set-effective, assignment
// generation, thirteen worker paths in its header's list — ENQUEUED its audit
// job, ran it, and THREW THE ROW AWAY. Measured at the time: 50,355 audit rows
// and EXACTLY ZERO with `performed_by IS NULL`, which is the fingerprint of the
// gate rather than evidence of complete attribution.
//
// The gate is gone. A payload with no `user_id` now writes `performed_by = NULL`,
// and `AuditLogsItem.vue:24` renders that as the literal word **System**:
//
//     const performerName = computed(() => {
//       if (!performer.value) return 'System'
//       …
//
// So the requirement's "system-vs-person attribution" is a real, testable,
// two-sided property: the SAME subject, mutated twice in the same run, once with
// `app.current_user_id` set and once without, must produce two rows that a
// reader can tell apart — on the page as a name versus "System", and in the
// table as a uuid versus NULL.
//
// ⚠ ONE TRAP THE TEST IS BUILT AROUND. `AuditLogsItem` renders
// `v-if="resolvedEntity"`, so a row whose subject cannot be resolved out of
// IndexedDB is DELETED FROM THE DOM rather than shown unlabelled. A hard-deleted
// department cannot resolve — the row is gone from `departments`, so
// ENTITY_LABEL_RESOLVERS returns null. That means the DELETE row provably
// reaches `audit_logs` and provably does NOT reach the page, and the honest
// thing is to assert each where it is true rather than to pick the surface that
// flatters the product. See the KNOWN-BEHAVIOUR note on the browser test.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH, COMPANY_ID, USERS } from '../fixtures/cast.js'
import { sql, sqlRow, sqlValue } from '../fixtures/db.js'
import {
  PROBE_DEPARTMENTS,
  TRAIL_SYNC_TIMEOUT,
  auditRows,
  dbNow,
  gotoAuditLogs,
  seedProbeDepartment,
  waitForAuditRow,
} from '../fixtures/auditLogs.js'

const DEPT = PROBE_DEPARTMENTS.primary
// A second, independent subject so the system-attributed leg does not have to
// share a row window with the person-attributed one. `foreign` is the fixture's
// other site-less department — same visibility properties, different id.
const FOREIGN = PROBE_DEPARTMENTS.foreign

/** The probe IP. Deliberately not a real address any request could carry. */
const PROBE_IP = '203.0.113.77' // TEST-NET-3 (RFC 5737) — never routable.

/**
 * One audit row as the table holds it, including the two columns ALD-A3 never
 * reads: `ip_address` and a NULL-able `performed_by`.
 */
function auditRow(entityId, action, since) {
  const row = sqlRow(
    `SELECT action, performed_by, ip_address,
            coalesce(old_value_json::text, ''), coalesce(new_value_json::text, '')
       FROM audit_logs
      WHERE entity_id = '${entityId}' AND action = '${action}' AND created_at > '${since}'
      ORDER BY created_at DESC LIMIT 1`,
  )
  expect(row, `an audit row exists for ${action} ${entityId}`).not.toBeNull()
  return {
    action: row[0],
    performedBy: row[1] || null,
    ipAddress: row[2] || null,
    oldValue: row[3] ? JSON.parse(row[3]) : null,
    newValue: row[4] ? JSON.parse(row[4]) : null,
  }
}

/**
 * Run DML with BOTH audit GUCs set — the actor AND the address.
 *
 * `fixtures/auditLogs.js`'s own `sqlAsActor` sets only `app.current_user_id`,
 * which is right for the journeys that only care about attribution. This one
 * additionally sets `app.current_user_ip`, mirroring what
 * `authzPgSettings.js` does on a real request, because the IP half of
 * URS-SEC-07 cannot be observed otherwise.
 *
 * Session-level (`false` for is_local) and in one `psql -c`, so the set_configs
 * and the DML share a session — the same reason the fixture's helper does.
 */
function sqlAsActorFromIp(actorId, ip, statements) {
  return sql(
    `SELECT set_config('app.current_user_id', '${actorId}', false);
     SELECT set_config('app.current_user_ip', '${ip}', false);
     ${statements}`,
  )
}

/** Run DML with NEITHER GUC set — a system actor, as a worker connection is. */
function sqlAsSystem(statements) {
  return sql(
    `SELECT set_config('app.current_user_id', '', false);
     SELECT set_config('app.current_user_ip', '', false);
     ${statements}`,
  )
}

test.describe('ALD-A6 · URS-SEC-07 — deletion, address and actor kind', () => {
  test('a HARD DELETE is captured, with the destroyed row as its old value', async () => {
    test.setTimeout(180_000)

    // Arrange: the subject must exist before it can be destroyed, and its
    // CREATE must have LANDED first. Without that barrier the DELETE job can
    // overtake the CREATE job (graphile_worker runs jobs concurrently) and the
    // window query below could read the CREATE as the newest row.
    const createdAt = dbNow()
    seedProbeDepartment(DEPT, USERS.owner.id)
    await waitForAuditRow({
      entityType: 'Departments',
      entityId: DEPT.id,
      action: 'CREATE',
      since: createdAt,
    })

    // Act. A literal SQL DELETE, attributed and addressed — the destructive act
    // URS-SEC-07 exists for.
    const since = dbNow()
    sqlAsActorFromIp(
      USERS.owner.id,
      PROBE_IP,
      `DELETE FROM departments WHERE id = '${DEPT.id}';`,
    )
    expect(
      sqlValue(`SELECT count(*) FROM departments WHERE id = '${DEPT.id}'`),
      'the row really is gone — this is a destruction, not a status change',
    ).toBe('0')

    await waitForAuditRow({
      entityType: 'Departments',
      entityId: DEPT.id,
      action: 'DELETE',
      since,
    })

    const deleted = auditRow(DEPT.id, 'DELETE', since)
    expect(deleted.action, 'the removal is recorded as a removal').toBe('DELETE')
    expect(deleted.performedBy, 'attributed to the person who did it').toBe(USERS.owner.id)

    // THE POINT OF A DELETE ROW. An audit trail that records only that
    // something was deleted cannot answer "what was lost", which is the one
    // question a deletion raises. `buildAuditValues`'s DELETE branch returns the
    // filtered OLD row and a NULL new row, so both halves are asserted — a
    // future change that swapped the sides would still produce a row and would
    // still say DELETE.
    expect(deleted.newValue, 'a DELETE has nothing to become').toBeNull()
    expect(deleted.oldValue, 'and carries what was destroyed').not.toBeNull()
    expect(
      Object.keys(deleted.oldValue).sort(),
      'the full tracked snapshot by name — a registry drifted off the schema yields a NON-EMPTY object missing exactly the fields that matter',
    ).toEqual(
      ['code', 'deletedAt', 'description', 'id', 'name', 'siteId', 'supervisorUserId'].sort(),
    )
    expect(deleted.oldValue.name, 'including the label a reader identifies it by').toBe(DEPT.name)
    expect(deleted.oldValue.code).toBe(DEPT.code)
  })

  test('the IP address the act came from is on the row', async () => {
    test.setTimeout(180_000)

    // Re-seeded rather than reused: the test above destroys the subject, and
    // Playwright does not guarantee these run in file order under a worker
    // count > 1. Each test arranges its own subject.
    seedProbeDepartment(DEPT, USERS.owner.id)

    const since = dbNow()
    const tag = `ALD-A6 ip ${Date.now()}`
    sqlAsActorFromIp(
      USERS.owner.id,
      PROBE_IP,
      `UPDATE departments SET description = '${tag}', updated_at = NOW()
        WHERE id = '${DEPT.id}';`,
    )
    await waitForAuditRow({
      entityType: 'Departments',
      entityId: DEPT.id,
      action: 'UPDATE',
      since,
    })

    const updated = auditRow(DEPT.id, 'UPDATE', since)
    expect(updated.newValue.description, 'the right row — the value we just wrote').toBe(tag)

    // The whole hop: GUC → `audit_trigger()`'s jsonb payload → graphile_worker
    // job → `handleDefault`'s `ipAddress` → the INSERT's $7. Any break in it
    // yields NULL rather than an error, which is why this is asserted as an
    // exact value and not merely as "not null": a hard-coded placeholder or a
    // mis-wired column would satisfy the weaker form.
    expect(
      updated.ipAddress,
      'the address the change was made from is recorded verbatim',
    ).toBe(PROBE_IP)

    // ── The negative control. Without it, "the IP is on the row" is equally
    // consistent with the column being filled from something other than the
    // session — a constant, the server's own address, the previous row's value.
    // Same table, same statement shape, same run; only the GUC differs.
    const noIpSince = dbNow()
    const noIpTag = `ALD-A6 no-ip ${Date.now()}`
    sql(
      `SELECT set_config('app.current_user_id', '${USERS.owner.id}', false);
       SELECT set_config('app.current_user_ip', '', false);
       UPDATE departments SET description = '${noIpTag}', updated_at = NOW()
        WHERE id = '${DEPT.id}';`,
    )
    await waitForAuditRow({
      entityType: 'Departments',
      entityId: DEPT.id,
      action: 'UPDATE',
      since: noIpSince,
    })
    const noIp = auditRow(DEPT.id, 'UPDATE', noIpSince)
    expect(noIp.newValue.description, 'the control row is the one we just wrote').toBe(noIpTag)
    expect(
      noIp.ipAddress,
      'and with no address in the session the column is NULL, not a fabricated value',
    ).toBeNull()
    expect(
      noIp.performedBy,
      'while the actor — a separate GUC — is still recorded, so this is not a broken pipeline',
    ).toBe(USERS.owner.id)
  })

  test('a system act and a person act are distinguishable in the table', async () => {
    test.setTimeout(180_000)

    seedProbeDepartment(FOREIGN, USERS.owner.id)

    // ── The PERSON leg.
    const personSince = dbNow()
    const personTag = `ALD-A6 person ${Date.now()}`
    sqlAsActorFromIp(
      USERS.owner.id,
      PROBE_IP,
      `UPDATE departments SET description = '${personTag}', updated_at = NOW()
        WHERE id = '${FOREIGN.id}';`,
    )
    await waitForAuditRow({
      entityType: 'Departments',
      entityId: FOREIGN.id,
      action: 'UPDATE',
      since: personSince,
    })
    const person = auditRow(FOREIGN.id, 'UPDATE', personSince)
    expect(person.newValue.description).toBe(personTag)
    expect(person.performedBy, 'a person act names the person').toBe(USERS.owner.id)

    // ── The SYSTEM leg. No GUCs at all — exactly the shape of a graphile_worker
    // connection, which is where the thirteen worker write paths in
    // `worker/tasks/audit_event.js`'s header come from.
    //
    // THIS IS THE ROW THE PRODUCT USED TO THROW AWAY. The old gate
    // (`if (payload.user_id) { … } else { warn }`) dropped it, logged a warning
    // nobody read, and left `audit_logs` with 50,355 rows and zero NULL
    // performers — a table that LOOKED perfectly attributed because the
    // unattributed half had been discarded. A regression here is therefore not
    // a wrong value, it is a MISSING ROW, and `waitForAuditRow` failing is the
    // correct way for that to surface.
    const systemSince = dbNow()
    const systemTag = `ALD-A6 system ${Date.now()}`
    sqlAsSystem(
      `UPDATE departments SET description = '${systemTag}', updated_at = NOW()
        WHERE id = '${FOREIGN.id}';`,
    )
    await waitForAuditRow({
      entityType: 'Departments',
      entityId: FOREIGN.id,
      action: 'UPDATE',
      since: systemSince,
    })
    const system = auditRow(FOREIGN.id, 'UPDATE', systemSince)
    expect(system.newValue.description, 'the system leg landed').toBe(systemTag)
    expect(
      system.performedBy,
      'and an act with no interactive user records NULL — the schema’s own representation of "system", not a synthetic user row',
    ).toBeNull()

    // The two together are the requirement. Asserting only the NULL would pass
    // on a pipeline that had lost attribution entirely.
    expect(
      person.performedBy !== system.performedBy,
      'the two acts are distinguishable — which is what "system-vs-person attribution" means',
    ).toBeTruthy()

    // And the column really is nullable by design rather than by accident: the
    // FK to users(id) is ON DELETE RESTRICT, so a synthetic "System" user would
    // have to be a real, listable, licensable person. NULL is the shape the
    // schema was built for.
    expect(
      sqlValue(
        `SELECT is_nullable FROM information_schema.columns
          WHERE table_name = 'audit_logs' AND column_name = 'performed_by'`,
      ),
      'performed_by is nullable — every other identity column on this table is NOT NULL',
    ).toBe('YES')
  })

  test('the page tells a reader which acts were nobody’s', async ({ browser }) => {
    test.setTimeout(TRAIL_SYNC_TIMEOUT + 120_000)

    // Both rows written immediately before the page opens, so both sit at the
    // top of the CREATED_AT_DESC bootstrap page and inside the page's own
    // `.limit(200)` window (the reasoning ALD-A3 documents).
    seedProbeDepartment(FOREIGN, USERS.owner.id)

    const personSince = dbNow()
    const personTag = `ALD-A6 ui person ${Date.now()}`
    sqlAsActorFromIp(
      USERS.owner.id,
      PROBE_IP,
      `UPDATE departments SET description = '${personTag}', updated_at = NOW()
        WHERE id = '${FOREIGN.id}';`,
    )
    await waitForAuditRow({
      entityType: 'Departments',
      entityId: FOREIGN.id,
      action: 'UPDATE',
      since: personSince,
    })

    const systemSince = dbNow()
    const systemTag = `ALD-A6 ui system ${Date.now()}`
    sqlAsSystem(
      `UPDATE departments SET description = '${systemTag}', updated_at = NOW()
        WHERE id = '${FOREIGN.id}';`,
    )
    await waitForAuditRow({
      entityType: 'Departments',
      entityId: FOREIGN.id,
      action: 'UPDATE',
      since: systemSince,
    })

    const ctx = await browser.newContext({ storageState: AUTH.auditor })
    try {
      const page = await ctx.newPage()
      await gotoAuditLogs(page)

      // The subject resolves for every persona — a NULL-`site_id` department is
      // released by `departments_sel` to the whole tenant — so a missing row
      // here is an audit-permission result and cannot be a visibility one.
      const rows = auditRows(page).filter({ hasText: FOREIGN.name })
      await expect(rows.first(), 'the subject’s changes are on the trail page').toBeVisible({
        timeout: TRAIL_SYNC_TIMEOUT,
      })

      // ── The person row names the person.
      const personRow = rows.filter({ hasText: USERS.owner.name }).first()
      await expect(
        personRow,
        'a change a person made is attributed to them by name',
      ).toBeVisible({ timeout: TRAIL_SYNC_TIMEOUT })

      // ── The system row says System, which is the literal string
      // `AuditLogsItem.vue:24` falls back to when `performedBy` resolves to no
      // user. Scoped to a row for THIS subject so a system row belonging to some
      // other module's worker sweep cannot satisfy it.
      const systemRow = rows.filter({ hasText: 'System' }).first()
      await expect(
        systemRow,
        'and a change nobody made is labelled System — not blank, and not the last person who touched it',
      ).toBeVisible({ timeout: TRAIL_SYNC_TIMEOUT })

      // Expand it and confirm it is OUR system row rather than an unrelated one
      // that happens to be on screen. Without this the assertion above is
      // satisfied by any worker-written row in the tenant.
      await systemRow.click()
      await expect(
        page.getByText(systemTag, { exact: false }).first(),
        'and it is the act this test performed, carrying its diff',
      ).toBeVisible({ timeout: 30_000 })

      // ── KNOWN BEHAVIOUR, pinned rather than asserted as a pass.
      //
      // The IP address is NOT on this page. It is captured (asserted above at
      // the database) and it is exported (ALD-A7), but `AuditLogsItem.vue`
      // renders only the action badge, the subject, `by {{ performerName }}` and
      // the timestamp, and `AuditLogsDiffViewer.vue` renders only the field
      // diff. Neither reads `log.ipAddress`; the single rendering site in the
      // whole module is the CSV's 'IP Address' column.
      //
      // This is pinned as CURRENT BEHAVIOUR, not endorsed: URS-SEC-07 asks for
      // the address to be RECORDED, which it is, and a reviewer reading this
      // file should know that reading it back requires an export rather than a
      // glance at the screen. If a future change surfaces it in the row, this
      // assertion fails and should be replaced by a positive one.
      await expect(
        personRow.getByText(PROBE_IP, { exact: false }),
        'the captured IP is deliberately not rendered in the trail row — it is reachable only through the CSV export (ALD-A7)',
      ).toHaveCount(0)
    } finally {
      await ctx.close()
    }
  })

  test('CONTROL · the tenant really does hold both kinds of row', () => {
    // The claim underneath every assertion above, stated as a measurement on
    // the live table rather than as a belief. If this tenant ever held ONLY
    // attributed rows, the "System" leg would be testing a code path that never
    // runs in production — and that is exactly the state the old gate produced
    // (50,355 rows, zero NULL performers), which looked like healthy
    // attribution and was the fingerprint of a defect.
    const people = Number(
      sqlValue(
        `SELECT count(*) FROM audit_logs
          WHERE company_id = '${COMPANY_ID}' AND performed_by IS NOT NULL`,
      ),
    )
    const system = Number(
      sqlValue(
        `SELECT count(*) FROM audit_logs
          WHERE company_id = '${COMPANY_ID}' AND performed_by IS NULL`,
      ),
    )
    expect(people, 'person-attributed rows exist').toBeGreaterThan(0)
    expect(system, 'and so do system rows — the gate that discarded them is gone').toBeGreaterThan(0)

    // Deletions are captured across the tenant, not only for the subject this
    // file drives. A DELETE count of zero would mean the whole action code is
    // unreachable and the first test above proved only that one fixture works.
    expect(
      Number(
        sqlValue(
          `SELECT count(*) FROM audit_logs
            WHERE company_id = '${COMPANY_ID}' AND action = 'DELETE'`,
        ),
      ),
      'removals are recorded as DELETE rows across the tenant',
    ).toBeGreaterThan(0)
  })
})
