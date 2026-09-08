// PJ-J5 — the delete boundary: the referential guard, the permission guard,
// the restore guard, and the paranoid invariant.
// (docs/modules/products/14-playwright-journeys.md, PW-J5.)
//
// WHY THIS FILE IS THE MOST VALUABLE ONE IN THE PROJECT. `products` has no REST
// layer, so "delete an item" is a syncEngine paranoid UPDATE
// (`BaseModel.delete()` sets deleted_at and issues an UPDATE — `product_delete`
// is never evaluated because there is no DELETE policy and no DELETE grant).
// Until 2026-09-07/08 that UPDATE met exactly one policy, `product_update_rls`,
// which asks for `products:update`. Three separate rules now stand in front of
// it and NONE of them existed six weeks ago:
//
//   P5  20260907260000  enforce_soft_delete_permission_trg
//       deleted_at NULL→NOW needs `products:delete`. Before it, ANY
//       `products:update` holder could tombstone the entire item master.
//   P7  20260910110000  enforce_products_restore_permission_trg
//       deleted_at NOW→NULL needs `products:delete` too. Before it the WEAKER
//       grant could undo a delete-holder's decision — a privilege split that
//       the privilege it was split away from could reverse.
//   P8  20260910120000  enforce_product_specification_link_trg
//       refuses soft-delete AND status→OBSOLETE while a LIVE (non-SUPERSEDED,
//       non-deleted) Specification points at the item. Before it, this rule
//       lived in `ProductsHome.vue:66` — a Vue component, in front of a
//       syncEngine mutation, on a module whose only enforcement layer is the
//       database.
//
// Every one is probed from BOTH sides. A guard that quietly stopped matching
// anything refuses everyone and reads as perfect against the denial half alone.
//
// ── A DIVERGENCE THIS FILE PINS RATHER THAN HIDES ──────────────────────────
// The pack's PW-J5 says: block on a non-superseded spec, SUPERSEDE it, delete
// now succeeds. That is exactly right at the DATABASE — P8's rule is
// `status_id <> 'SUPERSEDED'`, and its HINT says so. It is NOT right in the UI:
// `ProductsHome.vue`'s `productIdsWithSpecs` counts every live Specification
// carrying a productId and never looks at status, so superseding does not
// unblock the button even though the component's own toast says "Delete or
// supersede them first." The database is the more permissive of the two, which
// is the safe direction — but the two layers do disagree, and both halves are
// asserted below.
import { test, expect } from '@playwright/test'
import { COMPANY_ID } from '../fixtures/cast.js'
import { sqlValue } from '../fixtures/db.js'
import {
  PRODUCTS,
  asPersona,
  createPersonaPool,
  expectRowsAffected,
  findProduct,
  lastLine,
  openRegister,
  openRowMenu,
  productRowCount,
  registerRow,
  setSpecStatus,
} from '../fixtures/products.js'

const pool = createPersonaPool()
test.afterAll(() => pool.close())

const specLocked = PRODUCTS.items.specLocked
const delCycle = PRODUCTS.items.deleteCycle

// The paranoid invariant, captured before anything in this file runs. `products`
// is `static paranoid = true`, so no journey may ever reduce the physical row
// count — a delete that actually removed a row would take every FK reference to
// it (QC lots, sampling plans, complaints, NCs, retain samples) with it.
let rowsAtStart = 0

test.describe('PJ-J5 · delete, restore and the referential guard', () => {
  test.beforeAll(() => {
    rowsAtStart = productRowCount()
    // Put the fixtures back where §37 left them, in case a previous run failed
    // between a mutation and its reset. The seed is ON CONFLICT DO NOTHING and
    // will never do this itself.
    setSpecStatus(PRODUCTS.specs.lock.id, 'EFFECTIVE')
    asPersona(PRODUCTS.admin, `UPDATE products SET deleted_at = NULL WHERE id = '${delCycle.id}';`)
    asPersona(PRODUCTS.admin, `UPDATE products SET deleted_at = NULL WHERE id = '${specLocked.id}';`)
  })

  test.afterAll(() => {
    setSpecStatus(PRODUCTS.specs.lock.id, 'EFFECTIVE')
    asPersona(PRODUCTS.admin, `UPDATE products SET deleted_at = NULL WHERE id = '${delCycle.id}';`)
    asPersona(PRODUCTS.admin, `UPDATE products SET deleted_at = NULL WHERE id = '${specLocked.id}';`)
    expect(findProduct(specLocked.id).deletedAt, 'the seeded probe row survives').toBeNull()
    expect(findProduct(delCycle.id).deletedAt).toBeNull()
  })

  test('the register refuses to delete an item with a linked specification', async ({ browser }) => {
    const page = await pool.page(browser, PRODUCTS.admin.auth)
    await openRegister(page)

    await openRowMenu(page, specLocked.name)
    await page.getByRole('menuitem', { name: 'Delete' }).click()

    // A toast, not a confirm dialog: `onDeleteProduct` returns before the
    // confirm when the item is blocked.
    await expect(
      page.getByText(/has linked specification\(s\)\. Delete or supersede them first\./),
      'the component refuses before it asks',
    ).toBeVisible({ timeout: 15_000 })

    expect(findProduct(specLocked.id).deletedAt, 'nothing was written').toBeNull()
  })

  test('and so does the database, on the path the component is not in front of', async () => {
    // The assertion that matters. The UI check above is a Vue component; any
    // raw GraphQL client — or any future code path that does not route through
    // ProductsHome — walks straight past it. `sqlAsAppUser` reproduces exactly
    // what PostGraphile issues: SET ROLE app_user with the session GUCs.
    const denied = asPersona(
      PRODUCTS.admin,
      `UPDATE products SET deleted_at = NOW() WHERE id = '${specLocked.id}';`,
    )
    expect(denied.ok, 'the guard RAISED rather than silently no-opping').toBe(false)
    expect(denied.error).toMatch(/cannot be deleted while a live specification still references it/i)

    // The same guard covers the OBSOLETE transition — the half that was
    // reported missing (P-N2). Note the deliberately NARROW rule: DISCONTINUED
    // is allowed, because a discontinued part is still in the field and its
    // specification SHOULD stay effective.
    const obsolete = asPersona(
      PRODUCTS.admin,
      `UPDATE products SET status_id = 'OBSOLETE' WHERE id = '${specLocked.id}';`,
    )
    expect(obsolete.ok, 'retiring the item is refused for the same reason').toBe(false)
    expect(obsolete.error).toMatch(/cannot be marked OBSOLETE while a live specification/i)

    const discontinued = asPersona(
      PRODUCTS.admin,
      `UPDATE products SET status_id = 'DISCONTINUED' WHERE id = '${specLocked.id}';`,
    )
    expectRowsAffected(
      discontinued,
      1,
      'DISCONTINUED is deliberately NOT covered — the rule is about withdrawal, not supply',
    )
    asPersona(PRODUCTS.admin, `UPDATE products SET status_id = 'ACTIVE' WHERE id = '${specLocked.id}';`)
    expect(findProduct(specLocked.id).statusId).toBe('ACTIVE')
  })

  test('superseding the specification unblocks the database — but not the button', async ({
    browser,
  }) => {
    // THE DIVERGENCE, both halves. P8's rule is `status_id <> 'SUPERSEDED'`;
    // ProductsHome's `productIdsWithSpecs` never looks at status.
    setSpecStatus(PRODUCTS.specs.lock.id, 'SUPERSEDED')

    const page = await pool.page(browser, PRODUCTS.admin.auth)
    await openRegister(page)
    // Give the sync broadcast a chance to land the spec's new status in
    // IndexedDB before asserting that the UI still blocks — otherwise a pass
    // could simply mean the page had not noticed yet.
    await expect
      .poll(() => sqlValue(`SELECT status_id FROM specifications WHERE id = '${PRODUCTS.specs.lock.id}'`))
      .toBe('SUPERSEDED')
    await page.reload()
    await expect(registerRow(page, specLocked.name)).toBeVisible({ timeout: 60_000 })

    await openRowMenu(page, specLocked.name)
    await page.getByRole('menuitem', { name: 'Delete' }).click()
    await expect(
      page.getByText(/has linked specification\(s\)\. Delete or supersede them first\./),
      'the component still refuses — its guard counts live specs, not EFFECTIVE ones, ' +
        'even though its own toast tells the user superseding is the fix',
    ).toBeVisible({ timeout: 15_000 })

    // The database, on the same row, at the same moment, says yes.
    const allowed = asPersona(
      PRODUCTS.admin,
      `UPDATE products SET deleted_at = NOW() WHERE id = '${specLocked.id}';`,
    )
    expectRowsAffected(allowed, 1, 'a SUPERSEDED specification does not block the delete')
    expect(findProduct(specLocked.id).deletedAt).not.toBeNull()

    // Put it back, then re-effect the spec.
    expectRowsAffected(
      asPersona(PRODUCTS.admin, `UPDATE products SET deleted_at = NULL WHERE id = '${specLocked.id}';`),
      1,
      'restored',
    )
    setSpecStatus(PRODUCTS.specs.lock.id, 'EFFECTIVE')
  })

  test('an update-holder can neither delete nor restore (P5 + P7), and both sides are shown', async () => {
    // `editor` holds products:read + products:update and NOT products:delete.
    // Before P5, this persona could tombstone the whole register.
    const denied = asPersona(
      PRODUCTS.editor,
      `UPDATE products SET deleted_at = NOW() WHERE id = '${delCycle.id}';`,
    )
    expect(denied.ok, 'the soft-delete guard RAISED').toBe(false)
    expect(denied.error).toMatch(/Deleting this record requires one of: products:delete/i)

    // CONTROL — the same persona, the same row, an ordinary edit. Without this
    // the refusal above is equally consistent with "this session is broken" or
    // "the table is locked for everyone".
    expectRowsAffected(
      asPersona(
        PRODUCTS.editor,
        `UPDATE products SET description = 'PJ-J5 editor control' WHERE id = '${delCycle.id}';`,
      ),
      1,
      'update is untouched — only the tombstone transition is guarded',
    )

    // Now the RESTORE half. Arrange a tombstone through the persona that is
    // allowed to make one.
    expectRowsAffected(
      asPersona(PRODUCTS.admin, `UPDATE products SET deleted_at = NOW() WHERE id = '${delCycle.id}';`),
      1,
      'a delete-holder may tombstone',
    )

    const restoreDenied = asPersona(
      PRODUCTS.editor,
      `UPDATE products SET deleted_at = NULL WHERE id = '${delCycle.id}';`,
    )
    expect(restoreDenied.ok, 'the restore guard RAISED (P7)').toBe(false)
    expect(restoreDenied.error).toMatch(/Restoring this record requires one of: products:delete/i)

    expectRowsAffected(
      asPersona(PRODUCTS.admin, `UPDATE products SET deleted_at = NULL WHERE id = '${delCycle.id}';`),
      1,
      'and a delete-holder may restore — the positive half of P7',
    )
  })

  test('a reader cannot write at all, and the refusal is a rowCount not an error', async () => {
    // `reader` holds products:read and nothing else. This one is asserted on the
    // COMMAND TAG rather than on `ok`: an UPDATE that RLS filtered out raises
    // nothing — it succeeds against zero rows — so a test written the other way
    // would be just as green against a table with no policies at all.
    const write = asPersona(
      PRODUCTS.reader,
      `UPDATE products SET name = 'PJ-J5 should not land' WHERE id = '${delCycle.id}';`,
    )
    expect(lastLine(write.output), 'product_update_rls matched no rows for a read-only grant').toBe(
      'UPDATE 0',
    )
    expect(findProduct(delCycle.id).name).toBe(delCycle.name)

    // …and the same persona CAN read, so the zero above is about the write.
    const read = asPersona(
      PRODUCTS.reader,
      `SELECT count(*) FROM products WHERE company_id = '${COMPANY_ID}' AND deleted_at IS NULL;`,
    )
    expect(Number(lastLine(read.output)), 'the reader really does see the register').toBeGreaterThan(
      8,
    )
  })

  test('delete then restore through the register, and the row count never drops', async ({
    browser,
  }) => {
    const page = await pool.page(browser, PRODUCTS.admin.auth)
    await openRegister(page)

    await openRowMenu(page, delCycle.name)
    await page.getByRole('menuitem', { name: 'Delete' }).click()

    // This item has no linked specification, so the component asks rather than
    // refusing — the confirm dialog is the difference between the two paths.
    await page.getByRole('button', { name: 'Delete', exact: true }).last().click()

    await expect
      .poll(() => sqlValue(`SELECT deleted_at IS NOT NULL FROM products WHERE id = '${delCycle.id}'`), {
        timeout: 30_000,
        message: 'the tombstone landed',
      })
      .toBe('t')

    // It leaves the register and appears in the Deleted-items drawer.
    await expect(registerRow(page, delCycle.name)).toHaveCount(0, { timeout: 30_000 })
    await page.getByRole('button', { name: /Deleted items \(\d+\)/ }).click()
    await page.getByRole('button', { name: 'Restore' }).first().click()

    await expect
      .poll(() => sqlValue(`SELECT deleted_at IS NULL FROM products WHERE id = '${delCycle.id}'`), {
        timeout: 30_000,
        message: 'restore put it back',
      })
      .toBe('t')
    await expect(registerRow(page, delCycle.name)).toBeVisible({ timeout: 30_000 })

    // THE PARANOID INVARIANT. Everything above was an UPDATE; not one physical
    // row left the table.
    expect(
      productRowCount(),
      'products is paranoid — count(*) never decreases across a delete/restore cycle',
    ).toBeGreaterThanOrEqual(rowsAtStart)
  })
})
