// PW-J4 — Admin-config permission boundary (MTC-12, 13).
//
// `/notification-rules` is guarded across its WHOLE subtree on
// `company_settings:manage` (permissionGuard.js ADMIN_PERMISSIONS) — the same
// single permission that gates every other company-settings surface, not a
// dedicated `notification_rules` action. `noAccess` (zero grants anywhere)
// proves the refusal; `settingsAdmin` — seeded by §41 but never wired into
// cast.js until this pass (e2e-seed.sql §48) — proves the GRANT admits,
// which `noAccess` alone cannot: without a positive control, a broken guard
// that blocks EVERYONE would look identical to a working one.
import { test, expect } from '@playwright/test'
import { AUTH } from '../fixtures/cast.js'

test.describe('PW-J4 · Notifications admin-config permission boundary', () => {
  test('noAccess is bounced to /no-access; nothing renders', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: AUTH.noAccess })
    const page = await ctx.newPage()
    try {
      await page.goto('/notification-rules')
      await expect(page).toHaveURL(/\/no-access/, { timeout: 15_000 })
      await expect(page.getByRole('heading', { name: 'Notification defaults' })).toHaveCount(0)
    } finally {
      await ctx.close()
    }
  })

  test('CONTROL · settingsAdmin (company_settings:manage) reaches the page', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: AUTH.settingsAdmin })
    const page = await ctx.newPage()
    try {
      await page.goto('/notification-rules')
      await expect(page.getByRole('heading', { name: 'Notification defaults' })).toBeVisible({
        timeout: 45_000,
      })
    } finally {
      await ctx.close()
    }
  })
})
