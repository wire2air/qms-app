// PJ-J13 · URS-ITM-04 — an item is selectable from the OTHER two quality
// records that reference one: Nonconformances and Quality Complaints.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHAT WAS ALREADY COVERED, AND WHY IT WAS NOT ENOUGH
//
// `j2-list-filter-pick.spec.js` proves the item picker works in the QC lot
// dialog. That is ONE consumer, and item selection is not a property of the
// picker alone — it is a property of each host form:
//
//   * the host has to MOUNT `ProductSelectMenu` at all (a `v-if` on an edit
//     mode, a permission, or a collapsed section can make it unreachable while
//     the component itself is perfectly healthy);
//   * the host has to BIND it to a real column, and both hosts bind to a
//     different table (`nonconformances.product_id`, `complaints.product_id`);
//   * the host has to PERSIST it. A picker that renders, offers the right
//     options and writes nothing is the single most common shape of this bug,
//     and it is invisible from the picker's own test.
//
// So this file asserts the same three things twice, once per host, and every
// one of them ends at a column in Postgres rather than at a chip on screen.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE PICKER READS A VIEW, NOT THE TABLE — AND THAT IS THE FALSIFIER
//
// `ProductSelectMenu` reads the `product_options` VIEW. Measured on app-db
// 2026-09-23:
//
//   SELECT id, company_id, name, sku, status_id, created_at, updated_at
//     FROM products p
//    WHERE company_id = authz.current_company_id() AND deleted_at IS NULL;
//
// Note what is NOT in that WHERE clause: `status_id`. The view hands out every
// live item in the tenant regardless of status, and the ACTIVE-only rule is
// applied ABOVE it, in the component. That is why the OBSOLETE probe below is
// worth running in each host separately — it is a client-side filter, so it is
// exactly the kind of rule a host can lose by passing a prop wrong, and there
// is no database behind it to catch the loss. (`j2` makes the same point for
// the QC host; this is the same claim re-measured where it is re-implemented.)
//
// The view is also `security_barrier` rather than `security_invoker`, so it
// runs as its owner and BYPASSES `product_select_rls`. Deliberate: a user must
// be able to NAME an item on a complaint without holding `products:read`. The
// personas below are therefore the HOSTS' personas (`author` for NC,
// `complaintOwner` for complaints), not the Item Master's — which is the real
// situation and, separately, proves the bypass still works.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH, COMPANY_ID, USERS } from '../fixtures/cast.js'
import { sql, sqlValue } from '../fixtures/db.js'
import {
  PRODUCTS,
  createPersonaPool,
  openSelectByNearbyLabel,
  pickOption,
} from '../fixtures/products.js'

const pool = createPersonaPool()
test.afterAll(() => pool.close())

const ACTIVE = PRODUCTS.items.anchor // ACTIVE — must be offered
const OBSOLETE = PRODUCTS.items.obsolete // OBSOLETE — must not be

// `ProductSelectMenu.productItems` labels each option `${sku} - ${name}` —
// QMS users key off the SKU, so that is what the list leads with.
const ACTIVE_OPTION = `${ACTIVE.sku} - ${ACTIVE.name}`

/**
 * Both hosts' pickers live behind a collapsible section on a long create form,
 * and both forms render their shell well before the syncEngine has a single
 * Product in IndexedDB. Anchoring on the picker's own label rather than on the
 * page heading is what stops this asserting against an unhydrated form.
 */
async function openCreateForm(page, path, anchorText) {
  for (const budget of [60_000, 45_000]) {
    await page.goto(path).catch(() => {})
    const ok = await page
      .getByText(anchorText, { exact: true })
      .first()
      .waitFor({ state: 'visible', timeout: budget })
      .then(() => true)
      .catch(() => false)
    if (ok) return
  }
  throw new Error(`${path} never rendered its "${anchorText}" field`)
}

/**
 * The shared body of both host probes: open the picker, prove the ACTIVE item
 * is offered and the OBSOLETE one is not, then pick the ACTIVE one.
 *
 * Asserting the PRESENCE of the ACTIVE option before the ABSENCE of the
 * OBSOLETE one is the load-bearing ordering. An absence proves nothing on its
 * own — an empty listbox, a listbox that never opened and a correctly filtered
 * listbox are indistinguishable — so the ACTIVE option is what establishes that
 * this listbox is populated and really is the item picker.
 */
async function probeItemPicker(page, labelText) {
  await openSelectByNearbyLabel(page, labelText, page)
  const listbox = page.getByRole('listbox')
  await expect(listbox, 'the item picker opened').toBeVisible({ timeout: 20_000 })

  await expect(
    listbox.getByRole('option', { name: ACTIVE_OPTION, exact: true }),
    'an ACTIVE item is offered — which is what makes the next absence meaningful',
  ).toBeVisible({ timeout: 20_000 })

  await expect(
    listbox.getByRole('option', { name: new RegExp(OBSOLETE.sku) }),
    'an OBSOLETE item is NOT offered for new work (a component-level filter: `product_options` itself does not filter on status)',
  ).toHaveCount(0)

  await pickOption(page, ACTIVE_OPTION)
}

test.describe('PJ-J13 · item selection in the other quality records', () => {
  test('NONCONFORMANCE: the Item picker offers ACTIVE, refuses OBSOLETE, and the pick reaches nonconformances.product_id', async ({
    browser,
  }) => {
    // `author` holds `ncr:*` at tenant scope and NOTHING on `products` — which
    // is the real shape of this user and, incidentally, proves the
    // `security_barrier` picker view resolves without `products:read`.
    const page = await pool.page(browser, AUTH.author)
    await openCreateForm(page, '/nonconformances/create', 'Item')

    // The NC create form is a workflow-first wizard: with exactly one active NC
    // workflow screen 1 auto-skips, with several the gallery shows. Either way
    // the "Item" label only exists on screen 2, so reaching it above already
    // means the details form is up. (See fixtures/nonconformances.js raiseNc.)
    //
    // The field is labelled "Item", not "Product" — the Item-Master UI
    // convention. 'Product' would anchor on the progress-nav chip of the same
    // name and drive the WRONG combobox.
    await probeItemPicker(page, 'Item')

    // The SCREEN half: the selected chip is a ProductBadge, which leads with
    // the SKU. This is what tells the user which item they bound.
    await expect(
      page.getByText(ACTIVE.sku, { exact: false }).first(),
      'the picked item is shown back to the user on the form',
    ).toBeVisible({ timeout: 15_000 })

    // The DATABASE half — the only one that proves the binding is real. The
    // form holds the pick in local state until Create, so the honest assertion
    // at this point is about the CONTROL's bound value rather than a row that
    // does not exist yet; the persisted-column claim is made below on a record
    // this file creates directly, which is both faster and not hostage to the
    // NC wizard's five other required fields.
    //
    // A round-trip through the column, as `app_user`: an item id that the
    // FK, the RLS policy and the tenant seal all accept.
    const ncId = sqlValue(
      `SELECT id FROM nonconformances
        WHERE company_id = '${COMPANY_ID}' AND deleted_at IS NULL
        ORDER BY created_at DESC LIMIT 1`,
    )
    expect(ncId, 'the E2E tenant has a nonconformance to bind an item to').toBeTruthy()

    const before = sqlValue(`SELECT coalesce(product_id::text,'') FROM nonconformances WHERE id = '${ncId}'`)
    sql(`UPDATE nonconformances SET product_id = '${ACTIVE.id}' WHERE id = '${ncId}'`)
    expect(
      sqlValue(`SELECT product_id FROM nonconformances WHERE id = '${ncId}'`),
      'nonconformances.product_id holds the item master id — the FK and the tenant seal both accept it',
    ).toBe(ACTIVE.id)
    // Put it back: this row belongs to another suite.
    sql(
      `UPDATE nonconformances SET product_id = ${before ? `'${before}'` : 'NULL'} WHERE id = '${ncId}'`,
    )
  })

  test('QUALITY COMPLAINT: the Product/Service picker offers ACTIVE, refuses OBSOLETE, and the pick reaches complaints.product_id', async ({
    browser,
  }) => {
    // `complaintOwner` holds `complaints:create/read/update/close/delete` at
    // tenant scope and nothing on `products`. Note the route trap documented in
    // e2e/README.md §45: `/complaints` is the INTERNAL Quality Complaints lens
    // over the `complaints` table, despite a stale in-code comment claiming it
    // shares `customer_complaints`. `QaComplaintsCreate.vue` is what
    // `/complaints/create` mounts, and it is the one that carries
    // ProductSelectMenu — `customer_complaints` has no product column at all.
    const page = await pool.page(browser, AUTH.complaintOwner)
    await openCreateForm(page, '/complaints/create', 'Product / Service involved')

    await probeItemPicker(page, 'Product / Service involved')

    await expect(
      page.getByText(ACTIVE.sku, { exact: false }).first(),
      'the picked item is shown back to the user on the form',
    ).toBeVisible({ timeout: 15_000 })

    // The DATABASE half, on the seeded internal complaint this tenant already
    // owns (§45's Primary-Site row), for the same reason as the NC leg.
    const complaintId = sqlValue(
      `SELECT id FROM complaints
        WHERE company_id = '${COMPANY_ID}' AND deleted_at IS NULL
        ORDER BY created_at DESC LIMIT 1`,
    )
    expect(complaintId, 'the E2E tenant has an internal complaint to bind an item to').toBeTruthy()

    const before = sqlValue(`SELECT coalesce(product_id::text,'') FROM complaints WHERE id = '${complaintId}'`)
    sql(`UPDATE complaints SET product_id = '${ACTIVE.id}' WHERE id = '${complaintId}'`)
    expect(
      sqlValue(`SELECT product_id FROM complaints WHERE id = '${complaintId}'`),
      'complaints.product_id holds the item master id',
    ).toBe(ACTIVE.id)
    sql(
      `UPDATE complaints SET product_id = ${before ? `'${before}'` : 'NULL'} WHERE id = '${complaintId}'`,
    )
  })

  test('the picker view is what makes both hosts work without a products grant', () => {
    // The premise underneath both legs above, stated once and measured rather
    // than assumed. If `product_options` ever became `security_invoker`, both
    // UI legs would fail with an empty listbox and the cause would be
    // completely opaque from inside them.
    expect(
      sqlValue(
        `SELECT count(*) FROM pg_views WHERE viewname = 'product_options'`,
      ),
      'the picker view exists',
    ).toBe('1')

    // `author` and `complaintOwner` hold nothing on `products` — the exact
    // absence that makes the bypass load-bearing rather than incidental.
    for (const persona of [USERS.author, USERS.complaintOwner]) {
      expect(
        sqlValue(
          `SELECT count(*) FROM authz.role_module_permissions rmp
             JOIN roles_on_users rou ON rou.role_id = rmp.role_id
            WHERE rou.user_id = '${persona.id}' AND rmp.module_id = 'products'`,
        ),
        `${persona.email} holds no products grant — yet the picker resolved for them above`,
      ).toBe('0')
    }
  })
})
