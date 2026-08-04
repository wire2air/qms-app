// DEPT-J2 — 🔴 A department-scoped `departments:read` grant matches zero rows.
// WRITTEN TO FAIL.
//
// The exact twin of the `sites` finding (sites/j10). Both tables have
// owner_col, dept_col and site_col ALL NULL in `authz.module_table_bindings`,
// so the RLS generator substitutes NULL::uuid into scope_allowed() and the
// expression collapses to `rank >= 4` — tenant. Ranks 1-3 are dead code, while
// the permission UI keeps offering all four tiers.
//
// 2026-08-04 UPDATE — migration 20260804120000 bound the SITE tier (site_col)
// on both tables, so the paragraph above is now true only of the OWNER and
// DEPARTMENT tiers, and the collapse is to `rank >= 3`, not `rank >= 4`. This
// spec's finding is the dead DEPARTMENT tier, which that migration did not
// address: `departments` has no department column to bind, so a rank-2 grant
// still matches nothing. STILL OPEN — the reds below are correct.
//
// It is a separate spec rather than a second case in the sites one because the
// two must be fixable and verifiable independently: a binding fix applied to
// `sites` alone leaves this red, which is the point.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH, USERS, DEPARTMENTS, COMPANY_ID } from '../fixtures/cast.js'
import { asAppUser } from '../fixtures/sites.js'
import { sqlValue } from '../fixtures/db.js'

const SCOPED_ROLE = 'e2e30000-0000-4000-8000-00000000000b'

test.describe('DEPT-J2 · a saved department-scoped grant matches zero rows', () => {
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

  test('🔴 the grantee sees their own department in the list (FAILS TODAY)', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: AUTH.deptReader })
    const page = await ctx.newPage()
    await page.goto('/departments', { waitUntil: 'domcontentloaded' })

    await expect(
      page.getByRole('cell', { name: DEPARTMENTS.quality.name, exact: true }),
      'a department-scoped read grant must return the grantee’s own department',
    ).toBeVisible({ timeout: 20_000 })

    await ctx.close()
  })

  test('MECHANISM · the policy itself returns 0 rows for a department-scoped reader', () => {
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
    // Recorded on both so a half-fix cannot go green. Whatever repairs the
    // generator or the binding has to cover `sites` and `departments` together.
    //
    // 2026-08-04 — migration 20260804120000 bound the SITE tier on both tables,
    // so the expected value moved from all-∅ to the site columns below. The
    // OWNER and DEPARTMENT tiers are still ∅, which is precisely why the two
    // assertions above this one remain red: this spec's finding is the dead
    // DEPARTMENT tier, and that is untouched. Kept as an exact-match assertion
    // so a future rebinding of either table has to come through here.
    const bindings = sqlValue(
      `SELECT string_agg(table_name || '=' ||
                coalesce(owner_col,'∅') || '/' || coalesce(dept_col,'∅') || '/' || coalesce(site_col,'∅'),
                ' ' ORDER BY table_name)
         FROM authz.module_table_bindings WHERE table_name IN ('departments','sites')`,
    )
    expect(bindings, 'the department tier is still dead on both org-structure tables').toBe(
      'departments=∅/∅/site_id sites=∅/∅/id',
    )
  })
})
