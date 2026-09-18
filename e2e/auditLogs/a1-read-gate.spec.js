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
  // THE MODEL CHANGED ON 2026-09-01 AND THESE THREE TESTS CHANGED WITH IT.
  // `audit_log_select_rls` used to be binary: `audit_trail:read` or nothing. It
  // now carries a RECORD-SCOPED DISJUNCT — you may also read the audit rows of
  // an entity whose OWNING MODULE you can read. So visibility is three-tiered,
  // and the probe subject (a department) resolves to the `departments` module,
  // which is what decides who sees the probe rows.
  //
  //   audit_trail:read  -> the entire tenant trail
  //   <module>:read     -> that module's history only
  //   neither           -> nothing
  //
  // MEASURED on app-db when this was written: of 66,724 rows in the tenant, the
  // Doc Controller reads 28,516 and a zero-grant user reads 0, while a trail
  // holder reads all 66,724. Before this branch the Doc Controller read all
  // 66,724 through `document_control:read`, so this is still a large tightening
  // — it restores the history of what she administers, not the platform ledger.
  const MODULE_READERS = ['controller', 'author'] // hold departments:read
  // Holds NO departments grant, so it reads none of the PROBE rows — but it does
  // hold audit_management / audit_standards / audit_programs / audit_findings,
  // so under the disjunct it legitimately reaches those modules' history
  // elsewhere in the tenant. It is a module reader for OTHER modules, which is
  // why it cannot be asserted to reach zero rows tenant-wide.
  const OTHER_MODULE_READER = 'auditReader'
  // The only persona with no grant anywhere, and therefore the only one for whom
  // "reaches nothing in the tenant" is the correct claim.
  const NO_GRANTS = 'noAccess'

  test('visibility is three-tiered: whole trail, own module, or nothing', () => {
    // Leg 1 — ground truth, RLS bypassed. Without this every leg below is also
    // consistent with an empty table.
    const inTable = trailRowsInTable(probeWhere)
    expect(inTable, 'the probe wrote at least a CREATE and an UPDATE').toBeGreaterThanOrEqual(2)

    // Leg 2 — a trail grant reads every probe row. Equality, not `> 0`: a
    // granted reader seeing SOME rows would be a different defect.
    for (const persona of TRAIL_GRANTED.filter((p) => p !== 'owner')) {
      expect(
        trailRowsVisibleTo(USERS[persona].id, probeWhere),
        `${persona} holds audit_trail:read and reads every probe row`,
      ).toBe(inTable)
    }

    // Leg 3 — the new arm. These personas hold NO trail grant but DO hold
    // `departments:read`, and the probe subject is a department, so they read
    // its history. This is the §6.3 fix, asserted where it bites.
    for (const persona of MODULE_READERS) {
      expect(
        hasPermission(USERS[persona].id, 'audit_trail'),
        `${persona} holds no trail grant`,
      ).toBe(false)
      expect(
        trailRowsVisibleTo(USERS[persona].id, probeWhere),
        `${persona} reads departments and so reads this department's history`,
      ).toBe(inTable)
    }

    // Leg 4 — the disjunct is per-MODULE, not per-user. `auditReader` holds no
    // departments grant, so the probe rows stay shut to her even though she
    // reads plenty of trail elsewhere. This is the leg that would fail if the
    // arm had been written as "any grant anywhere unlocks the trail".
    expect(
      trailRowsVisibleTo(USERS[OTHER_MODULE_READER].id, probeWhere),
      `${OTHER_MODULE_READER} reads the audit MODULES but not departments, so not this history`,
    ).toBe(0)
    expect(
      trailReachesAnyRow(USERS[OTHER_MODULE_READER].id),
      `${OTHER_MODULE_READER} does reach her OWN modules' history — the arm is per-module`,
    ).toBe(1)

    // Leg 5 — and a user with no grant at all still reads nothing, anywhere.
    // Without this the disjunct could have widened to "any authenticated user"
    // and every leg above would still pass.
    expect(
      trailRowsVisibleTo(USERS[NO_GRANTS].id, probeWhere),
      'a user with no role reads none of the probe rows',
    ).toBe(0)
    expect(trailReachesAnyRow(USERS[NO_GRANTS].id), 'and no audit row in the tenant at all').toBe(0)

    // …paired, because "no rows anywhere" is also what a dropped policy, an
    // empty table and a broken probe all look like.
    for (const persona of TRAIL_GRANTED.filter((p) => p !== 'owner')) {
      expect(
        trailReachesAnyRow(USERS[persona].id),
        `${persona} reaches the tenant-wide trail through the same query`,
      ).toBe(1)
    }
  })

  test("a module grant buys that module's history and NOT the rest of the trail", () => {
    // This is F1, restated for the three-tier model. The finding was that
    // `document_control:read` returned the ENTIRE cross-module trail. It no
    // longer does — but proving that now needs a module the persona cannot
    // read, because she legitimately reads the ones she administers.
    //
    // `SamplingPlanTables` is that probe: 11,200 rows in the tenant, owned by an
    // inspection module the Doc Controller holds nothing on.
    expect(
      hasPermission(USERS.controller.id, 'document_control'),
      'the Doc Controller still holds the OLD gate',
    ).toBe(true)
    expect(hasPermission(USERS.controller.id, 'audit_trail'), '…and not the new one').toBe(false)

    const foreign = "entity_type = 'SamplingPlanTables'"
    expect(trailRowsInTable(foreign), 'the foreign-module probe has rows to leak').toBeGreaterThan(
      0,
    )
    expect(
      trailRowsVisibleTo(USERS.controller.id, foreign),
      'document_control buys her nothing outside the modules she reads',
    ).toBe(0)

    // → The mirror image, and the half that proves the line above is a
    // permission result rather than a broken policy: no document_control grant
    // whatsoever, and the full trail.
    expect(
      hasPermission(USERS.roleAdmin.id, 'document_control'),
      'the Role Admin holds NO document_control grant',
    ).toBe(false)
    expect(hasPermission(USERS.roleAdmin.id, 'audit_trail'), '…only audit_trail').toBe(true)
    expect(
      trailRowsVisibleTo(USERS.roleAdmin.id, foreign),
      'and the trail grant alone reaches the foreign module',
    ).toBe(trailRowsInTable(foreign))

    // The policy text itself, so a regression that reverts the string fails here
    // with the reason spelled out rather than as an arithmetic surprise.
    // Asked as booleans rather than by substring-matching the expression:
    // `pg_get_expr` for this policy is longer than `sqlValue` returns intact, and
    // a truncated string silently fails `toContain` for the wrong reason.
    const policySays = (needle) =>
      sqlValue(
        `SELECT (pg_get_expr(polqual, polrelid) LIKE '%${needle}%')::text
           FROM pg_policy WHERE polname = 'audit_log_select_rls'`,
      )
    // Needles carry NO single quotes: this goes through `docker exec … psql -c`,
    // and an embedded quote closes the SQL string and fails as a psql syntax
    // error rather than an assertion. `audit_trail` appears in this policy only
    // inside has_permission('audit_trail', 'read'), so the bare name is exact.
    expect(policySays('audit_trail'), 'the live policy names audit_trail').toBe('true')
    expect(policySays('document_control'), 'and still never names document_control').toBe('false')
    expect(
      policySays('audit_entity_types'),
      'and it resolves the entity type through the vocabulary, not a literal list',
    ).toBe('true')
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

  test('§6.3 CLOSED — a record you can read no longer hides its own history', () => {
    // This test was written the other way round, asserting §6.3 as a known-open
    // defect: `audit_log_select_rls` was tenant-wide, so a Document Controller
    // kept the department row and lost its change history. Its own note said
    // "when the record-scoped disjunct lands, this test SHOULD fail, and the
    // failure is the signal to rewrite it". The disjunct landed; this is the
    // rewrite.
    //
    // MEASURED, and the measurement is what makes the pairing meaningful: the
    // probe subject is a department with a NULL `site_id`, and `departments_sel`
    // ends `… OR ((site_id IS NULL) OR (site_id = ANY (authz.current_site_ids())))`
    // — so ALL personas read the row itself, grants or none. Only the audit rows
    // differ, which is exactly the asymmetry §6.3 was about.
    const reads = (userId) => {
      const res = sqlAsAppUser(
        `SELECT 'RESULT=' || count(*)::text FROM departments WHERE id = '${DEPT.id}';`,
        { userId, companyId: COMPANY_ID },
      )
      expect(res.ok, `department probe ran (stderr: ${res.error})`).toBeTruthy()
      return Number(/RESULT=(\d+)/.exec(res.output)?.[1])
    }

    // Both still read the RECORD — unchanged, and the premise of the asymmetry.
    expect(reads(USERS.controller.id), 'the Doc Controller reads the department row').toBe(1)
    expect(reads(USERS.noAccess.id), 'so does a user with no role at all').toBe(1)

    // The fix: she holds `departments:read`, so she now reads its history too.
    expect(
      trailRowsVisibleTo(USERS.controller.id, probeWhere),
      '…and now she reads its changes as well — §6.3 closed',
    ).toBe(trailRowsInTable(probeWhere))

    // The other side, and the reason this is a scoped fix rather than an
    // opening: reading the ROW is not reading its HISTORY. `noAccess` reaches
    // the department through the NULL-site arm of `departments_sel` and holds no
    // grant on the module, so the trail stays shut for her. If this ever returns
    // rows, the disjunct has widened to "anyone who can see the record", which
    // is not what was agreed.
    expect(
      hasPermission(USERS.noAccess.id, 'departments'),
      'the no-role user holds no departments grant',
    ).toBe(false)
    expect(
      trailRowsVisibleTo(USERS.noAccess.id, probeWhere),
      'reading the row is still not reading its history',
    ).toBe(0)
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
