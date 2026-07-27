// PW-J3 — The site picker across its mount points.
//
// `SiteSelectMenu` is mounted in ~26 places across ~20 modules, in four
// distinct configurations, and every one of them reads the same live query and
// the same `sites:create` check. That makes it the highest-leverage component
// in the module: a regression here is a regression in twenty features at once,
// and none of them has a test that would notice.
//
// This journey does not try to visit all 26. It takes one mount of each
// CONFIGURATION — required-single, optional-filter, multiple — plus the inline
// create affordance, which is the only part of the component that is
// permission-gated.
import { test, expect } from '@playwright/test'
import { AUTH, SITES } from '../fixtures/cast.js'
import { uniqueSiteName, findSiteByName, purgeSiteByName } from '../fixtures/sites.js'

/** The first combobox that follows a field label, in document order. */
function pickerAfter(page, label) {
  return page
    .getByText(label, { exact: true })
    .first()
    .locator('xpath=following::*[@role="combobox"][1]')
}

test.describe('PW-J3 · the shared site picker', () => {
  test('required-single mount: lists the tenant’s sites and cannot be cleared', async ({
    browser,
  }) => {
    // Document create — `:required="true"`, so the component auto-selects the
    // first option and drops the clear affordance. A record that must have a
    // site should not be able to lose one through the picker.
    const ctx = await browser.newContext({ storageState: AUTH.author })
    const page = await ctx.newPage()
    await page.goto('/documents/create', { waitUntil: 'domcontentloaded' })

    const picker = pickerAfter(page, 'Site')
    await expect(picker).toBeVisible({ timeout: 20_000 })
    await picker.click()

    const listbox = page.getByRole('listbox')
    await expect(listbox.getByRole('option').first()).toBeVisible({ timeout: 20_000 })
    await expect(listbox.getByRole('option', { name: SITES.primary.name, exact: true })).toBeVisible()
    await expect(listbox.getByRole('option', { name: SITES.secondary.name, exact: true })).toBeVisible()

    // A required picker offers no "— Select site —" null option to fall back to.
    await expect(listbox.getByRole('option', { name: /^—\s*Select site\s*—$/ })).toHaveCount(0)

    await ctx.close()
  })

  test('filter mount: offers an "All sites" option the required mounts do not', async ({
    browser,
  }) => {
    // Departments filter toolbar — `:isFilter="true"`, which flips the null
    // label from "— Select site —" to "— All sites —". The distinction is the
    // whole difference between "this record has no site" and "do not filter by
    // site", and it is carried entirely by that one prop.
    const ctx = await browser.newContext({ storageState: AUTH.siteAdmin })
    const page = await ctx.newPage()
    await page.goto('/departments', { waitUntil: 'domcontentloaded' })

    const picker = page.getByRole('combobox').first()
    await expect(picker).toBeVisible({ timeout: 20_000 })
    await picker.click()

    await expect(page.getByRole('listbox').getByRole('option', { name: /All sites/ })).toBeVisible({
      timeout: 20_000,
    })

    await ctx.close()
  })

  test('the inline "Add New Site" is gated on sites:create', async ({ browser }) => {
    // The only permission-sensitive part of the component, and it is checked
    // client-side only (`isAllowed(['sites:create'])`). Worth pinning in both
    // directions: shipping it to everyone would be a UX bug that ends in a
    // permission-denied toast, and losing it for holders removes the only
    // create path that does not require leaving the form.
    // Both halves use the SAME mount (the departments filter toolbar) so the
    // only variable is the grant. siteAdmin cannot reach /documents/create —
    // it holds no document_control grants — and running the two halves on
    // different pages would compare two different mounts.
    const withCreate = await browser.newContext({ storageState: AUTH.siteAdmin })
    const p1 = await withCreate.newPage()
    await p1.goto('/departments', { waitUntil: 'domcontentloaded' })
    await p1.getByRole('combobox').first().click()
    await expect(
      p1.getByRole('button', { name: 'Add New Site' }),
      'a sites:create holder gets the inline create affordance',
    ).toBeVisible({ timeout: 20_000 })
    await withCreate.close()

    // The author holds sites:read (so the picker resolves) but not sites:create.
    const withoutCreate = await browser.newContext({ storageState: AUTH.author })
    const p2 = await withoutCreate.newPage()
    await p2.goto('/departments', { waitUntil: 'domcontentloaded' })
    await p2.getByRole('combobox').first().click()
    await expect(p2.getByRole('listbox').getByRole('option').first()).toBeVisible({ timeout: 20_000 })
    await expect(
      p2.getByRole('button', { name: 'Add New Site' }),
      'a read-only user does not get it',
    ).toHaveCount(0)
    await withoutCreate.close()
  })

  test('creating a site from inside the picker selects it in place', async ({ browser }) => {
    // The inline create flow's whole point: the operator does not lose the form
    // they were filling in. Asserts the new site is both persisted AND selected
    // in the picker that launched it.
    const name = uniqueSiteName('J3')
    const ctx = await browser.newContext({ storageState: AUTH.siteAdmin })
    const page = await ctx.newPage()

    try {
      await page.goto('/departments', { waitUntil: 'domcontentloaded' })
      await page.getByRole('combobox').first().click()
      await page.getByRole('button', { name: 'Add New Site' }).click()

      await expect(page.getByPlaceholder('e.g. New York Headquarters')).toBeVisible({ timeout: 10_000 })
      await page.getByPlaceholder('e.g. New York Headquarters').fill(name)
      await page.getByPlaceholder('e.g. NY-HQ').click() // blur → code auto-suggest
      await expect(page.getByPlaceholder('e.g. NY-HQ')).not.toHaveValue('', { timeout: 10_000 })
      await page.getByRole('button', { name: 'Create Site' }).click()

      await expect
        .poll(() => findSiteByName(name) !== null, { timeout: 20_000, message: 'site persisted' })
        .toBe(true)

      // And the picker it was launched from now carries it as the selected
      // value — the operator does not have to go and find it.
      await expect(page.getByText(name).first()).toBeVisible({ timeout: 20_000 })
    } finally {
      await ctx.close()
      purgeSiteByName(name)
    }
  })

  test('multiple mount: accepts more than one site', async ({ browser }) => {
    // Log books assign to N sites via the `sites_on_log_books` pivot — the same
    // pivot PW-J8 shows is rewritable by anyone. Here the concern is only that
    // the multi-select configuration renders and holds several values.
    const ctx = await browser.newContext({ storageState: AUTH.owner })
    const page = await ctx.newPage()
    // The create dialog lives on the log-book *templates* page, not the
    // inspections-logs index.
    await page.goto('/inspections-logs/templates', { waitUntil: 'domcontentloaded' })

    const createBtn = page.getByRole('button', { name: /\+?\s*New Log Book/i }).first()
    await expect(createBtn).toBeVisible({ timeout: 30_000 })
    await createBtn.click()

    // Scope to the Sites BaseField via its hint text, then take the control
    // inside it. A `following::*[@role="combobox"]` walk from the "Sites" label
    // lands on the dialog's User picker instead — the multi-select's trigger is
    // not the next combobox in document order.
    const sitesField = page
      .getByText('Pick at least one site where this log book can be filled.')
      .locator('xpath=ancestor::div[1]')
    await expect(sitesField).toBeVisible({ timeout: 20_000 })
    await sitesField.getByRole('combobox').or(sitesField.getByRole('button')).first().click()

    const listbox = page.getByRole('listbox')
    await expect(listbox.getByRole('option').first()).toBeVisible({ timeout: 20_000 })
    await listbox.getByRole('option', { name: SITES.primary.name, exact: true }).click()
    await listbox.getByRole('option', { name: SITES.secondary.name, exact: true }).click()

    // Both selections survive — a single-select mount would have replaced the
    // first with the second.
    await expect(page.getByText(SITES.primary.name).first()).toBeVisible()
    await expect(page.getByText(SITES.secondary.name).first()).toBeVisible()

    await ctx.close()
  })
})
