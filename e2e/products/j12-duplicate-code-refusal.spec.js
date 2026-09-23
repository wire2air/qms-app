// PJ-J12 · URS-ITM-02 — an item CODE cannot be reused while a live item holds it.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY THIS FILE EXISTS AND WHAT IT ADDS
//
// `j1-create-edit-lifecycle.spec.js` already covers the OTHER half of
// URS-ITM-02: once an item exists, its SKU is immutable (the detail page has no
// editable SKU control). That is "you cannot rename INTO a collision". It says
// nothing about "you cannot CREATE into one", which is the half an item master
// actually lives or dies by — a duplicate code means two physical things answer
// to one identifier, and every downstream FK (QC lots, NCs, complaints,
// specifications, retain samples) silently splits between them.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHERE THE REFUSAL ACTUALLY LIVES, MEASURED
//
// `products` has NO REST layer (see fixtures/products.js, fact 1), so there is
// no controller to hold a "is this code taken?" check and no HTTP status to
// read. The entire refusal is one partial unique index, measured on app-db
// 2026-09-23:
//
//   products_company_sku_unique
//     UNIQUE (company_id, sku) WHERE deleted_at IS NULL
//
// Three properties fall straight out of that definition, and all three are
// asserted below because each one is a different promise to a user:
//
//   1. SCOPED TO THE TENANT. `(company_id, sku)`, not `(sku)`. E2EALT may hold
//      the same code as E2ELAB — SaaS tenants do not share a part-number space.
//   2. IGNORES TOMBSTONES. `WHERE deleted_at IS NULL`. Soft-deleting an item
//      RELEASES its code for reuse, which is the whole reason the index is
//      partial rather than total. A test that only asserted "duplicates are
//      refused" would pass just as happily against a TOTAL index — a different
//      product, in which deleting an item burns its part number forever.
//   3. RAISES, it does not filter. A unique violation is SQLSTATE 23505, an
//      ERROR — unlike an RLS refusal, which succeeds against zero rows. So
//      these are `ok === false` with the constraint NAME checked, not a
//      command-tag count. Checking the name rather than just "it failed" is
//      what stops this passing when some unrelated NOT NULL fires instead.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY THE BROWSER LEG IS SEPARATE FROM THE DATABASE LEGS
//
// The UI leg is about what a user is TOLD; the SQL legs are about what the
// database will ALLOW. They are not substitutes. `product_insert_rls` runs
// before the index is consulted, so a probe driven only through `app_user` can
// be refused for a permission reason and read as a duplicate refusal — hence
// the admitting persona (`admin`, products:create) is used throughout and a
// CONTROL insert of a FREE code on the same connection proves the persona is
// not simply being refused everything.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { ALT_COMPANY_ID, COMPANY_ID } from '../fixtures/cast.js'
import { sql, sqlValue } from '../fixtures/db.js'
import {
  PRODUCTS,
  asPersona,
  createPersonaPool,
  dialog,
  findProductBySku,
  openRegister,
  purgeProductBySku,
  selectByNearbyLabel,
} from '../fixtures/products.js'

const pool = createPersonaPool()
test.afterAll(() => pool.close())

// The seeded ACTIVE item whose code every probe below tries to steal. Seeded,
// not minted, so the collision target cannot be destroyed by a failing test.
const TAKEN = PRODUCTS.items.anchor

// Codes this file mints and must clean up. CONSTANT, not timestamped — a
// Playwright worker restart after a failed test re-evaluates module scope, and
// a timestamped code would change mid-file. beforeAll purges instead.
const FREE_SKU = 'E2E-PJ-J12-FREE' // the control: a code nobody holds
const RECYCLE_SKU = 'E2E-PJ-J12-RECYCLE' // deleted, then re-created
const UI_SKU = TAKEN.sku // what the dialog leg types

/** Insert an item with an arbitrary SKU on the superuser connection. */
function insertItem(sku, { companyId = COMPANY_ID, id = null } = {}) {
  return sql(
    `INSERT INTO products (${id ? 'id, ' : ''}company_id, name, sku, product_type_id, status_id,
                           created_by, updated_by, created_at, updated_at)
     VALUES (${id ? `'${id}', ` : ''}'${companyId}', 'E2E PJ-J12 ${sku}', '${sku}', 'COMPONENT',
             'ACTIVE', '${PRODUCTS.admin.user.id}', '${PRODUCTS.admin.user.id}', NOW(), NOW())
     RETURNING id`,
  )
}

test.describe('PJ-J12 · duplicate item codes', () => {
  test.beforeAll(() => {
    for (const sku of [FREE_SKU, RECYCLE_SKU]) purgeProductBySku(sku)
    sql(`DELETE FROM products WHERE company_id = '${ALT_COMPANY_ID}' AND sku = '${TAKEN.sku}'`)
  })
  test.afterAll(() => {
    for (const sku of [FREE_SKU, RECYCLE_SKU]) purgeProductBySku(sku)
    sql(`DELETE FROM products WHERE company_id = '${ALT_COMPANY_ID}' AND sku = '${TAKEN.sku}'`)
  })

  test('the database refuses a second live item with the same code, and admits a free one', () => {
    // Premise. Without this the refusal below could be about a code nobody
    // holds — i.e. about nothing.
    const holder = findProductBySku(TAKEN.sku)
    expect(holder, 'the seeded anchor item holds the code under test').toBeTruthy()
    expect(holder.deletedAt, 'and it is LIVE, so the partial index covers it').toBeNull()

    // ── The refusal, issued as the persona the product would use ───────────
    // `admin` holds products:create, so `product_insert_rls` admits the row and
    // the only thing left to refuse it is the index. Driven through app_user
    // rather than the superuser because that is the ONLY connection the product
    // ever writes this table on (no REST layer; every write is PostGraphile).
    const clash = asPersona(
      PRODUCTS.admin,
      `INSERT INTO products (company_id, name, sku, product_type_id, status_id,
                             created_by, updated_by, created_at, updated_at)
       VALUES ('${COMPANY_ID}', 'E2E PJ-J12 Clash', '${TAKEN.sku}', 'COMPONENT', 'ACTIVE',
               '${PRODUCTS.admin.user.id}', '${PRODUCTS.admin.user.id}', NOW(), NOW());`,
    )
    expect(clash.ok, 'a duplicate code RAISES — it is a constraint, not an RLS filter').toBe(false)
    expect(
      clash.error,
      'and it is the SKU uniqueness index that refused it, not some other constraint',
    ).toMatch(/products_company_sku_unique/)

    // ── The CONTROL, on the same connection, one statement later ───────────
    // Without this, "the insert was refused" is equally consistent with "this
    // persona cannot insert products at all", which would be a permission
    // finding wearing a uniqueness finding's clothes.
    const free = asPersona(
      PRODUCTS.admin,
      `INSERT INTO products (company_id, name, sku, product_type_id, status_id,
                             created_by, updated_by, created_at, updated_at)
       VALUES ('${COMPANY_ID}', 'E2E PJ-J12 Free', '${FREE_SKU}', 'COMPONENT', 'ACTIVE',
               '${PRODUCTS.admin.user.id}', '${PRODUCTS.admin.user.id}', NOW(), NOW());`,
    )
    expect(free.ok, `the same persona inserts a FREE code fine: ${free.error}`).toBe(true)
    expect(findProductBySku(FREE_SKU), 'and the control row really landed').toBeTruthy()

    // Nothing was created by the refused statement.
    expect(
      Number(
        sqlValue(
          `SELECT count(*) FROM products
            WHERE company_id = '${COMPANY_ID}' AND sku = '${TAKEN.sku}' AND deleted_at IS NULL`,
        ),
      ),
      'exactly one live item still holds the code',
    ).toBe(1)
  })

  test('the uniqueness is per TENANT — E2EALT may hold the same code', () => {
    // `(company_id, sku)`, not `(sku)`. Two SaaS tenants do not share a
    // part-number space, and an index that forced them to would make E2ELAB's
    // catalogue leak into E2EALT's namespace as a mysterious refusal.
    const out = insertItem(TAKEN.sku, { companyId: ALT_COMPANY_ID })
    expect(out, 'the other tenant may use a code E2ELAB already holds').toBeTruthy()

    expect(
      Number(
        sqlValue(
          `SELECT count(*) FROM products WHERE sku = '${TAKEN.sku}' AND deleted_at IS NULL`,
        ),
      ),
      'two live rows now share the code — one per tenant',
    ).toBe(2)
  })

  test('soft-deleting an item RELEASES its code — the index is partial by design', () => {
    // The `WHERE deleted_at IS NULL` half. This test is the reason the first
    // test is not the whole story: a TOTAL unique index would pass every
    // assertion above and fail here, and the difference between the two is
    // whether retiring a part number burns it forever.
    const created = insertItem(RECYCLE_SKU)
    expect(created, 'the recyclable item exists').toBeTruthy()

    // While it is live, the code is taken — the premise this test rests on.
    const whileLive = asPersona(
      PRODUCTS.admin,
      `INSERT INTO products (company_id, name, sku, product_type_id, status_id,
                             created_by, updated_by, created_at, updated_at)
       VALUES ('${COMPANY_ID}', 'E2E PJ-J12 Recycle Clash', '${RECYCLE_SKU}', 'COMPONENT',
               'ACTIVE', '${PRODUCTS.admin.user.id}', '${PRODUCTS.admin.user.id}', NOW(), NOW());`,
    )
    expect(whileLive.ok, 'a live holder blocks the code').toBe(false)

    // Tombstone it. Superuser, because the point here is the INDEX's behaviour
    // and `enforce_soft_delete_permission_trg` (which needs products:delete) is
    // a different guard with its own coverage in PJ-J5.
    sql(
      `UPDATE products SET deleted_at = NOW()
        WHERE company_id = '${COMPANY_ID}' AND sku = '${RECYCLE_SKU}' AND deleted_at IS NULL`,
    )
    expect(findProductBySku(RECYCLE_SKU), 'no LIVE row holds the code now').toBeNull()

    const afterDelete = asPersona(
      PRODUCTS.admin,
      `INSERT INTO products (company_id, name, sku, product_type_id, status_id,
                             created_by, updated_by, created_at, updated_at)
       VALUES ('${COMPANY_ID}', 'E2E PJ-J12 Recycled', '${RECYCLE_SKU}', 'COMPONENT', 'ACTIVE',
               '${PRODUCTS.admin.user.id}', '${PRODUCTS.admin.user.id}', NOW(), NOW());`,
    )
    expect(
      afterDelete.ok,
      `a tombstoned code is free to reuse — the index is partial: ${afterDelete.error}`,
    ).toBe(true)

    expect(
      Number(sqlValue(`SELECT count(*) FROM products WHERE sku = '${RECYCLE_SKU}'`)),
      'both rows coexist: one tombstone, one live',
    ).toBe(2)
    expect(
      Number(
        sqlValue(
          `SELECT count(*) FROM products WHERE sku = '${RECYCLE_SKU}' AND deleted_at IS NULL`,
        ),
      ),
      'and exactly one of them is live',
    ).toBe(1)
  })

  test('the create dialog does not put a duplicate-coded item in the master', async ({
    browser,
  }) => {
    // The user-facing leg. What is asserted is the OUTCOME, not a particular
    // error string: `products` has no REST layer and no client-side uniqueness
    // check, so the failure surfaces as a rejected GraphQL mutation and the
    // dialog's own error rendering is not the contract under test — the
    // contract is that no second row appears.
    const page = await pool.page(browser, PRODUCTS.admin.auth)
    await openRegister(page)

    const before = Number(
      sqlValue(
        `SELECT count(*) FROM products
          WHERE company_id = '${COMPANY_ID}' AND sku = '${UI_SKU}' AND deleted_at IS NULL`,
      ),
    )
    expect(before, 'exactly one live item holds the code before the attempt').toBe(1)

    await page.getByRole('button', { name: 'Add New Item' }).first().click()
    const d = dialog(page)
    await expect(d.getByText('Create New Item', { exact: true })).toBeVisible()

    await d.getByRole('textbox', { name: 'Item Name', exact: true }).fill('E2E PJ-J12 UI Clash')
    await d.getByRole('textbox', { name: 'SKU', exact: true }).fill(UI_SKU)
    // Item Type is `required` and BaseSelect auto-fills the first option of a
    // required select; all four product_types share display_order 1000, so
    // "first" is arbitrary. Pick explicitly (same reason as PJ-J1).
    await selectByNearbyLabel(page, 'Item Type', 'Component')

    await page.getByRole('button', { name: 'Create Item', exact: true }).click()

    // The dialog STAYS OPEN — the save threw, so the component never got to
    // close it. That is the observable difference between a refused create and
    // a successful one, and it is what a user actually experiences.
    await expect(
      d.getByText('Create New Item', { exact: true }),
      'the create dialog stays open: the save was refused, not accepted',
    ).toBeVisible({ timeout: 20_000 })

    // The assertion that matters. Polled rather than read once, because a
    // successful GraphQL write would land asynchronously and a single read
    // could beat it.
    await expect
      .poll(
        () =>
          Number(
            sqlValue(
              `SELECT count(*) FROM products
                WHERE company_id = '${COMPANY_ID}' AND sku = '${UI_SKU}' AND deleted_at IS NULL`,
            ),
          ),
        { timeout: 15_000, message: 'no second live item was created with the taken code' },
      )
      .toBe(1)

    // …and the row that IS there is still the original, untouched. Without
    // this, "count is still 1" would also be satisfied by a create that
    // somehow replaced the incumbent.
    expect(
      sqlValue(
        `SELECT name FROM products
          WHERE company_id = '${COMPANY_ID}' AND sku = '${UI_SKU}' AND deleted_at IS NULL`,
      ),
      'the incumbent item is untouched — nothing was overwritten',
    ).toBe(TAKEN.name)
  })
})
