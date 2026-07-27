// PW-J10 — 🔴 A site-scoped `sites:read` grant returns nothing. WRITTEN TO FAIL.
//
// This is the only journey in the pack whose entire value is that a UI shows
// nothing. There is no error, no warning, and no log line: an administrator
// grants sites:read at site scope, the grant saves, the grantee opens /sites,
// and gets an empty list that is indistinguishable from "this tenant has no
// sites". An E2E assertion is the only layer at which "the administrator did
// the right thing and got nothing" becomes visible.
//
// THE MECHANISM — authz.module_table_bindings carries owner_col, dept_col and
// site_col per table so the RLS generator can pass real columns into
// scope_allowed(). For `sites` all three are NULL, so the generator substitutes
// NULL::uuid and the expression collapses to:
//
//     (rank >= 4)                                        -- tenant
//  OR (rank >= 3 AND NULL IS NOT NULL AND …)             -- site,  dead
//  OR (rank >= 2 AND NULL IS NOT NULL AND …)             -- dept,  dead
//  OR (rank >= 1 AND NULL IS NOT NULL AND …)             -- own,   dead
//
// Ranks 1-3 are unreachable. Only a tenant-scoped grant matches anything, and
// the three narrower tiers remain fully selectable in the permission UI.
// `departments` has the identical all-NULL binding.
import { test, expect } from '@playwright/test'
import { AUTH, USERS, SITES, COMPANY_ID } from '../fixtures/cast.js'
import { gotoSites, asAppUser } from '../fixtures/sites.js'
import { sqlValue } from '../fixtures/db.js'

const SCOPED_ROLE = 'e2e30000-0000-4000-8000-000000000008'

test.describe('PW-J10 · a saved site-scoped grant matches zero rows', () => {
  test('PRECONDITION · the grant really is saved, at site scope', () => {
    // If this ever fails, every assertion below is meaningless — the grantee
    // would be seeing nothing simply because they were granted nothing.
    const scope = sqlValue(
      `SELECT scope_id FROM authz.role_module_permissions
        WHERE role_id = '${SCOPED_ROLE}' AND module_id = 'sites' AND action_id = 'read'`,
    )
    expect(scope, 'sites:read is granted at site scope').toBe('site')

    // And the grantee genuinely belongs to a site, so "site scope" has a
    // referent. The all-NULL binding is the problem, not a missing site_id.
    expect(sqlValue(`SELECT site_id FROM users WHERE id = '${USERS.siteReader.id}'`)).toBe(
      SITES.primary.id,
    )
  })

  test('the route guard admits them — the failure is silent, not a redirect', async ({ browser }) => {
    // The guard checks only that the permission string is held, not its scope.
    // So the grantee lands on a working page. That is what makes this finding
    // hard to notice: a redirect would at least be an answer.
    const ctx = await browser.newContext({ storageState: AUTH.siteReader })
    const page = await ctx.newPage()
    await page.goto('/sites', { waitUntil: 'domcontentloaded' })
    await expect(page).not.toHaveURL(/\/no-access/, { timeout: 20_000 })
    await ctx.close()
  })

  test('🔴 the grantee sees their own site in the list (FAILS TODAY)', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: AUTH.siteReader })
    const page = await ctx.newPage()
    await gotoSites(page)

    // A site-scoped read grant should return the site the user belongs to.
    // Today it returns nothing at all.
    await expect(
      page.getByRole('cell', { name: SITES.primary.name, exact: true }),
      'a site-scoped sites:read grant must return the grantee’s own site',
    ).toBeVisible({ timeout: 20_000 })

    await ctx.close()
  })

  test('🔴 and the empty state is indistinguishable from an empty tenant (FAILS TODAY)', async ({
    browser,
  }) => {
    const ctx = await browser.newContext({ storageState: AUTH.siteReader })
    const page = await ctx.newPage()
    await gotoSites(page)

    // "No sites yet" is a lie here — the tenant has two. Whatever the fix,
    // a scope tier that cannot match must not render as an empty dataset.
    await expect(
      page.getByText('No sites yet'),
      'an unsatisfiable scope tier must not present as "there are no sites"',
    ).toHaveCount(0, { timeout: 20_000 })

    await ctx.close()
  })

  test('MECHANISM · the policy itself returns 0 rows for a site-scoped reader', () => {
    // Pinning it at the policy makes the diagnosis unambiguous when the UI
    // assertions above go red: this is RLS, not the syncEngine, not the guard.
    const scoped = asAppUser(
      { userId: USERS.siteReader.id, companyId: COMPANY_ID },
      'SELECT count(*) FROM sites',
    )
    expect(Number(scoped), 'site-scoped reader must see at least their own site').toBeGreaterThan(0)
  })

  test('CONTROL · a tenant-scoped grant on the same table works (must pass today)', () => {
    // Proves the policy is not simply broken for everyone, and that the seeded
    // rows are visible to app_user at all. The difference between this and the
    // test above is one word in the grant: 'tenant' vs 'site'.
    const tenantScoped = asAppUser(
      { userId: USERS.siteAdmin.id, companyId: COMPANY_ID },
      'SELECT count(*) FROM sites',
    )
    expect(Number(tenantScoped)).toBeGreaterThanOrEqual(2)
  })

  test('CONTROL · departments carries the identical all-NULL binding', () => {
    // Recorded as a control rather than a separate finding: whatever fixes
    // `sites` must fix `departments` in the same change, and a fix that
    // addresses only one of them will leave this assertion red.
    const cols = sqlValue(
      `SELECT coalesce(owner_col,'∅') || '/' || coalesce(dept_col,'∅') || '/' || coalesce(site_col,'∅')
         FROM authz.module_table_bindings WHERE table_name = 'departments'`,
    )
    expect(cols, 'departments has the same dead-scope-tier binding as sites').toBe('∅/∅/∅')
  })
})
