// ST-J3 · Who reaches the settings surfaces — and, for the one that matters,
// whether reaching it means being able to SAVE (PW-J8 / MTC-17, addendum §3/§7).
//
// The addendum's open item "two gates disagree": the route guard admits any
// `company_settings:manage` holder to the Defaults tab, while the write the tab
// performs (GraphQL updateCompany) was gated by RLS on `users.is_owner`. So a
// non-owner settings admin could open the tab, edit the ladder, and watch the
// autosave fail. ST-20 is the release condition for that gap: it passes only
// when reaching the tab and saving it are decided by the same grant.
//
// The rest are route-guard probes. They are UX gates, not security ones (the
// server re-checks every call); what they prove is that each admin surface is
// bound to its own grant and that supplier accounts get none of them.
import { test, expect } from '@playwright/test'
import { AUTH, SUPPLIER_USER } from '../fixtures/cast.js'
import {
  SETTINGS_USERS,
  cardByHeading,
  companySettings,
  field,
  loginState,
  openSettingsTab,
  personaContext,
  restoreSettingsKeys,
  waitForSettingsPath,
} from '../fixtures/settings.js'

test('ST-20 · a non-owner holding company_settings:manage can SAVE the Defaults card, not just open it', async ({
  browser,
}) => {
  const before = companySettings()
  const ctx = await personaContext(browser, SETTINGS_USERS.settingsAdmin)
  const page = await ctx.newPage()
  try {
    await openSettingsTab(page, 'defaults')
    const next = Number(before?.defaultSla) === 21 ? 22 : 21
    const response = page.waitForResponse(
      (r) => r.url().includes('/graphql') && (r.request().postData() || '').includes('updateCompany'),
      { timeout: 20_000 },
    )
    await field(page, 'Default SLA (days)').fill(String(next))
    const body = await (await response).json().catch(() => ({}))

    expect(
      body.errors ?? null,
      `updateCompany as a non-owner settings admin was refused: ${JSON.stringify(body.errors)}`,
    ).toBeNull()
    await waitForSettingsPath('defaultSla', next)
    await expect(cardByHeading(page, 'Default Settings').getByText(/Save failed/)).toHaveCount(0)
  } finally {
    await ctx.close()
    restoreSettingsKeys(before, ['defaultSla', 'printSettings'])
  }
})

test('ST-21 · without company_settings:manage, /settings and /lookups bounce to /no-access', async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: AUTH.noAccess })
  const page = await ctx.newPage()
  try {
    for (const path of ['/settings', '/settings?tab=defaults', '/lookups', '/notification-rules']) {
      await page.goto(path)
      await expect(page, `${path} → /no-access`).toHaveURL(/\/no-access/, { timeout: 30_000 })
    }
  } finally {
    await ctx.close()
  }
})

test('ST-22 · settings administration and security administration are separate grants', async ({ browser }) => {
  const settingsCtx = await personaContext(browser, SETTINGS_USERS.settingsAdmin)
  const securityCtx = await personaContext(browser, SETTINGS_USERS.securityAdmin)
  try {
    const sp = await settingsCtx.newPage()
    await sp.goto('/lookups')
    await expect(sp.getByRole('combobox', { name: 'Lookup' })).toBeVisible({ timeout: 60_000 })
    await sp.goto('/organization-security')
    await expect(sp, 'company_settings:manage does not open Organization Security').toHaveURL(/\/no-access/, {
      timeout: 30_000,
    })

    const pp = await securityCtx.newPage()
    await pp.goto('/organization-security')
    await expect(pp.getByRole('tab', { name: 'Password policy' })).toBeVisible({ timeout: 60_000 })
    await pp.goto('/settings')
    await expect(pp, 'security:manage does not open company Settings').toHaveURL(/\/no-access/, {
      timeout: 30_000,
    })
  } finally {
    await settingsCtx.close()
    await securityCtx.close()
  }
})

test('ST-23 · a supplier reaches /profile but not /settings, and is offered no Settings entry', async ({
  browser,
}) => {
  const ctx = await browser.newContext({ storageState: await loginState(SUPPLIER_USER) })
  const page = await ctx.newPage()
  try {
    await page.goto('/settings')
    await expect(page, 'supplier → /settings is blocked').toHaveURL(/\/no-access/, { timeout: 30_000 })

    await page.goto('/profile')
    await expect(page).toHaveURL(/\/profile/)
    await expect(page.getByRole('tab', { name: 'Personal Profile' })).toBeVisible({ timeout: 60_000 })
    await expect(page.locator('a[href$="/settings"]'), 'no Settings link anywhere in the shell').toHaveCount(0)
  } finally {
    await ctx.close()
  }
})
