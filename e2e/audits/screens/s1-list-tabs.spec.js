// Audits screenshots · S1 — the three list tabs and the denial states.
//   /audits?tab=instances | programs | standards, the "New Audit" dialog, the
//   read-only auditor view (audit_management:read only — no create affordance),
//   the no-access redirect and the sign-in bounce.
// Selectors are the audits fixture's and PW-J11's.
import { test, expect } from '../../../video/fixtures/videoTest.js'
import { AUTH } from '../../fixtures/cast.js'
import { shooter } from '../../fixtures/screenshots.js'

const shot = shooter('audits')

test.describe.serial('Audits screenshots · list tabs + denials', () => {
  test('instances, programs and standards tabs, and the New Audit dialog', async ({ browser }) => {
    test.setTimeout(240_000)
    const ctx = await browser.newContext({ storageState: AUTH.author })
    const page = await ctx.newPage()

    await page.goto('/audits?tab=instances')
    await expect(page.getByRole('button', { name: 'New Audit' })).toBeVisible({ timeout: 30_000 })
    await shot(page, 'list-instances')

    await page.goto('/audits?tab=programs')
    await expect(page.getByRole('tab', { name: /programs/i }).first()).toBeVisible({
      timeout: 30_000,
    })
    await shot(page, 'list-programs')

    await page.goto('/audits?tab=standards')
    await expect(page.getByRole('button', { name: 'New Standard' })).toBeVisible({
      timeout: 30_000,
    })
    await shot(page, 'list-standards')

    // The create dialog, blank (filled + submitted in S2).
    await page.goto('/audits?tab=instances')
    await page.getByRole('button', { name: 'New Audit' }).click()
    await expect(page.getByRole('heading', { name: 'New Audit' })).toBeVisible({ timeout: 20_000 })
    await shot(page, 'new-audit-dialog')

    await ctx.close()
  })

  test('read-only auditor and the denial states', async ({ browser }) => {
    test.setTimeout(180_000)

    // audit_management:read and nothing else — admitted, but no create control.
    const readerCtx = await browser.newContext({ storageState: AUTH.auditor })
    const readerPage = await readerCtx.newPage()
    await readerPage.goto('/audits?tab=instances', { waitUntil: 'domcontentloaded' })
    await expect(readerPage.getByRole('tab', { name: /Audits/i }).first()).toBeVisible({
      timeout: 30_000,
    })
    await expect(readerPage.getByRole('button', { name: 'New Audit' })).toHaveCount(0)
    await shot(readerPage, 'list-readonly-auditor')
    await readerCtx.close()

    const denied = await browser.newContext({ storageState: AUTH.noAccess })
    const deniedPage = await denied.newPage()
    await deniedPage.goto('/audits', { waitUntil: 'domcontentloaded' })
    await expect(deniedPage).toHaveURL(/\/no-access/, { timeout: 30_000 })
    await shot(deniedPage, 'no-access')
    await denied.close()

    const anon = await browser.newContext() // no session
    const anonPage = await anon.newPage()
    await anonPage.goto('/audits', { waitUntil: 'domcontentloaded' })
    await expect(anonPage).toHaveURL(/\/signin/, { timeout: 30_000 })
    await shot(anonPage, 'signin-redirect')
    await anon.close()
  })
})
