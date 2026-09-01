// CF-4 — `entity_type` is a closed vocabulary, in the database, on both paths.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE FINDING THIS PINS
//
// L-4. Neither `entity_field_sets` nor `entity_field_values` had any constraint
// on `entity_type`; it was free text. Re-verified live before the fix — a
// `noaccess@e2e.test` session (holding no grant in any module, which is itself
// L-2) inserted `entity_type = 'NotARealEntity'` and it was ACCEPTED.
//
// Why an unbounded value mattered beyond untidiness:
//
//   * `entity_id` is polymorphic with **no** foreign key, by design. So
//     `entity_type` is the ONLY thing in the row that says what `entity_id`
//     points at. A typo'd or invented type produces answers attached to nothing,
//     which nothing will ever surface again and nothing will ever clean up.
//   * Since the L-2 fix it is also the only thing that says WHICH PERMISSION
//     GATES THE ROW. The policies map `entity_type` to a host module through an
//     8-row VALUES list; a value outside that list matches no row and is denied
//     to every non-owner. That is fail-closed, which is the right default — but
//     it means a mistyped type silently makes data unreachable rather than
//     loudly rejecting it.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY THIS FILE PROBES AS THE SUPERUSER, AND WHY THAT IS THE POINT
//
// Every other file in this suite probes through `sqlAsAppUser`, because RLS is
// what governs the GraphQL/syncEngine path the frontend actually uses, and REST
// connects as the superuser and bypasses RLS unless `REST_RLS_ENABLED=true`
// (off by default).
//
// L-4 was closed with a CHECK CONSTRAINT rather than a policy for exactly that
// reason: a policy would leave the REST/superuser path unbounded. So this file
// probes with the plain superuser `sql()` helper ON PURPOSE — it is asking the
// question the constraint was chosen to answer, and a probe that went through
// `app_user` would be testing L-2's VALUES map a second time instead.
//
// Both halves are then checked against each other in the last test: the CHECK's
// list and the live policy's VALUES list must name the same eight types, because
// the constraint bounds one path and the policy bounds the other, and a
// vocabulary that disagreed between them would be a gap in whichever path the
// shorter list did not cover.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHAT WAS MEASURED TO JUSTIFY THE ASSERTIONS (app-db, 2026-09-01)
//
// As the superuser, INSERT into `entity_field_values`:
//
//   Nonconformance Capa ChangeRequest AuditInstance Document Training
//   CustomerComplaint Complaint                       -> all 8 ACCEPTED
//   'NotARealEntity'                                  -> REJECTED 23514
//   'nonconformance'  (wrong case)                    -> REJECTED 23514
//   'Nonconformances' (plural — the shape audit_logs
//                      writes, see CF-6)              -> REJECTED 23514
//
// and the same rejection on `entity_field_sets`. Constraint names:
// `entity_field_values_entity_type_chk`, `entity_field_sets_entity_type_chk`.
//
// The two near-miss values are in the list deliberately. A CHECK written with
// `lower(entity_type) = ANY(...)` or a `LIKE` would pass the obvious
// `NotARealEntity` probe and admit both of them — and the plural one is not
// hypothetical: it is the exact string this module's own audit rows are filed
// under (L-6), so it is the typo most likely to be pasted in by someone reading
// `audit_logs`.
import { test, expect } from '@playwright/test'
import { COMPANY_ID } from '../fixtures/cast.js'
import { sql, sqlValue } from '../fixtures/db.js'
import { CUSTOM_FIELD_ENTITY_TYPES, removeValueRows } from '../fixtures/customFields.js'

/**
 * Values that are NOT registered but are near enough to a registered one that a
 * sloppy constraint would let them through.
 */
const NEAR_MISSES = [
  { value: 'NotARealEntity', why: 'plainly invented — the baseline probe' },
  { value: 'nonconformance', why: 'wrong case — a case-insensitive CHECK would admit it' },
  { value: 'Nonconformances', why: 'PLURAL — the exact string audit_logs files these rows under (L-6)' },
  { value: 'Nonconformance ', why: 'trailing space — a trimmed comparison would admit it' },
]

/**
 * Try an insert as the SUPERUSER (the REST path) and report which way it went.
 * Returns `{ accepted, error }`; the caller cleans up on acceptance.
 */
function trySuperuserInsert(table, entityType, id) {
  const columns =
    table === 'entity_field_values'
      ? `(id, company_id, entity_type, entity_id, payload, form_schema, created_at, updated_at)
         VALUES ('${id}', '${COMPANY_ID}', $$${entityType}$$, gen_random_uuid(), '{}'::jsonb, '[]'::jsonb, now(), now())`
      : `(id, company_id, entity_type, schema, created_at, updated_at)
         VALUES ('${id}', '${COMPANY_ID}', $$${entityType}$$, '[]'::jsonb, now(), now())`
  try {
    sql(`INSERT INTO ${table} ${columns}`)
    return { accepted: true, error: '' }
  } catch (err) {
    return { accepted: false, error: `${err.stderr ?? err.message ?? ''}` }
  }
}

const inserted = []

test.afterAll(() => {
  removeValueRows(inserted)
  // `entity_field_sets` rows this file created are removed by id in the test
  // that creates them; this sweep covers an interrupted run.
  sql(
    `DELETE FROM entity_field_sets
      WHERE company_id = '${COMPANY_ID}'
        AND id IN ('11111111-2222-4333-8444-666666666666')`,
  )
})

test.describe('CF-4 — the entity_type allowlist holds on the path RLS does not cover', () => {
  test('all eight registered types are accepted — on both tables', () => {
    // The positive half FIRST. Without it, every rejection below is equally
    // consistent with a constraint that rejects everything, which is not a
    // hypothetical failure mode: a CHECK written against the wrong column name
    // or a stale list would look exactly like a very effective allowlist.
    for (const type of CUSTOM_FIELD_ENTITY_TYPES) {
      const id = crypto.randomUUID()
      const res = trySuperuserInsert('entity_field_values', type, id)
      expect(res.accepted, `entity_field_values accepts '${type}' (${res.error})`).toBe(true)
      inserted.push(id)
    }
    // …and clean up immediately rather than in afterAll, so the counts CF-1 and
    // CF-2 take as ground truth are not perturbed if this file runs alongside
    // them in a future parallel configuration.
    removeValueRows(inserted.splice(0))

    // `entity_field_sets` is keyed (company_id, entity_type) and the tenant may
    // legitimately already hold rows, so probe it on the one type nothing else
    // in this suite touches and delete it straight away.
    const setId = '11111111-2222-4333-8444-666666666666'
    sql(`DELETE FROM entity_field_sets WHERE id = '${setId}' OR (company_id = '${COMPANY_ID}' AND entity_type = 'Complaint')`)
    const okSet = trySuperuserInsert('entity_field_sets', 'Complaint', setId)
    expect(okSet.accepted, `entity_field_sets accepts 'Complaint' (${okSet.error})`).toBe(true)
    sql(`DELETE FROM entity_field_sets WHERE id = '${setId}'`)
  })

  for (const { value, why } of NEAR_MISSES) {
    test(`'${value}' is rejected — ${why}`, () => {
      for (const table of ['entity_field_values', 'entity_field_sets']) {
        const id = crypto.randomUUID()
        const res = trySuperuserInsert(table, value, id)
        if (res.accepted) {
          inserted.push(id)
          sql(`DELETE FROM ${table} WHERE id = '${id}'`)
        }
        expect(res.accepted, `${table} rejects '${value}'`).toBe(false)
        // The constraint by name, not merely "something went wrong" — a NOT NULL
        // violation or a typo'd column would otherwise read as a passing probe.
        expect(res.error, `${table} rejected it via its entity_type CHECK`).toMatch(
          new RegExp(`violates check constraint "${table}_entity_type_chk"`),
        )
      }
    })
  }

  test('the CHECK and the RLS policy bound the SAME eight types', () => {
    // The two halves cover different paths — the constraint covers REST and
    // superuser writes, the policy covers GraphQL — so a vocabulary that
    // disagreed between them would leave a gap in whichever path held the
    // shorter list. They are also both restatements of
    // `services/customFields/entityRegistry.js`, which this repo cannot import
    // across the git-repo boundary, so this is where the two DB-side copies are
    // held to each other and to the fixture's own copy.
    const checkDef = sqlValue(
      `SELECT pg_get_constraintdef(oid) FROM pg_constraint
        WHERE conname = 'entity_field_values_entity_type_chk'`,
    )
    expect(checkDef, 'the CHECK constraint exists').toBeTruthy()

    // Newlines are flattened IN SQL, not in JS: `sqlValue` returns only psql's
    // FIRST output line, and `pg_get_expr` pretty-prints this policy across
    // several — so reading it raw silently hands back the first 60 characters
    // and the loop below then "passes" by finding nothing to disagree with.
    const policyDef = sqlValue(
      `SELECT replace(replace(pg_get_expr(polqual, polrelid), chr(10), ' '), chr(13), ' ')
         FROM pg_policy WHERE polname = 'entity_field_value_select_rls'`,
    )
    expect(policyDef, 'the SELECT policy exists').toBeTruthy()
    expect(policyDef, 'and was read whole, not truncated at the first newline').toContain(
      'has_permission',
    )

    for (const type of CUSTOM_FIELD_ENTITY_TYPES) {
      expect(checkDef, `the CHECK names ${type}`).toContain(`'${type}'`)
      expect(policyDef, `the policy's VALUES map names ${type}`).toContain(`'${type}'`)
    }

    // Neither list may hold anything the other does not. Counting quoted
    // literals is the cheap way to catch a NINTH type added to one and not the
    // other — the drift direction a "does it contain X" loop cannot see.
    const quotedTypes = (def) =>
      new Set(
        (def.match(/'[A-Z][A-Za-z]+'/g) ?? [])
          .map((s) => s.slice(1, -1))
          .filter((s) => /^[A-Z]/.test(s)),
      )
    expect(
      [...quotedTypes(checkDef)].sort(),
      'the CHECK holds exactly the registered eight and no more',
    ).toEqual([...CUSTOM_FIELD_ENTITY_TYPES].sort())

    // The policy string additionally contains module ids (lower-case, so the
    // regex above skips them) and the constant `RESULT`-free SQL around them, so
    // its extracted set is compared as a superset-free equality too.
    expect(
      [...quotedTypes(policyDef)].sort(),
      'the policy maps exactly the registered eight and no more',
    ).toEqual([...CUSTOM_FIELD_ENTITY_TYPES].sort())
  })

  test('the constraint is on the TABLE, so it also binds an UPDATE', () => {
    // An allowlist enforced only at INSERT is a common half-fix: the row is
    // created with a legal type and then moved to an illegal one. It matters
    // more than usual here because `entity_type` is the column the L-2 policies
    // read to decide who may reach the row — changing it changes the gate.
    const id = crypto.randomUUID()
    const created = trySuperuserInsert('entity_field_values', 'Nonconformance', id)
    expect(created.accepted, `probe row created (${created.error})`).toBe(true)
    inserted.push(id)

    let moved = true
    let error = ''
    try {
      sql(`UPDATE entity_field_values SET entity_type = 'NotARealEntity' WHERE id = '${id}'`)
    } catch (err) {
      moved = false
      error = `${err.stderr ?? ''}`
    }
    expect(moved, 'an existing row cannot be moved to an unregistered type').toBe(false)
    expect(error).toMatch(/violates check constraint "entity_field_values_entity_type_chk"/)

    // The pair: a move to another REGISTERED type is allowed, so the refusal
    // above is the vocabulary and not a blanket immutability trigger.
    sql(`UPDATE entity_field_values SET entity_type = 'Capa' WHERE id = '${id}'`)
    expect(
      sqlValue(`SELECT entity_type FROM entity_field_values WHERE id = '${id}'`),
      'a registered type is still a legal destination',
    ).toBe('Capa')
  })
})
