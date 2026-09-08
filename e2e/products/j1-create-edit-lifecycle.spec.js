// PJ-J1 — create, edit and lifecycle an item.
// (docs/modules/products/14-playwright-journeys.md, PW-J1.)
//
// WHY THIS FILE EXISTS. `products` is the only module in this program with NO
// REST layer at all: `backend/api/routes/` has productFamilies.js,
// itemCategories.js and uoms.js — the LOOKUPS — and no products.js. So every
// byte written to the item master is a GraphQL mutation issued by the
// syncEngine and judged only by `product_insert_rls` / `product_update_rls` and
// the table's four triggers. There is no route gate in front and no service
// layer behind.
//
// That makes "which path did the write take" a first-class assertion here
// rather than a stylistic one, and it is asserted in the direction that can
// actually catch a regression: the write must issue NO /v1/services request
// mentioning products at all. A test asserting only "a GraphQL mutation
// happened" would still pass if someone added a REST shim and left the mutation
// in place; one asserting only "no REST" would pass on a page that never saved
// anything. Both halves are here, plus the row in Postgres, because only the
// third proves the save actually landed.
import { test, expect } from '@playwright/test'
import { COMPANY_ID } from '../fixtures/cast.js'
import { sql, sqlValue } from '../fixtures/db.js'
import {
  PRODUCTS,
  createPersonaPool,
  dialog,
  findProductBySku,
  openItemDetail,
  openRegister,
  purgeProductBySku,
  recordGraphqlMutations,
  recordRestCalls,
  registerRow,
  selectByNearbyLabel,
  statusBadge,
} from '../fixtures/products.js'

const pool = createPersonaPool()
test.afterAll(() => pool.close())

// Deliberately CONSTANT, not timestamped. Playwright restarts the worker after
// a failed test, which re-evaluates module scope — a timestamped SKU would
// change mid-file and the edit test would hunt for a row the create test never
// made under that name. beforeAll purges instead, so every run starts from the
// same state regardless of what failed before it. (Same reasoning as EQ-J1.)
const SKU = 'E2E-PJ-J1-SUBJECT'
const NAME = 'E2E PJ-J1 Gasket'
const RENAMED = 'E2E PJ-J1 Gasket (rev B)'

/**
 * Re-create the subject in SQL if it is not there.
 *
 * The three tests below are a sequence — create, then edit, then walk the
 * statuses — and a Playwright RETRY re-runs the file's `beforeAll` (which
 * purges) and then only the failed test. Without this, a retry of the edit or
 * lifecycle test hunts for a row the create test never made on that attempt and
 * fails with "the create test must have run first", masking the real reason it
 * failed the first time. Minting in SQL rather than skipping keeps the retry
 * meaningful: what those two tests are about is the EDIT path, not the create.
 */
function ensureSubject() {
  const existing = findProductBySku(SKU)
  if (existing) return existing
  sql(
    `INSERT INTO products (company_id, name, sku, product_type_id, status_id, product_family_id,
                           uom_id, revision, inspection_required, lot_controlled, serial_controlled,
                           is_hazardous, created_by, updated_by, created_at, updated_at)
     VALUES ('${COMPANY_ID}', '${NAME}', '${SKU}', 'COMPONENT', 'ACTIVE',
             '${PRODUCTS.groups.a.id}', '${PRODUCTS.uoms.each.id}', 'A',
             false, false, false, false,
             '${PRODUCTS.admin.user.id}', '${PRODUCTS.admin.user.id}', NOW(), NOW())`,
  )
  return findProductBySku(SKU)
}

test.describe('PJ-J1 · the item lifecycle', () => {
  test.beforeAll(() => purgeProductBySku(SKU))
  test.afterAll(() => purgeProductBySku(SKU))

  test('create: the dialog writes over GraphQL and issues no products REST call', async ({
    browser,
  }) => {
    const page = await pool.page(browser, PRODUCTS.admin.auth)
    await openRegister(page)

    // Record EVERY /v1/services request, not just ones mentioning products. The
    // interesting failure mode is a request to a path nobody expected, and a
    // recorder written around the expected path could never see it.
    const restCalls = recordRestCalls(page)
    const mutations = recordGraphqlMutations(page)

    await page.getByRole('button', { name: 'Add New Item' }).first().click()
    const d = dialog(page)
    await expect(d.getByText('Create New Item', { exact: true })).toBeVisible()

    await d.getByRole('textbox', { name: 'Item Name', exact: true }).fill(NAME)
    await d.getByRole('textbox', { name: 'SKU', exact: true }).fill(SKU)
    await d.getByRole('textbox', { name: 'Revision', exact: true }).fill('A')

    // Item Type is `required`, and BaseSelect auto-fills the first option of a
    // required select once the option list loads. All four product_types share
    // display_order 1000, so "the first" is whatever order the query happened to
    // return — pick explicitly, or this test asserts against an arbitrary value.
    await selectByNearbyLabel(page, 'Item Type', 'Component')
    // Item Group / Unit of Measure are NOT wrapped in BaseField's default slot
    // (the dialog uses a bare <p> caption for them), so they never receive the
    // generated id and getByLabel matches nothing — hence the
    // label-then-next-combobox handle, scoped to the dialog.
    await selectByNearbyLabel(page, 'Item Group', PRODUCTS.groups.a.name)
    await selectByNearbyLabel(page, 'Unit of Measure', PRODUCTS.uoms.each.name)

    await page.getByRole('button', { name: 'Create Item', exact: true }).click()

    // Assert against Postgres, never against the toast: the row is what QC,
    // complaints, NCs, sampling plans and retain samples all FK into.
    await expect
      .poll(() => sqlValue(`SELECT count(*) FROM products WHERE sku = '${SKU}'`), {
        timeout: 30_000,
        message: 'the create landed in Postgres',
      })
      .toBe('1')

    const row = findProductBySku(SKU)
    expect(row.name).toBe(NAME)
    expect(row.productTypeId, 'the stored value is the enum id, not the label').toBe('COMPONENT')
    expect(row.productFamilyId).toBe(PRODUCTS.groups.a.id)
    expect(row.uomId).toBe(PRODUCTS.uoms.each.id)
    expect(row.revision).toBe('A')
    expect(row.statusId, 'statusId defaults to ACTIVE in EMPTY_FORM').toBe('ACTIVE')
    expect(row.deletedAt).toBeNull()

    // THE PATH ASSERTION. There is no products REST endpoint; if one ever
    // appears, this fails and whoever added it has to say so out loud.
    expect(
      restCalls.filter((c) => /product/i.test(c)),
      'products has no REST route — the write must be a GraphQL mutation',
    ).toEqual([])
    // …and the positive half, so "no REST" cannot be satisfied by a save that
    // never happened.
    expect(
      mutations,
      'the syncEngine issued the create mutation (GraphQLSchemaGenerator: createProduct)',
    ).toContain('createProduct')

    // The row shows up in the register with no reload — the live query over
    // IndexedDB, fed by the sync socket.
    await expect(registerRow(page, NAME)).toBeVisible({ timeout: 30_000 })
  })

  test('edit: the detail page saves the same way, and SKU stays immutable', async ({ browser }) => {
    const page = await pool.page(browser, PRODUCTS.admin.auth)
    const created = ensureSubject()
    expect(created, 'the subject item exists').not.toBeNull()

    await openItemDetail(page, { id: created.id, name: created.name })

    const restCalls = recordRestCalls(page)
    const mutations = recordGraphqlMutations(page)

    await page.getByRole('button', { name: 'Edit', exact: true }).click()
    const d = dialog(page)
    await expect(d.getByText('Edit Item', { exact: true })).toBeVisible()

    // SKU is `:disabled="isEdit"` — the item's key is immutable once issued,
    // because every other record refers to it by that string. Asserted rather
    // than assumed: an editable SKU would silently re-point the human meaning of
    // every historical reference.
    await expect(
      d.getByRole('textbox', { name: 'SKU', exact: true }),
      'SKU is not editable after creation',
    ).toBeDisabled()

    await d.getByRole('textbox', { name: 'Item Name', exact: true }).fill(RENAMED)
    await d.getByRole('textbox', { name: 'Revision', exact: true }).fill('B')
    await page.getByRole('button', { name: 'Save Changes', exact: true }).click()

    await expect
      .poll(() => findProductBySku(SKU)?.revision, {
        timeout: 30_000,
        message: 'the edit landed in Postgres',
      })
      .toBe('B')

    const after = findProductBySku(SKU)
    expect(after.name).toBe(RENAMED)
    expect(after.sku, 'the SKU is unchanged').toBe(SKU)

    expect(
      restCalls.filter((c) => /product/i.test(c)),
      'edit takes the same GraphQL path as create',
    ).toEqual([])
    expect(mutations, 'the update mutation went out').toContain('updateProduct')
  })

  test('lifecycle: all four statuses are reachable and each repaints the badge', async ({
    browser,
  }) => {
    // ACTIVE (green) → UNDER_REVIEW (amber) → OBSOLETE (gray) → DISCONTINUED
    // (red) → back to ACTIVE. The colours are Tailwind classes in
    // ProductStatusBadge.vue's SCHEME_MAP, which is the only place the mapping
    // exists — there is no status colour in the database — so asserting the
    // class IS asserting the mapping.
    //
    // This item carries NO Specification, and that matters for the OBSOLETE
    // step: `enforce_product_specification_link_trg` (migration 20260910120000)
    // refuses status→OBSOLETE while a LIVE spec references the item. PJ-J5
    // covers that rule from the other side; here the point is that the ordinary
    // path is open, so the guard has not become a tax on every retirement.
    const page = await pool.page(browser, PRODUCTS.admin.auth)
    const created = ensureSubject()
    expect(created, 'the subject item exists').not.toBeNull()
    const subjectName = created.name

    const STEPS = [
      { id: 'UNDER_REVIEW', label: 'Under Review', colour: /bg-amber-100/ },
      { id: 'OBSOLETE', label: 'Obsolete', colour: /bg-gray-100/ },
      { id: 'DISCONTINUED', label: 'Discontinued', colour: /bg-red-100/ },
      { id: 'ACTIVE', label: 'Active', colour: /bg-green-100/ },
    ]

    for (const step of STEPS) {
      await openItemDetail(page, { id: created.id, name: subjectName })
      await page.getByRole('button', { name: 'Edit', exact: true }).click()
      await expect(dialog(page).getByText('Edit Item', { exact: true })).toBeVisible()
      await selectByNearbyLabel(page, 'Status', step.label)
      await page.getByRole('button', { name: 'Save Changes', exact: true }).click()

      await expect
        .poll(() => findProductBySku(SKU)?.statusId, {
          timeout: 30_000,
          message: `status moved to ${step.id} in Postgres`,
        })
        .toBe(step.id)

      // The dialog must be gone before the badge is located: while it is open
      // the status select's own option text carries the same label.
      await expect(dialog(page)).toHaveCount(0, { timeout: 15_000 })
      await expect(
        statusBadge(page, step.label),
        `the ${step.id} badge is painted ${String(step.colour)}`,
      ).toHaveClass(step.colour, { timeout: 30_000 })
    }
  })
})
