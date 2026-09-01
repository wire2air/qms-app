// REC-J6 — one physical table, three permission namespaces, no leakage between them.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHAT THIS PINS
//
// `records` is the only table in the product whose PERMISSION NAMESPACE IS A
// COLUMN. Promoting a form template inserts an `authz.modules` row whose id IS
// the template's `internal_name` and stamps that name onto every record it
// produces as `module_key`; the policies then dispatch on it:
//
//   authz.has_permission_legacy(COALESCE(module_key, 'records') || ':<verb>')
//
// So one table holds an unbounded number of independently-governed record sets,
// and the property that has to hold is a MATRIX, not a pair: a holder of
// module A's grant sees module A's records, module B's holder sees module B's,
// the plain-submission grant sees only `module_key IS NULL` rows, and no grant
// reaches across.
//
// This is the property that both of the rejected alternatives would have
// broken, in opposite directions:
//
//   * a route-level `enforcePermission('records', …)` on the lifecycle
//     endpoints — TOO WEAK: one generic `records:update` becomes a skeleton key
//     into every admin-promoted module in the tenant; and TOO STRONG: the
//     person actually granted `e2emod:update` is refused.
//   * binding `records` into `authz.module_table_bindings` and generating
//     policies — same failure, at the RLS layer, because `apply_module_rls`
//     hardcodes the module id into the policy text and cannot read one from a
//     row.
//
// Neither was adopted, so nothing about this table's dispatch is generated and
// nothing else regression-tests it.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY THREE NAMESPACES AND NOT TWO
//
// Two would let a broken dispatch pass as "each persona sees half the table".
// With three, every persona has TWO sets it must not see, and the three sets
// are asserted to partition the table exactly — so a policy that fell back to
// tenant-wide, or that matched on the wrong column, cannot produce these
// numbers by accident.
//
//   namespace          persona     grant
//   records (plain)    author      records:create/read/update/delete @tenant
//   e2emod             reviewer    e2emod:create/read/update/delete  @tenant
//   e2emodb            approver    e2emodb:create/read/update        @tenant
//
// All three are TENANT-scoped on purpose: scope is REC-J4's subject, and mixing
// the two would make a zero-row result ambiguous between "wrong namespace" and
// "out of scope".
//
// `e2emodb` is provisioned by e2e/fixtures/records.js rather than by the seed —
// `e2e-seed.sql` §35 promotes exactly one module, and one promoted module
// cannot express module-to-module isolation at all.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHAT WAS MEASURED (app-db, 2026-09-01)
//
//   persona     e2emod:read   e2emodb:read   records:read   rows seen per namespace
//   author         false         false          true         0 / 0 / all plain
//   reviewer       true          false          false        all e2emod / 0 / 0
//   approver       false         true           false        0 / all e2emodb / 0
//   noAccess       false         false          false        0 / 0 / 0
//
// The `false` column entries are the finding. Each one is a namespace the
// persona holds a full CRUD grant NEXT DOOR to, on the same table, and reaches
// nothing in.
import { test, expect } from '@playwright/test'
import { AUTH, COMPANY_ID, USERS } from '../fixtures/cast.js'
import { sql } from '../fixtures/db.js'
import {
  RECORDS,
  createPersonaPool,
  createProbeRecord,
  deleteProbeRecords,
  hasPermissionLegacy,
  perRowGrantedRecordIds,
  provisionRecordsFixtures,
  recordIdsInModuleVisibleTo,
  recordsVisibleTo,
  restGet,
} from '../fixtures/records.js'

// One record per namespace, all created in the same run so the comparison is
// between namespaces and nothing else.
const PROBE = {
  plain: 'e2e6f400-0000-4000-8000-000000000001',
  modA: 'e2e6f400-0000-4000-8000-000000000002',
  modB: 'e2e6f400-0000-4000-8000-000000000003',
}

// namespace → [the persona that holds it, the two that must not reach it]
const NAMESPACES = [
  { key: null, label: 'records (plain)', probe: PROBE.plain, holder: 'author' },
  { key: RECORDS.module.key, label: 'e2emod', probe: PROBE.modA, holder: 'reviewer' },
  { key: RECORDS.moduleB.key, label: 'e2emodb', probe: PROBE.modB, holder: 'approver' },
]

const pool = createPersonaPool()
test.afterAll(async () => {
  await pool.close()
  deleteProbeRecords(Object.values(PROBE))
})

test.beforeAll(() => {
  provisionRecordsFixtures()
  createProbeRecord({
    id: PROBE.plain,
    templateId: RECORDS.plain.templateId,
    moduleKey: null,
    userId: USERS.author.id,
  })
  createProbeRecord({
    id: PROBE.modA,
    templateId: RECORDS.module.templateId,
    moduleKey: RECORDS.module.key,
    ownerUserId: USERS.reviewer.id,
  })
  createProbeRecord({
    id: PROBE.modB,
    templateId: RECORDS.moduleB.templateId,
    moduleKey: RECORDS.moduleB.key,
    ownerUserId: USERS.approver.id,
  })
})

test.describe('REC-J6 — per-module namespace isolation', () => {
  test('the fixture really is three namespaces on one table', () => {
    // Every count below is meaningless if the three probe rows are not actually
    // in three different namespaces of the SAME table.
    const shape = sql(`
      SELECT coalesce(module_key, '<null>'), count(*)::text
        FROM records WHERE id IN ('${Object.values(PROBE).join("','")}')
       GROUP BY 1 ORDER BY 1`)
    // Both sides sorted the same way. Not cosmetic: psql's column separator is
    // `|`, whose code point (124) is ABOVE every letter, so JS string order and
    // psql's `ORDER BY 1` disagree on any pair where one key is a prefix of the
    // other — exactly the `e2emod` / `e2emodb` pair this fixture is built on.
    expect(shape.split('\n').sort(), 'one row in each of the three namespaces').toEqual(
      ['<null>|1', `${RECORDS.module.key}|1`, `${RECORDS.moduleB.key}|1`].sort(),
    )

    // Both promoted modules are registered in authz. Without the
    // `authz.modules` row, `has_permission_legacy('<key>:read')` resolves
    // nothing and returns FALSE — and every persona would then read zero rows
    // of that module, which is what a passing isolation test looks like from
    // the outside. This is the assertion that stops this whole file passing for
    // the most boring possible wrong reason.
    for (const key of [RECORDS.module.key, RECORDS.moduleB.key]) {
      expect(
        sql(`SELECT count(*) FROM authz.modules WHERE id = '${key}' AND is_active`),
        `${key} is a registered, active authz module`,
      ).toBe('1')
    }
  })

  test('each namespace is readable by its own holder and by neither of the others', () => {
    for (const ns of NAMESPACES) {
      const others = NAMESPACES.filter((o) => o.holder !== ns.holder)

      // ── Leg 1: the holder reaches it. Ground truth for legs 2 and 3. ──────
      expect(
        recordsVisibleTo(USERS[ns.holder].id, [ns.probe]),
        `${ns.holder} reads the ${ns.label} record`,
      ).toBe(1)

      // ── Leg 2: nobody else does — including personas holding a FULL CRUD
      // grant on a neighbouring namespace of the same table.
      for (const other of others) {
        expect(
          recordsVisibleTo(USERS[other.holder].id, [ns.probe]),
          `${other.holder} holds ${other.label} and reads nothing of ${ns.label}`,
        ).toBe(0)
      }

      // ── Leg 3: and it is the PERMISSION that refuses them, not an accident
      // of the fixture. Without this a mis-seeded persona would look like a
      // working policy.
      if (ns.key !== null) {
        expect(
          hasPermissionLegacy(USERS[ns.holder].id, `${ns.key}:read`),
          `${ns.holder} holds ${ns.key}:read`,
        ).toBe(true)
        for (const other of others) {
          expect(
            hasPermissionLegacy(USERS[other.holder].id, `${ns.key}:read`),
            `${other.holder} does not hold ${ns.key}:read`,
          ).toBe(false)
        }
      }
    }
  })

  test('the isolation is namespace-wide, not just on the probe rows', () => {
    // A policy narrowed to hide only the three rows above would pass the test
    // before this one. This asks the same question of every row in the tenant.
    for (const ns of NAMESPACES) {
      const seenByHolder = recordIdsInModuleVisibleTo(USERS[ns.holder].id, ns.key)
      expect(
        seenByHolder,
        `${ns.holder} reads the whole ${ns.label} namespace, not one row of it`,
      ).toContain(ns.probe)

      for (const other of NAMESPACES.filter((o) => o.holder !== ns.holder)) {
        // Rows reached through a PER-ROW grant are subtracted, and that is not
        // a loophole — it is the policy's other two arms. `record_select_rls`
        // also admits a caller who has an open TASK on the row, or whom the row
        // is SHARED with, and those arms are deliberately unscoped because the
        // workflow engine handed that specific row to that specific person.
        //
        // The naive `toEqual([])` here is not merely fragile, it is WRONG: it
        // asserts that a documented feature does not exist. Measured — it failed
        // the moment two started `e2emodb` records with tasks assigned to
        // `reviewer` were left in the tenant, and the "leak" it reported was the
        // task-assignee arm working exactly as designed. The property that
        // actually holds is the one below: nothing outside the per-row grants.
        const perRow = perRowGrantedRecordIds(USERS[other.holder].id, ns.key)
        expect(
          recordIdsInModuleVisibleTo(USERS[other.holder].id, ns.key).filter(
            (id) => !perRow.includes(id),
          ),
          `${other.holder} reads no ${ns.label} row except ones handed to them row by row`,
        ).toEqual([])
      }
    }

    // The zero-grant control. Every count above is a comparison; this is the
    // floor they are compared against — and this persona is in no workflow, so
    // no per-row subtraction applies to them.
    for (const ns of NAMESPACES) {
      expect(
        perRowGrantedRecordIds(USERS.noAccess.id, ns.key ?? ''),
        'the zero-grant persona holds no per-row grant either',
      ).toEqual([])
      expect(
        recordIdsInModuleVisibleTo(USERS.noAccess.id, ns.key),
        `a user with no grant at all reads no ${ns.label} record`,
      ).toEqual([])
    }
  })

  test('the task-assignee arm is a per-ROW grant that deliberately crosses the namespace', () => {
    // The other half of the test above, stated positively — because "isolation"
    // on this table is not "a module's rows are unreachable without its grant".
    // `record_select_rls` has three arms, and only the FIRST is the permission
    // dispatch:
    //
    //   permission  has_permission_legacy(<module>:read) AND scope_allowed(…)
    //   task        an open task_instance on this row, assigned to me
    //   share       a shared_with_user row for this row, for me
    //
    // The last two are per-ROW and are NOT scope-gated, on purpose: gating them
    // on a tier computed from department/site would revoke access the workflow
    // engine had just granted, and show an assignee a task they cannot open.
    //
    // So the guarantee is narrower and more precise than "no cross-namespace
    // reads": a foreign persona reaches EXACTLY the rows handed to them, one at
    // a time, and no others. Pinned here so a future tightening of the policy
    // that removes the task arm — which would break every routed section fill in
    // the product — fails loudly rather than looking like better isolation.
    const B = NAMESPACES.find((n) => n.key === RECORDS.moduleB.key)
    const stranger = USERS.reviewer // full e2emod CRUD, nothing at all on e2emodb

    expect(
      hasPermissionLegacy(stranger.id, `${RECORDS.moduleB.key}:read`),
      'the stranger holds no e2emodb permission',
    ).toBe(false)
    expect(
      recordsVisibleTo(stranger.id, [B.probe]),
      '…and reads the row through no permission arm',
    ).toBe(0)

    // Hand them exactly one row, the way the engine does.
    const taskId = 'e2e6f400-0000-4000-8000-0000000000a1'
    sql(`
      DELETE FROM task_instances WHERE id = '${taskId}';
      INSERT INTO task_instances (id, company_id, entity_type, entity_id, task_kind_id, status_id, assigned_to, created_at, updated_at)
      VALUES ('${taskId}', '${COMPANY_ID}', '${RECORDS.moduleB.key}', '${B.probe}', 'REVIEW', 'ASSIGNED',
              '${stranger.id}', NOW(), NOW());`)

    try {
      expect(
        recordsVisibleTo(stranger.id, [B.probe]),
        'the task arm admits them to the one row they were handed',
      ).toBe(1)

      // …and to nothing else in that namespace. This is the assertion that makes
      // the arm a grant rather than a hole.
      expect(
        recordIdsInModuleVisibleTo(stranger.id, RECORDS.moduleB.key),
        'and to no other e2emodb row',
      ).toEqual([B.probe])
    } finally {
      sql(`DELETE FROM task_instances WHERE id = '${taskId}'`)
    }

    // Revoked with the task. The arm is live state, not a durable grant.
    expect(
      recordsVisibleTo(stranger.id, [B.probe]),
      'once the task is gone, so is the access',
    ).toBe(0)
  })

  test('GET /records applies the same dispatch — per module, not per route', async ({ browser }) => {
    // The REST list endpoint is where this could most easily have been gated
    // wrongly, and it is the one surface where RLS is NOT a backstop: REST
    // connects as the superuser and REST_RLS_ENABLED is off by default. It
    // returns rows from many modules at once, so no single verb can gate it —
    // `listRecords` resolves the namespace once per DISTINCT module and filters.
    //
    // Asserted through the real HTTP surface, as the persona, with their real
    // session cookie.
    for (const ns of NAMESPACES) {
      const ctx = await pool.context(browser, AUTH[ns.holder])
      const res = await restGet(ctx, '/records')
      expect(res.status(), `${ns.holder} may call GET /records`).toBe(200)
      const body = await res.json()
      const returned = body?.records ?? body?.data?.records ?? []
      const ids = returned.map((r) => r.id)

      expect(ids, `${ns.holder} is returned their own ${ns.label} record`).toContain(ns.probe)

      // …and none of the other namespaces' rows, in the same response.
      for (const other of NAMESPACES.filter((o) => o.holder !== ns.holder)) {
        expect(
          ids,
          `${ns.holder}'s list does not contain the ${other.label} record`,
        ).not.toContain(other.probe)
      }

      // Every row that came back really is from the holder's namespace — a
      // per-row check rather than a per-probe one, so a leaked FOURTH module's
      // record would fail here too.
      const foreign = returned.filter((r) => (r.moduleKey ?? null) !== ns.key)
      expect(
        foreign.map((r) => `${r.id}:${r.moduleKey}`),
        `every row in ${ns.holder}'s list belongs to ${ns.label}`,
      ).toEqual([])
    }

    // The zero-grant control, through the same door. `filterReadableRecords`
    // returns [] rather than 403 for a caller who holds nothing — an empty
    // list, not an error, and that distinction is worth pinning because a
    // future route-level gate would change it.
    const ctx = await pool.context(browser, AUTH.noAccess)
    const res = await restGet(ctx, '/records')
    expect(res.status(), 'a caller with no records grant is not refused outright').toBe(200)
    const body = await res.json()
    expect(
      (body?.records ?? body?.data?.records ?? []).length,
      '…they are simply handed nothing',
    ).toBe(0)
  })

  test('the plain namespace is reached by records:*, and module grants do not confer it', () => {
    // The COALESCE arm, stated on its own. `module_key IS NULL` rows fall back
    // to the literal module id 'records', which is a real row in authz.modules
    // and NOT a magic value — so a module grant must not reach them and
    // `records:read` must not reach a module's rows. Both halves, because the
    // COALESCE is exactly the kind of expression an edit can invert.
    expect(hasPermissionLegacy(USERS.author.id, 'records:read'), 'author holds records:read').toBe(
      true,
    )
    expect(
      recordsVisibleTo(USERS.author.id, [PROBE.plain]),
      '…and reads the plain submission',
    ).toBe(1)
    expect(
      recordsVisibleTo(USERS.author.id, [PROBE.modA, PROBE.modB]),
      '…and neither promoted module’s records',
    ).toBe(0)

    for (const persona of ['reviewer', 'approver']) {
      expect(
        hasPermissionLegacy(USERS[persona].id, 'records:read'),
        `${persona} holds a module grant but NOT records:read`,
      ).toBe(false)
      expect(
        recordsVisibleTo(USERS[persona].id, [PROBE.plain]),
        `…and reads no plain submission`,
      ).toBe(0)
    }
  })
})
