// NCR screenshots · S1 — the list workspace and the denial states.
//   KPI strip, quick-view pills, the cascading filter menu, a filtered view,
//   the no-access redirect and the sign-in bounce.
// Selectors are PW-J4's (list) and PW-J6's (denials).
import { test, expect } from '../../../video/fixtures/videoTest.js'
import { AUTH } from '../../fixtures/cast.js'
import { raiseNc, uniqueTitle } from '../../fixtures/nonconformances.js'
import { shooter } from '../../fixtures/screenshots.js'

const shot = shooter('nonconformances')

/** The dimension filter menu trigger (scoped by aria-haspopup — see PW-J4). */
function filterMenu(page) {
  return page.locator('button[aria-haspopup="menu"]').filter({ hasText: 'Filter' })
}

test.describe.serial('NCR screenshots · list, KPIs, filters', () => {
  test('list, KPI strip, quick pills and the severity filter', async ({ browser }) => {
    test.setTimeout(300_000)
    const ctx = await browser.newContext({ storageState: AUTH.author })
    const page = await ctx.newPage()

    // One CRITICAL NC so the filtered capture below has a real row.
    const title = uniqueTitle('S1-critical')
    await raiseNc(page, title, { severity: 'Critical' })

    await page.goto('/nonconformances')
    const pillGroup = page.getByRole('group', { name: 'Quick views' })
    await expect(page.getByText('Open NCs', { exact: true }).first()).toBeVisible({
      timeout: 20_000,
    })
    await expect(pillGroup.getByRole('button', { name: 'All open', exact: true })).toBeVisible()
    await shot(page, 'list')

    await pillGroup.getByRole('button', { name: 'My NCs', exact: true }).click()
    await expect(pillGroup.getByRole('button', { name: 'My NCs', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await shot(page, 'list-quick-view-mine')

    await pillGroup.getByRole('button', { name: 'All open', exact: true }).click()
    await expect(pillGroup.getByRole('button', { name: 'All open', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    await filterMenu(page).click()
    await expect(page.getByRole('menuitem', { name: 'Severity' })).toBeVisible({ timeout: 10_000 })
    await shot(page, 'list-filter-menu')

    await page.getByRole('menuitem', { name: 'Severity' }).click()
    await expect(page.getByRole('menuitemcheckbox', { name: 'Critical', exact: true })).toBeVisible({
      timeout: 10_000,
    })
    await shot(page, 'list-filter-severity-options')

    await page.getByRole('menuitemcheckbox', { name: 'Critical', exact: true }).click()
    await page.keyboard.press('Escape')
    await expect(page.getByText(title).first()).toBeVisible({ timeout: 20_000 })
    await shot(page, 'list-filter-applied')

    // Closed quick view — the terminal slice of the same table.
    await page.goto('/nonconformances')
    await expect(pillGroup.getByRole('button', { name: 'Closed', exact: true })).toBeVisible({
      timeout: 20_000,
    })
    await pillGroup.getByRole('button', { name: 'Closed', exact: true }).click()
    await expect(pillGroup.getByRole('button', { name: 'Closed', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await shot(page, 'list-quick-view-closed')

    await ctx.close()
  })

  test('denial states — no permission and unauthenticated', async ({ browser }) => {
    test.setTimeout(120_000)
    const denied = await browser.newContext({ storageState: AUTH.noAccess })
    const deniedPage = await denied.newPage()
    await deniedPage.goto('/nonconformances')
    await expect(deniedPage).toHaveURL(/\/no-access/, { timeout: 30_000 })
    await shot(deniedPage, 'no-access')
    await denied.close()

    const anon = await browser.newContext() // no session
    const anonPage = await anon.newPage()
    await anonPage.goto('/nonconformances')
    await expect(anonPage).toHaveURL(/\/signin/, { timeout: 30_000 })
    await shot(anonPage, 'signin-redirect')
    await anon.close()
  })
})
