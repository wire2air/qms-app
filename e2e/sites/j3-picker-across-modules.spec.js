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
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH, SITES } from '../fixtures/cast.js'
import { uniqueSiteName, findSiteByName, purgeSiteByName } from '../fixtures/sites.js'

/** The first combobox that follows a piece of text, in document order. */
function pickerAfter(page, label) {
  return page
    .getByText(label, { exact: true })
    .first()
    .locator('xpath=following::*[@role="combobox"][1]')
}

test.describe('PW-J3 · the shared site picker', () => {
  test('required-single mount: auto-fills, lists the tenant’s sites, and cannot be emptied', async ({
    browser,
  }) => {
    // Log book create — `:required="true"` on a SINGLE-select mount, which is
    // the configuration `required` was designed for: BaseSelect auto-fills the
    // first option once the list resolves, and SiteSelectMenu drops the clear
    // affordance (`:clearable="!required && !multiple"`) and the null row
    // (`showNull` is false when required). A record that must have a site
    // should not be able to lose one through the picker.
    //
    // This used to be /documents/create. That mount is no longer required-single
    // — multi-site document applicability turned it into a MULTI select behind
    // an "All sites" checkbox, so it now stands in for the `multiple` case at
    // the bottom of this file. The two mounts swapped configurations; the set of
    // configurations under test is unchanged.
    const ctx = await browser.newContext({ storageState: AUTH.owner })
    const page = await ctx.newPage()
    await page.goto('/inspections-logs/templates', { waitUntil: 'domcontentloaded' })

    const createBtn = page.getByRole('button', { name: /\+?\s*New Log Book/i }).first()
    await expect(createBtn).toBeVisible({ timeout: 30_000 })
    await createBtn.click()

    // Scope to the Sites BaseField via its hint text, then take the control
    // inside it. The dialog carries several pickers (supervisor, department,
    // equipment) and a `following::*[@role="combobox"]` walk from the "Sites"
    // label is not reliably the site one.
    const sitesField = page
      .getByText('Pick at least one site where this log book can be filled.')
      .locator('xpath=ancestor::div[1]')
    await expect(sitesField).toBeVisible({ timeout: 20_000 })
    const picker = sitesField.getByRole('combobox').first()
    await expect(picker).toBeVisible({ timeout: 20_000 })

    // The one control that could empty a required field is not rendered.
    await expect(
      picker.getByRole('button', { name: 'Clear selection' }),
      'a required picker offers no clear control',
    ).toHaveCount(0)

    await picker.click()

    const listbox = page.getByRole('listbox')
    await expect(listbox.getByRole('option').first()).toBeVisible({ timeout: 20_000 })
    await expect(listbox.getByRole('option', { name: SITES.primary.name, exact: true })).toBeVisible()
    await expect(listbox.getByRole('option', { name: SITES.secondary.name, exact: true })).toBeVisible()

    // It opened already holding a site: `required` auto-fills the first option,
    // so the field is never in an empty state — the invariant that makes the
    // missing clear control meaningful rather than merely absent.
    await expect(
      listbox.locator('[role="option"][aria-selected="true"]'),
      'a required picker starts with exactly one site selected',
    ).toHaveCount(1)

    // And there is no "— Select site —" null row to fall back to.
    await expect(listbox.getByRole('option', { name: /Select site/ })).toHaveCount(0)

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
    // Document create — `:multiple="true"`, the mount behind multi-site document
    // applicability: a controlled document can apply at several sites at once.
    // The concern is that the configuration actually HOLDS several values. A
    // single-select mount would replace the first choice with the second, and
    // the document would silently ship scoped to one site.
    //
    // (This case used to live on the log-book create dialog. That field is now
    // required-SINGLE, and is the required-single case at the top of this file.)
    const ctx = await browser.newContext({ storageState: AUTH.author })
    const page = await ctx.newPage()
    await page.goto('/documents/create', { waitUntil: 'domcontentloaded' })

    // Anchor on the "All sites" checkbox that guards the picker, not on the
    // field's "Sites" label — the sidebar carries a "Sites" entry of its own
    // (MainSidebar.vue), and it comes first in document order. The picker is the
    // next combobox after the checkbox either way.
    const picker = pickerAfter(page, 'All sites (company-wide)')
    await expect(picker).toBeVisible({ timeout: 20_000 })
    await picker.click()

    const listbox = page.getByRole('listbox')
    await expect(listbox.getByRole('option').first()).toBeVisible({ timeout: 20_000 })
    const primary = listbox.getByRole('option', { name: SITES.primary.name, exact: true })
    const secondary = listbox.getByRole('option', { name: SITES.secondary.name, exact: true })
    await primary.click()
    await secondary.click()

    // Both selections survive — a single-select mount would have dropped the
    // first, and would have closed the panel on the first click besides.
    await expect(primary).toHaveAttribute('aria-selected', 'true')
    await expect(secondary).toHaveAttribute('aria-selected', 'true')

    // And the trigger carries both, so the operator can see the document is
    // applied at two sites. `picker` is the trigger only: the panel is
    // teleported to <body>, so this cannot match the listbox rows above.
    await expect(picker.getByText(SITES.primary.name, { exact: true })).toBeVisible()
    await expect(picker.getByText(SITES.secondary.name, { exact: true })).toBeVisible()

    await ctx.close()
  })
})
