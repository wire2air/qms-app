// PJ-J3 — the item detail page and its cross-module Specifications tab.
// (docs/modules/products/14-playwright-journeys.md, PW-J3.)
//
// WHY THIS FILE EXISTS. The Specifications tab is the one place in this module
// where a permission from a DIFFERENT module decides what a user may do:
// `ProductSpecificationsTab.vue` gates "New Specification" on
// `inspection_spec:write`, not on `products:update`. That is CORRECT — the
// button creates a `specifications` row, and `specifications_write_rls` gates on
// exactly that verb — and it is the kind of correctness that gets "simplified"
// into `products:update` by someone tidying up, at which point the UI offers an
// action the database will refuse.
//
// The tab's other claim is that it lists specifications scoped to the item AND
// to the item's Item GROUP. `specifications_scope_exactly_one_chk` forces a
// group-scoped spec to leave `product_id` NULL, so the group arm is the only
// way such a row can ever be found from an item — and a fixture set with only
// item-scoped specs would let a one-armed filter pass.
import { test, expect } from '@playwright/test'
import {
  PRODUCTS,
  createPersonaPool,
  dialog,
  openItemDetail,
} from '../fixtures/products.js'

const pool = createPersonaPool()
test.afterAll(() => pool.close())

const anchor = PRODUCTS.items.anchor

test.describe('PJ-J3 · item detail and the Specifications tab', () => {
  test('the Overview tab renders the item from productDetailConfig', async ({ browser }) => {
    const page = await pool.page(browser, PRODUCTS.admin.auth)
    await openItemDetail(page, anchor)

    // buildProductTabs() returns exactly these two, both in panel mode. The
    // config file is unit-tested (productDetailConfig.spec.js); what only a
    // browser can say is that BaseDetailLayout actually renders them.
    await expect(page.getByRole('tab', { name: 'Overview' })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Specifications' })).toBeVisible()

    // buildProductActions() emits ONE descriptor, `edit`, visible only when
    // canUpdate. This persona holds products:update.
    await expect(page.getByRole('button', { name: 'Edit', exact: true })).toBeVisible()

    // The seeded anchor populates every optional column precisely so this
    // assertion is about rendering rather than about a row of dashes.
    await expect(page.getByText(anchor.sku, { exact: true }).first()).toBeVisible()
    await expect(page.getByText(anchor.criticality, { exact: true }).first()).toBeVisible()
    await expect(page.getByText('Hazardous', { exact: true })).toBeVisible()
    await expect(page.getByText('Inspection required', { exact: true })).toBeVisible()
    await expect(page.getByText(PRODUCTS.uoms.each.name, { exact: true }).first()).toBeVisible()
  })

  test('the tab lists item-scoped AND group-scoped specs, and hides superseded ones', async ({
    browser,
  }) => {
    const page = await pool.page(browser, PRODUCTS.admin.auth)
    await openItemDetail(page, anchor)
    await page.getByRole('tab', { name: 'Specifications' }).click()

    const itemSpec = page.getByRole('button', { name: `Open specification ${PRODUCTS.specs.itemScoped.name}` }).first()
    await expect(itemSpec, 'the item-scoped spec is listed').toBeVisible({ timeout: 30_000 })

    await expect(
      page.getByRole('button', { name: `Open specification ${PRODUCTS.specs.groupScoped.name}` }).first(),
      'the GROUP-scoped spec is listed too — it carries product_id NULL, so only the family arm of the filter can find it',
    ).toBeVisible()

    // Scope chips distinguish the two arms in the UI.
    await expect(page.getByText('This item', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('Item group', { exact: true }).first()).toBeVisible()

    await expect(
      page.getByRole('button', { name: `Open specification ${PRODUCTS.specs.superseded.name}` }),
      'SUPERSEDED specs are filtered out of the DISPLAY (they are not filtered out of the delete guard — see PJ-J5)',
    ).toHaveCount(0)

    await expect(page.getByText(/2 specification\(s\) linked/)).toBeVisible()
  })

  test('New Specification pre-seeds the item it was opened from', async ({ browser }) => {
    const page = await pool.page(browser, PRODUCTS.admin.auth)
    await openItemDetail(page, anchor)
    await page.getByRole('tab', { name: 'Specifications' }).click()

    await page.getByRole('button', { name: 'New Specification' }).click()
    const d = dialog(page)
    await expect(d.getByText('New Specification', { exact: true })).toBeVisible()

    // `:defaultProductId="productId"` reaches the dialog's form as
    // `form.productId` with `scope: 'product'`, and the bound value renders
    // through ProductBadgeById, which leads with the SKU. Asserting the SKU is
    // asserting the prefill: an empty picker would render its placeholder.
    await expect(
      d.getByText(anchor.sku, { exact: true }).first(),
      'the new specification is pre-scoped to the item the tab belongs to',
    ).toBeVisible({ timeout: 20_000 })

    // Close without saving — this file asserts the gate and the prefill, not the
    // specification authoring flow (which qcInspection PW-J4 owns).
    await page.getByRole('button', { name: 'Cancel' }).first().click()
  })

  test('a reader without inspection_spec:write still sees the list, but is offered no create', async ({
    browser,
  }) => {
    // THE POINT OF THE WHOLE FILE. This persona holds `products:read` and
    // `inspection_spec:read` — enough to reach the item and to read its specs
    // through `specifications_select_rls` — and does NOT hold
    // `inspection_spec:write`.
    //
    // The read grant is load-bearing and easy to get wrong. Without it the list
    // would be empty for RLS reasons that have nothing to do with the write
    // gate, and "no create button, no rows" would pass while proving nothing.
    // So the list rendering is asserted FIRST, as the premise.
    const page = await pool.page(browser, PRODUCTS.reader.auth)
    await openItemDetail(page, anchor)
    await page.getByRole('tab', { name: 'Specifications' }).click()

    await expect(
      page.getByRole('button', { name: `Open specification ${PRODUCTS.specs.itemScoped.name}` }).first(),
      'the premise: this persona really can read specifications',
    ).toBeVisible({ timeout: 30_000 })

    await expect(
      page.getByRole('button', { name: 'New Specification' }),
      'the tab gates authoring on the OTHER module’s verb (inspection_spec:write), not on products:update',
    ).toHaveCount(0)

    // …and the same persona is offered no item-level Edit either, so the absence
    // above is not just "this user can do nothing anywhere".
    await expect(page.getByRole('button', { name: 'Edit', exact: true })).toHaveCount(0)
  })
})
