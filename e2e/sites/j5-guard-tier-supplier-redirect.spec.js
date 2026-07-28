// PW-J5 — 🟢 Guard tier and supplier redirect. GREEN-EXPECTED.
//
// Sites is an ADMIN-tier module in the route guard, which means the WHOLE
// subtree is gated on sites:read — not just the list route. That is a
// deliberate design decision (permissionGuard.js header comment: "there is no
// row-level RLS exception: if you can't read the module, you can't see any of
// its records"), and it differs from RECORD-tier modules like documents, whose
// detail routes stay open so assignees keep row-level access.
//
// Nothing in the repository asserted that today. This spec pins it in both
// directions so neither a tier reclassification nor a dropped supplier
// allow-list entry can regress silently.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH, SUPPLIER_USER } from '../fixtures/cast.js'
import { freshContext } from '../fixtures/sites.js'

test.describe('PW-J5 · sites is ADMIN-tier: subtree guard + supplier redirect', () => {
  test.use({ storageState: AUTH.noAccess })

  test('a user without sites:read is redirected off /sites', async ({ page }) => {
    await page.goto('/sites', { waitUntil: 'domcontentloaded' })
    await expect(page).toHaveURL(/\/no-access/, { timeout: 20_000 })
  })

  test('the guard covers the whole subtree, not just the list route', async ({ page }) => {
    // The distinguishing assertion. A RECORD-tier module would let this through
    // and defer to RLS; an ADMIN-tier one must not.
    await page.goto('/sites/e2e51000-0000-4000-8000-000000000001', { waitUntil: 'domcontentloaded' })
    await expect(page).toHaveURL(/\/no-access/, { timeout: 20_000 })
  })

  test('the sidebar hides the Sites entry entirely', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    // Wait for the shell to hydrate before asserting an absence, otherwise the
    // assertion passes against an empty DOM and proves nothing.
    await expect(page.getByRole('navigation').first()).toBeVisible({ timeout: 20_000 })
    await expect(page.getByRole('navigation').getByRole('link', { name: 'Sites' })).toHaveCount(0)
  })

  test('an EXTERNAL_SUPPLIER is redirected to /no-access', async ({ browser }) => {
    // Suppliers get their own allow-list: the record modules RLS shares with
    // them stay open, every admin module is blocked. Sites is an admin module.
    const ctx = await freshContext(browser, SUPPLIER_USER)
    const page = await ctx.newPage()
    await page.goto('/sites', { waitUntil: 'domcontentloaded' })
    await expect(page).toHaveURL(/\/no-access/, { timeout: 20_000 })
    await ctx.close()
  })
})
