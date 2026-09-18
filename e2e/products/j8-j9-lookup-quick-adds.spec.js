// PJ-J8 + PJ-J9 — the three inline lookup quick-adds inside the item dialog.
// (docs/modules/products/14-playwright-journeys.md, PW-J8 and PW-J9.)
//
// ⚠ THE PACK DESCRIBES BOTH OF THESE AS "WRITTEN TO FAIL TODAY". Neither is,
// any more, and writing them that way now would have inverted their meaning.
// Both defects were closed on 2026-09-07, so these are GREEN-EXPECTED GATES
// asserting the fixed behaviour — a regression fails them, which is the whole
// point of writing them at all.
//
// PJ-J8 — finding #1, "Add New Group" was dead for EVERYONE, owners included.
// `ProductFamilyCreateDialog.vue` used to save through the syncEngine:
//
//     const pf = db.ProductFamily.create(payload); await pf.save()
//
// which cannot work for two independent reasons. `product_families` carries
// COMMENT ON TABLE … '@behavior -insert -update -delete', so PostGraphile emits
// NO create/update/delete field for the type — the client was sending a mutation
// the schema had never built. And `app_user` holds SELECT only on the table, so
// even a mutation that existed would have been refused; the company-owner bypass
// lives in RLS POLICIES, which Postgres never consults when the table-level
// GRANT is absent. That is why "works for admins" never masked it and why nobody
// could produce a working case to compare against. The fix routes the dialog to
// `POST /v1/services/productFamilies`, the table's only write path.
//
// So the assertion is not merely "a group appeared". It is that the group
// appeared AND `createProductFamily` was never selected in a GraphQL mutation —
// because the regression being guarded against is a future refactor tidying the
// REST call back into a `useLiveMutation` for consistency with its neighbours,
// which is exactly how the bug was written the first time.
//
// PJ-J9 — finding #2, `isAllowed(['company_settings:manage', 'owner'])`.
// `isAllowed` ANDs its list (currentSession.js) and `'owner'` is not a
// module:action pair, so it could never be present — collapsing all three gates
// to owner-only through the `isOwner` short-circuit and hiding the affordance
// from exactly the settings admins the backend admits. All three REST routes
// gate on `company_settings:manage` alone.
//
// ⚠ AND A DIVERGENCE THE PACK DID NOT KNOW ABOUT, which changes PJ-J9's first
// bullet. The pack says "assert Item Group administration works on the Lookups
// page" for a non-owner settings admin. It does NOT: `ProductFamiliesCard.vue`
// gates "Add Group" on `isOwner` alone and renders "Only the company owner can
// edit shared lookup data" to everyone else. So the SAME capability is gated
// three different ways — `company_settings:manage` on the REST route, the same
// in the three quick-adds, and OWNER-ONLY on the Lookups page — and the Lookups
// page is now the strictest of the three. That is asserted below rather than
// worked around, and the REST probe underneath it shows the server disagrees
// with the page.
import { test, expect } from '@playwright/test'
import { sqlValue } from '../fixtures/db.js'
import {
  PRODUCTS,
  createPersonaPool,
  dialog,
  errorMessage,
  openItemDetail,
  closeSelectByNearbyLabel,
  openRegister,
  openSelectByNearbyLabel,
  purgeMintedCategories,
  purgeMintedGroups,
  purgeMintedUoms,
  recordGraphqlMutations,
  recordRestCalls,
  restPost,
} from '../fixtures/products.js'

const pool = createPersonaPool()
test.afterAll(() => pool.close())

const GROUP_CODE = 'E2E_PJ_J8_GROUP'
const GROUP_NAME = 'E2E PJ-J8 Quick Group'
const LOOKUPS_CODE = 'E2E_PJ_J8_LOOKUPS'
const LOOKUPS_NAME = 'E2E PJ-J8 Lookups Group'
const REST_CODE = 'E2E_PJ_J9_REST'

function familyByCode(code) {
  return sqlValue(`SELECT id FROM product_families WHERE code = '${code}' AND deleted_at IS NULL`)
}

test.describe('PJ-J8 · the Item Group quick-add', () => {
  test.beforeAll(() => purgeMintedGroups())
  test.afterAll(() => purgeMintedGroups())

  test('the quick-add creates a group over REST and issues no GraphQL mutation for it', async ({
    browser,
  }) => {
    const page = await pool.page(browser, PRODUCTS.admin.auth)
    await openRegister(page)

    await page.getByRole('button', { name: 'Add New Item' }).first().click()
    const d = dialog(page)
    await expect(d.getByText('Create New Item', { exact: true })).toBeVisible()

    const restCalls = recordRestCalls(page)
    const mutations = recordGraphqlMutations(page)

    await openSelectByNearbyLabel(page, 'Item Group')
    await page.getByRole('button', { name: 'Add New Group' }).click()

    // The quick-add dialog opens ON TOP of the item dialog, so `dialog(page)` is
    // now ambiguous — address the inner one by its own title.
    const quickAdd = page.getByRole('dialog').filter({ hasText: 'Add Item Group' }).last()
    // Count, not visibility: HeadlessUI's <Dialog as="div"> root is a zero-size
    // relative wrapper (its children are fixed), so Playwright reports it hidden
    // even when the modal is on screen.
    await expect(quickAdd).toHaveCount(1)
    await expect(quickAdd.getByRole('textbox', { name: 'Name', exact: true })).toBeVisible()

    await quickAdd.getByRole('textbox', { name: 'Name', exact: true }).fill(GROUP_NAME)

    // `code` is auto-derived by slugify() and validated CLIENT-SIDE against the
    // same regex the REST schema uses (/^[A-Z][A-Z0-9_]*$/, min 2). That check
    // is itself part of the P1 fix: the GraphQL path validated nothing, so a
    // name like "3M Caps" would have reached the user as an opaque 400 on a
    // field they never typed. Override it here so the assertion is about the
    // write path, not about slugify.
    await quickAdd.getByRole('button', { name: 'Edit' }).click()
    // The Code BaseField overrides BaseField's #label slot, so its accessible
    // name is "Code (auto-derived)" rather than "Code". NOT located by
    // placeholder: getByPlaceholder is a SUBSTRING match and the Name field's
    // placeholder ("e.g. Skincare (product line)…") contains "SKINCARE".
    await quickAdd.getByRole('textbox', { name: 'Code (auto-derived)' }).fill(GROUP_CODE)

    await quickAdd.getByRole('button', { name: 'Add Group', exact: true }).click()

    await expect
      .poll(() => familyByCode(GROUP_CODE), { timeout: 30_000, message: 'the group reached Postgres' })
      .not.toBeNull()

    // THE PATH ASSERTIONS, both directions.
    expect(
      restCalls,
      'the only write path product_families has is REST — /v1/services/productFamilies',
    ).toContain('POST /api/v1/services/productFamilies')
    expect(
      mutations,
      'and no createProductFamily mutation was attempted — PostGraphile emits no such field, ' +
        'so an attempt would be a silent regression to the shape that shipped broken for six weeks',
    ).not.toContain('createProductFamily')
    expect(mutations).not.toContain('CreateProductFamily')

    // The new group is SELECTED in the field it was created from — the whole
    // reason the quick-add exists.
    await expect(d.getByText(GROUP_NAME, { exact: true }).first()).toBeVisible({ timeout: 20_000 })

  })

  test('the Lookups page control case: the owner can administer Item Groups there', async ({
    browser,
  }) => {
    // THE CONTROL. Without it, "the quick-add worked" is consistent with a
    // tenant where nothing about product_families works at all. Run as the
    // OWNER because — see the file header — ProductFamiliesCard gates its "Add
    // Group" button on isOwner alone, not on company_settings:manage.
    const page = await pool.page(browser, PRODUCTS.owner.auth)
    await page.goto('/lookups?tab=product-families')

    await expect(page.getByRole('heading', { name: 'Item Groups' })).toBeVisible({ timeout: 60_000 })
    await page.getByRole('button', { name: 'Add Group' }).click()

    const d = page.getByRole('dialog').filter({ hasText: 'Add Product Family' }).last()
    await expect(d).toHaveCount(1)
    await expect(d.getByRole('textbox', { name: 'Name', exact: true })).toBeVisible()
    await d.getByRole('textbox', { name: 'Name', exact: true }).fill(LOOKUPS_NAME)
    await d.getByRole('button', { name: 'Edit' }).click()
    // On the Lookups card the Code BaseField has no `label` prop at all (the
    // caption is a sibling <p>), so there is no accessible name to use — and
    // `exact` is required because getByPlaceholder is otherwise a substring
    // match and the Name field's placeholder contains "Skincare".
    await d.getByPlaceholder('SKINCARE', { exact: true }).fill(LOOKUPS_CODE)
    await d.getByRole('button', { name: 'Add', exact: true }).click()

    await expect
      .poll(() => familyByCode(LOOKUPS_CODE), { timeout: 30_000, message: 'the Lookups page wrote it' })
      .not.toBeNull()
  })

  test('the owner reaches the quick-add too — the isOwner short-circuit still passes', async ({
    browser,
  }) => {
    // The pack asked for this half because the ORIGINAL failure was
    // owner-inclusive: an owner bypass in RLS cannot conjure a mutation that was
    // never built, so the button was dead for owners as well. Now that the write
    // is REST, the owner's `isAllowed` short-circuit is what has to hold.
    const page = await pool.page(browser, PRODUCTS.owner.auth)
    await openRegister(page)
    await page.getByRole('button', { name: 'Add New Item' }).first().click()
    await expect(dialog(page).getByText('Create New Item', { exact: true })).toBeVisible()

    await openSelectByNearbyLabel(page, 'Item Group')
    await expect(
      page.getByRole('button', { name: 'Add New Group' }),
      'the owner is offered the quick-add',
    ).toBeVisible()
  })
})

test.describe('PJ-J9 · the AND-semantics gate, all three call sites', () => {
  test.beforeAll(() => {
    purgeMintedGroups()
    purgeMintedCategories()
    purgeMintedUoms()
  })
  test.afterAll(() => {
    purgeMintedGroups()
    purgeMintedCategories()
    purgeMintedUoms()
  })

  test('a NON-OWNER with company_settings:manage sees all three quick-adds', async ({ browser }) => {
    // The persona is `admin` (E2E QC Author) — a plain member of the tenant who
    // holds company_settings:manage. Before the F-16 fix, `.every()` over
    // ['company_settings:manage', 'owner'] could never be true for them and all
    // three affordances were hidden.
    const page = await pool.page(browser, PRODUCTS.admin.auth)
    expect(PRODUCTS.admin.user.id, 'the persona is NOT the company owner').not.toBe(
      PRODUCTS.owner.user.id,
    )

    await openRegister(page)
    await page.getByRole('button', { name: 'Add New Item' }).first().click()
    await expect(dialog(page).getByText('Create New Item', { exact: true })).toBeVisible()

    for (const [label, button] of [
      ['Item Group', 'Add New Group'],
      ['Item Category', 'Add New Category'],
      ['Unit of Measure', 'Add New Unit'],
    ]) {
      await openSelectByNearbyLabel(page, label)
      await expect(
        page.getByRole('button', { name: button }),
        `${label}: the settings admin is offered the quick-add (ProductFamilySelectMenu / ItemCategorySelectMenu / UomSelectMenu all gate on company_settings:manage alone since F-16)`,
      ).toBeVisible()
      // Opening the next select does NOT close this one — two listboxes would
      // then be in the DOM and the next iteration's locators become ambiguous.
      await closeSelectByNearbyLabel(page, label)
    }

  })

  test('a persona WITHOUT company_settings:manage sees none of them', async ({ browser }) => {
    // THE NEGATIVE CONTROL, and the reason the seed withholds
    // company_settings:manage from this role explicitly. Without it, "all three
    // are visible" is indistinguishable from "the gate was deleted".
    //
    // `editor` holds products:update and NOT products:create, so "Add New Item"
    // is hidden from them — the EDIT dialog is the only route they have to the
    // same three menus, which is why the seed carries a dedicated probe item.
    const page = await pool.page(browser, PRODUCTS.editor.auth)
    await openItemDetail(page, PRODUCTS.items.quickAdd)

    await expect(
      page.getByRole('button', { name: 'Add New Item' }),
      'the premise: this persona cannot create items',
    ).toHaveCount(0)

    await page.getByRole('button', { name: 'Edit', exact: true }).click()
    await expect(dialog(page).getByText('Edit Item', { exact: true })).toBeVisible()

    for (const [label, button] of [
      ['Item Group', 'Add New Group'],
      ['Item Category', 'Add New Category'],
      ['Unit of Measure', 'Add New Unit'],
    ]) {
      await openSelectByNearbyLabel(page, label)
      // The picker itself still works — this persona can CHOOSE a group, just
      // not invent one. Asserted so the absence below is about the gate rather
      // than about a control that failed to open.
      await expect(page.getByRole('listbox')).toHaveCount(1)
      await expect(
        page.getByRole('button', { name: button }),
        `${label}: no quick-add without company_settings:manage`,
      ).toHaveCount(0)
      await closeSelectByNearbyLabel(page, label)
    }

  })

  test('the Lookups page is STRICTER than the dialog — owner-only, and the server disagrees', async ({
    browser,
  }) => {
    // The divergence in the file header, measured. Same capability, three gates:
    //   REST route            company_settings:manage
    //   the three quick-adds  company_settings:manage   (since F-16)
    //   ProductFamiliesCard   isOwner                   ← the odd one out
    const page = await pool.page(browser, PRODUCTS.admin.auth)
    await page.goto('/lookups?tab=product-families')

    await expect(page.getByRole('heading', { name: 'Item Groups' })).toBeVisible({ timeout: 60_000 })
    await expect(
      page.getByText('Only the company owner can edit shared lookup data.'),
      'a settings admin is told they may not — on the page, by the page',
    ).toBeVisible()
    await expect(page.getByRole('button', { name: 'Add Group' })).toHaveCount(0)

    // …while the endpoint that page would have called admits them. This is the
    // assertion that makes the divergence a fact rather than a reading: the
    // refusal above is a UI decision, not an authorization one.
    const res = await restPost(page, '/productFamilies', {
      code: REST_CODE,
      name: 'E2E PJ-J9 REST-created Group',
      description: null,
    })
    // 200, not 201 — measured. `sendSuccess` defaults to 200 and the
    // productFamilies create route does not override it, unlike
    // POST /v1/services/equipment which answers 201. A small API inconsistency,
    // recorded here rather than asserted away: what this test is about is the
    // AUTHORIZATION verdict, so the assertion is "not a 4xx" plus the row.
    expect(
      res.status(),
      `POST /v1/services/productFamilies gates on company_settings:manage alone: ${await errorMessage(res)}`,
    ).toBe(200)
    expect(res.ok(), 'the settings admin was admitted').toBe(true)
    expect(familyByCode(REST_CODE), 'and the row really landed').not.toBeNull()
  })
})
