// CAPA screenshots · S1 — the list workspace and the denial states.
//   KPI strip, quick-view pills, the cascading filter menu, a filtered view,
//   the no-access redirect and the sign-in bounce.
// Selectors are PW-J6's (list) and PW-J7's (denials) — nothing new invented.
import { test, expect } from '../../../video/fixtures/videoTest.js'
import { AUTH } from '../../fixtures/cast.js'
import { createCapa, uniqueTitle } from '../../fixtures/capas.js'
import { shooter } from '../../fixtures/screenshots.js'

const shot = shooter('capas')

/** The dimension filter menu trigger (scoped by aria-haspopup — see PW-J6). */
function filterMenu(page) {
  return page.locator('button[aria-haspopup="menu"]').filter({ hasText: 'Filter' })
}

test.describe.serial('CAPA screenshots · list, KPIs, filters', () => {
  test('list, KPI strip, quick pills and the priority filter', async ({ browser }) => {
    test.setTimeout(300_000)
    const ctx = await browser.newContext({ storageState: AUTH.author })
    const page = await ctx.newPage()

    // One CRITICAL CAPA so the filtered view below has a real row (PW-J6 makes
    // the same point: without it only the empty-state branch is ever exercised).
    const title = uniqueTitle('S1-critical')
    await createCapa(page, title, { priority: 'Critical' })

    await page.goto('/capas')
    const pillGroup = page.getByRole('group', { name: 'Quick views' })
    await expect(page.getByText('Open CAPAs', { exact: true }).first()).toBeVisible({
      timeout: 20_000,
    })
    await expect(pillGroup.getByRole('button', { name: 'All open', exact: true })).toBeVisible()
    await shot(page, 'list')

    // "My CAPAs" quick view.
    await pillGroup.getByRole('button', { name: 'My CAPAs', exact: true }).click()
    await expect(pillGroup.getByRole('button', { name: 'My CAPAs', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await shot(page, 'list-quick-view-mine')

    await pillGroup.getByRole('button', { name: 'All open', exact: true }).click()
    await expect(pillGroup.getByRole('button', { name: 'All open', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    // Cascading filter menu → Priority → Critical.
    await filterMenu(page).click()
    await expect(page.getByRole('menuitem', { name: 'Priority' })).toBeVisible({ timeout: 10_000 })
    await shot(page, 'list-filter-menu')

    await page.getByRole('menuitem', { name: 'Priority' }).click()
    await expect(page.getByRole('menuitemcheckbox', { name: 'Critical', exact: true })).toBeVisible({
      timeout: 10_000,
    })
    await shot(page, 'list-filter-priority-options')

    await page.getByRole('menuitemcheckbox', { name: 'Critical', exact: true }).click()
    await page.keyboard.press('Escape')
    await expect(page.getByText(title).first()).toBeVisible({ timeout: 20_000 })
    await shot(page, 'list-filter-applied')

    // Closed quick view — a different lifecycle slice of the same table.
    await page.goto('/capas')
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
    await deniedPage.goto('/capas')
    await expect(deniedPage).toHaveURL(/\/no-access/, { timeout: 30_000 })
    await shot(deniedPage, 'no-access')
    await denied.close()

    const anon = await browser.newContext() // no session
    const anonPage = await anon.newPage()
    await anonPage.goto('/capas')
    await expect(anonPage).toHaveURL(/\/signin/, { timeout: 30_000 })
    await shot(anonPage, 'signin-redirect')
    await anon.close()
  })
})
