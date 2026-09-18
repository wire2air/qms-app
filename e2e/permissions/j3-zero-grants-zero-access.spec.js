// PERM-J3 — zero grants means zero access, and the deliberate exceptions stay open.
//
// ─────────────────────────────────────────────────────────────────────────────
// TWO CLAIMS, AND THE SECOND IS THE ONE THAT ROTS
//
// The first half is obvious: a user with no permissions reads no records. It is
// asserted here across every Archetype-A module at once because a per-module
// policy is exactly the kind of thing a migration forgets one of.
//
// The second half is the one worth the file. Several modules are readable
// WITHOUT any grant on purpose — the template libraries and the equipment
// register are marked `public_read` in the catalog, and the product depends on
// it: a user filling in a form needs the form template, a user raising an NC
// needs the RCA templates. That decision is invisible in the code at the point
// of use and looks exactly like a missing policy to anyone auditing later.
//
// So this file pins it as a CONTROL. If a future hardening pass "closes the
// hole" by gating those modules, these cases fail loudly and the person doing
// it finds out here rather than from a user who can no longer open a form.
// A test suite that only ever asserts denial teaches the codebase that more
// denial is always better, which is false.
//
// ─────────────────────────────────────────────────────────────────────────────
// PM-R0 — NEVER ASSERT "THE LIST IS EMPTY"
//
// Every case below names a specific row that exists, and pairs the denial with
// a control persona reading that same row. `count = 0` on its own is satisfied
// by an unseeded database.
import { test, expect } from '@playwright/test'
import { COMPANY_ID, USERS } from '../fixtures/cast.js'
import { sqlValue } from '../fixtures/db.js'
import {
  countVisibleAsUser,
  effectivePermissions,
  expectRowVisibility,
} from '../fixtures/permissions.js'

const uid = (email) => sqlValue(`SELECT id FROM users WHERE email = '${email}'`)

let noaccess
let control

test.beforeAll(() => {
  noaccess = { id: uid(USERS.noAccess.email), email: USERS.noAccess.email }
  control = { id: uid(USERS.author.email), email: USERS.author.email }
  expect(noaccess.id).toBeTruthy()
  expect(control.id).toBeTruthy()
})

test.describe('PERM-J3 — the zero-grant persona', () => {
  test('holds literally nothing — the premise of every case below', () => {
    const held = effectivePermissions(noaccess.id)
    expect(held, `noaccess must hold zero permissions, got: ${held.join(' ')}`).toEqual([])
  })

  // Archetype-A: ordinary record modules, gated on `<module>:read`.
  const GATED = [
    { table: 'capas', label: 'CAPA' },
    { table: 'nonconformances', label: 'NCR' },
    { table: 'change_requests', label: 'Change Requests' },
    { table: 'documents', label: 'Documents' },
    { table: 'audit_instances', label: 'Audits' },
  ]

  for (const { table, label } of GATED) {
    test(`${label} — a real row is invisible to a zero-grant user and visible to a control`, () => {
      const row = sqlValue(
        `SELECT id FROM ${table} WHERE company_id = '${COMPANY_ID}' AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1`,
      )
      test.skip(!row, `no seeded ${table} row to probe`)

      expectRowVisibility(table, row, { granted: control, denied: noaccess, label })
    })
  }

  test('the public_read modules ARE readable with no grant — deliberate, and pinned so it stays deliberate', () => {
    // `public_read` is a column on `authz.module_table_bindings` — NOT on
    // `authz.modules`, which has only (id, name, section, display_order,
    // is_active). The binding is where a module is tied to its table, and the
    // flag belongs to that pairing rather than to the module.
    const bindings = sqlValue(
      `SELECT coalesce(string_agg(module_id || '=' || table_name, ' ' ORDER BY module_id), '')
         FROM authz.module_table_bindings WHERE public_read = true`,
    )
    expect(bindings, 'the catalog still marks some bindings public_read').not.toBe('')

    // Workflow templates are the load-bearing one: the workflow engine reads
    // them for every approval, for every user, regardless of grants. Note the
    // TABLE is `workflows` while the MODULE is `workflows_templates` — the two
    // names differ, which is exactly why the assertion reads the binding rather
    // than assuming a table name.
    const table = sqlValue(
      `SELECT table_name FROM authz.module_table_bindings
        WHERE module_id = 'workflows_templates' AND public_read = true`,
    )
    expect(table, 'workflows_templates is still bound public_read').toBe('workflows')

    const template = sqlValue(
      `SELECT id FROM ${table} WHERE company_id = '${COMPANY_ID}' AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1`,
    )
    test.skip(!template, `no seeded ${table} row to probe`)

    const truth = Number(sqlValue(`SELECT count(*) FROM ${table} WHERE id = '${template}'`))
    expect(truth, 'ground truth: the template exists').toBe(1)

    const seen = countVisibleAsUser(table, template, noaccess.id)
    expect(
      seen,
      `a zero-grant user MUST still read ${table} — the engine depends on it (binding public_read)`,
    ).toBe(1)
  })

  test('cross-tenant: the zero-grant user cannot see another company at all', () => {
    // The tenant boundary is a different control from the permission gate, and
    // it is the one whose failure is unrecoverable. Every policy in the system
    // ANDs on `company_id`; this asserts that the AND is really there for a
    // user who has no grants to confuse the result.
    const foreign = sqlValue(
      `SELECT id FROM capas WHERE company_id <> '${COMPANY_ID}' AND deleted_at IS NULL LIMIT 1`,
    )
    test.skip(!foreign, 'no second-tenant CAPA seeded')

    expect(countVisibleAsUser('capas', foreign, noaccess.id)).toBe(0)
    // And not visible to a fully-granted user of THIS tenant either — proving
    // the refusal is tenancy, not permission.
    expect(
      countVisibleAsUser('capas', foreign, control.id),
      'even a granted user sees nothing outside their tenant',
    ).toBe(0)
  })
})
