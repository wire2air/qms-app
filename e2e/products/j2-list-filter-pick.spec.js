// PJ-J2 — the register (filter, sort, paginate) and the picker.
// (docs/modules/products/14-playwright-journeys.md, PW-J2.)
//
// WHY THE PICKER IS HALF OF THIS FILE. `/products` is where the item master is
// ADMINISTERED, but `ProductSelectMenu` is where most users MEET an item — it
// is the Product field on the QC lot dialog, on the specification dialog, on
// sampling plans and on retain samples. The two surfaces do not read the same
// thing, and the difference is deliberate and easy to break:
//
//   the register  reads `products` through `product_select_rls`
//                 (company_id AND products:read)
//   the picker    reads the `product_options` VIEW, which is
//                 `security_barrier` and NOT `security_invoker` — so it runs as
//                 its owner and BYPASSES that policy entirely, exactly so a
//                 picker resolves for users who hold no products grant.
//
// The picker applies its own filter instead: only `statusId === 'ACTIVE'` items
// (plus one already selected) are offered, so a retired part cannot be pulled
// into new work. That is a business rule with no database behind it, which
// makes it precisely the kind of rule only a browser test can hold — and the
// seed carries an OBSOLETE item for the sole purpose of falsifying it.
import { test, expect } from '@playwright/test'
import {
  PRODUCTS,
  createPersonaPool,
  dialog,
  openRegister,
  openSelectByNearbyLabel,
  registerRow,
  searchRegister,
} from '../fixtures/products.js'

const pool = createPersonaPool()
test.afterAll(() => pool.close())

/**
 * The visible rows' NAME cell text, in render order.
 *
 * Located by ProductsTable's own name-cell markup (`<div class="tw:font-bold
 * tw:text-on-main">`) rather than by column position. DataTable prepends a
 * checkbox `<td>` when `selectable` and another when a row is expandable, so
 * `td:nth-child(2)` is a guess that silently starts reading the SKU column the
 * day either of those changes.
 */
async function visibleNames(page) {
  return (await page.locator('tbody tr td div[class*="font-bold"]').allInnerTexts()).map((s) =>
    s.trim(),
  )
}

test.describe('PJ-J2 · list, filter, sort, paginate, pick', () => {
  test('the register lists every seeded item, and search narrows it', async ({ browser }) => {
    const page = await pool.page(browser, PRODUCTS.admin.auth)
    await openRegister(page)

    // Every status is represented, which is what makes the status filter below
    // falsifiable. Asserted by name rather than by count: the tenant also holds
    // the QC widgets (§22b) and the buffer solution (§36c), and a count would
    // become a tripwire for every future fixture rather than an assertion about
    // this module.
    for (const item of [
      PRODUCTS.items.anchor,
      PRODUCTS.items.underReview,
      PRODUCTS.items.obsolete,
      PRODUCTS.items.discontinued,
    ]) {
      await expect(registerRow(page, item.name), `${item.sku} is listed`).toBeVisible()
    }

    // The table search is a client-side filter over the live query — no debounce
    // and no request, so "settled" is one expect poll rather than a network wait.
    await searchRegister(page, PRODUCTS.items.anchor.sku)
    await expect(registerRow(page, PRODUCTS.items.anchor.name)).toBeVisible()
    await expect(
      registerRow(page, PRODUCTS.items.obsolete.name),
      'search excludes non-matching rows',
    ).toHaveCount(0)
    await searchRegister(page, '')
  })

  test('the Item Group and Status filters both narrow and can be cleared', async ({ browser }) => {
    const page = await pool.page(browser, PRODUCTS.admin.auth)

    // `useListLayout({ syncUrl: true })` hydrates filters FROM the query on
    // mount (listLayoutHelpers.queryToFilters), so a deep link is the
    // deterministic way to arrange a filter state. The chips and the "Clear all"
    // control are exercised interactively below — arranging by URL and asserting
    // the UI is what separates "the filter works" from "the click handler works".
    await openRegister(page, {
      path: `/products?productFamilyId=${PRODUCTS.groups.a.id}`,
      anchorName: PRODUCTS.items.anchor.name,
    })

    await expect(
      registerRow(page, PRODUCTS.items.specLocked.name),
      'Group A holds the spec-locked item',
    ).toBeVisible()
    await expect(
      registerRow(page, PRODUCTS.items.auditSubject.name),
      'the Group B item is filtered out — without a second group this proves nothing',
    ).toHaveCount(0)

    // The applied filter renders as a removable token, and "Clear all" empties
    // the whole toolbar. This is the interactive half.
    await expect(page.getByText('Filters', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Clear all' }).click()
    await expect(
      registerRow(page, PRODUCTS.items.auditSubject.name),
      'clearing the filter brings the Group B item back',
    ).toBeVisible({ timeout: 20_000 })

    // Status, same shape. OBSOLETE is the value with a second job later in this
    // file: the picker must refuse to offer it.
    await openRegister(page, {
      path: '/products?statusId=OBSOLETE',
      anchorName: PRODUCTS.items.obsolete.name,
    })
    await expect(registerRow(page, PRODUCTS.items.obsolete.name)).toBeVisible()
    await expect(
      registerRow(page, PRODUCTS.items.anchor.name),
      'an ACTIVE item is filtered out by statusId=OBSOLETE',
    ).toHaveCount(0)
  })

  test('the NAME column sorts both ways', async ({ browser }) => {
    const page = await pool.page(browser, PRODUCTS.admin.auth)
    await openRegister(page)

    const header = page.getByRole('columnheader', { name: /NAME/ }).first()
    const sortButton = header.getByRole('button').first()

    // Click until the header reports the sort, rather than once. The table
    // re-renders as the live query settles (the previous test cleared a search
    // box), and a click that lands during that render is swallowed — observed as
    // aria-sort staying "none" with no error anywhere.
    await expect
      .poll(
        async () => {
          if ((await header.getAttribute('aria-sort')) === 'ascending') return 'ascending'
          await sortButton.click({ timeout: 5_000 }).catch(() => {})
          return header.getAttribute('aria-sort')
        },
        { timeout: 30_000, message: 'the header reports its own sort state to assistive tech' },
      )
      .toBe('ascending')
    const asc = await visibleNames(page)
    expect(asc.length, 'rows are rendered').toBeGreaterThan(1)
    expect(asc, 'ascending really is ascending').toEqual([...asc].sort((a, b) => a.localeCompare(b)))

    await expect
      .poll(
        async () => {
          if ((await header.getAttribute('aria-sort')) === 'descending') return 'descending'
          await sortButton.click({ timeout: 5_000 }).catch(() => {})
          return header.getAttribute('aria-sort')
        },
        { timeout: 30_000, message: 'a second click reverses it' },
      )
      .toBe('descending')
    await expect
      .poll(() => visibleNames(page), { message: 'descending is exactly the reverse' })
      .toEqual([...asc].reverse())
  })

  test('pagination pages, and the range label follows', async ({ browser }) => {
    // The fixture set is deliberately SMALL (see e2e-seed.sql §37c: every row
    // here is bootstrapped into every browser context by the syncEngine, so a
    // 60-row pagination fixture would tax all 29 projects to serve one). The
    // pager is exercised by shrinking the page instead — the control under test
    // is BasePagination, not the row count.
    const page = await pool.page(browser, PRODUCTS.admin.auth)
    await openRegister(page)

    const pager = page.locator('nav[aria-label="Pagination"]')
    await pager.locator('select').selectOption('5')

    const label = pager.locator('span').first()
    await expect(label, 'the first page shows rows 1-5').toHaveText(/^1-5 of \d+$/)
    await expect(page.locator('tbody tr')).toHaveCount(5)

    await expect(
      pager.getByRole('button', { name: 'Previous page' }),
      'page 1 cannot go back',
    ).toBeDisabled()

    await pager.getByRole('button', { name: 'Next page' }).click()
    await expect(label, 'Next advances the range').toHaveText(/^6-\d+ of \d+$/)
    await expect(
      pager.getByRole('button', { name: 'Previous page' }),
      'and going back is now offered',
    ).toBeEnabled()
  })

  test('the QC lot picker offers ACTIVE items and refuses the OBSOLETE one', async ({
    browser,
  }) => {
    // The picker is how most users encounter an item, and it reads
    // `product_options` rather than `products` — a different code path with a
    // different filter. Nothing else in this suite reaches it.
    const page = await pool.page(browser, PRODUCTS.admin.auth)
    await page.goto('/qc-inspection?tab=lots')

    // Wait for the list to hydrate before reaching for its toolbar button:
    // BaseListLayout renders its shell before the syncEngine has anything.
    await page.getByRole('button', { name: 'New Inspection' }).waitFor({ timeout: 60_000 })
    await page.getByRole('button', { name: 'New Inspection' }).click()
    // NOT `toBeVisible()` on the dialog root. HeadlessUI's <Dialog as="div"> is
    // a zero-size `position: relative` wrapper whose children are `fixed`, so
    // Playwright reports it HIDDEN even while the modal is plainly on screen.
    // Assert a child, or the count.
    await expect(dialog(page).getByText('Product', { exact: true }).first()).toBeVisible({
      timeout: 30_000,
    })

    await openSelectByNearbyLabel(page, 'Product')
    const listbox = page.getByRole('listbox')

    // The option label is `${sku} - ${name}` (ProductSelectMenu.productItems) —
    // QMS users key off the SKU, so that is what the list leads with.
    await expect(
      listbox.getByRole('option', {
        name: `${PRODUCTS.items.anchor.sku} - ${PRODUCTS.items.anchor.name}`,
        exact: true,
      }),
      'an ACTIVE item is selectable',
    ).toBeVisible()

    await expect(
      listbox.getByRole('option', { name: new RegExp(PRODUCTS.items.obsolete.sku) }),
      'an OBSOLETE item is NOT offered for new work — a UI-only rule with no database behind it',
    ).toHaveCount(0)

    // Picking it really binds the value: the selected chip is a ProductBadge,
    // which leads with the SKU.
    await listbox
      .getByRole('option', {
        name: `${PRODUCTS.items.anchor.sku} - ${PRODUCTS.items.anchor.name}`,
        exact: true,
      })
      .click()
    await expect(dialog(page).getByText(PRODUCTS.items.anchor.sku, { exact: true }).first()).toBeVisible()

    // Leave without creating a lot. Lots accumulate in this tenant and are
    // purged by the qcSetup project; minting one here would make this file a
    // contributor to that problem for no assertion gained.
    // The lot dialog is `:persistent="true"`, which suppresses BaseDialog's
    // close X entirely — the footer Cancel is the only way out.
    await page.getByRole('button', { name: 'Cancel', exact: true }).last().click()
    await expect(dialog(page)).toHaveCount(0)  // count, not visibility — see above
  })
})
