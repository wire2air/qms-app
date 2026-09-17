// PERM-J2 — delete is enforced on the WRITE, not just on the button.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE DEFECT THIS EXISTS TO KEEP CLOSED (F-27)
//
// A paranoid model's `delete()` in the syncEngine sets the tombstone and then
// switches the operation to an UPDATE (`syncEngine/core/BaseModel.js`). So the
// mutation that reaches Postgres from the browser is
//
//     UPDATE capas SET deleted_at = now() WHERE id = …
//
// which Postgres evaluates against `capas_upd` — the UPDATE policy, asking for
// `capa:update`. The `capas_delete_rls` policy, the one that asks for
// `capa:delete`, is NEVER REACHED on the GraphQL path. Every delete permission
// in the product was unreachable from the SPA; the button was the only thing
// stopping anyone, and a button is not a gate.
//
// REST was never affected (`REST_RLS_ENABLED` is false and all 59
// `router.delete` routes carry a route-level gate), which is exactly why this
// went unnoticed: every test that existed ran on the path that was fine.
//
// The fix is a `BEFORE UPDATE OF deleted_at … WHEN (NEW.deleted_at IS NOT NULL
// AND OLD.deleted_at IS NULL)` trigger over 29 tables
// (`enforce_soft_delete_permission`). RLS cannot express this: `WITH CHECK
// (OLD.deleted_at IS NULL)` raises `missing FROM-clause entry for table "old"`,
// and permissive policies only ever OR, so a second UPDATE policy could only
// widen access. A trigger is the only instrument that narrows here.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY `reviewer@e2e.test` IS THE ONLY PERSONA THAT PROVES THIS
//
// The exposed principal is the holder of `:update` WITHOUT `:delete` — the
// ordinary "author, not approver" shape, and by far the most common non-admin
// role in live data. A pure reader is stopped by the UPDATE policy itself and
// therefore proves nothing about the delete gate: the test would pass with the
// trigger dropped.
//
// Measured on app-db, 2026-09-17:
//   reviewer  capa:read t · capa:update t · capa:delete f   ← the exposed shape
//   author    capa:update t · capa:delete f
//
// So `reviewer` must be REFUSED the soft delete while still being ALLOWED an
// ordinary edit. Both halves are asserted. The second is what distinguishes
// "the delete gate works" from "this persona cannot write at all", which is the
// failure mode that would make this file pass for the wrong reason.
//
// Observed refusal (verbatim, same date):
//   ERROR: Deleting this record requires one of: capa:delete.
//   HINT:  This is a paranoid model, so a delete is an UPDATE that sets
//          deleted_at. Editing the record still only needs its update permission.
import { test, expect } from '@playwright/test'
import { COMPANY_ID, USERS } from '../fixtures/cast.js'
import { sql, sqlAsAppUser, sqlValue } from '../fixtures/db.js'
import { attemptSoftDelete, holdsPermission } from '../fixtures/permissions.js'

const uid = (email) => sqlValue(`SELECT id FROM users WHERE email = '${email}'`)

let reviewer

test.beforeAll(() => {
  reviewer = uid(USERS.reviewer.email)
  expect(reviewer, 'reviewer@e2e.test is seeded').toBeTruthy()
})

/**
 * A record created for this run, so the assertions never depend on which other
 * suite ran first and a stray tombstone cannot be mistaken for a pass.
 *
 * CLONED FROM A SEEDED ROW RATHER THAN BUILT FIELD BY FIELD. `capas` has
 * fourteen NOT NULL columns without defaults (`capa_number`, `owner_id`,
 * `type_id`, `priority_id`, `site_id`, `department_id`, `source_type`,
 * `initiated_at`, the four audit columns …) and `nonconformances` has seven.
 * Spelling them out here means this fixture breaks every time the schema gains
 * a required column — which is a test maintenance cost paid for nothing, since
 * none of those values is what the file is about. `INSERT … SELECT` from an
 * existing row inherits whatever the schema currently demands.
 *
 * Inserted with RLS bypassed: the fixture is not the thing under test.
 */
function cloneRecord(table, numberColumn, suffix) {
  const title = `E2E PERM-J2 ${suffix} ${Date.now()}`
  const id = sqlValue(
    `INSERT INTO ${table}
     SELECT (t).*
       FROM (
         SELECT (
           jsonb_populate_record(
             NULL::${table},
             to_jsonb(src) || jsonb_build_object(
               'id', gen_random_uuid(),
               '${numberColumn}', 'E2E-J2-' || substr(gen_random_uuid()::text, 1, 8),
               'title', '${title}',
               'status_id', 'DRAFT',
               'deleted_at', NULL
             )
           )
         ) AS t
         FROM ${table} src
        WHERE src.company_id = '${COMPANY_ID}' AND src.deleted_at IS NULL
        ORDER BY src.created_at DESC
        LIMIT 1
       ) s
     RETURNING id`,
  )
  if (!id) throw new Error(`no seeded ${table} row to clone — has e2e-seed.sql been applied?`)
  return { id, title }
}

const freshCapa = (suffix) => cloneRecord('capas', 'capa_number', suffix)

test.describe('PERM-J2 — a soft delete is a permission decision, not a UI decision', () => {
  test('the persona still holds update-without-delete — the shape the whole file rests on', () => {
    expect(holdsPermission(reviewer, 'capa:update'), 'reviewer holds capa:update').toBe(true)
    expect(holdsPermission(reviewer, 'capa:delete'), 'reviewer must NOT hold capa:delete').toBe(
      false,
    )
  })

  test('an ordinary edit is allowed — the control that proves the persona can write at all', () => {
    const capa = freshCapa('editable')
    const newTitle = `${capa.title} (edited)`

    const r = sqlAsAppUser(`UPDATE capas SET title = '${newTitle}' WHERE id = '${capa.id}';`, {
      userId: reviewer,
      companyId: COMPANY_ID,
    })

    expect(r.ok, `an update holder may edit: ${r.error}`).toBe(true)
    expect(sqlValue(`SELECT title FROM capas WHERE id = '${capa.id}'`)).toBe(newTitle)

    sql(`DELETE FROM capas WHERE id = '${capa.id}'`)
  })

  test('the soft delete is REFUSED, and the row is still live afterwards', () => {
    const capa = freshCapa('undeletable')

    const outcome = attemptSoftDelete('capas', capa.id, reviewer)

    expect(outcome.allowed, 'an update-only holder must not be able to soft delete').toBe(false)
    // The refusal must be the delete guard, not some unrelated failure that
    // happens to also produce an error — a test that accepts any error passes
    // when the table is missing.
    expect(outcome.error, 'refused by the soft-delete guard, naming the permission').toContain(
      'capa:delete',
    )
    expect(outcome.stillLive, 'refused AND rolled back — deleted_at is still NULL').toBe(true)

    sql(`DELETE FROM capas WHERE id = '${capa.id}'`)
  })

  test('the same guard holds on nonconformances — one table is a coincidence, two is a rule', () => {
    const { id: nc } = cloneRecord('nonconformances', 'nc_number', 'nc')

    expect(holdsPermission(reviewer, 'ncr:update')).toBe(true)
    expect(holdsPermission(reviewer, 'ncr:delete')).toBe(false)

    const outcome = attemptSoftDelete('nonconformances', nc, reviewer)
    expect(outcome.allowed, 'ncr soft delete refused without ncr:delete').toBe(false)
    expect(outcome.stillLive, 'deleted_at is still NULL').toBe(true)

    sql(`DELETE FROM nonconformances WHERE id = '${nc}'`)
  })

  test('the guard is a permission check, not a blanket ban — granting delete allows it', () => {
    // WHY THIS CASE MATTERS MORE THAN THE REFUSALS. Every assertion above is
    // satisfied by a trigger that refuses EVERYONE, which would be a total
    // outage of soft delete rather than a working gate. This is the only case
    // that distinguishes the two, so it is the one to read first when this file
    // goes red.
    const capa = freshCapa('grantable')
    const roleId = sqlValue(
      `SELECT r.id FROM roles r
        JOIN roles_on_users ru ON ru.role_id = r.id AND ru.deleted_at IS NULL
       WHERE ru.user_id = '${reviewer}' AND r.company_id = '${COMPANY_ID}'
         AND r.deleted_at IS NULL
       ORDER BY r.name LIMIT 1`,
    )
    expect(roleId, 'reviewer reaches at least one role directly').toBeTruthy()

    // `company_id` is NOT NULL here and part of the composite cross-tenant
    // seal — a grant row cannot be written without saying which tenant it
    // belongs to, which is the property that stops a role in one company from
    // being pointed at a module binding in another.
    sql(
      `INSERT INTO authz.role_module_permissions (role_id, company_id, module_id, action_id, scope_id)
       VALUES ('${roleId}', '${COMPANY_ID}', 'capa', 'delete', 'tenant') ON CONFLICT DO NOTHING`,
    )
    try {
      expect(holdsPermission(reviewer, 'capa:delete'), 'the grant landed').toBe(true)

      const outcome = attemptSoftDelete('capas', capa.id, reviewer)
      expect(outcome.allowed, `with capa:delete the same write succeeds: ${outcome.error}`).toBe(
        true,
      )
      expect(outcome.stillLive, 'deleted_at is now set').toBe(false)
    } finally {
      sql(
        `DELETE FROM authz.role_module_permissions
          WHERE role_id = '${roleId}' AND module_id = 'capa' AND action_id = 'delete'`,
      )
      sql(`DELETE FROM capas WHERE id = '${capa.id}'`)
    }

    // The grant must be gone again, or every later run of this suite — and every
    // other suite using this persona — silently tests a wider role than it says.
    expect(holdsPermission(reviewer, 'capa:delete'), 'the grant was rolled back').toBe(false)
  })

  test('the DELETE policy still exists underneath — it is unreachable, not absent', () => {
    // F-27 was "the delete policy is never evaluated", not "there is no delete
    // policy". If someone concludes the policies are dead weight and drops
    // them, REST loses its gate while this suite stays green. So the policy's
    // existence is pinned here explicitly.
    const policies = sqlValue(
      `SELECT count(*) FROM pg_policies
        WHERE tablename = 'capas' AND cmd = 'DELETE'`,
    )
    expect(Number(policies), 'capas still carries a DELETE policy').toBeGreaterThan(0)
  })
})
