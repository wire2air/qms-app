// Shared flows + DB assertions for the dedicated `assetRequest` Playwright
// project — the UI-driven complement to e2e/suppliers/j12 (SUP-J12, the F-01
// read-exposure regression lock) and j13 (SUP-J13, F-03/F-08 accept +
// lifecycle). Those two probe HTTP/SQL directly; this project drives the
// actual Vue surfaces: SuppliersAssetRequestsTab (internal, at
// /suppliers/:id?tab=asset-requests), SuppliersAssetRequestReviewDialog and
// SupplierAssetRequestsList (portal, at /supplier).
//
// F-01 STATUS (confirmed live 2026-09-14, not trusted from the docs pack):
// FIXED at both the route/controller layer and RLS.
//   - GET /v1/services/suppliers/:supplierId/assetRequests carries
//     `authorizeSupplierAssetRequestRead` (routes/assetRequests.js:168-175).
//   - GET /v1/services/assetRequests/:id has no route-level gate (the comment
//     there explains why: the supplier a request belongs to is only knowable
//     from the loaded record) but `getAssetRequest` applies the identical
//     disjunctive check in the controller after `findOrFail`
//     (controllers/assetRequests.js — `authorizeSupplierAssetRequestRead` /
//     `isPortalUserFor`).
//   - `asset_request_select_rls` (database/rls.sql:255-259) carries the
//     EXTERNAL_SUPPLIER branch independently, so GraphQL is covered too.
// j3-f01-read-exposure-regression.spec.js is written GREEN (a regression
// lock), not red — see its header for why.
//
// AssetRequest / AssetRequestItem are INSTANT-strategy synced models
// (models/assetRequest.js, models/assetRequestItem.js carry no
// loadStrategy override, which defaults to 'instant'), so a REST write is
// only visible on a page once the sync broadcast lands in that context's
// IndexedDB — same posture as Equipment/Documents. Helpers below wait on SQL
// rather than trusting a first render.
import { expect } from '@playwright/test'
import { COMPANY_ID, SUPPLIER_IDS } from './cast.js'
import { sql, sqlValue } from './db.js'

// The stable fixture seeded by e2e-seed.sql §43 — a UI anchor with a
// findable title, unlike j12/j13's per-run throwaway rows.
export const FIXED_REQUEST = {
  id: 'e2e7a000-0000-4000-8000-000000000001',
  itemId: 'e2e7b000-0000-4000-8000-000000000001',
  title: 'E2E Asset Request — ISO Certificate',
  supplierId: SUPPLIER_IDS.withPortal,
}

// §43b — the E2EALT-side fixture, for tenant-isolation probes.
export const ALT_REQUEST = {
  id: 'e2e7a000-0000-4000-8000-0000000000a1',
  supplierId: 'e2e70000-0000-4000-8000-00000000a002',
  title: 'E2EALT Asset Request',
}

/**
 * Put the fixed §43 request back to a known PENDING state with exactly one
 * PENDING item. QMSAR (migration 20260903100000) makes ACCEPTED/CANCELLED
 * terminal — the seed's own re-apply cannot rewrite status_id once a journey
 * has driven it there — so this fixture does a real DELETE + INSERT instead,
 * which the trigger's INSERT arm always admits ("a request must be created
 * as PENDING").
 */
export function resetFixedRequest() {
  sql(`DELETE FROM supplier_assets WHERE asset_id IN
         (SELECT asset_id FROM asset_request_items WHERE asset_request_id = '${FIXED_REQUEST.id}' AND asset_id IS NOT NULL)`)
  sql(`DELETE FROM asset_request_items WHERE asset_request_id = '${FIXED_REQUEST.id}'`)
  // asset_requests_on_users FK's asset_request_id to asset_requests(id)
  // (migration 20260903110000) — nothing in this suite grants the fixed
  // request a recipient, but the DELETE below would violate the FK if it
  // ever did, so this is cleared defensively rather than assumed empty.
  sql(`DELETE FROM asset_requests_on_users WHERE asset_request_id = '${FIXED_REQUEST.id}'`)
  sql(`DELETE FROM asset_requests WHERE id = '${FIXED_REQUEST.id}'`)
  sql(`
    INSERT INTO asset_requests (id, company_id, supplier_id, title, description, status_id, created_by, created_at, updated_at)
    VALUES ('${FIXED_REQUEST.id}', '${COMPANY_ID}', '${FIXED_REQUEST.supplierId}',
            '${FIXED_REQUEST.title}', 'Seeded for the assetRequest Playwright project.',
            'PENDING', 'e2e10000-0000-4000-8000-000000000001', now(), now())
  `)
  sql(`
    INSERT INTO asset_request_items (id, company_id, asset_request_id, custom_title, status_id, created_at, updated_at)
    VALUES ('${FIXED_REQUEST.itemId}', '${COMPANY_ID}', '${FIXED_REQUEST.id}',
            'ISO 9001 Certificate', 'PENDING', now(), now())
  `)
}

/** Current status of the fixed request, straight from the DB. */
export function fixedRequestStatus() {
  return sqlValue(`SELECT status_id FROM asset_requests WHERE id = '${FIXED_REQUEST.id}'`)
}

/**
 * Navigate to the internal supplier detail page's Asset Requests tab.
 * `?tab=asset-requests` matches SuppliersPageId.vue's tabs array — the value,
 * not the label ("Asset Requests").
 */
export async function openInternalTab(page, supplierId = FIXED_REQUEST.supplierId) {
  await page.goto(`/suppliers/${supplierId}?tab=asset-requests`)
  await expect(page.getByRole('tab', { name: 'Asset Requests' })).toBeVisible({ timeout: 30_000 })
}

/** Navigate to the portal's own asset-requests landing page (`/supplier`). */
export async function openPortalHome(page) {
  await page.goto('/supplier')
}

/**
 * Click a button that opens a native file chooser, then hand it `file`.
 * Same idiom as e2e/fixtures/auditee.js `chooseFile` — the portal upload
 * button (SupplierAssetRequestsList.vue `pickAndUpload`) creates a detached
 * `<input type=file>` and calls `.click()` on it rather than rendering a
 * real file input, so Playwright must intercept the native chooser event
 * rather than `setInputFiles` on a locator.
 */
export async function chooseFileViaButton(locator, file) {
  const page = locator.page()
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), locator.click()])
  await chooser.setFiles(file)
}

/**
 * Wait for the request to reach `statusId` in Postgres — the DB-level
 * counterpart to waiting for the UI to reflect a REST write that landed
 * outside the page (e.g. a portal upload driven via page.request rather than
 * the file input).
 *
 * NOT built on `waitForSqlValue` — that helper's readiness check treats any
 * non-empty, non-'0'/'f' string as "ready", so polling a `status_id` column
 * with it would return on the very first poll regardless of which status was
 * actually there. This polls for the SPECIFIC target value instead.
 */
export async function waitForRequestStatus(id, statusId, { timeoutMs = 30_000, intervalMs = 1_000 } = {}) {
  const deadline = Date.now() + timeoutMs
  let last = null
  while (Date.now() < deadline) {
    last = sqlValue(`SELECT status_id FROM asset_requests WHERE id = '${id}'`)
    if (last === statusId) return
    await new Promise((r) => setTimeout(r, intervalMs))
  }
  expect(last, `asset_requests.status_id never reached ${statusId}`).toBe(statusId)
}
