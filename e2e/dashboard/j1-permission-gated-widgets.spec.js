// PW-J1 — Permission-gated widget visibility, full round-trip (MTC-02/03/04).
//
// docs/modules/dashboard/14-playwright-journeys.md: "As a fresh role with zero
// module grants, land on /dashboard and assert only kpis(1 card)/my-tasks/
// quick-actions render and only those 3 appear in Customize. Grant ncr:read.
// Reload and assert Open NCs now appears in both the grid and Customize...
// Revoke ncr:read. Reload and assert it disappears from both again."
//
// `dashboardNoAccess` holds its own dedicated role (e2e-seed.sql §49) rather
// than reusing `noAccess` — see that section's comment for why a live
// grant+revoke on the shared zero-grant persona would be a suite-wide risk.
import { test, expect } from '@playwright/test'
import { AUTH } from '../fixtures/cast.js'
import { grantToRole } from '../fixtures/permissions.js'
import { openCustomize, checklistLabels } from '../fixtures/dashboard.js'

const ROLE = 'E2E Dashboard NoAccess'

test.describe('PW-J1 · Dashboard permission-gated widgets', () => {
  test('grant then revoke ncr:read live — Open Nonconformances appears and disappears in both the grid and Customize', async ({
    browser,
  }) => {
    test.setTimeout(120_000)
    const ctx = await browser.newContext({ storageState: AUTH.dashboardNoAccess })
    const page = await ctx.newPage()
    let revoke = null
    try {
      // ── Zero grants: only the 3 always-available widgets ─────────────────
      await page.goto('/dashboard')
      await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 20_000 })
      await expect(page.getByRole('link', { name: /My Open Tasks/ })).toBeVisible()
      await expect(page.getByRole('link', { name: /Open NCs/ })).toHaveCount(0)
      await expect(page.getByRole('heading', { name: 'My Tasks', exact: true })).toBeVisible()
      await expect(page.getByRole('heading', { name: 'Quick Actions', exact: true })).toBeVisible()
      await expect(page.getByRole('heading', { name: 'Open Nonconformances' })).toHaveCount(0)

      let dialog = await openCustomize(page)
      expect(await checklistLabels(page)).toEqual(
        expect.arrayContaining(['KPI Summary', 'My Tasks', 'Quick Actions']),
      )
      expect((await checklistLabels(page)).length).toBe(3)
      await page.getByRole('button', { name: 'Cancel' }).click()
      await expect(dialog).toBeHidden({ timeout: 10_000 })

      // ── Grant ncr:read live, reload ───────────────────────────────────────
      revoke = grantToRole(ROLE, 'ncr', 'read')
      await page.reload()
      await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 20_000 })

      await expect(page.getByRole('link', { name: /Open NCs/ })).toBeVisible({ timeout: 15_000 })
      // Title and its "View all" link are siblings in DashboardWidgetCard's
      // header row — go up to that row rather than guess at a card boundary.
      const ncWidget = page.getByRole('heading', { name: 'Open Nonconformances' })
      await expect(ncWidget).toBeVisible()
      const ncHeader = ncWidget.locator('xpath=..')
      await expect(ncHeader.getByRole('link', { name: 'View all' })).toHaveAttribute(
        'href',
        /\/nonconformances$/,
      )

      dialog = await openCustomize(page)
      expect(await checklistLabels(page)).toEqual(
        expect.arrayContaining(['KPI Summary', 'My Tasks', 'Open Nonconformances', 'Quick Actions']),
      )
      expect((await checklistLabels(page)).length).toBe(4)
      await page.getByRole('button', { name: 'Cancel' }).click()
      await expect(dialog).toBeHidden({ timeout: 10_000 })

      // ── Revoke, reload — back to the zero-grant state ─────────────────────
      revoke()
      revoke = null
      await page.reload()
      await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 20_000 })
      await expect(page.getByRole('link', { name: /Open NCs/ })).toHaveCount(0, { timeout: 15_000 })
      await expect(page.getByRole('heading', { name: 'Open Nonconformances' })).toHaveCount(0)

      dialog = await openCustomize(page)
      expect((await checklistLabels(page)).length).toBe(3)
      await page.getByRole('button', { name: 'Cancel' }).click()
    } finally {
      if (revoke) revoke()
      await ctx.close()
    }
  })
})
