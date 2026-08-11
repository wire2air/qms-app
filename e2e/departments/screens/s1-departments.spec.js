// Departments screenshots · S1 — the departments workspace.
//   List, the Create New Department dialog (blank → filled), the row action
//   menu, the Delete confirm, and the denial states.
// Selectors are DEPT-J5's — including its two documented traps: fields are
// matched by ACCESSIBLE NAME (placeholder matching is substring + case
// insensitive, so "e.g. Quality Assurance" also matches the Description
// placeholder), and the code is left to auto-suggest on blur.
import { test, expect } from '../../../video/fixtures/videoTest.js'
import { AUTH, SITES } from '../../fixtures/cast.js'
import { sql, sqlValue } from '../../fixtures/db.js'
import { shooter } from '../../fixtures/screenshots.js'

const shot = shooter('departments')

const NAME = `E2E Screens Dept ${Date.now()}`

async function gotoDepartments(page) {
  await page.goto('/departments', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'Departments' }).first()).toBeVisible({
    timeout: 30_000,
  })
}

test.describe.serial('Departments screenshots · list, create, delete', () => {
  test.afterAll(() => {
    // The row is deleted through the UI below; this only covers an early exit.
    if (Number(sqlValue(`SELECT count(*) FROM departments WHERE name = '${NAME}'`)) > 0) {
      sql(`DELETE FROM departments WHERE name = '${NAME}'`)
    }
  })

  test('list, create dialog, row menu and delete', async ({ browser }) => {
    test.setTimeout(300_000)
    // deptAdmin holds departments CRUD.
    const ctx = await browser.newContext({ storageState: AUTH.deptAdmin })
    const page = await ctx.newPage()

    await gotoDepartments(page)
    await shot(page, 'list')

    // ── Create dialog ──────────────────────────────────────────────────────
    await page.getByRole('button', { name: 'Create New Department' }).click()
    await expect(page.getByRole('textbox', { name: 'Department Name' })).toBeVisible({
      timeout: 15_000,
    })
    await shot(page, 'create-dialog')

    await page.getByRole('textbox', { name: 'Department Name' }).fill(NAME)
    // Blur lets the dialog auto-suggest the code; typing one before that lands
    // overflows code varchar(10) and the create fails silently (DEPT-J5).
    const codeInput = page.getByRole('textbox', { name: 'Code' })
    await codeInput.click()
    await expect(codeInput).not.toHaveValue('', { timeout: 15_000 })

    const siteCombo = page
      .getByText('Site', { exact: true })
      .first()
      .locator('xpath=following::*[@role="combobox"][1]')
    await siteCombo.click()
    await page
      .getByRole('listbox')
      .getByRole('option', { name: SITES.primary.name, exact: true })
      .click()
    await shot(page, 'create-dialog-filled')

    await page.getByRole('button', { name: 'Create Department', exact: true }).click()
    await expect
      .poll(() => sqlValue(`SELECT count(*) FROM departments WHERE name = '${NAME}'`), {
        timeout: 30_000,
      })
      .toBe('1')
    await expect(page.getByRole('cell', { name: NAME, exact: true }).first()).toBeVisible({
      timeout: 30_000,
    })
    await shot(page, 'list-after-create')

    // ── Row menu → Delete confirm ──────────────────────────────────────────
    const row = page.getByRole('row').filter({ hasText: NAME }).first()
    await row.getByRole('button', { name: 'More actions' }).click()
    await expect(page.getByRole('menuitem', { name: 'Delete', exact: true })).toBeVisible({
      timeout: 15_000,
    })
    await shot(page, 'row-menu')

    await page.getByRole('menuitem', { name: 'Delete', exact: true }).click()
    await expect(page.getByText('Delete Department', { exact: true }).last()).toBeVisible({
      timeout: 15_000,
    })
    await shot(page, 'delete-confirm')
    await page.getByRole('button', { name: 'Delete', exact: true }).last().click()
    await expect(page.getByRole('cell', { name: NAME, exact: true })).toHaveCount(0, {
      timeout: 30_000,
    })
    await shot(page, 'list-after-delete')

    await ctx.close()
  })

  test('denial states — no permission and unauthenticated', async ({ browser }) => {
    test.setTimeout(120_000)
    const denied = await browser.newContext({ storageState: AUTH.noAccess })
    const deniedPage = await denied.newPage()
    await deniedPage.goto('/departments', { waitUntil: 'domcontentloaded' })
    await expect(deniedPage).toHaveURL(/\/no-access/, { timeout: 30_000 })
    await shot(deniedPage, 'no-access')
    await denied.close()

    const anon = await browser.newContext() // no session
    const anonPage = await anon.newPage()
    await anonPage.goto('/departments', { waitUntil: 'domcontentloaded' })
    await expect(anonPage).toHaveURL(/\/signin/, { timeout: 30_000 })
    await shot(anonPage, 'signin-redirect')
    await anon.close()
  })
})
