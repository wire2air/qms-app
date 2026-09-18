// Sites screenshots · S1 — the sites workspace.
//   List, the Create New Site dialog (blank → filled → the created row), a
//   row's action menu, the Edit dialog, the Delete confirm, the site detail
//   page, and the denial states.
// Selectors come from fixtures/sites.js (gotoSites / createSiteViaUi /
// openRowAction / deleteSiteViaUi) — the same ones the PW journeys use.
import { test, expect } from '../../../video/fixtures/videoTest.js'
import { AUTH, SITES } from '../../fixtures/cast.js'
import {
  gotoSites,
  openRowAction,
  purgeSiteByName,
  uniqueSiteCode,
  uniqueSiteName,
} from '../../fixtures/sites.js'
import { shooter } from '../../fixtures/screenshots.js'

const shot = shooter('sites')

test.describe.serial('Sites screenshots · list, create, edit, delete', () => {
  let name, code

  test.afterAll(() => {
    if (name) purgeSiteByName(name)
  })

  test('list, create dialog, row menu, edit and delete', async ({ browser }) => {
    test.setTimeout(300_000)
    // siteAdmin is the only persona that may create a site.
    const ctx = await browser.newContext({ storageState: AUTH.siteAdmin })
    const page = await ctx.newPage()

    await gotoSites(page)
    await shot(page, 'list')

    // ── Create dialog, blank then filled ───────────────────────────────────
    name = uniqueSiteName('S1')
    code = uniqueSiteCode('S1')
    await page.getByRole('button', { name: 'Create New Site' }).click()
    await expect(page.getByText('Create New Site', { exact: true }).last()).toBeVisible({
      timeout: 15_000,
    })
    await shot(page, 'create-dialog')

    await page.getByPlaceholder('e.g. New York Headquarters').fill(name)
    // Blur triggers the code auto-suggestion (create mode only).
    await page.getByPlaceholder('e.g. NY-HQ').click()
    await page.getByPlaceholder('e.g. NY-HQ').fill(code)
    await page.getByPlaceholder('e.g. 123 Main St, New York, NY').fill('221B Baker Street, London')
    await shot(page, 'create-dialog-filled')

    await page.getByRole('button', { name: 'Create Site' }).click()
    await expect(page.getByRole('cell', { name, exact: true }).first()).toBeVisible({
      timeout: 30_000,
    })
    await shot(page, 'list-after-create')

    // ── Row action menu ────────────────────────────────────────────────────
    const row = page.getByRole('row').filter({ hasText: name }).first()
    await row.getByRole('button', { name: 'More actions' }).click()
    await expect(page.getByRole('menuitem', { name: 'Edit', exact: true })).toBeVisible({
      timeout: 15_000,
    })
    await shot(page, 'row-menu')
    await page.keyboard.press('Escape')

    // ── Edit dialog ────────────────────────────────────────────────────────
    await openRowAction(page, name, 'Edit')
    await expect(page.getByPlaceholder('e.g. New York Headquarters')).toBeVisible({
      timeout: 15_000,
    })
    await shot(page, 'edit-dialog')
    await page.keyboard.press('Escape')

    // ── Delete confirm (captured, then confirmed) ──────────────────────────
    await openRowAction(page, name, 'Delete')
    await expect(page.getByText('Delete Site', { exact: true }).last()).toBeVisible({
      timeout: 15_000,
    })
    await shot(page, 'delete-confirm')
    await page.getByRole('button', { name: 'Delete', exact: true }).last().click()
    await expect(page.getByRole('cell', { name, exact: true })).toHaveCount(0, { timeout: 30_000 })
    await shot(page, 'list-after-delete')

    await ctx.close()
  })

  test('site detail page', async ({ browser }) => {
    test.setTimeout(120_000)
    const ctx = await browser.newContext({ storageState: AUTH.siteAdmin })
    const page = await ctx.newPage()
    await page.goto(`/sites/${SITES.primary.id}`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByText(SITES.primary.name).first()).toBeVisible({ timeout: 30_000 })
    await shot(page, 'detail')
    await ctx.close()
  })

  test('denial states — no permission and unauthenticated', async ({ browser }) => {
    test.setTimeout(120_000)
    const denied = await browser.newContext({ storageState: AUTH.noAccess })
    const deniedPage = await denied.newPage()
    await deniedPage.goto('/sites', { waitUntil: 'domcontentloaded' })
    await expect(deniedPage).toHaveURL(/\/no-access/, { timeout: 30_000 })
    await shot(deniedPage, 'no-access')
    await denied.close()

    const anon = await browser.newContext() // no session
    const anonPage = await anon.newPage()
    await anonPage.goto('/sites', { waitUntil: 'domcontentloaded' })
    await expect(anonPage).toHaveURL(/\/signin/, { timeout: 30_000 })
    await shot(anonPage, 'signin-redirect')
    await anon.close()
  })
})
