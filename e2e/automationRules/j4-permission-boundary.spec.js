// PW-J4 — Permission boundary.
//
// `automation_rules` is a single-action native module: `manage` is the ONLY
// grantable action (RA-1, 2026-09-07: read is no longer implied by any other
// grant — see root CLAUDE.md), and the route is guarded across its whole
// subtree on `automation_rules:manage` (permissionGuard.js ADMIN_PERMISSIONS
// — "Template/reference routes deliberately carry NO guard… In-page authoring
// actions gate on the module's write verbs" does NOT apply here: this module
// IS write-gated at the route). `noAccess` (zero grants anywhere in the
// cast) is reused rather than minting a second persona — it's the exact
// negative case the guard exists for.
//
// The CONTROL half proves the probe is sound: `automationOwner`, who holds
// the grant, reaches the same URL and sees the page render.
import { test, expect } from '@playwright/test'
import { AUTH } from '../fixtures/cast.js'

test.describe('PW-J4 · Automation Rules permission boundary', () => {
  test('noAccess is bounced to /no-access; nothing renders', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: AUTH.noAccess })
    const page = await ctx.newPage()
    try {
      await page.goto('/automation-rules')
      await expect(page).toHaveURL(/\/no-access/, { timeout: 15_000 })
      await expect(page.getByRole('heading', { name: 'Automation Rules' })).toHaveCount(0)
      await expect(page.getByRole('button', { name: 'New Rule' })).toHaveCount(0)
    } finally {
      await ctx.close()
    }
  })

  test('CONTROL · automationOwner (automation_rules:manage) reaches the page', async ({
    browser,
  }) => {
    const ctx = await browser.newContext({ storageState: AUTH.automationOwner })
    const page = await ctx.newPage()
    try {
      await page.goto('/automation-rules')
      await expect(page.getByRole('heading', { name: 'Automation Rules' })).toBeVisible({
        timeout: 15_000,
      })
      await expect(page.getByRole('button', { name: 'New Rule' })).toBeVisible()
    } finally {
      await ctx.close()
    }
  })
})
