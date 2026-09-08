// Shared fixtures, flows and DB assertions for the Products / Item Master
// journeys (`products` Playwright project, docs/modules/products/14).
//
// Fixtures live in qms/database/e2e-seed.sql §37. The constants below are the
// module's cast; they are declared HERE rather than in cast.js on purpose —
// cast.js is shared by 29 projects and three other agents were editing it in
// the same window. Everything imported from cast.js below is read-only.
//
// FIVE FACTS ABOUT THIS MODULE SHAPE EVERYTHING IN THIS FILE.
//
// 1. THERE IS NO PRODUCTS REST LAYER. `backend/api/routes/` contains
//    productFamilies.js, itemCategories.js and uoms.js — the LOOKUPS — and no
//    products.js. Every write to `products` is a GraphQL mutation issued by the
//    syncEngine, judged only by `product_update_rls` / `product_insert_rls` and
//    by the four triggers on the table. That is why so many assertions here are
//    SQL: there is no HTTP status code to read, and a UI that hides a button
//    cannot tell you whether the server would have refused.
//
// 2. /products IS AN ADMIN-TIER ROUTE. permissionGuard.js maps it to
//    `products:read` in ADMIN_PERMISSIONS, which guards the WHOLE subtree —
//    list AND detail — unlike the RECORD modules (Documents/CAPA/NCR) which
//    guard only the list and defer detail to RLS. A zero-grant user is bounced
//    to /no-access from BOTH /products and /products/:id. PW-J6 pins that.
//
// 3. EVERY READ IS INDEXEDDB. The register is a `useLiveQueryWithDeps` over the
//    syncEngine's Product store fed by the sync socket, so a row written in SQL
//    lands in Postgres instantly and reaches the page only when the broadcast
//    does. Assert hard facts in SQL; let UI assertions retry.
//
// 4. THE PICKER DOES NOT READ `products`. ProductSelectMenu reads the
//    `product_options` VIEW, which is `security_barrier` (NOT
//    `security_invoker`) — so it runs as its owner and BYPASSES
//    `product_select_rls`. Deliberate: pickers must resolve for users without
//    products:read. It means "can this persona see the item in a picker" and
//    "can this persona read the item master" are different questions.
//
// 5. FOUR TRIGGERS GOVERN WRITES, and they are not interchangeable:
//      products_audit_trigger                  → enqueues audit_event (worker)
//      enforce_soft_delete_permission_trg      → deleted_at NULL→NOW needs
//                                                products:delete   (P5)
//      enforce_products_restore_permission_trg → deleted_at NOW→NULL needs
//                                                products:delete   (P7)
//      enforce_product_specification_link_trg  → refuses soft-delete AND
//                                                status→OBSOLETE while a LIVE
//                                                (non-SUPERSEDED, non-deleted)
//                                                specification points at the
//                                                item                (P8)
//    A refusal from one says nothing about the others.
import { expect } from '@playwright/test'
import { AUTH, COMPANY_ID, USERS } from './cast.js'
import { sql, sqlRow, sqlValue, sqlAsAppUser, waitForSqlValue } from './db.js'

const quote = (s) => `'${String(s).replace(/'/g, "''")}'`

/** The last line of psql output — the command tag on a write, the value on a read. */
export const lastLine = (out) => String(out ?? '').trim().split('\n').pop().trim()

/**
 * Item Master cast + fixtures, mirroring e2e-seed.sql §37.
 *
 * The persona split is the module's whole security story and every absence in
 * it is load-bearing — see §37a. Do not widen a persona to make a test pass:
 * `reader` gaining update, or `editor` gaining delete or
 * company_settings:manage, turns four denial probes into vacuous passes at
 * once, and the seed's explicit DELETE statements exist because
 * ON CONFLICT DO NOTHING can never take a stray grant back.
 */
export const PRODUCTS = {
  // products create/read/update/delete + company_settings:manage +
  // inspection_spec:write. The Item Master Administrator.
  admin: { auth: AUTH.qcAuthor, user: USERS.qcAuthor },
  // products read + update. NO create, NO delete, NO company_settings:manage.
  editor: { auth: AUTH.qcInspector, user: USERS.qcInspector },
  // products:read + inspection_spec:read and nothing else.
  reader: { auth: AUTH.auditor, user: USERS.auditor },
  // No role at all. The ADMIN-tier subtree baseline.
  noAccess: { auth: AUTH.noAccess, user: USERS.noAccess },
  // Company owner — the isOwner short-circuit.
  owner: { auth: AUTH.owner, user: USERS.owner },

  // Item Groups (product_families). Two, so a family filter is falsifiable.
  groups: {
    a: { id: 'e2ec2000-0000-4000-8000-000000000001', code: 'E2E_GROUP_A', name: 'E2E Item Group A' },
    b: { id: 'e2ec2000-0000-4000-8000-000000000002', code: 'E2E_GROUP_B', name: 'E2E Item Group B' },
  },
  category: {
    id: 'e2ec3000-0000-4000-8000-000000000001',
    code: 'E2E_CAT_PRIMARY',
    name: 'E2E Item Category',
  },
  uoms: {
    each: { id: 'e2e90000-0000-4000-8000-000000000001', code: 'EA', name: 'Each' },
    kilogram: { id: 'e2ec4000-0000-4000-8000-000000000001', code: 'E2EKG', name: 'E2E Kilogram' },
  },

  // Items. One journey owns each row; see §37c.
  items: {
    anchor: {
      id: 'e2ec1000-0000-4000-8000-000000000001',
      sku: 'E2E-IM-ANCHOR',
      name: 'E2E Item Master Anchor',
      revision: 'A',
      criticality: 'CRITICAL',
    },
    specLocked: {
      id: 'e2ec1000-0000-4000-8000-000000000002',
      sku: 'E2E-IM-SPECLOCK',
      name: 'E2E Item Spec Locked',
    },
    auditSubject: {
      id: 'e2ec1000-0000-4000-8000-000000000003',
      sku: 'E2E-IM-AUDIT',
      name: 'E2E Item Audit Subject',
      revision: 'R0',
      criticality: 'MINOR',
    },
    statusWalker: {
      id: 'e2ec1000-0000-4000-8000-000000000004',
      sku: 'E2E-IM-STATUS',
      name: 'E2E Item Status Walker',
    },
    underReview: {
      id: 'e2ec1000-0000-4000-8000-000000000005',
      sku: 'E2E-IM-REVIEW',
      name: 'E2E Item Under Review',
    },
    obsolete: {
      id: 'e2ec1000-0000-4000-8000-000000000006',
      sku: 'E2E-IM-OBSOLETE',
      name: 'E2E Item Obsolete',
    },
    discontinued: {
      id: 'e2ec1000-0000-4000-8000-000000000007',
      sku: 'E2E-IM-DISC',
      name: 'E2E Item Discontinued',
    },
    quickAdd: {
      id: 'e2ec1000-0000-4000-8000-000000000008',
      sku: 'E2E-IM-QUICKADD',
      name: 'E2E Item Quickadd Probe',
    },
    deleteCycle: {
      id: 'e2ec1000-0000-4000-8000-000000000009',
      sku: 'E2E-IM-DELCYCLE',
      name: 'E2E Item Delete Cycle',
    },
    alt: {
      id: 'e2ec1000-0000-4000-8000-000000000021',
      sku: 'E2EALT-ITEM-1',
      name: 'E2EALT Item',
    },
  },

  // Specifications (the cross-module tab, and the live-spec guard's trigger).
  specs: {
    itemScoped: {
      id: 'e2ec5000-0000-4000-8000-000000000001',
      code: 'E2E-IM-SPEC-ITEM',
      name: 'E2E Anchor Item Spec',
    },
    groupScoped: {
      id: 'e2ec5000-0000-4000-8000-000000000002',
      code: 'E2E-IM-SPEC-GROUP',
      name: 'E2E Group A Spec',
    },
    superseded: {
      id: 'e2ec5000-0000-4000-8000-000000000003',
      code: 'E2E-IM-SPEC-OLD',
      name: 'E2E Anchor Superseded Spec',
    },
    lock: {
      id: 'e2ec5000-0000-4000-8000-000000000004',
      code: 'E2E-IM-SPEC-LOCK',
      name: 'E2E Spec Lock Spec',
    },
  },
}

// ── Browser contexts ────────────────────────────────────────────────────────

/**
 * One browser context per persona, shared by every test in a spec file.
 *
 * Same shape and same reason as `equipment.js` / `inspectionsLogs.js`: a fresh
 * context is a brand new IndexedDB and the register renders nothing until the
 * syncEngine has bootstrapped Product (and ProductFamily, ProductType,
 * ProductStatus, Specification, ProductSupplier…) into it. Opening one per test
 * per persona spends most of the suite waiting for the same rows twice.
 */
export function createPersonaPool() {
  const pool = new Map()
  return {
    async page(browser, storageState) {
      if (!pool.has(storageState)) {
        const ctx = await browser.newContext({ storageState })
        pool.set(storageState, { ctx, page: await ctx.newPage() })
      }
      return pool.get(storageState).page
    },
    async close() {
      for (const { ctx } of pool.values()) await ctx.close().catch(() => {})
      pool.clear()
    },
  }
}

// ── Database ────────────────────────────────────────────────────────────────

/** One item, straight out of Postgres. Empty strings normalised to null. */
export function findProduct(id) {
  const row = sqlRow(
    `SELECT name, sku, description, product_type_id, status_id, product_family_id,
            item_category_id, uom_id, erp_item_code, revision, criticality, default_aql,
            inspection_required, lot_controlled, serial_controlled, shelf_life_days,
            is_hazardous, country_of_origin, storage_conditions, deleted_at
       FROM products WHERE id = ${quote(id)}`,
  )
  if (!row) return null
  const nz = (v) => (v === '' ? null : v)
  return {
    name: row[0],
    sku: row[1],
    description: nz(row[2]),
    productTypeId: row[3],
    statusId: row[4],
    productFamilyId: nz(row[5]),
    itemCategoryId: nz(row[6]),
    uomId: nz(row[7]),
    erpItemCode: nz(row[8]),
    revision: nz(row[9]),
    criticality: nz(row[10]),
    defaultAql: nz(row[11]),
    inspectionRequired: row[12] === 't',
    lotControlled: row[13] === 't',
    serialControlled: row[14] === 't',
    shelfLifeDays: nz(row[15]) === null ? null : Number(row[15]),
    isHazardous: row[16] === 't',
    countryOfOrigin: nz(row[17]),
    storageConditions: nz(row[18]),
    deletedAt: nz(row[19]),
  }
}

/**
 * The LIVE row for a SKU, ignoring tombstones.
 *
 * `products_company_sku_unique` is PARTIAL (`WHERE deleted_at IS NULL`) since
 * migration 20260907240000, so a SKU can legitimately be held by one live row
 * and any number of tombstones. A lookup that ignored `deleted_at` would return
 * whichever the planner reached first.
 */
export function findProductBySku(sku) {
  const id = sqlValue(
    `SELECT id FROM products WHERE sku = ${quote(sku)} AND deleted_at IS NULL LIMIT 1`,
  )
  return id ? { id, ...findProduct(id) } : null
}

/** Live item count for E2ELAB — the number PW-J5 asserts never decreases. */
export function productRowCount({ includeDeleted = true } = {}) {
  return Number(
    sqlValue(
      `SELECT count(*) FROM products WHERE company_id = ${quote(COMPANY_ID)}` +
        (includeDeleted ? '' : ' AND deleted_at IS NULL'),
    ),
  )
}

/**
 * Hard-remove every row a run of this suite minted.
 *
 * DELETE, not restore: these rows never existed as far as the fixture set is
 * concerned, and a tombstone left behind would still occupy `erp_item_code`
 * uniqueness (that index is partial on deleted_at too, so in fact it would not
 * — but a tombstone DOES still show in the register's "Deleted items" drawer,
 * which PW-J5 counts).
 */
export function purgeMintedProducts() {
  sql(`DELETE FROM products_on_suppliers
        WHERE product_id IN (SELECT id FROM products WHERE sku LIKE 'E2E-PJ-%')`)
  sql(`DELETE FROM products WHERE sku LIKE 'E2E-PJ-%'`)
}

/** Purge one minted item by SKU, tombstoned or not. */
export function purgeProductBySku(sku) {
  sql(`DELETE FROM products_on_suppliers
        WHERE product_id IN (SELECT id FROM products WHERE sku = ${quote(sku)})`)
  sql(`DELETE FROM products WHERE sku = ${quote(sku)}`)
}

/** Purge Item Groups a run minted through the quick-add / Lookups page. */
export function purgeMintedGroups() {
  sql(`DELETE FROM product_families WHERE code LIKE 'E2E_PJ_%'`)
}

export function purgeMintedCategories() {
  sql(`DELETE FROM item_categories WHERE code LIKE 'E2E_PJ_%'`)
}

export function purgeMintedUoms() {
  sql(`DELETE FROM uoms WHERE code LIKE 'E2EPJ%'`)
}

/**
 * Restore one seeded item to exactly the state §37c wrote.
 *
 * The seed is ON CONFLICT DO NOTHING and will never put a moved row back, so
 * any journey that mutates a seeded fixture has to reset it itself or the next
 * run inherits the mutation. `updated_at` is bumped deliberately: the register
 * reads out of IndexedDB and the sync service broadcasts on the audit trigger,
 * so a reset that left updated_at alone would be invisible to any open page.
 */
export function resetSeededItem(id, columns) {
  const assignments = Object.entries(columns)
    .map(([col, val]) => `${col} = ${val === null ? 'NULL' : quote(val)}`)
    .join(', ')
  sql(`UPDATE products SET ${assignments}, updated_at = NOW() WHERE id = ${quote(id)}`)
  return findProduct(id)
}

/** Set a specification's status directly (there is no UI shortcut for this). */
export function setSpecStatus(specId, statusId) {
  sql(
    `UPDATE specifications SET status_id = ${quote(statusId)}, updated_at = NOW() WHERE id = ${quote(specId)}`,
  )
  return sqlValue(`SELECT status_id FROM specifications WHERE id = ${quote(specId)}`)
}

/** Thin wrapper so specs read as journeys rather than as SQL. */
export async function waitForProductState(query, opts) {
  return waitForSqlValue(query, opts)
}

/**
 * Run a statement as one of this module's personas through `app_user`.
 *
 * The ONLY way to reach `product_update_rls` and the four triggers from a test:
 * REST/Sequelize connects as the superuser and bypasses both, and there is no
 * products REST route to drive anyway.
 */
export function asPersona(persona, query) {
  return sqlAsAppUser(query, { userId: persona.user.id, companyId: COMPANY_ID })
}

/**
 * Assert an app_user write reached exactly `expected` rows.
 *
 * Written against the COMMAND TAG, never against `ok`. An UPDATE that RLS
 * filtered out raises nothing at all — it succeeds against zero rows — so a
 * test that only checked for an absent error would score a silent no-op as a
 * passing guard, and would be just as green against a table with no policies.
 */
export function expectRowsAffected(result, expected, message) {
  expect(result.ok, `${message}: statement errored — ${result.error}`).toBe(true)
  expect(lastLine(result.output), message).toBe(`UPDATE ${expected}`)
}

// ── REST (the LOOKUPS only — `products` has no REST surface) ────────────────
// `page.request` inherits the page's cookies, so these speak as the persona the
// context was opened for.
export async function restPost(page, path, body) {
  return page.request.post(`/api/v1/services${path}`, { data: body ?? {} })
}
export async function restPatch(page, path, body) {
  return page.request.patch(`/api/v1/services${path}`, { data: body ?? {} })
}
export async function restDelete(page, path) {
  return page.request.delete(`/api/v1/services${path}`)
}

/** The message an API error carried; must be awaited before the context closes. */
export async function errorMessage(res) {
  const body = await res.text()
  try {
    const json = JSON.parse(body)
    return json?.error?.message ?? json?.message ?? json?.error ?? body
  } catch {
    return body
  }
}

// ── UI ──────────────────────────────────────────────────────────────────────

/**
 * Open the Item Master register and wait until it has genuinely hydrated.
 *
 * Anchoring on a SEEDED ROW, never on the page chrome: `BaseListLayout` renders
 * its header, toolbar and empty state before the syncEngine has put a single
 * Product row in IndexedDB, so a test that waited on the "Item Master" heading
 * would assert against an empty table and read an unfinished bootstrap as "no
 * rows matched".
 *
 * WAIT LONG, RELOAD ONCE. A reload restarts the bootstrap from zero, so an
 * impatient retry loop is counter-productive. Same posture as equipment.js.
 */
export async function openRegister(
  page,
  {
    path = '/products',
    anchorName = PRODUCTS.items.anchor.name,
    // THREE attempts, not two. A file here keeps up to four persona contexts
    // open at once (admin, editor, reader, owner) and each is a separate
    // IndexedDB paying its own bootstrap of Product + ProductFamily +
    // ProductType + ProductStatus + ItemCategory + Uom + Specification +
    // ProductSupplier + ProductOption. On a machine also running three other
    // agents' suites, two attempts (105s) was observed to be short.
    budgets = [60_000, 45_000, 45_000],
  } = {},
) {
  const anchor = page.getByText(anchorName, { exact: false }).first()
  for (const budget of budgets) {
    // `.catch()` because a vue-router navigation still settling from the
    // previous test aborts this one with "interrupted by another navigation".
    // That is a reason to retry, not to fail: the anchor wait below is what
    // decides whether we actually arrived.
    await page.goto(path).catch(() => {})
    const ok = await anchor
      .waitFor({ state: 'visible', timeout: budget })
      .then(() => true)
      .catch(() => false)
    if (ok) return
  }
  throw new Error(
    `openRegister: the register never hydrated — "${anchorName}" never appeared at ${path}. ` +
      'The page shell renders before IndexedDB has any Product rows, so this is a sync/bootstrap failure, not a filter miss.',
  )
}

/** Open one item's detail page and wait for its SKU chip to render. */
export async function openItemDetail(page, item, { waitMs = 60_000 } = {}) {
  for (const budget of [waitMs, 45_000, 45_000]) {
    // See openRegister: a navigation left in flight by the previous test aborts
    // this goto, and that is a retry condition rather than a failure.
    await page.goto(`/products/${item.id}`).catch(() => {})
    const ok = await page
      .getByText(item.name, { exact: false })
      .first()
      .waitFor({ state: 'visible', timeout: budget })
      .then(() => true)
      .catch(() => false)
    if (ok) return
  }
  throw new Error(`openItemDetail: /products/${item.id} never rendered "${item.name}"`)
}

/** The register row for one item, located by its NAME cell. */
export function registerRow(page, name) {
  return page.locator('tbody tr').filter({ hasText: name }).first()
}

/**
 * Open a register row's ⋮ menu and return the row.
 *
 * The scroll is NOT tidiness. `BaseMenu`'s own `flip` prop defaults to FALSE and
 * ProductsTable does not pass it, so the panel always opens DOWNWARD: for a row
 * near the bottom of the register the menu items render below the fold and every
 * click retries with "element is outside of the viewport" until it times out.
 * That is a real UI issue rather than a test one — BaseMenu.vue's own docblock
 * says so and names three other Playwright suites carrying this same
 * workaround. Centring the row first is that workaround.
 */
export async function openRowMenu(page, name) {
  const row = registerRow(page, name)
  await expect(row).toBeVisible()
  await row.evaluate((el) => el.scrollIntoView({ block: 'center' }))
  await row.getByRole('button', { name: 'More actions' }).click()
  return row
}

/**
 * Type into the register's table search (a client-side filter, no request).
 *
 * `TableSearch` renders `<input type="search">`, whose implicit ARIA role is
 * SEARCHBOX, not textbox — `getByRole('textbox')` matches nothing at all.
 */
export async function searchRegister(page, term) {
  await page.getByRole('searchbox', { name: 'Search table' }).fill(term)
}

/**
 * The open modal, as a scope for every locator inside it.
 *
 * NOT a convenience. The item detail page renders its Overview tab and the
 * create/update dialog in the SAME document (the dialog lives outside
 * BaseDetailLayout, after it in DOM order), and the overview's field captions
 * are plain <p> elements whose text is "Status", "Revision", "SKU", "Item
 * Group"… — the exact strings the dialog's own labels use. An unscoped
 * `getByText('Status').first()` therefore resolves to the read-only overview
 * caption, and the subsequent "following combobox" hop lands on a control in a
 * different part of the page. Every dialog interaction in this suite is scoped
 * through here.
 */
export function dialog(page) {
  return page.getByRole('dialog')
}

/**
 * Pick a value from a BaseSelect that sits inside a plain-<p> labelled block.
 *
 * Several controls in ProductsCreateUpdateDialog (Item Category, Item Group,
 * Unit of Measure, Suppliers) are NOT wrapped in BaseField's default slot, so
 * they never receive the generated id and `getByLabel` matches nothing. The
 * label text plus the first following combobox is the only stable handle, and
 * it is what a human would use.
 *
 * `scope` defaults to the open dialog for the reason in `dialog()` above.
 */
export async function selectByNearbyLabel(page, labelText, optionName, scope = dialog(page)) {
  await openSelectByNearbyLabel(page, labelText, scope)
  await pickOption(page, optionName)
}

/**
 * Click an option in the open BaseSelect listbox, retrying until it closes.
 *
 * A single `.click()` is not enough here and the failure is not flaky-test
 * noise: BasePopover runs an enter transition AND BaseSelect scrolls the active
 * row into view on open, so for the first frames the option's box is moving
 * (Playwright: "element is not stable") and the row can be re-rendered under the
 * handle ("element was detached from the DOM"). Retrying the click until the
 * listbox goes away is the honest expression of "keep trying to pick it", and it
 * still fails loudly if the option genuinely cannot be chosen.
 */
export async function pickOption(page, optionName, { timeout = 25_000 } = {}) {
  const listbox = page.getByRole('listbox')
  const option = listbox.getByRole('option', { name: optionName, exact: true }).first()
  await option.waitFor({ state: 'visible', timeout: 15_000 })
  await expect
    .poll(
      async () => {
        if (!(await listbox.isVisible().catch(() => false))) return true
        await option.click({ timeout: 3_000 }).catch(() => {})
        return !(await listbox.isVisible().catch(() => false))
      },
      { timeout, message: `could not pick the "${optionName}" option` },
    )
    .toBe(true)
}

/** Open the BaseSelect popover for a nearby-labelled control without choosing. */
export async function openSelectByNearbyLabel(page, labelText, scope = dialog(page)) {
  await scope
    .getByText(labelText, { exact: true })
    .first()
    .locator('xpath=following::*[@role="combobox"][1]')
    .click()
}

/**
 * Close a BaseSelect popover by clicking its trigger again.
 *
 * Opening a SECOND select does NOT close the first — measured: two
 * `role="listbox"` panels stayed in the DOM at once and every page-level
 * `getByRole('listbox')` became a strict-mode violation. The trigger toggles, so
 * closing is the same click; this alias exists so the call site reads as the
 * intention rather than as a mysterious second click.
 */
export const closeSelectByNearbyLabel = openSelectByNearbyLabel

/**
 * The status pill carrying `label`.
 *
 * BaseBadge is a <div> whose only text child is the label, so getByText's
 * smallest-matching-element rule lands on the element that carries
 * ProductStatusBadge's SCHEME_MAP class — which is the point: the colour
 * mapping exists nowhere but that component, so asserting the class IS
 * asserting the mapping. Callers must close the dialog first (the status
 * select's own option text would otherwise match).
 */
export function statusBadge(page, label) {
  return page.getByText(label, { exact: true }).first()
}

/**
 * Every `/v1/services/**` request the page issues, recorded from the moment
 * this is called.
 *
 * PW-J1's central claim is that creating and editing an item issues NO REST
 * call at all, because `products` has no REST route — the write is a GraphQL
 * mutation. A recorder that only watched `/v1/services/products` could never
 * prove that: the interesting failure mode is a request to a path nobody
 * expected. So this records ALL of them and the assertion filters.
 */
export function recordRestCalls(page) {
  const calls = []
  page.on('request', (req) => {
    const url = new URL(req.url())
    if (url.pathname.includes('/v1/services/')) calls.push(`${req.method()} ${url.pathname}`)
  })
  return calls
}

/**
 * Every GraphQL MUTATION the page has sent since this was called.
 *
 * `graphqlClient.js` POSTs `{ query, variables }` to /api/graphql with NO
 * `operationName` field, so the wire body is the only source of truth. Both
 * halves of the operation are recorded — the mutation's declared name
 * (`CreateProduct`, from GraphQLSchemaGenerator) and its root selection field
 * (`createProduct`) — because assertions in this suite are written against both
 * shapes: PJ-J1 wants "a Product mutation happened", PJ-J8 wants "the
 * createProductFamily field was never selected".
 */
export function recordGraphqlMutations(page) {
  const ops = []
  page.on('request', (req) => {
    if (!req.url().includes('/graphql')) return
    let body
    try {
      body = req.postDataJSON()
    } catch {
      return
    }
    for (const entry of Array.isArray(body) ? body : [body]) {
      const q = String(entry?.query ?? '')
      if (!/^\s*mutation\b/.test(q)) continue
      const named = /^\s*mutation\s+([A-Za-z_][A-Za-z0-9_]*)/.exec(q)
      if (named) ops.push(named[1])
      const rootField = /mutation[^{]*\{\s*([A-Za-z_][A-Za-z0-9_]*)/.exec(q)
      if (rootField) ops.push(rootField[1])
    }
  })
  return ops
}
