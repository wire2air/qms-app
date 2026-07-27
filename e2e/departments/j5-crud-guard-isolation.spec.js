// DEPT-J5 — The working baseline: CRUD, the route guard, and tenant isolation.
// GREEN-EXPECTED.
//
// Everything the module gets right, asserted so a fix for the four findings in
// this suite cannot quietly break it. In particular the CRUD path here is the
// GraphQL one — the same path DEPT-J1 shows *can* set supervisorUserId — so if
// someone repairs the REST Zod schemas by rerouting the UI through REST, this
// spec is what notices.
import { test, expect } from '@playwright/test'
import { AUTH, SITES, DEPARTMENTS, COMPANY_ID, ALT_BASE_URL } from '../fixtures/cast.js'
import { sql, sqlValue } from '../fixtures/db.js'

// Deliberately CONSTANT, not timestamped. Playwright restarts the worker after
// a failed test, which re-evaluates module scope — a timestamped name would
// change mid-file and the later tests would hunt for a row the create test
// never made under that name. beforeAll clears it instead, so every run starts
// from the same state regardless of what failed before it.
const NAME = 'E2E DJ5 Department'

async function gotoDepartments(page) {
  await page.goto('/departments', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'Departments' }).first()).toBeVisible({
    timeout: 20_000,
  })
}

test.describe('DEPT-J5 · departments CRUD, guard and isolation', () => {
  // Cleanup keys on NAME, not code: the dialog auto-suggests the code from the
  // name on blur, so the test does not choose it.
  const purge = () => sql(`DELETE FROM departments WHERE name = '${NAME}'`)
  test.beforeAll(purge)
  test.afterAll(purge)

  test('create: the dialog persists over GraphQL, not REST', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: AUTH.deptAdmin })
    const page = await ctx.newPage()

    // Record any REST traffic the page makes while creating. The Sites module
    // has the identical property and the identical assertion — both pages'
    // writes are governed by RLS alone, so the path is worth pinning.
    const restCalls = []
    page.on('request', (req) => {
      if (req.url().includes('/v1/services/departments')) restCalls.push(`${req.method()} ${req.url()}`)
    })

    await gotoDepartments(page)
    await page.getByRole('button', { name: 'Create New Department' }).click()

    // By accessible name. Two weaker locators were tried first and both were
    // wrong in instructive ways: getByRole('textbox').nth(n) picks up the
    // app-shell and table search inputs that precede the dialog in the DOM, and
    // getByPlaceholder('e.g. Quality Assurance') ALSO matches the Description
    // field's 'e.g. Quality assurance and testing department' — placeholder
    // matching is substring and case-insensitive by default.
    await page.getByRole('textbox', { name: 'Department Name' }).fill(NAME)

    // Let the dialog auto-suggest the code rather than supplying one. Blurring
    // the name field triggers the suggestion, and a code typed before that
    // lands gets combined with it — the result overflows `code` varchar(10) and
    // the create fails silently with the dialog still open.
    const codeInput = page.getByRole('textbox', { name: 'Code' })
    await codeInput.click()
    await expect(codeInput).not.toHaveValue('', { timeout: 10_000 })

    // Site is a required select on this dialog.
    const siteCombo = page
      .getByText('Site', { exact: true })
      .first()
      .locator('xpath=following::*[@role="combobox"][1]')
    await siteCombo.click()
    await page
      .getByRole('listbox')
      .getByRole('option', { name: SITES.primary.name, exact: true })
      .click()

    await page.getByRole('button', { name: 'Create Department', exact: true }).click()

    await expect
      .poll(() => sqlValue(`SELECT count(*) FROM departments WHERE name = '${NAME}'`), {
        timeout: 20_000,
        message: 'department persisted',
      })
      .toBe('1')

    expect(restCalls, 'the Departments page must not write through the REST surface').toEqual([])
    await ctx.close()
  })

  test('the created department belongs to the chosen site', () => {
    expect(sqlValue(`SELECT site_id FROM departments WHERE name = '${NAME}'`)).toBe(SITES.primary.id)
  })

  test('a user without departments:read is redirected off /departments', async ({ browser }) => {
    // departments is ADMIN-tier, so the guard covers the whole subtree.
    const ctx = await browser.newContext({ storageState: AUTH.noAccess })
    const page = await ctx.newPage()
    await page.goto('/departments', { waitUntil: 'domcontentloaded' })
    await expect(page).toHaveURL(/\/no-access/, { timeout: 20_000 })
    await ctx.close()
  })

  test('a tenant sees its own departments and no others', async ({ browser }) => {
    const own = await browser.newContext({ storageState: AUTH.deptAdmin })
    const p1 = await own.newPage()
    await gotoDepartments(p1)
    await expect(p1.getByRole('cell', { name: DEPARTMENTS.quality.name, exact: true })).toBeVisible({
      timeout: 20_000,
    })
    await own.close()

    // E2EALT has its own 'Quality' department — a different row with the same
    // name, which is exactly the case a company-id filter has to get right.
    const alt = await browser.newContext({ storageState: AUTH.altOwner, baseURL: ALT_BASE_URL })
    const p2 = await alt.newPage()
    await gotoDepartments(p2)
    await expect(p2.getByRole('cell', { name: NAME, exact: true })).toHaveCount(0)
    await alt.close()

    expect(
      Number(sqlValue(`SELECT count(*) FROM departments WHERE company_id = '${COMPANY_ID}' AND deleted_at IS NULL`)),
      'the tenants are separate populations',
    ).toBeGreaterThanOrEqual(3)
  })

  test('delete: the row goes from the list and is soft-deleted', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: AUTH.deptAdmin })
    const page = await ctx.newPage()
    await gotoDepartments(page)

    const row = page.getByRole('row').filter({ hasText: NAME }).first()
    await expect(row).toBeVisible({ timeout: 20_000 })
    await row.getByRole('button', { name: 'More actions' }).click()
    await page.getByRole('menuitem', { name: 'Delete', exact: true }).click()
    await page.getByRole('button', { name: 'Delete', exact: true }).last().click()

    await expect(page.getByRole('cell', { name: NAME, exact: true })).toHaveCount(0, {
      timeout: 20_000,
    })
    await ctx.close()

    // Soft delete, like sites. Note what DEPT-J4 establishes about this: only
    // deleted_at changes, and deleted_at is not a tracked field, so the removal
    // produces no audit row.
    expect(
      sqlValue(`SELECT coalesce(deleted_at::text,'') FROM departments WHERE name = '${NAME}'`),
      'the row survives as a soft delete',
    ).not.toBe('')
  })
})
