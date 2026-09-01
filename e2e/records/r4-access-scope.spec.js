// REC-J4 — access scope on `records`, Own vs Tenant, read and write.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHAT THIS PINS
//
// Records F-06. `records` is absent from `authz.module_table_bindings` while 25
// other module tables are in it, so NO generated policy ever evaluated
// `authz.scope_allowed` for this table. Own / Department / Site tiers were
// offered by the permission-matrix UI, accepted, stored, and displayed back to
// the administrator — and never consulted. A grant scoped to "own records only"
// returned the whole tenant's.
//
// The fix is NOT the binding the finding proposed, and that distinction is the
// reason this file exists rather than a generic scope test. `authz.apply_module_rls`
// hardcodes `has_permission('<module>', …)` into the policy text and has no way
// to express a module id read from a ROW — so binding `records` would have
// destroyed the polymorphic dispatch that lets one policy set serve every
// admin-promoted module: one generic `records:read` would unlock every promoted
// module in the tenant, and the person actually granted `e2emod:read` would be
// refused their own records. The binding therefore stays absent ON PURPOSE and
// `database/rls.sql` calls `scope_allowed` inline, with the module id read from
// the row:
//
//   authz.has_permission_legacy(COALESCE(module_key,'records') || ':read')
//   AND authz.scope_allowed(COALESCE(module_key,'records'), 'read',
//                           COALESCE(owner_user_id, user_id), department_id, site_id)
//
// Because that is hand-written rather than generated, nothing regenerates it and
// nothing else tests it. This file is what stands between it and a silent
// revert.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE PERSONAS, AND WHY THE WRITE PROBE NEEDS A THIRD ONE
//
//   reviewer   e2emod:read/update @TENANT       sees 3 of 3, writes any
//   ownAuthor  e2emod:read/update @OWN          sees 1 of 3, writes only hers
//   auditor    e2emod:read @TENANT              sees 3 of 3
//              e2emod:update @OWN               writes only hers
//
// `auditor`'s split grant is the load-bearing one. PostgreSQL applies the
// SELECT policy to the rows an `UPDATE … WHERE` has to LOCATE, so a persona who
// cannot read a row is filtered out before `record_update_rls` is consulted at
// all — and a write probe using `ownAuthor` against somebody else's record
// would report zero rows against the FIXED code and zero rows against the
// DEFECT, proving nothing whatsoever. `auditor` can read every e2emod record in
// the tenant, so when her UPDATE touches zero rows it is the UPDATE policy's
// scope arm answering and nothing else. She is paired, on the same row and in
// the same run, with `reviewer` — whose tenant-scoped update succeeds — so
// "zero rows" can never be confused with "this row is not writable".
//
// ─────────────────────────────────────────────────────────────────────────────
// WHAT WAS MEASURED (app-db, 2026-09-01)
//
// Three e2emod DRAFT records, same site and same department, differing ONLY in
// owner: e2e-seed.sql §35's two (owned by `ownAuthor` and by `author`) plus one
// owned by `auditor`, provisioned by e2e/fixtures/records.js.
//
//   persona      has_permission_legacy('e2emod:read')   records visible
//   reviewer                    true                          3
//   ownAuthor                   true                          1   ← the fix
//   auditor                     true                          3
//   author                      false                         0   ← isolation
//   noAccess                    false                         0
//
// `ownAuthor` is the row that carries the finding. Her PERMISSION arm is TRUE —
// she genuinely holds `e2emod:read` — so the two records she cannot see are
// being withheld by `scope_allowed` and by nothing else. Before the fix she saw
// all three, and the permission column would have looked identical.
//
// `scope_allowed` resolves the READ tier as `max(rank)` over every grant on the
// module (`action_id = p_action OR p_action = 'read'`), which is why `auditor`'s
// tenant READ does not accidentally widen her own-scoped UPDATE: the update
// probe resolves `action_id = 'update'` alone, and finds only the own grant.
import { test, expect } from '@playwright/test'
import { COMPANY_ID, USERS } from '../fixtures/cast.js'
import { sqlAsAppUser, sqlValue } from '../fixtures/db.js'
import {
  RECORDS,
  affectedRows,
  hasPermissionLegacy,
  policyExpr,
  provisionRecordsFixtures,
  recordsVisibleTo,
} from '../fixtures/records.js'

const M = RECORDS.module
// The three e2emod records, identical but for their owner.
const ALL = [M.ownRecordId, M.otherRecordId, M.auditorRecordId]
const OWNER_OF = {
  [M.ownRecordId]: 'ownAuthor',
  [M.otherRecordId]: 'author',
  [M.auditorRecordId]: 'auditor',
}

/** One payload write, as `app_user`. Never touches status — that is REC-J3. */
function writeAsAppUser(persona, recordId) {
  return sqlAsAppUser(
    `UPDATE records SET payload = payload || '{"j4":"${Date.now()}"}'::jsonb WHERE id = '${recordId}' RETURNING id;`,
    { userId: USERS[persona].id, companyId: COMPANY_ID },
  )
}

test.beforeAll(() => provisionRecordsFixtures())

test.describe('REC-J4 — access scope (F-06)', () => {
  test('the fixture is a controlled comparison — three rows differing only in owner', () => {
    // Without this, every count below is consistent with the rows differing in
    // site or department and scope never being consulted at all.
    const shape = sqlValue(`
      SELECT count(DISTINCT site_id)::text || '/' || count(DISTINCT department_id)::text
             || '/' || count(DISTINCT owner_user_id)::text || '/' || count(*)::text
        FROM records WHERE id IN ('${ALL.join("','")}') AND deleted_at IS NULL`)
    expect(shape, 'one site, one department, three owners, three rows').toBe('1/1/3/3')

    // And all three are in the module namespace the personas are granted on —
    // a row that fell back to COALESCE's 'records' would be governed by a
    // different permission entirely.
    expect(
      sqlValue(`SELECT string_agg(DISTINCT module_key, ',') FROM records WHERE id IN ('${ALL.join("','")}')`),
      'all three are e2emod records',
    ).toBe(M.key)
  })

  test('READ — an own-scoped grant reaches one record; a tenant-scoped one reaches all three', () => {
    // ── The permission arm is TRUE for both. This is the whole point. ───────
    // If the own-scoped persona simply lacked the permission, the count below
    // would be zero for a reason that has nothing to do with F-06, and the
    // test would pass against a build where scope was never evaluated.
    expect(
      hasPermissionLegacy(USERS.ownAuthor.id, `${M.key}:read`),
      'the own-scoped persona genuinely holds e2emod:read',
    ).toBe(true)
    expect(
      hasPermissionLegacy(USERS.reviewer.id, `${M.key}:read`),
      'and so does the tenant-scoped one',
    ).toBe(true)

    // ── Leg 1: tenant scope sees everything. Ground truth for leg 2. ────────
    expect(
      recordsVisibleTo(USERS.reviewer.id, ALL),
      'a tenant-scoped grant reaches all three records',
    ).toBe(3)

    // ── Leg 2: own scope sees exactly the one it owns. THE FINDING. ─────────
    expect(
      recordsVisibleTo(USERS.ownAuthor.id, ALL),
      'an own-scoped grant reaches exactly one of the same three',
    ).toBe(1)
    expect(
      recordsVisibleTo(USERS.ownAuthor.id, [M.ownRecordId]),
      '…and it is the one she owns',
    ).toBe(1)
    for (const id of [M.otherRecordId, M.auditorRecordId]) {
      expect(
        recordsVisibleTo(USERS.ownAuthor.id, [id]),
        `…and not the one owned by ${OWNER_OF[id]}`,
      ).toBe(0)
    }
  })

  test('READ — the own tier matches BOTH custodian columns, not just owner_user_id', () => {
    // `COALESCE(owner_user_id, user_id)` in the policy is load-bearing and easy
    // to lose in an edit: module records carry a responsible party in
    // owner_user_id, plain submissions only ever have their author in user_id,
    // and an own-tier grant matching only the first reaches NEITHER of the
    // second. Asserted on the live policy text so a regression fails here with
    // the reason spelled out rather than as an arithmetic surprise three tests
    // down.
    // Read whole (see fixtures/records.js `policyExpr`): every records policy
    // builds its namespace with `||`, so db.js's row reader truncates it.
    // Matched against the text Postgres STORES, which adds the casts —
    // `COALESCE(module_key, 'records'::character varying)`, not the `'records'`
    // rls.sql was written with.
    const policy = policyExpr('record_select_rls')
    expect(policy, 'the read policy evaluates scope_allowed at all').toContain(
      'authz.scope_allowed(',
    )
    expect(policy, '…with the module id read from the row, not hardcoded').toContain(
      "COALESCE(module_key, 'records'::character varying)",
    )
    expect(policy, '…and both custodian columns feed the own tier').toContain(
      'COALESCE(owner_user_id, user_id)',
    )
    // The scope call takes the same four arguments the generator would emit —
    // module, action, owner, department, site — in that order. A regression
    // that dropped department_id or site_id would still contain the substrings
    // above.
    expect(policy, 'scope is evaluated over owner, department AND site').toContain(
      "authz.scope_allowed((COALESCE(module_key, 'records'::character varying))::text, 'read'::text, COALESCE(owner_user_id, user_id), department_id, site_id)",
    )

    // The binding really is absent — this is the fix's premise, and if someone
    // "completes" it by binding the table, apply_module_rls will generate a
    // second policy set that ORs with this one and silently widens both.
    expect(
      sqlValue(`SELECT count(*) FROM authz.module_table_bindings WHERE table_name = 'records'`),
      'records stays OUT of module_table_bindings, on purpose',
    ).toBe('0')
  })

  test('WRITE — a tenant read with an own-scoped update writes only what it owns', () => {
    // ── The probe's premise: this persona CAN READ every row it is about to
    // fail to write. Stated first, because it is the difference between a real
    // probe and one that passes against the defect.
    expect(
      recordsVisibleTo(USERS.auditor.id, ALL),
      'the split-scope persona reads all three records',
    ).toBe(3)

    // ── Leg 1: her own row. Without this, "she wrote nothing" is equally
    // consistent with her holding no update grant at all.
    const own = writeAsAppUser('auditor', M.auditorRecordId)
    expect(own.ok, 'her own-scoped update raises nothing').toBeTruthy()
    expect(affectedRows(own), 'and it lands on the record she owns').toBe(1)

    // ── Leg 2: somebody else's row. THE FINDING, on the write path. ─────────
    // An RLS refusal here is a zero-row SUCCESS: nothing throws, nothing 403s,
    // the UPDATE simply matches no rows. `expect().rejects` would be the wrong
    // assertion entirely.
    for (const id of [M.ownRecordId, M.otherRecordId]) {
      const res = writeAsAppUser('auditor', id)
      expect(res.ok, `the refusal on ${OWNER_OF[id]}'s record is silent, not an error`).toBeTruthy()
      expect(
        affectedRows(res),
        `an own-scoped update does not reach ${OWNER_OF[id]}'s record — though she can read it`,
      ).toBe(0)
    }

    // ── Leg 3: the same rows ARE writable, by a tenant-scoped grant, in the
    // same run. This is what stops leg 2 passing against a policy that had
    // stopped matching anything at all.
    for (const id of [M.ownRecordId, M.otherRecordId]) {
      const res = writeAsAppUser('reviewer', id)
      expect(res.ok, `the tenant-scoped persona's write raises nothing (${OWNER_OF[id]}'s row)`).toBeTruthy()
      expect(affectedRows(res), '…and it lands').toBe(1)
    }
  })

  test('WRITE — an own-scoped grant on both verbs is bounded the same way', () => {
    // `ownAuthor` holds read AND update at own. Her write probe cannot
    // distinguish the SELECT filter from the UPDATE policy — which is exactly
    // why the test above exists — but it is still worth pinning that the tier
    // holds on the row she CAN see, and that the one she cannot see stays put.
    const mine = writeAsAppUser('ownAuthor', M.ownRecordId)
    expect(mine.ok).toBeTruthy()
    expect(affectedRows(mine), 'she writes the record she owns').toBe(1)

    const theirs = writeAsAppUser('ownAuthor', M.otherRecordId)
    expect(theirs.ok, 'and is refused silently on the one she does not').toBeTruthy()
    expect(affectedRows(theirs)).toBe(0)
  })

  test('module_section_records dispatches on its PARENT record, not on a fixed namespace', () => {
    // The same fix, on the answers table, and it was over-permissive in a way
    // that is easy to miss: its admin read arm asked
    // `has_permission('records','read')`, which on a polymorphic table is the
    // wrong question twice — these rows are the section-by-section ANSWERS of a
    // module record, so a row belonging to `e2emod` must be gated on
    // `e2emod:read` exactly as its parent is. As written, one generic `records`
    // grant — and via has_permission's read-fallback, ANY grant on the
    // `records` module at all — returned every promoted module's answer set in
    // the tenant, including modules whose parent records the same caller could
    // not open.
    const policy = policyExpr('module_section_record_select_rls')
    expect(policy, 'the admin arm joins back to the parent record').toContain('FROM records r')
    expect(policy, '…and reads the namespace off that row').toContain(
      "COALESCE(r.module_key, 'records'::character varying)",
    )
    expect(policy, '…rather than asking a fixed records:read').not.toContain(
      "authz.has_permission('records'::text, 'read'::text)",
    )
  })
})
