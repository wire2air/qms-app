// PW-J11 · Permission denials + the two-tier route scheme (MTC-16).
//
// Audits is a RECORD-tier module in permissionGuard.js: the LIST route
// (/audits) is gated on audit_management:read, the three detail routes
// (instances / programs / standards) are deliberately left OPEN so an assignee
// or shared auditee with no module grant keeps row-level access via RLS.
// `audits` is also in SUPPLIER_EXEMPT_SEGMENTS, so EXTERNAL_SUPPLIER users reach
// it without the permission at all.
//
// All three of those are design decisions with no test behind them; this spec
// pins each one in both directions, so neither a tier reclassification nor a
// dropped exemption can regress silently.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH, AUDIT_STANDARD, SUPPLIER_USER } from '../fixtures/cast.js'
import { freshContext } from '../fixtures/sites.js'
import { dateInDays } from '../fixtures/audits.js'

test.describe('PW-J11 · who can reach the audits module', () => {
  test('a user with no audit_management:read is redirected off /audits', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: AUTH.noAccess })
    const page = await ctx.newPage()
    await page.goto('/audits', { waitUntil: 'domcontentloaded' })
    await expect(page).toHaveURL(/\/no-access/, { timeout: 20_000 })
    await ctx.close()
  })

  test('the detail routes stay open by design — the guard defers to RLS', async ({ browser }) => {
    // The distinguishing assertion vs an ADMIN-tier module (sites, users), whose
    // whole subtree is gated. Here the route loads; the row simply never
    // arrives, because RLS does not share it with this user.
    const ctx = await browser.newContext({ storageState: AUTH.noAccess })
    const page = await ctx.newPage()
    await page.goto(`/audits/standards/${AUDIT_STANDARD.id}`, { waitUntil: 'domcontentloaded' })
    await expect(page).not.toHaveURL(/\/no-access/)
    await expect(
      page.getByText(AUDIT_STANDARD.name),
      'the route is open, but RLS must still withhold the record',
    ).toHaveCount(0)
    await ctx.close()
  })

  test('an EXTERNAL_SUPPLIER reaches /audits without the module permission', async ({
    browser,
  }) => {
    const ctx = await freshContext(browser, SUPPLIER_USER)
    const page = await ctx.newPage()
    await page.goto('/audits?tab=instances', { waitUntil: 'domcontentloaded' })
    await expect(page).not.toHaveURL(/\/no-access/)
    await expect(page.getByRole('tab', { name: /Audits/i }).first()).toBeVisible({
      timeout: 30_000,
    })
    // Exempt from the guard is not the same as privileged — creating is still
    // gated on audits:create, which a supplier never holds.
    await expect(page.getByRole('button', { name: 'New Audit' })).toHaveCount(0)
    await ctx.close()
  })

  test('a read-only auditor sees the module but no create affordance', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: AUTH.auditor })
    const page = await ctx.newPage()
    await page.goto('/audits?tab=instances', { waitUntil: 'domcontentloaded' })
    await expect(page).not.toHaveURL(/\/no-access/)
    await expect(page.getByRole('tab', { name: /Audits/i }).first()).toBeVisible({
      timeout: 30_000,
    })
    await expect(page.getByRole('button', { name: 'New Audit' })).toHaveCount(0)
    await ctx.close()
  })

  test('creating an audit without audit_management:create is refused with 403', async ({
    browser,
  }) => {
    const ctx = await browser.newContext({ storageState: AUTH.auditor })
    const res = await ctx.request.post('/api/v1/services/auditInstances', {
      data: {
        auditStandardId: AUDIT_STANDARD.id,
        programTypeId: 'INTERNAL',
        scheduledDate: dateInDays(3),
      },
    })
    expect(res.status(), 'auditInstances self-gates in-controller via assertPermission').toBe(403)
    await ctx.close()
  })

  test('an unauthenticated API call is rejected with 401', async ({ playwright }) => {
    const request = await playwright.request.newContext()
    const res = await request.post('/api/v1/services/auditInstances', { data: {} })
    expect(res.status()).toBe(401)
    await request.dispose()
  })

  test('an unauthenticated page visit is bounced to sign-in', async ({ browser }) => {
    const ctx = await browser.newContext() // no session
    const page = await ctx.newPage()
    await page.goto('/audits', { waitUntil: 'domcontentloaded' })
    await expect(page).toHaveURL(/\/signin/, { timeout: 20_000 })
    await ctx.close()
  })
})
