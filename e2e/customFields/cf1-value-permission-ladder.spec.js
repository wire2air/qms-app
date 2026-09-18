// CF-1 — the graded permission ladder on `entity_field_values`, both sides of
// every rung.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE FINDING THIS PINS
//
// L-2, the module's headline defect (`docs/modules/custom-fields-lookups/
// 22-hardening-2026-09-01.md`). All four policies on `entity_field_values` read
//
//     USING ((company_id = current_setting('app.current_company_id')))
//
// and NOTHING more. Not a permission, not a scope, not a host-record check.
// Re-verified on `app-db` before the fix as `noaccess@e2e.test`, an account
// holding no grant in any module, under `SET ROLE app_user`:
//
//     SELECT count(*)                       ->  2239 rows
//     UPDATE … SET payload = payload || …   ->  1 row
//     DELETE … WHERE id = …                 ->  1 row
//     INSERT … entity_type 'Nonconformance' ->  accepted
//
// So any authenticated member of the tenant could read, rewrite or destroy the
// custom-field answers on every NC, CAPA, Change Request, Audit and Document in
// the company. The sibling schema table next to it was correctly gated the
// whole time, which is what made the gap easy to miss.
//
// The fix gates each verb on the **HOST record's** module, because editing an
// NC's custom fields *is* editing the NC:
//
//     SELECT -> host `read`     INSERT -> host `create` OR `update`
//     UPDATE -> host `update`   DELETE -> host `delete`
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY EVERY PROBE IS TWO-SIDED, AND WHY THAT IS SHARPER HERE THAN USUAL
//
// An RLS refusal is a ZERO-ROW SUCCESS. Nothing throws and nothing 403s — the
// UPDATE simply matches no rows. So `expect().rejects` is the wrong assertion,
// and a one-sided "the denied persona wrote nothing" is worth nothing: it passes
// identically when the seed did not apply, when the probe row was never created,
// and when the policy was deleted outright.
//
// Sharper still on THIS table, and this is the trap the whole file is shaped
// around: **Postgres applies the SELECT policy to the rows an `UPDATE … WHERE`
// reads.** A zero-grant persona is filtered out before the UPDATE policy is ever
// consulted. Their UPDATE therefore returns 0 rows whether the UPDATE policy
// exists or not — which means a `noAccess`-only write probe would have PASSED
// against the L-2 defect and proved nothing at all.
//
// The only construction that escapes that is a graded ladder where each rung
// differs from the one below it by exactly ONE grant, hitting THE SAME row in
// the same run:
//
//   noAccess   no grant in any module            sees nothing, writes nothing
//   auditor    ncr:read                          SEES the row, still cannot write it
//   reviewer   ncr:read + ncr:update             writes it; cannot delete it
//   author     + ncr:close/create/manage_access  same — because ncr:delete is
//                                                not in the E2E grant set at all
//
// `auditor` is the rung that carries the proof. She reaches the row through the
// SELECT policy, so the UPDATE policy is genuinely reached and genuinely says
// no. Below her a zero is ambiguous; at her rung it is not.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHAT WAS MEASURED TO JUSTIFY THE ASSERTIONS (app-db, 2026-09-01)
//
// Grants, read from `roles_on_users` ⨝ `authz.role_module_permissions`:
//
//   auditor      ncr,capa,change_control,document_control,audit_management: read
//   reviewer     those five: read + update
//   author       ncr: close,create,manage_access,read,update
//                change_control: + delete    audit_management: + delete
//   controller   document_control: delete,read,update   (and nothing else)
//   noAccess     nothing
//
// Ladder, via `sqlAsAppUser` (the `app_user` role + the request path's GUCs),
// against throwaway probe rows:
//
//   persona     selNC  selDoc   updNC  delNC   insNC        updDoc  delDoc
//   noAccess        0       0       0      0   DENIED 42501      0       0
//   auditor       291     660       0      0   DENIED 42501      0       0
//   reviewer      291     660       1      0   1                 1       0
//   author        291     660       1      0   1                 1       0
//   controller      0     660       0      0   DENIED 42501      1       1
//
// Two rows there are load-bearing beyond the ladder:
//
//   * `controller` holds `document_control:delete` and is the ONLY seeded
//     persona holding a host `delete` grant on a mapped module — so she is the
//     positive half of the DELETE probe, and her selNC=0 makes her the negative
//     half of the same probe on a different entity type, in one persona.
//   * NOBODY in the E2E tenant holds `ncr:delete`, which is why delNC is 0 all
//     the way up the ladder. That is a fact about the fixture, not about the
//     policy, and the DELETE test says so and moves to Document to prove it.
//
// Counts are never asserted as literals — ground truth is taken with RLS
// bypassed in the same run and the personas are compared to it, so the file
// survives the tenant growing.
import { test, expect } from '@playwright/test'
import { COMPANY_ID, USERS } from '../fixtures/cast.js'
import { sqlAsAppUser } from '../fixtures/db.js'
import {
  affectedRows,
  dbNow,
  deniedByPolicy,
  hasPermission,
  installCustomFieldPersonas,
  removeValueRows,
  seedValueRow,
  valueRowsInTable,
  valueRowsVisibleTo,
} from '../fixtures/customFields.js'

/** Rungs in grant order. `grants` is documentation AND an assertion (see below). */
const LADDER = [
  { persona: 'noAccess', ncr: [] },
  { persona: 'auditor', ncr: ['read'] },
  { persona: 'reviewer', ncr: ['read', 'update'] },
  { persona: 'author', ncr: ['read', 'update', 'create'] },
]

const probes = []

/**
 * Upper bound for every count comparison in this file.
 *
 * Three agents run Playwright against this shared E2E tenant at once, and other
 * suites create host records — and therefore answer rows — while this one runs.
 * Every assertion below reads the table twice (ground truth, then a persona's
 * view), and a concurrent insert landing between the two reads fails it for a
 * reason that has nothing to do with the policy. Freezing both sides onto rows
 * that existed when this file started makes the comparison about RLS again.
 */
let stableBefore = null

function probe(entityType) {
  const id = seedValueRow(entityType)
  probes.push(id)
  return id
}

const update = (userId, rowId) =>
  sqlAsAppUser(
    `UPDATE entity_field_values SET payload = payload || '{"cf1":1}'::jsonb WHERE id = '${rowId}';`,
    { userId, companyId: COMPANY_ID },
  )

const del = (userId, rowId) =>
  sqlAsAppUser(`DELETE FROM entity_field_values WHERE id = '${rowId}';`, {
    userId,
    companyId: COMPANY_ID,
  })

/**
 * The row id is generated test-side rather than by `gen_random_uuid()` so an
 * ACCEPTED insert can be swept in `afterAll`. A denied insert leaves nothing, so
 * registering the id up-front is harmless.
 */
const insert = (userId, entityType) => {
  const id = crypto.randomUUID()
  probes.push(id)
  return sqlAsAppUser(
    `INSERT INTO entity_field_values (id, company_id, entity_type, entity_id, payload, form_schema, created_at, updated_at)
     VALUES ('${id}', '${COMPANY_ID}', '${entityType}', gen_random_uuid(), '{}'::jsonb, '[]'::jsonb, now(), now());`,
    { userId, companyId: COMPANY_ID },
  )
}

test.beforeAll(() => {
  installCustomFieldPersonas()
  stableBefore = dbNow()
})

test.afterAll(() => {
  // Probe rows carry synthetic `entity_id`s and belong to nothing, so removing
  // them restores the tenant exactly. Rows an INSERT probe created are swept by
  // their empty payload + synthetic entity — see the sweep in the INSERT test.
  removeValueRows(probes)
})

test.describe('CF-1 — entity_field_values is gated on the HOST record’s module', () => {
  test('the grant ladder is what the fixture claims it is', () => {
    // Everything below reads as a permission result only if the permissions are
    // what this file says. Assert them first, so a re-seeded or re-granted
    // fixture fails HERE — with the reason spelled out — instead of surfacing
    // three tests later as an inexplicable row count.
    for (const { persona, ncr } of LADDER) {
      for (const action of ['read', 'update', 'create']) {
        expect(
          hasPermission(USERS[persona].id, 'ncr', action),
          `${persona} ${ncr.includes(action) ? 'holds' : 'does not hold'} ncr:${action}`,
        ).toBe(ncr.includes(action))
      }
    }
    // The rung that makes DELETE untestable on NCs, stated rather than implied.
    expect(
      hasPermission(USERS.author.id, 'ncr', 'delete'),
      'no seeded E2E persona holds ncr:delete — the DELETE test moves to Document',
    ).toBe(false)
    expect(
      hasPermission(USERS.controller.id, 'document_control', 'delete'),
      'the Doc Controller does hold document_control:delete',
    ).toBe(true)
  })

  test('SELECT — the ladder’s bottom rung sees nothing, and every rung above sees everything', () => {
    // Leg 1 — ground truth, RLS bypassed. Without this the two legs below are
    // both consistent with an empty table.
    const inTable = valueRowsInTable('Nonconformance', { before: stableBefore })
    expect(inTable, 'the tenant holds NC custom-field answers to leak').toBeGreaterThan(0)

    // Leg 2 — the denial. Before the fix this number was the whole table.
    expect(
      valueRowsVisibleTo(USERS.noAccess.id, 'Nonconformance', { before: stableBefore }),
      'a member holding no grant in any module reads no NC answers at all',
    ).toBe(0)

    // Leg 3 — the pair, on the SAME rows in the same run. `read` alone is the
    // whole bar: the policy uses `authz.has_permission(module,'read')`, whose
    // read-fallback makes it "holds ANY grant on the host module", deliberately
    // no tighter than the host table's own read policy. Equality rather than
    // `> 0`, because the policy carries no row-level narrowing and a granted
    // reader seeing SOME of the rows would be a different defect that `> 0`
    // would not notice.
    for (const persona of ['auditor', 'reviewer', 'author']) {
      expect(
        valueRowsVisibleTo(USERS[persona].id, 'Nonconformance', { before: stableBefore }),
        `${persona} holds ncr:read and reads every NC answer row`,
      ).toBe(inTable)
    }
  })

  test('UPDATE — read is not write, proved at the rung that can see the row', () => {
    const row = probe('Nonconformance')

    // The bottom rung. This zero is REAL but WEAK, and the comment is the point
    // of the test: `noAccess` is filtered out by the SELECT policy before the
    // UPDATE policy is consulted, so this assertion passed against the defect
    // too. It is here to bracket the ladder, not to carry it.
    expect(
      affectedRows(update(USERS.noAccess.id, row)),
      'a zero-grant member touches nothing (weak — SELECT already hid the row)',
    ).toBe(0)

    // The rung that carries the finding. `auditor` READS this exact row — the
    // previous test proved it — so the SELECT policy admits her and the UPDATE
    // policy is genuinely the thing saying no.
    expect(
      valueRowsVisibleTo(USERS.auditor.id, 'Nonconformance'),
      'the auditor can see these rows, so her zero below is the UPDATE policy',
    ).toBeGreaterThan(0)
    expect(
      affectedRows(update(USERS.auditor.id, row)),
      'ncr:read alone cannot rewrite an NC’s answers',
    ).toBe(0)

    // …and the pair, one grant further up, on the SAME row. Without this the
    // three zeros above are equally consistent with a row that does not exist.
    expect(
      affectedRows(update(USERS.reviewer.id, row)),
      'adding ncr:update — and nothing else — makes the identical statement land',
    ).toBe(1)
    expect(
      affectedRows(update(USERS.author.id, row)),
      'as does the record owner’s grant set',
    ).toBe(1)
  })

  test('DELETE — the verb is gated separately, shown on the one module that has it', () => {
    // On `Nonconformance` every rung returns 0, because no seeded persona holds
    // `ncr:delete` — a fixture fact, not a policy result, and a one-sided
    // reading of it would be exactly the mistake this file is written against.
    const ncRow = probe('Nonconformance')
    for (const persona of ['auditor', 'reviewer', 'author']) {
      expect(
        affectedRows(del(USERS[persona].id, ncRow), 'DELETE'),
        `${persona} holds no ncr:delete, so no NC answer row is deletable by them`,
      ).toBe(0)
    }

    // So the real two-sided probe moves to `Document`, where `controller` holds
    // `document_control:delete` and `reviewer` holds read+update and not delete.
    // One entity type, one row each, one grant apart.
    const docForReviewer = probe('Document')
    const docForController = probe('Document')

    expect(
      affectedRows(update(USERS.reviewer.id, docForReviewer)),
      'the reviewer reaches this Document row — her delete below is the DELETE policy',
    ).toBe(1)
    expect(
      affectedRows(del(USERS.reviewer.id, docForReviewer), 'DELETE'),
      'document_control update does not confer delete',
    ).toBe(0)

    expect(
      affectedRows(del(USERS.controller.id, docForController), 'DELETE'),
      'document_control:delete does — the same statement, one grant apart',
    ).toBe(1)

    // DELETE is dormant in the product (all three models are paranoid and the
    // app soft-deletes through UPDATE), so this policy guards a path nothing
    // takes today. It is gated at the matching verb so a future hard-delete is
    // not born ungated — which only means anything if the gate is tested.
  })

  test('INSERT — create OR update admits, read alone does not, and it fails LOUDLY', () => {
    // INSERT is the one verb on this table that raises rather than filtering:
    // there is no pre-existing row for the SELECT policy to hide, so the WITH
    // CHECK is always reached and a refusal surfaces as SQLSTATE 42501.
    for (const persona of ['noAccess', 'auditor']) {
      const res = insert(USERS[persona].id, 'Nonconformance')
      expect(
        deniedByPolicy(res),
        `${persona} cannot create an NC answers row (raised, not silently dropped)`,
      ).toBe(true)
    }

    // The pair. Both arms of `create OR update` are exercised: `reviewer` holds
    // ncr:update and NOT ncr:create, `author` holds both. The OR is not
    // decorative — the CREATE pages write the first answers row immediately
    // after the host record exists (`CustomFieldsCreateSection.persist()`), so a
    // create-only role must be admitted or raising an NC with custom fields
    // fails outright.
    expect(hasPermission(USERS.reviewer.id, 'ncr', 'create'), 'the reviewer has no ncr:create').toBe(
      false,
    )
    for (const persona of ['reviewer', 'author']) {
      const res = insert(USERS[persona].id, 'Nonconformance')
      expect(res.ok, `${persona}'s insert was accepted (stderr: ${res.error})`).toBeTruthy()
      expect(affectedRows(res, 'INSERT'), `${persona} wrote exactly one row`).toBe(1)
    }
    // The two rows the accepted inserts left are registered in `probes` by
    // `insert()` and swept in `afterAll`.
  })

  test('the tenant boundary survived the rewrite — the gate is AND, not OR', () => {
    // The policy is `company_id = … AND (owner OR host-module permission)`.
    // Replacing the second half is exactly the kind of edit that loses the
    // first, and this table holds one row of answers for every NC, CAPA, CR,
    // Audit and Document in the company.
    const policy = sqlAsAppUser(
      `SELECT 'RESULT=' || count(*) FROM entity_field_values WHERE company_id <> '${COMPANY_ID}';`,
      { userId: USERS.author.id, companyId: COMPANY_ID },
    )
    expect(policy.ok, `cross-tenant probe ran (stderr: ${policy.error})`).toBeTruthy()
    expect(
      Number(/RESULT=(\d+)/.exec(policy.output)?.[1]),
      'a fully-granted persona reads zero rows belonging to any other company',
    ).toBe(0)

    // Paired with the same persona reading their own tenant through the same
    // statement shape, so "zero" cannot be "the query was broken".
    expect(valueRowsVisibleTo(USERS.author.id, 'Nonconformance')).toBeGreaterThan(0)
  })
})
