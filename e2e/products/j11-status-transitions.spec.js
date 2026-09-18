// PJ-J11 — status transitions: the guard that was DELIBERATELY not built.
// (docs/modules/products/14-playwright-journeys.md, PW-J11.)
//
// ⚠ THE PACK ASKS THIS JOURNEY TO ASSERT THAT A FREE JUMP IS REFUSED, and to be
// "written to fail today" until an `enforce-products-status-transitions`
// migration lands. That migration was considered and DECLINED, on the record, in
// `20260907250000-products-criticality-check.js`'s header, for four reasons that
// were each verified against the code:
//
//   1. THERE IS NO SANCTIONED PATH TO PROTECT. Every peer guard exists to force
//      traffic onto a gated server-side action — Quality Events' names three
//      controller functions carrying reviewer checks, mandatory fields and a
//      narrower permission. `products` has ZERO REST routes and zero
//      controllers; the dropdown is the only writer of status_id there is. That
//      same QE migration spells out what happens when you guard a state with no
//      server path: the state becomes PERMANENTLY UNREACHABLE. Here that would
//      be true of all four.
//   2. THE VALUE DOMAIN IS ALREADY CLOSED. `status_id` is a FK to
//      `product_statuses` with ON DELETE RESTRICT and four seeded rows — there
//      is no garbage-value hole to plug, which is exactly the hole the
//      `criticality` CHECK in the same migration DOES plug for the column that
//      has no such FK.
//   3. NO NARROWER PERMISSION EXISTS. `authz.module_actions` holds exactly four
//      pairs for this module — create / read / update / delete. There is no
//      `products:obsolete`, so a guard could say "nobody may obsolete an item"
//      but not "only these people may", and nobody asked for the former.
//   4. MASTER DATA HAS NO TERMINAL STATES. OBSOLETE and DISCONTINUED are
//      reversible business facts: a discontinued SKU comes back, a superseded
//      part is reinstated for a service run. Every peer guard's terminal-state
//      clause is backed by a signed, gated closure. Products has neither.
//
// SO THIS FILE ASSERTS THE DECISION, NOT THE ABSENCE OF ONE. "There is no
// guard" and "someone forgot the guard" look identical in a schema dump, and
// identical in a passing test suite that simply never asked. The decision is
// already pinned at the integration layer
// (`tests/integration/products/product-field-constraints.test.js` walks all 12
// edges and asserts `products_status_transition_guard` does not exist); this is
// its browser-side twin, and it adds the two things that layer cannot see: that
// the dropdown really does offer every status to a user, and that the ONE
// conditional rule which DOES exist — P8's live-specification guard on OBSOLETE
// — is not the transition guard being asked about here.
//
// If someone later builds the transition guard, this file fails and they have to
// come and read migration 20260907250000's header before deleting it. That is
// the entire point.
import { test, expect } from '@playwright/test'
import {
  PRODUCTS,
  asPersona,
  createPersonaPool,
  dialog,
  expectRowsAffected,
  findProduct,
  openItemDetail,
  openSelectByNearbyLabel,
  resetSeededItem,
} from '../fixtures/products.js'
import { sqlValue } from '../fixtures/db.js'

const pool = createPersonaPool()
test.afterAll(() => pool.close())

const walker = PRODUCTS.items.statusWalker
const STATUSES = ['ACTIVE', 'UNDER_REVIEW', 'OBSOLETE', 'DISCONTINUED']

test.describe('PJ-J11 · status transitions are deliberately ungoverned', () => {
  test.beforeAll(() => resetSeededItem(walker.id, { status_id: 'ACTIVE' }))
  test.afterAll(() => {
    resetSeededItem(walker.id, { status_id: 'ACTIVE' })
    expect(findProduct(walker.id).statusId).toBe('ACTIVE')
  })

  test('no transition trigger exists on products — and three OTHER triggers do', async () => {
    // Read from the catalog, not from a hand-kept list, so a trigger added
    // tomorrow under any name is caught. The three that SHOULD be there are
    // named individually: an assertion that only counted triggers would pass
    // just as happily against a table that had lost its audit trigger.
    const triggers = sqlValue(
      `SELECT string_agg(tgname, ',' ORDER BY tgname) FROM pg_trigger
        WHERE tgrelid = 'public.products'::regclass AND NOT tgisinternal`,
    )
    expect(triggers, 'the audit trigger is attached').toContain('products_audit_trigger')
    expect(triggers, 'the P5 soft-delete permission guard is attached').toContain(
      'enforce_soft_delete_permission_trg',
    )
    expect(triggers, 'the P8 live-specification guard is attached').toContain(
      'enforce_product_specification_link_trg',
    )
    expect(
      triggers,
      'and there is NO status-transition guard — see migration 20260907250000’s header before adding one',
    ).not.toMatch(/status_transition/i)
  })

  test('every edge between the four statuses is permitted, in both directions', async () => {
    // All 12 ordered pairs, driven through `app_user` — the same role and the
    // same GUCs PostGraphile hands a syncEngine mutation. The pack's headline
    // case, ACTIVE → DISCONTINUED and straight back, is two of them.
    //
    // This item carries NO Specification, deliberately: P8's guard refuses
    // status→OBSOLETE while a live spec references the item, and that rule would
    // otherwise make four of these twelve edges fail for a reason that has
    // nothing to do with transition governance. The distinction is asserted
    // explicitly in the next test.
    for (const from of STATUSES) {
      for (const to of STATUSES) {
        if (from === to) continue
        resetSeededItem(walker.id, { status_id: from })
        const res = asPersona(
          PRODUCTS.admin,
          `UPDATE products SET status_id = '${to}' WHERE id = '${walker.id}';`,
        )
        expectRowsAffected(res, 1, `${from} → ${to} is permitted`)
        expect(findProduct(walker.id).statusId).toBe(to)
      }
    }
  })

  test('the one conditional rule that DOES exist is about specifications, not transitions', async () => {
    // P8 (`enforce_product_specification_link_trg`) refuses status→OBSOLETE
    // while a LIVE Specification points at the item. It is not a transition
    // guard: it does not care where the item is coming FROM, it does not gate
    // any other status, and it has a user-reachable escape hatch (supersede the
    // specification). Asserting the difference is what stops the next reader
    // concluding that a transition guard exists after all.
    const locked = PRODUCTS.items.specLocked
    resetSeededItem(locked.id, { status_id: 'ACTIVE' })

    const refused = asPersona(
      PRODUCTS.admin,
      `UPDATE products SET status_id = 'OBSOLETE' WHERE id = '${locked.id}';`,
    )
    expect(refused.ok, 'OBSOLETE is refused for the spec-linked item').toBe(false)
    expect(refused.error).toMatch(/live specification/i)

    // …from EVERY origin, which is what makes it conditional-on-state rather
    // than conditional-on-edge.
    for (const from of ['UNDER_REVIEW', 'DISCONTINUED']) {
      resetSeededItem(locked.id, { status_id: from })
      const again = asPersona(
        PRODUCTS.admin,
        `UPDATE products SET status_id = 'OBSOLETE' WHERE id = '${locked.id}';`,
      )
      expect(again.ok, `${from} → OBSOLETE refused for the same reason, not because of the edge`).toBe(
        false,
      )
    }

    // …and the SAME edge on an item with no live specification is fine, which is
    // the control that keeps the refusal above from reading as a transition rule.
    resetSeededItem(walker.id, { status_id: 'ACTIVE' })
    expectRowsAffected(
      asPersona(PRODUCTS.admin, `UPDATE products SET status_id = 'OBSOLETE' WHERE id = '${walker.id}';`),
      1,
      'ACTIVE → OBSOLETE is permitted for an item with no live specification',
    )

    resetSeededItem(locked.id, { status_id: 'ACTIVE' })
    resetSeededItem(walker.id, { status_id: 'ACTIVE' })
  })

  test('the dropdown offers all four statuses to an editor, with no lock of any kind', async ({
    browser,
  }) => {
    // The client-side half of the decision. There is no disabled option, no
    // "allowed next statuses" list, and no confirmation step — the status field
    // is an ordinary select, and the browser is where that is visible.
    const page = await pool.page(browser, PRODUCTS.admin.auth)
    await openItemDetail(page, walker)
    await page.getByRole('button', { name: 'Edit', exact: true }).click()
    await expect(dialog(page).getByText('Edit Item', { exact: true })).toBeVisible()

    await openSelectByNearbyLabel(page, 'Status')
    const listbox = page.getByRole('listbox')
    for (const label of ['Active', 'Under Review', 'Obsolete', 'Discontinued']) {
      await expect(
        listbox.getByRole('option', { name: label, exact: true }),
        `${label} is offered with no client-side lock`,
      ).toBeEnabled()
    }

    // Drive the pack's exact scenario through the UI: ACTIVE → DISCONTINUED in
    // one save. It is accepted, which is the decided behaviour.
    await listbox.getByRole('option', { name: 'Discontinued', exact: true }).click()
    await page.getByRole('button', { name: 'Save Changes', exact: true }).click()
    await expect.poll(() => findProduct(walker.id).statusId, { timeout: 30_000 }).toBe('DISCONTINUED')

    // …and straight back again, the other half of the pack's scenario.
    await page.getByRole('button', { name: 'Edit', exact: true }).click()
    await expect(dialog(page).getByText('Edit Item', { exact: true })).toBeVisible()
    await openSelectByNearbyLabel(page, 'Status')
    await page.getByRole('listbox').getByRole('option', { name: 'Active', exact: true }).click()
    await page.getByRole('button', { name: 'Save Changes', exact: true }).click()
    await expect.poll(() => findProduct(walker.id).statusId, { timeout: 30_000 }).toBe('ACTIVE')
  })
})
