// PJ-J4 — CSV bulk import: what is actually accepted, pinned.
// (docs/modules/products/14-playwright-journeys.md, PW-J4.)
//
// ⚠ THE PACK'S EXPECTATION HERE IS HALF WRONG, AND THE HALF THAT IS WRONG IS
// THE REASSURING HALF. It predicted "everything the browser parses is accepted,
// because no server-side validation exists on this path". The first clause is
// right and the reason is right — `products` has no REST controller, no Zod
// schema and no service layer, so `ProductsImportCsvDialog` maps CSV cells
// straight onto `db.Product.create()` and fires them at GraphQL with
// `Promise.allSettled`. But "accepted" does not follow, because the DATABASE is
// not nothing:
//
//   products_company_sku_unique   partial unique index → duplicate SKU = 23505
//   products_product_type_id_fkey → an unknown Item Type is rejected
//   name varchar(200) / sku varchar(100) → an over-long field is rejected
//   products_criticality_chk      → unreachable on this path (see below)
//
// So the honest statement is narrower and more useful: THE IMPORT HAS NO
// VALIDATION OF ITS OWN, and the storage layer is the only thing that judges a
// row. Every rejection below comes from a constraint, none from the importer,
// and the importer reports the outcome only as a toast count — there is no
// per-row error report, so a user importing 200 rows is told "3 failed" and not
// which three.
//
// The second correction is about `criticality`, which the pack asked this
// journey to feed a bad value to. It CANNOT: the importer builds its header map
// from ProductsTable's `columns` (NAME, SKU, FAMILY, PRODUCT TYPE, STATUS,
// CREATED), so a `Criticality` column is not mapped at all — the cell is
// silently dropped before any layer could judge it. That is asserted here
// rather than glossed, because "the CHECK constraint held" and "the value never
// reached the database" look identical from the outside, and only one of them
// is true.
import { test, expect } from '@playwright/test'
import { sql, sqlValue } from '../fixtures/db.js'
import {
  PRODUCTS,
  createPersonaPool,
  dialog,
  findProductBySku,
  openRegister,
  purgeMintedProducts,
} from '../fixtures/products.js'

const pool = createPersonaPool()
test.afterAll(() => pool.close())

const GOOD_1 = 'E2E-PJ-J4-OK1'
const GOOD_2 = 'E2E-PJ-J4-OK2'
const BAD_TYPE = 'E2E-PJ-J4-BADTYPE'
const LONG_NAME = 'E2E-PJ-J4-LONGNAME'
const BLANK_FAMILY = 'E2E-PJ-J4-NOFAMILY'
const OVERLONG = 'X'.repeat(250)

/**
 * The mixed file the journey imports. Header labels must match ProductsTable's
 * `columns` — that array IS the importer's schema (`headerMap`).
 *
 * EVERY ROW CARRIES A FAMILY except the one that is about the blank-family
 * defect. That is not decoration: a blank FAMILY cell is refused on its own
 * (finding below), so a row left blank "to keep the file simple" would be
 * rejected for THAT reason and the assertion about its intended defect — bad
 * type, over-long name, duplicate SKU — would pass while proving nothing.
 */
function mixedCsv() {
  const FAMILY = PRODUCTS.groups.a.name
  return [
    'NAME,SKU,FAMILY,PRODUCT TYPE,STATUS,CRITICALITY',
    // 1 — valid, with FAMILY resolved by NAME (the importer's one and only
    //     transformation: familyByName, lower-cased).
    `E2E PJ-J4 Valid One,${GOOD_1},${FAMILY},COMPONENT,ACTIVE,CRITICAL`,
    // 2 — valid, and a CRITICALITY cell that is never mapped at all.
    `E2E PJ-J4 Valid Two,${GOOD_2},${FAMILY},RAW_MATERIAL,ACTIVE,NOT-A-REAL-VALUE`,
    // 3 — an unknown Item Type. products_product_type_id_fkey must refuse it.
    `E2E PJ-J4 Bad Type,${BAD_TYPE},${FAMILY},NOT_A_TYPE,ACTIVE,MINOR`,
    // 4 — a 250-character name against varchar(200).
    `${OVERLONG},${LONG_NAME},${FAMILY},COMPONENT,ACTIVE,MINOR`,
    // 5 — a duplicate of a SKU that already exists in the tenant.
    `E2E PJ-J4 Duplicate,${PRODUCTS.items.anchor.sku},${FAMILY},COMPONENT,ACTIVE,MINOR`,
    // 6 — THE BLANK-FAMILY ROW. Perfectly valid data; see the finding below.
    `E2E PJ-J4 No Family,${BLANK_FAMILY},,COMPONENT,ACTIVE,MINOR`,
  ].join('\n')
}

test.describe('PJ-J4 · CSV bulk import', () => {
  test.beforeAll(() => purgeMintedProducts())
  test.afterAll(() => purgeMintedProducts())

  test('a mixed file: the importer judges nothing, the database judges everything', async ({
    browser,
  }) => {
    const page = await pool.page(browser, PRODUCTS.admin.auth)
    await openRegister(page)

    const anchorBefore = findProductBySku(PRODUCTS.items.anchor.sku)

    await page.getByRole('button', { name: 'Import CSV' }).click()
    const d = dialog(page)
    await expect(d.getByText('Import Products from CSV', { exact: true })).toBeVisible()

    // The picker is a hidden <input type="file"> behind a click-through drop
    // zone; setInputFiles reaches it directly, which is what a drag-and-drop
    // would amount to anyway.
    await d.locator('input[type="file"]').setInputFiles({
      name: 'pj-j4-mixed.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(mixedCsv(), 'utf8'),
    })

    // SIX rows are PARSED. The parser is a hand-rolled splitter with no schema:
    // every non-empty line after the header becomes a row, whatever is in it.
    await expect(
      d.getByText(/6\s+rows detected/),
      'the parser accepts every non-empty line — it has no schema of its own',
    ).toBeVisible()

    await page.getByRole('button', { name: /^Import 6 Products$/ }).click()

    // THE TOASTS ARE ASSERTED FIRST, and that ordering is deliberate. They are
    // the only feedback this path gives a user — there is no per-row error
    // report — and they auto-dismiss. Every assertion below is a `docker exec
    // psql` round trip; a dozen of them is several seconds, which is long enough
    // for the toast to be gone by the time anyone looks.
    await expect(page.getByText(/products imported successfully/)).toBeVisible({ timeout: 60_000 })

    // 🔴 THE FALSE-SUCCESS FINDING, measured 2026-09-08.
    //
    // The toast says SIX. Exactly TWO rows reach Postgres (asserted below). The
    // count is not a display bug — it is the only feedback this path gives, and
    // it is wrong in the direction that loses data silently.
    //
    // `handleImport` counts settled promises:
    //
    //     const results = await Promise.allSettled(resolvedRows.map(createProduct))
    //
    // but `createProduct` ends at `await p.save()`, a SyncEngine write. That
    // resolves as soon as the row is staged locally; the server round trip is
    // asynchronous and its rejection never reaches this promise. So all six
    // FULFIL, `rejected` is 0, and the "N products failed to import" toast this
    // dialog can emit is UNREACHABLE on every database-level refusal — which is
    // every refusal there is, since the importer itself validates nothing.
    //
    // Consequence: an operator bulk-loading an item master is told every row
    // landed while the FK, the length limit, the SKU uniqueness index and the
    // blank-FAMILY bug below drop rows one by one, with no per-row report and
    // no error toast. On the export-then-reimport round trip described further
    // down, that is silent, unbounded data loss.
    //
    // Pinned as observed. If the counting is fixed to await the server, this
    // assertion flips to /^2 products imported successfully$/ and the
    // `failed to import` expectation below becomes reachable.
    await expect(
      page.getByText(/products imported successfully/),
      'the toast counts staged SyncEngine writes, not rows the database accepted',
    ).toHaveText(/^6 products imported successfully$/)

    await expect(
      page.getByText(/products failed to import/),
      'no failure toast is emitted at all — four rows are refused and none is reported',
    ).toHaveCount(0)

    // ── What landed ──────────────────────────────────────────────────────────
    await expect
      .poll(() => sqlValue(`SELECT count(*) FROM products WHERE sku LIKE 'E2E-PJ-J4-%'`), {
        timeout: 30_000,
        message: 'the two valid rows landed and nothing else did',
      })
      .toBe('2')

    const ok1 = findProductBySku(GOOD_1)
    expect(ok1, 'the fully-valid row is in Postgres').not.toBeNull()
    expect(ok1.productTypeId).toBe('COMPONENT')
    expect(
      ok1.productFamilyId,
      'FAMILY is matched by NAME — the importer’s only transformation',
    ).toBe(PRODUCTS.groups.a.id)
    expect(ok1.statusId).toBe('ACTIVE')

    // THE CRITICALITY CORRECTION. The column is not in ProductsTable's `columns`
    // list, so headerMap never maps it and the cell is dropped in the browser.
    // The row is accepted with criticality NULL — products_criticality_chk was
    // never consulted, and a test that only asserted "the bad value is not
    // stored" would have credited a guard that did not run.
    expect(
      ok1.criticality,
      'CRITICALITY is not an importable column — the cell never reaches the database at all',
    ).toBeNull()
    expect(findProductBySku(GOOD_2).criticality).toBeNull()

    // Attribution. `created_by`/`updated_by` are NOT NULL with an FK to users and
    // NOTHING in the database fills them — the CLIENT model's constructor does
    // (qms-app/models/product.js:18-22), from the session. So a bulk import
    // carries the importer's identity into every row, and that is the only
    // attribution the item master gets on this path.
    for (const sku of [GOOD_1, GOOD_2]) {
      const [createdBy, updatedBy] = sql(
        `SELECT created_by, updated_by FROM products WHERE sku = '${sku}' AND deleted_at IS NULL`,
      ).split('|')
      expect(createdBy, `${sku} is attributed to the importer`).toBe(PRODUCTS.admin.user.id)
      expect(updatedBy).toBe(PRODUCTS.admin.user.id)
    }

    // ── What did not ─────────────────────────────────────────────────────────
    expect(findProductBySku(BAD_TYPE), 'unknown Item Type refused by the FK').toBeNull()
    expect(findProductBySku(LONG_NAME), 'a 250-char name refused by varchar(200)').toBeNull()

    // 🔴 THE BLANK-FAMILY FINDING, measured rather than predicted.
    //
    // Row 6 is ordinary, correct data — an item with no Item Group — and it is
    // REFUSED. `handleImport` only rewrites the cell when it is truthy:
    //
    //     if (r.productFamilyId) { r.productFamilyId = familyByName.get(…) ?? null }
    //
    // so a blank cell stays the EMPTY STRING and is sent as `productFamilyId: ''`
    // to a `uuid` column, which Postgres rejects (22P02, invalid input syntax).
    // An unknown family NAME is handled correctly (?? null); only the blank one
    // is not.
    //
    // It matters more than a normal nit because of where the file comes from:
    // this same register exports CSV with a FAMILY column
    // (`exportFilename="products.csv"`), and most items have no group — so
    // export-then-reimport, the obvious way to bulk-edit an item master, fails on
    // every ungrouped row with a toast that says only "N products failed to
    // import". Pinned here; if it is fixed, this assertion flips and whoever
    // fixed it comes and says so.
    expect(
      findProductBySku(BLANK_FAMILY),
      'a blank FAMILY cell is sent as an empty string to a uuid column and refused',
    ).toBeNull()

    // The duplicate must not have touched the row it collided with, and must not
    // have created a second live row under that SKU.
    expect(
      sqlValue(
        `SELECT count(*) FROM products WHERE sku = '${PRODUCTS.items.anchor.sku}' AND deleted_at IS NULL`,
      ),
      'the partial unique index held — one live row per SKU',
    ).toBe('1')
    expect(findProductBySku(PRODUCTS.items.anchor.sku).name, 'the existing item is untouched').toBe(
      anchorBefore.name,
    )

  })
})
