// ALD-A1 — the audit trail's read gate, at the policy layer, from both sides.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY THIS FILE EXISTS
//
// This is the test named P0 by the module's own production-readiness doc, named
// "the central lesson" by its security review (§12: *the defect that matters
// most is the one nothing tests*), and left unwritten by the hardening pass that
// closed the defect. `docs/modules/audit-logs/23-hardening-pass-2026-09-01.md`
// §13 opens with it: *"The regression test for F1 has still not been written …
// Everything else on this list is secondary to it."* This is that test.
//
// F1 in one line: `audit_log_select_rls` gated on
// `authz.has_permission('document_control','read')` while the product presented
// a dedicated `audit_trail` module in Role & Permission Management as though it
// governed the page. Grepping `audit_trail` across the whole of
// `database/rls.sql` at that commit returned zero hits. Measured on `app-db`:
// 49 of 75 roles held `document_control`; 10 held `audit_trail`; 39 role rows —
// 23 distinct role names — held the first and not the second. So every document
// reader could read the tenant's entire cross-module audit trail: every tracked
// change in every module, with actor, IP and a field-level diff.
//
// The fix is one string, and one string is exactly what a regression undoes.
//
// ─────────────────────────────────────────────────────────────────────────────
// EVERY PROBE HERE IS TWO-SIDED, AND THE REASON IS SPECIFIC TO THIS TABLE
//
// An RLS refusal on `audit_logs` is a ZERO-ROW SUCCESS, not an error. Nothing
// throws, nothing 403s: the policy simply matches no rows. So `expect().rejects`
// would be the wrong assertion and a one-sided "Carla sees nothing" is worth
// nothing — it passes identically when the seed did not apply, when the worker
// is down, when the table is empty, and when the policy was deleted outright.
//
// So each denial is paired with a grant reading THE SAME ROWS in the same run,
// against data this file generates itself, and the ground truth is taken with
// RLS bypassed first. Three numbers, not one: what the table holds, what a
// granted persona sees, what a denied persona sees.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHAT WAS MEASURED TO JUSTIFY THE ASSERTIONS (app-db, 2026-09-01)
//
// Live policy text, from `pg_policy`:
//   company_id = current_setting('app.current_company_id') AND
//   (current_setting('app.current_user_is_owner')::boolean OR
//    authz.has_permission('audit_trail','read'))
//
// Per-persona, via `SET ROLE app_user` with the real request path's GUCs:
//
//   persona      document_control:read   audit_trail:read   trail rows
//   controller           true                 false               0
//   noAccess             false                false               0
//   auditor              true                 true           64,182
//   roleAdmin            false                true           64,182
//   auditReader          false                true           64,182   (see below)
//
// The two rows that carry the whole finding are `controller` and `roleAdmin`.
// Carla holds the FULL Document Control CRUD set and reads nothing; Rosa holds
// NO `document_control` grant at all and reads everything. Neither permission
// implies the other any more, in either direction — which is the property F1
// broke and the only one a future regression can quietly restore.
//
// `auditReader` and `author` read the trail in the measurement above because the
// grant-backfill migration (20260901230000) had widened them and the seed had
// not been re-applied since. `e2e-seed.sql` §35 ends with a DELETE that strips
// `audit_trail` from every role but E2E Auditor and E2E Role Admin precisely so
// the fixture's grant set cannot depend on which file ran last — and the
// `setup` project applies the seed before this suite runs. The DENIED list below
// is therefore the seed's declared map, not that measurement, and if this file
// fails on `auditReader` the first thing to check is whether the seed ran.
import { test, expect } from '@playwright/test'
import { ALT_COMPANY_ID, COMPANY_ID, USERS } from '../fixtures/cast.js'
import { sqlAsAppUser, sqlValue } from '../fixtures/db.js'
import {
  PROBE_DEPARTMENTS,
  TRAIL_DENIED,
  TRAIL_GRANTED,
  dbNow,
  seedProbeDepartment,
  touchProbeDepartment,
  trailRowsInTable,
  trailRowsVisibleTo,
  waitForAuditRow,
} from '../fixtures/auditLogs.js'

const DEPT = PROBE_DEPARTMENTS.primary

// The probe window. `seedProbeDepartment` deletes before it inserts, so a second
// run of this file adds a DELETE row alongside the CREATE and the UPDATE and an
// exact count would be run-order dependent. Scoping every count to rows written
// after this run started makes the number stable without asserting what it is —
// and the assertions below compare the three counts to each other rather than to
// a literal, which is the property that actually matters.
let probeWhere = 'TRUE'

/** `authz.has_permission`, evaluated exactly as the policy evaluates it. */
function hasPermission(userId, moduleId, action = 'read') {
  const res = sqlAsAppUser(
    `SELECT 'RESULT=' || authz.has_permission('${moduleId}', '${action}')::text;`,
    { userId, companyId: COMPANY_ID },
  )
  expect(res.ok, `permission probe ran (stderr: ${res.error})`).toBeTruthy()
  const m = /RESULT=(true|false)/.exec(res.output)
  expect(m, `permission probe returned a boolean (output: ${res.output})`).not.toBeNull()
  return m[1] === 'true'
}

/**
 * Does `audit_log_select_rls` release ANY row of the tenant to this user — 1 or
 * 0, resolved off the first matching tuple rather than by counting 64k of them.
 * See the comment at its call site for why the bound is load-bearing.
 */
function trailReachesAnyRow(userId) {
  const res = sqlAsAppUser(
    `SELECT 'RESULT=' || count(*)::text
       FROM (SELECT 1 FROM audit_logs WHERE company_id = '${COMPANY_ID}' LIMIT 1) probe;`,
    { userId, companyId: COMPANY_ID },
  )
  expect(res.ok, `reachability probe ran (stderr: ${res.error})`).toBeTruthy()
  const m = /RESULT=(\d+)/.exec(res.output)
  expect(m, `reachability probe returned a count (output: ${res.output})`).not.toBeNull()
  return Number(m[1])
}

test.beforeAll(async () => {
  const since = dbNow()
  probeWhere = `entity_id = '${DEPT.id}' AND created_at > '${since}'`

  // Two auditable acts on one subject: a CREATE with tracked fields, and an
  // UPDATE with a real old→new diff. The subject is a department with a NULL
  // `site_id`, which `departments_sel` releases to every member of the tenant —
  // so the ONLY variable between the personas below is `audit_log_select_rls`.
  seedProbeDepartment(DEPT, USERS.owner.id)
  await waitForAuditRow({ entityType: 'Departments', entityId: DEPT.id, action: 'CREATE', since })

  touchProbeDepartment(DEPT, {
    actorId: USERS.owner.id,
    description: `ALD-A1 probe ${Date.now()}`,
  })
  await waitForAuditRow({ entityType: 'Departments', entityId: DEPT.id, action: 'UPDATE', since })
})

test.describe('ALD-A1 — audit_log_select_rls gates on audit_trail:read', () => {
  test('the trail is readable by audit_trail holders and by nobody else', () => {
    // Leg 1 — ground truth, RLS bypassed. Without this the two legs below are
    // both consistent with an empty table.
    const inTable = trailRowsInTable(probeWhere)
    expect(inTable, 'the probe wrote at least a CREATE and an UPDATE').toBeGreaterThanOrEqual(2)

    // Leg 2 — every GRANTED persona sees exactly what the table holds. Equality
    // rather than `> 0`: the policy carries no row-level narrowing, so a granted
    // reader that saw *some* of the rows would be a different defect, and a
    // `> 0` assertion would not notice it.
    //
    // `owner` is excluded because `sqlAsAppUser` pins
    // `app.current_user_is_owner = 'false'` — her bypass cannot be probed
    // through this door, and the browser leg (ALD-A2) is where it is exercised.
    for (const persona of TRAIL_GRANTED.filter((p) => p !== 'owner')) {
      expect(
        trailRowsVisibleTo(USERS[persona].id, probeWhere),
        `${persona} holds audit_trail:read and reads every probe row`,
      ).toBe(inTable)
    }

    // Leg 3 — every DENIED persona sees none of them. Each of these is a probe
    // placed on purpose by e2e-seed.sql §35, not a gap in the fixture.
    for (const persona of TRAIL_DENIED) {
      expect(
        trailRowsVisibleTo(USERS[persona].id, probeWhere),
        `${persona} holds no audit_trail grant and reads nothing`,
      ).toBe(0)
    }

    // Leg 4 — tenant-wide, not just on the probe rows. A policy narrowed to hide
    // only recent rows would pass the three legs above.
    //
    // BOUNDED on purpose, and the bound is not cosmetic. An unbounded
    // `count(*)` over this table is a sequential scan calling
    // `authz.has_permission` per row — the E2E tenant holds ~64k audit rows and
    // the probe blew `db.js`'s 15 s psql timeout, which surfaces as
    // `ok === false` with an EMPTY stderr: a probe that looks like a policy
    // error and is actually a stopwatch. `LIMIT 1` asks the only question this
    // leg needs (is there ANY row) and answers it off the first matching tuple.
    for (const persona of TRAIL_DENIED) {
      expect(
        trailReachesAnyRow(USERS[persona].id),
        `${persona} reads no audit row in the tenant at all`,
      ).toBe(0)
    }

    // …paired, because "no rows anywhere" is also what a dropped policy, an
    // empty table and a broken probe all look like.
    for (const persona of TRAIL_GRANTED.filter((p) => p !== 'owner')) {
      expect(
        trailReachesAnyRow(USERS[persona].id),
        `${persona} reaches the tenant-wide trail through the same query`,
      ).toBe(1)
    }
  })

  test('the gate is audit_trail and not document_control — proved in both directions', () => {
    // This is F1 itself. One direction is the finding; the other is what stops a
    // "fix" that simply widened `audit_trail` to everyone from passing.

    // ← Direction 1. Carla is THE regression probe: full document_control CRUD,
    // zero audit_trail. Before the fix she read the entire cross-module trail.
    expect(
      hasPermission(USERS.controller.id, 'document_control'),
      'the Doc Controller still holds the OLD gate',
    ).toBe(true)
    expect(
      hasPermission(USERS.controller.id, 'audit_trail'),
      '…and not the new one',
    ).toBe(false)
    expect(
      trailRowsVisibleTo(USERS.controller.id, probeWhere),
      'so the old gate buys her nothing — document_control no longer reaches the trail',
    ).toBe(0)

    // → Direction 2. Rosa is the mirror image, and she is the half that proves
    // the first is a permission result rather than a broken policy: no
    // document_control grant whatsoever, and the full trail.
    expect(
      hasPermission(USERS.roleAdmin.id, 'document_control'),
      'the Role Admin holds NO document_control grant',
    ).toBe(false)
    expect(hasPermission(USERS.roleAdmin.id, 'audit_trail'), '…only audit_trail').toBe(true)
    expect(
      trailRowsVisibleTo(USERS.roleAdmin.id, probeWhere),
      'and the new gate is sufficient on its own',
    ).toBe(trailRowsInTable(probeWhere))

    // The policy text itself, so a regression that reverts the string fails here
    // with the reason spelled out rather than as an arithmetic surprise.
    const policy = sqlValue(
      `SELECT pg_get_expr(polqual, polrelid) FROM pg_policy WHERE polname = 'audit_log_select_rls'`,
    )
    expect(policy, 'the live policy names audit_trail').toContain("has_permission('audit_trail'")
    expect(policy, 'and no longer names document_control').not.toContain('document_control')
  })

  test('reading the Audits MODULE is not reading the TRAIL', () => {
    // Rhea (`E2E Audit Reader`) holds audit_management / audit_standards /
    // audit_programs / audit_findings, all `:read`. That is the shape of every
    // role an administrator creates AFTER the grant-backfill migration has run,
    // which makes it the probe most likely to catch the next mistake: the two
    // module names look adjacent and are not.
    expect(hasPermission(USERS.auditReader.id, 'audit_management'), 'she reads the module').toBe(
      true,
    )
    expect(hasPermission(USERS.auditReader.id, 'audit_trail'), 'and not the trail').toBe(false)
    expect(trailRowsVisibleTo(USERS.auditReader.id, probeWhere)).toBe(0)

    // Paired, as always, with somebody who does — same rows, same run.
    expect(trailRowsVisibleTo(USERS.auditor.id, probeWhere)).toBe(trailRowsInTable(probeWhere))
  })

  test('a denied persona still reads the RECORD whose history it hides (§6.3, open)', () => {
    // ⚠ THIS TEST ASSERTS A KNOWN-OPEN DEFECT, DELIBERATELY.
    //
    // 23-hardening-pass §6.3 records a residual the grant backfill cannot fix:
    // `audit_log_select_rls` is tenant-wide, so a Document Controller loses the
    // change history of records she owns and can read, not merely the
    // cross-module page. The fix is a record-scoped disjunct inside the policy —
    // the shape `authz.can_read_workflow_resource` already has — and it was not
    // written, because getting it right means answering the same question for
    // the CAPA, NCR, CR and Quality Event embeds at once.
    //
    // MEASURED, not assumed: the probe subject is a department with a NULL
    // `site_id`, and `departments_sel` ends `… OR ((site_id IS NULL) OR (site_id
    // = ANY (authz.current_site_ids())))`. Verified live — all six personas,
    // grants or none, read the row; only the audit rows differ. So this is
    // exactly §6.3's shape: a record you are entitled to, whose history you are
    // not.
    //
    // It is written asserting CURRENT REAL BEHAVIOUR. When the record-scoped
    // disjunct lands, this test SHOULD fail, and the failure is the signal to
    // rewrite it — not a regression.
    const reads = (userId) => {
      const res = sqlAsAppUser(
        `SELECT 'RESULT=' || count(*)::text FROM departments WHERE id = '${DEPT.id}';`,
        { userId, companyId: COMPANY_ID },
      )
      expect(res.ok, `department probe ran (stderr: ${res.error})`).toBeTruthy()
      return Number(/RESULT=(\d+)/.exec(res.output)?.[1])
    }

    expect(reads(USERS.controller.id), 'the Doc Controller reads the department row').toBe(1)
    expect(reads(USERS.noAccess.id), 'so does a user with no role at all').toBe(1)
    expect(
      trailRowsVisibleTo(USERS.controller.id, probeWhere),
      'and neither of them reads a single one of its changes — §6.3, still open',
    ).toBe(0)

    // The pair, without which the line above is just "the table might be empty".
    expect(trailRowsVisibleTo(USERS.auditor.id, probeWhere)).toBeGreaterThanOrEqual(2)
  })

  test('the company clause is intact — a granted reader sees one tenant only', () => {
    // The gate is a conjunction: `company_id = … AND (owner OR permission)`.
    // Repointing the permission half is the kind of edit that can lose the other
    // half, and the audit trail is the last table in the product where a tenant
    // boundary should be taken on trust.
    const altRows = Number(
      sqlValue(`SELECT count(*) FROM audit_logs WHERE company_id = '${ALT_COMPANY_ID}'`),
    )
    expect(altRows, 'the second tenant has a trail to leak').toBeGreaterThan(0)

    for (const persona of ['auditor', 'roleAdmin']) {
      const res = sqlAsAppUser(
        `SELECT 'RESULT=' || count(*)::text FROM audit_logs WHERE company_id = '${ALT_COMPANY_ID}';`,
        { userId: USERS[persona].id, companyId: COMPANY_ID },
      )
      expect(res.ok, `cross-tenant probe ran (stderr: ${res.error})`).toBeTruthy()
      expect(
        Number(/RESULT=(\d+)/.exec(res.output)?.[1]),
        `${persona} holds audit_trail:read in E2E Lab and reads zero rows of E2E Alt`,
      ).toBe(0)
    }
  })
})
