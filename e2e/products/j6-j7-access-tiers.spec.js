// PJ-J6 + PJ-J7 — the two access tiers, both written GREEN.
// (docs/modules/products/14-playwright-journeys.md, PW-J6 and PW-J7.)
//
// Both journeys pin a DECISION rather than chase a defect, which is the
// cheapest thing E2E does well: an intentional access-control choice that no
// other layer states out loud, held so that changing it has to be deliberate.
//
// PJ-J6 — THE ADMIN-TIER CLASSIFICATION. permissionGuard.js sorts modules into
// two sets, and `products` is in the stricter one:
//
//   ADMIN_PERMISSIONS      guard the WHOLE subtree — list AND detail — because
//                          there is no row-level RLS exception: if you cannot
//                          read the module, you can see none of its records.
//                          users, roles, groups, sites, departments, suppliers,
//                          PRODUCTS, settings, lookups, analytics, audit-logs…
//   RECORD_LIST_PERMISSIONS guard only the LIST route and defer detail to RLS,
//                          because an assignee / collaborator / shared user
//                          legitimately reaches one record without the module
//                          read. documents, capas, nonconformances, audits…
//
// The whole difference is visible only at `/products/:id`, and only to a user
// who holds nothing. That is the one assertion here that no unit test, no
// integration test and no amount of reading RLS can make — RLS would also
// refuse this user, so a page that rendered "Item not found" would look fine
// while the classification had silently flipped to RECORD tier.
//
// PJ-J7 — THE READ-ONLY PERSONA. products:read and nothing else. The register
// must render IN FULL — every column, every badge — and every write affordance
// must be gone. It also records an ungated affordance that IS still offered
// (Import CSV), and proves the server refuses it anyway; see the test.
import { test, expect } from '@playwright/test'
import { COMPANY_ID } from '../fixtures/cast.js'
import {
  PRODUCTS,
  asPersona,
  createPersonaPool,
  findProduct,
  lastLine,
  openItemDetail,
  openRegister,
  registerRow,
} from '../fixtures/products.js'

const pool = createPersonaPool()
test.afterAll(() => pool.close())

const anchor = PRODUCTS.items.anchor

test.describe('PJ-J6 · the ADMIN-tier subtree guard (green-expected)', () => {
  test('a zero-permission user is refused the register', async ({ browser }) => {
    const page = await pool.page(browser, PRODUCTS.noAccess.auth)
    await page.goto('/products')
    await expect(page).toHaveURL(/\/no-access/, { timeout: 30_000 })
    await expect(page.getByRole('heading', { name: 'Access denied' })).toBeVisible()
  })

  test('…and refused a KNOWN item id too — this is what ADMIN tier means', async ({ browser }) => {
    // The load-bearing half. A RECORD-tier module would let this navigation
    // through and leave the outcome to RLS. Products does not, on purpose, and
    // the id used here is real — a made-up uuid would produce a "not found" page
    // for reasons that say nothing about the guard.
    const page = await pool.page(browser, PRODUCTS.noAccess.auth)
    await page.goto(`/products/${anchor.id}`)
    await expect(page).toHaveURL(/\/no-access/, { timeout: 30_000 })

    // The guard passes the attempted path through so the page can show it —
    // asserting it is how we know THIS navigation is what was refused, rather
    // than some earlier redirect the context was already sitting on.
    await expect(page.getByText(`/products/${anchor.id}`)).toBeVisible()
  })

  test('and the database agrees, so the guard is not the only thing standing there', async () => {
    // A route guard is client-side. If it were the only refusal, a non-browser
    // client would read the whole item master. `product_select_rls` requires
    // `products:read`, and this persona holds no role at all.
    const read = asPersona(
      PRODUCTS.noAccess,
      `SELECT count(*) FROM products WHERE company_id = '${COMPANY_ID}';`,
    )
    expect(
      Number(lastLine(read.output)),
      'a zero-grant member sees NO items — unlike equipment, whose SELECT policy is a bare company match',
    ).toBe(0)
  })
})

test.describe('PJ-J7 · the read-only persona (green-expected)', () => {
  test('the register renders in full', async ({ browser }) => {
    const page = await pool.page(browser, PRODUCTS.reader.auth)
    await openRegister(page)

    // The seeded anchor populates every optional column precisely so "in full"
    // is a real assertion rather than a row of dashes.
    const row = registerRow(page, anchor.name)
    await expect(row).toBeVisible()
    await expect(row.getByText(anchor.sku, { exact: true })).toBeVisible()

    // Every status badge is reachable by this persona — the register is not
    // silently filtered down to ACTIVE items the way the picker is.
    await expect(registerRow(page, PRODUCTS.items.underReview.name)).toBeVisible()
    await expect(registerRow(page, PRODUCTS.items.obsolete.name)).toBeVisible()
    await expect(registerRow(page, PRODUCTS.items.discontinued.name)).toBeVisible()

    // …and the detail page opens, with its read-only fields populated.
    await openItemDetail(page, anchor)
    await expect(page.getByText(anchor.revision, { exact: true }).first()).toBeVisible()
    await expect(page.getByText(anchor.criticality, { exact: true }).first()).toBeVisible()
    await expect(page.getByText('Hazardous', { exact: true })).toBeVisible()
  })

  test('all three write controls are absent — New, Edit and Delete', async ({ browser }) => {
    const page = await pool.page(browser, PRODUCTS.reader.auth)
    await openRegister(page)

    await expect(
      page.getByRole('button', { name: 'Add New Item' }),
      'no create affordance without products:create',
    ).toHaveCount(0)

    // ProductsTable renders the per-row BaseMenu only when canUpdate ||
    // canDelete, so a read-only persona sees no row menu at all — which also
    // means no Edit and no Delete, since both live inside it.
    await expect(
      page.getByRole('button', { name: 'More actions' }),
      'no row action menu without products:update or products:delete',
    ).toHaveCount(0)

    // Selecting rows is still offered (the checkbox column is not gated), but
    // the bulk Delete inside the selection bar is.
    await page.locator('tbody tr input[type="checkbox"]').first().check()
    await expect(
      page.getByRole('button', { name: 'Delete', exact: true }),
      'no bulk delete in the selection bar',
    ).toHaveCount(0)
  })

  test('Import CSV is NOT gated — and the server is what refuses it', async ({ browser }) => {
    // An observation, pinned rather than glossed. `ProductsTable.vue` renders
    // "Import CSV" with no `v-if` at all, while "Add New Item" two components up
    // is gated on `products:create`. So the register offers a read-only persona
    // a bulk-create affordance. It is not an exposure — every row the importer
    // sends is an INSERT judged by `product_insert_rls` — but the two create
    // paths disagree about who may see them, and a user who clicks it gets a
    // toast reading "N products failed to import" with no explanation.
    const page = await pool.page(browser, PRODUCTS.reader.auth)
    await openRegister(page)

    await expect(
      page.getByRole('button', { name: 'Import CSV' }),
      'the second create path carries no permission gate in the UI',
    ).toBeVisible()

    // THE ASSERTION THAT MATTERS. A hidden button proves nothing about the
    // server, and a visible one proves nothing about exposure — only this does.
    // `product_insert_rls` is a WITH CHECK, so a refused INSERT RAISES rather
    // than affecting zero rows; both shapes are accepted here because either is
    // a refusal, and the row count afterwards is the real proof.
    const insert = asPersona(
      PRODUCTS.reader,
      `INSERT INTO products (company_id, name, sku, product_type_id, status_id, created_by, updated_by, created_at, updated_at)
       VALUES ('${COMPANY_ID}', 'PJ-J7 should not land', 'E2E-PJ-J7-DENIED', 'COMPONENT', 'ACTIVE',
               '${PRODUCTS.reader.user.id}', '${PRODUCTS.reader.user.id}', NOW(), NOW());`,
    )
    expect(insert.ok, 'the INSERT was refused by product_insert_rls').toBe(false)
    expect(insert.error).toMatch(/row-level security/i)
  })

  test('the read-only grant is genuinely read-only at the database', async () => {
    // The UI assertions above are all absences, and an absence is also what a
    // broken page looks like. This is the one that cannot be faked.
    const write = asPersona(
      PRODUCTS.reader,
      `UPDATE products SET revision = 'PJ-J7' WHERE id = '${anchor.id}';`,
    )
    // Asserted on the COMMAND TAG: an UPDATE filtered out by RLS raises nothing,
    // it succeeds against zero rows. Reading `ok` alone would score a silent
    // no-op as a passing guard.
    expect(lastLine(write.output), 'product_update_rls matched no rows').toBe('UPDATE 0')
    expect(findProduct(anchor.id).revision, 'the item is untouched').toBe(anchor.revision)
  })
})
