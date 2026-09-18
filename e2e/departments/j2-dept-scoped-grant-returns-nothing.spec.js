// DEPT-J2 — A department-scoped `departments:read` grant now matches the
// grantee's own department.
// FIXED 2026-09-07 (D-M1). Written to fail; the reds below turned green.
//
// The exact twin of the `sites` finding (sites/j10). Both tables have
// owner_col, dept_col and site_col ALL NULL in `authz.module_table_bindings`,
// so the RLS generator substitutes NULL::uuid into scope_allowed() and the
// expression collapses to `rank >= 4` — tenant. Ranks 1-3 are dead code, while
// the permission UI keeps offering all four tiers.
//
// 2026-08-04 — migration 20260804120000 bound the SITE tier (site_col) on both
// tables, which left only the OWNER and DEPARTMENT tiers dead and moved the
// collapse to `rank >= 3`.
//
// 2026-09-07 — migration 20260907410000 finished the job for `departments`, and
// the claim this file used to make about it was wrong. It said "`departments`
// has no department column to bind". It has one: ITSELF. `dept_col = 'id'` is
// the same reading 20260804120000 already applied to `sites.site_col = 'id'` —
// a department's department is the department. `owner_col` is bound to
// `supervisor_user_id` in the same migration, the column the model's own
// comment calls "Accountable person for this department".
//
// `sites` is deliberately NOT included: its two remaining tiers have no such
// obvious referent (what is the "department" of a site?), so it stays ∅/∅/id
// and the exact-match assertion at the bottom of this file now pins a
// DIFFERENCE between the two tables rather than a shared defect.
//
// It is a separate spec rather than a second case in the sites one because the
// two must be fixable and verifiable independently: a binding fix applied to
// `sites` alone leaves this red, which is the point.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH, USERS, DEPARTMENTS, COMPANY_ID } from '../fixtures/cast.js'
import { asAppUser } from '../fixtures/sites.js'
import { sqlValue } from '../fixtures/db.js'

const SCOPED_ROLE = 'e2e30000-0000-4000-8000-00000000000b'

test.describe('DEPT-J2 · a saved department-scoped grant reaches its department', () => {
  test('PRECONDITION · the grant is saved at department scope, and the grantee has a department', () => {
    expect(
      sqlValue(`SELECT scope_id FROM authz.role_module_permissions
                 WHERE role_id = '${SCOPED_ROLE}' AND module_id = 'departments' AND action_id = 'read'`),
    ).toBe('department')
    expect(
      sqlValue(`SELECT department_id FROM users WHERE id = '${USERS.deptReader.id}'`),
      'the grantee belongs to a department, so "department scope" has a referent',
    ).toBe(DEPARTMENTS.quality.id)
  })

  test('the route guard admits them — the failure is silent', async ({ browser }) => {
    // The guard checks that the permission string is held, not its scope, so
    // the grantee lands on a working page and is told nothing.
    const ctx = await browser.newContext({ storageState: AUTH.deptReader })
    const page = await ctx.newPage()
    await page.goto('/departments', { waitUntil: 'domcontentloaded' })
    await expect(page).not.toHaveURL(/\/no-access/, { timeout: 20_000 })
    await ctx.close()
  })

  test('the grantee sees their own department in the list', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: AUTH.deptReader })
    const page = await ctx.newPage()
    await page.goto('/departments', { waitUntil: 'domcontentloaded' })

    await expect(
      page.getByRole('cell', { name: DEPARTMENTS.quality.name, exact: true }),
      'a department-scoped read grant must return the grantee’s own department',
    ).toBeVisible({ timeout: 20_000 })

    await ctx.close()
  })

  test('MECHANISM · the policy returns rows for a department-scoped reader', () => {
    const scoped = asAppUser(
      { userId: USERS.deptReader.id, companyId: COMPANY_ID },
      'SELECT count(*) FROM departments',
    )
    expect(Number(scoped), 'must see at least their own department').toBeGreaterThan(0)
  })

  test('CONTROL · a tenant-scoped grant on the same table works (must pass today)', () => {
    // One word apart in the grant — 'tenant' vs 'department' — and the whole
    // table appears. Proves the policy is not broken for everyone.
    const tenantScoped = asAppUser(
      { userId: USERS.deptAdmin.id, companyId: COMPANY_ID },
      'SELECT count(*) FROM departments',
    )
    expect(Number(tenantScoped)).toBeGreaterThanOrEqual(2)
  })

  test('MECHANISM · the binding, on both tables', () => {
    // Kept as an exact-match assertion, and kept on BOTH tables, so any future
    // rebinding of either has to come through here and say why.
    //
    // The two now differ, which is the point: `departments` is fully bound
    // (20260907410000), `sites` still has ∅ owner and department tiers. That is
    // a decision, not an oversight — a site has no supervisor column and no
    // sensible "department of a site" — but it means a site-scoped module still
    // offers two tiers in the Roles matrix that match nothing. Recorded here
    // rather than in prose so it cannot be forgotten.
    const bindings = sqlValue(
      `SELECT string_agg(table_name || '=' ||
                coalesce(owner_col,'∅') || '/' || coalesce(dept_col,'∅') || '/' || coalesce(site_col,'∅'),
                ' ' ORDER BY table_name)
         FROM authz.module_table_bindings WHERE table_name IN ('departments','sites')`,
    )
    expect(bindings, 'departments is fully bound; sites still has two dead tiers').toBe(
      'departments=supervisor_user_id/id/site_id sites=∅/∅/id',
    )
  })
})
