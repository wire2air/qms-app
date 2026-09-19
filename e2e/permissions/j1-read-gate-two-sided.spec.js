// PERM-J1 — a module read gate, proved from both sides, at the policy layer.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHAT THIS PINS
//
// The single most basic claim the permission system makes: a user with no grant
// on a module cannot read that module's records, and a user with the grant can
// read the SAME records. Nothing in the repository asserted that end to end
// before this file. The 151 integration tests in
// `backend/api/tests/integration/authz/` prove the decision FUNCTIONS are
// correct by calling them directly; they never prove a policy is attached to a
// table, which is the half that a bad migration silently removes.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY THE SPEC THIS IMPLEMENTS WAS REWRITTEN
//
// `docs/modules/permissions/14-playwright-journeys.md` specifies PERM-J1 as
// "the read-only role cannot create, anywhere", built on `reviewer@e2e.test`
// described as "9 × read @tenant". Measured on app-db 2026-09-17, that persona
// holds 22 permissions INCLUDING `capa:update`, `ncr:update`,
// `change_control:update` and full CRUD on `e2emod`. It is not a read-only
// role and a create-denial suite built on it would assert the wrong thing.
//
// `noaccess@e2e.test` is the persona with a true zero (0 effective permissions,
// verified in the same measurement), so the read gate is proved with that one
// and `reviewer` is used as the granted control. The create-denial half of the
// original spec moves to the delete/write journey, where the persona actually
// has the shape the assertion needs.
//
// ─────────────────────────────────────────────────────────────────────────────
// THREE NUMBERS, NEVER ONE
//
// An RLS denial is a zero-row success. `noaccess sees 0 rows` passes when the
// seed did not apply, when the table is empty, and when someone drops the
// policy and the table with it. So each case asserts:
//
//   ground truth (RLS bypassed)  = 1   the row is really there
//   granted persona              = 1   the gate admits the holder
//   denied persona               = 0   the gate refuses the non-holder
//
// The first number is what makes the third one evidence.
import { test, expect } from '@playwright/test'
import { COMPANY_ID, USERS } from '../fixtures/cast.js'
import { sqlValue } from '../fixtures/db.js'
import {
  effectivePermissions,
  expectRowVisibility,
  holdsPermission,
} from '../fixtures/permissions.js'

// Resolved once — the cast carries ids, but reading them from the database is
// what catches a seed that half-applied.
const uid = (email) => sqlValue(`SELECT id FROM users WHERE email = '${email}'`)

let noaccess
let reviewer

test.beforeAll(() => {
  noaccess = { id: uid(USERS.noAccess.email), email: USERS.noAccess.email }
  reviewer = { id: uid(USERS.reviewer.email), email: USERS.reviewer.email }
  expect(noaccess.id, 'noaccess@e2e.test is seeded').toBeTruthy()
  expect(reviewer.id, 'reviewer@e2e.test is seeded').toBeTruthy()
})

test.describe('PERM-J1 — the read gate admits the holder and refuses everyone else', () => {
  test('the fixture personas still have the shape every case below depends on', () => {
    // If this fails, every other assertion in this file is meaningless rather
    // than wrong — the personas drifted and the suite is probing nothing. It is
    // deliberately the first test in the file.
    expect(effectivePermissions(noaccess.id), 'noaccess holds a TRUE zero').toEqual([])

    expect(holdsPermission(reviewer.id, 'capa:read'), 'reviewer holds capa:read').toBe(true)
    expect(holdsPermission(reviewer.id, 'ncr:read'), 'reviewer holds ncr:read').toBe(true)
  })

  // One case per module rather than a loop, so a failure names the module in
  // the test title instead of an index.
  test('capas — a known CAPA is visible to the reader and invisible to the zero-grant user', () => {
    const capa = sqlValue(
      `SELECT id FROM capas WHERE company_id = '${COMPANY_ID}' AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1`,
    )
    expect(capa, 'the seed leaves at least one CAPA in the tenant').toBeTruthy()

    expectRowVisibility('capas', capa, { granted: reviewer, denied: noaccess, label: 'capas' })
  })

  test('nonconformances — same row, same two sides', () => {
    const nc = sqlValue(
      `SELECT id FROM nonconformances WHERE company_id = '${COMPANY_ID}' AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1`,
    )
    expect(nc, 'the seed leaves at least one NC in the tenant').toBeTruthy()

    expectRowVisibility('nonconformances', nc, {
      granted: reviewer,
      denied: noaccess,
      label: 'nonconformances',
    })
  })

  test('change_requests — same row, same two sides', () => {
    const cr = sqlValue(
      `SELECT id FROM change_requests WHERE company_id = '${COMPANY_ID}' AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1`,
    )
    expect(cr, 'the seed leaves at least one CR in the tenant').toBeTruthy()

    expectRowVisibility('change_requests', cr, {
      granted: reviewer,
      denied: noaccess,
      label: 'change_requests',
    })
  })

  test('documents — the reader reads, the zero-grant user does not', () => {
    const doc = sqlValue(
      `SELECT id FROM documents WHERE company_id = '${COMPANY_ID}' AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1`,
    )
    expect(doc, 'the seed leaves at least one document in the tenant').toBeTruthy()

    expectRowVisibility('documents', doc, {
      granted: reviewer,
      denied: noaccess,
      label: 'documents',
    })
  })
})
