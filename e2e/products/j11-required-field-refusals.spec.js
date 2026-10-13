// PW-J11 · Products required-field refusal — UI only, for the same structural
// reason as Documents but arrived at from the opposite direction.
//
// THERE IS NO PRODUCTS REST LAYER. This file's sibling fixture says it outright
// (`e2e/fixtures/products.js`): every write to `products` is a GraphQL mutation
// issued by the syncEngine, judged only by `product_insert_rls` /
// `product_update_rls` and the table's four triggers — "there is no HTTP status
// code to read". `routes/` carries productFamilies, itemCategories and uoms (the
// lookups); there is no products.js, and no zod schema for products either.
//
// Required-ness therefore lives in two places, neither of them a REST 400:
//   · the client — Item Name, SKU, Item Type and Status all carry
//     `:rules="[required()]"` in ProductsCreateUpdateDialog.vue
//   · Postgres — `name`, `sku`, `product_type_id` are NOT NULL on the table
//
// This file asserts the first. The second is reachable only through
// `asPersona()` (raw SQL as `app_user`, the one path in this suite that reaches
// the RLS policies and triggers), which is a materially different helper from
// the REST one `negativeArms.js` provides — a DB-constraint arm is deliberately
// left for later rather than bolted on here.
//
// OQ-14 TC-14-01 steps 2-3 ("save refused without name / without code") are
// therefore covered at the client layer only. Record that in the execution
// summary; do not report it as server-enforced.
import { test, expect } from '@playwright/test'
import { AUTH, COMPANY_ID } from '../fixtures/cast.js'
import { sqlValue } from '../fixtures/db.js'
import { expectEmptyFormRefused } from '../fixtures/negativeArms.js'

/**
 * Scoped to the tenant on purpose. This count is the evidence that a refused
 * create wrote NOTHING, so it is compared before and after the refusal — and an
 * unscoped `count(*)` makes any concurrent insert anywhere in the database
 * (a graphile_worker job, another tenant's fixture, a leaked row from an
 * earlier spec) look like the refused create having written a row. That is a
 * SECURITY-SHAPED false positive: it reports "a rejected request created a
 * record", which is the most alarming thing this suite can say.
 */
function productCount() {
  return Number(
    sqlValue(`SELECT count(*) FROM products WHERE company_id = '${COMPANY_ID}'`),
  )
}

test.describe('PW-J11 · Products required-field refusal', () => {
  // qcAuthor, not author. `canCreateProduct` is `isAllowed(['products:create'])`
  // and only the "E2E QC Author" role (…032) holds it — the seed says so in as
  // many words: "PW-J1/PW-J7 — no 'Add New Item' button without
  // products:create". With `author` the button never renders and this arm fails
  // looking for a control that was correctly absent.
  test.use({ storageState: AUTH.qcAuthor })

  test('UI: submitting the empty create dialog tells the user what is missing', async ({
    page,
  }) => {
    test.setTimeout(120_000)

    await expectEmptyFormRefused(page, {
      // Not a route — the create form is a dialog on the register, so
      // `createPath` is the page we land on and `reach` opens the form.
      createPath: '/products',
      submitLabel: 'Create Item',
      countRows: productCount,
      async reach(p) {
        // `.first()` is load-bearing: ProductsHome renders "Add New Item" TWICE
        // when the register is empty — once as the header action (line 131) and
        // once as the empty-state CTA (line 139) — and strict mode fails on the
        // pair. An empty register is the normal state for this arm, since it
        // writes nothing and other product specs purge what they mint.
        const open = p.getByRole('button', { name: /add new item/i }).first()
        await expect(open, 'the register must offer the create dialog').toBeVisible({
          timeout: 45_000,
        })
        await open.click()
        // Deliberately NOT asserting getByRole('dialog') here — see the audits
        // arm for why it resolves hidden. expectEmptyFormRefused waits for the
        // submit control itself, which is inside the panel and therefore the
        // honest signal that the form is up.
      },
    })
  })
})
