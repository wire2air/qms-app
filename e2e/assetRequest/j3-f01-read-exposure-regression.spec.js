// AR-J3 — F-01 regression, from a real logged-in browser session.
//
// F-01 STATUS: FIXED. Verified live against current source on 2026-09-14,
// not assumed from the hardening pack:
//   - GET /v1/services/suppliers/:supplierId/assetRequests carries
//     `authorizeSupplierAssetRequestRead` as route middleware
//     (backend/api/routes/assetRequests.js:168-175).
//   - GET /v1/services/assetRequests/:id has no route-level gate (by design —
//     the record's supplier is only knowable after `findOrFail` loads it) but
//     `getAssetRequest` calls the identical `assertCanReadForSupplier` check
//     after loading (backend/api/controllers/assetRequests.js:715).
//   - `assertCanReadForSupplier` admits exactly two callers: an internal user
//     holding `supplier_management:read`, or `isPortalUserFor` — identity via
//     `req.companyContext.kind === 'EXTERNAL_SUPPLIER'` AND a matching
//     `supplierId`, both session-derived and not attacker-controlled
//     (backend/api/controllers/assetRequests.js:24-46).
//   - `asset_request_select_rls` (database/rls.sql:255-259) carries the same
//     EXTERNAL_SUPPLIER branch independently, so GraphQL is covered too.
//   - The two previously-anonymous lookups (`assetRequestTypes`,
//     `assetRequestStatuses`) now require `requireCompanyAccess`
//     (routes/assetRequests.js:75-81, 112-118) — no longer served to the
//     open internet.
//
// So this is written GREEN, as a regression lock, per the harness's own
// convention (see e2e/suppliers/j12, SUP-J12, which already locks this at the
// raw HTTP/SQL level). What this file adds is the SAME probe from a real
// browser context carrying the portal user's session cookie — the artifact a
// browser-based attacker actually has, rather than a hand-built
// APIRequestContext — plus the login-time behaviour (does an EXTERNAL_SUPPLIER
// even reach the internal /suppliers/:id admin page at all).
import { test, expect, request as playwrightRequest } from '@playwright/test'
import { BASE_URL, COMPANY_ID, SUPPLIER_IDS, SUPPLIER_USER } from '../fixtures/cast.js'
import { sql, sqlValue } from '../fixtures/db.js'
import { freshContext } from '../fixtures/sites.js'

function seedForeignRequest() {
  const title = `AR-J3 Foreign ${process.pid}-${Date.now()}`
  const id = sqlValue(`
    INSERT INTO asset_requests (company_id, supplier_id, title, status_id, created_by, created_at, updated_at)
    VALUES ('${COMPANY_ID}', '${SUPPLIER_IDS.noPortal}', '${title}', 'PENDING',
            'e2e10000-0000-4000-8000-000000000001', now(), now())
    RETURNING id
  `)
  return { id, title }
}

test.describe('AR-J3 — F-01 regression (FIXED — this is a green lock)', () => {
  const created = []
  test.afterAll(() => {
    for (const id of created) sql(`DELETE FROM asset_requests WHERE id = '${id}'`)
  })

  test('a real browser session for the portal user reads its OWN supplier’s list (control)', async ({
    browser,
  }) => {
    const ctx = await freshContext(browser, SUPPLIER_USER)
    try {
      const res = await ctx.request.get(
        `/api/v1/services/suppliers/${SUPPLIER_IDS.withPortal}/assetRequests`,
      )
      expect(res.status(), 'the portal must keep working — a refusal here is F-04, not F-01').toBe(
        200,
      )
    } finally {
      await ctx.close()
    }
  })

  test('the same browser session CANNOT list a different supplier’s requests', async ({
    browser,
  }) => {
    const foreign = seedForeignRequest()
    created.push(foreign.id)

    const ctx = await freshContext(browser, SUPPLIER_USER)
    try {
      const res = await ctx.request.get(
        `/api/v1/services/suppliers/${SUPPLIER_IDS.noPortal}/assetRequests`,
      )
      expect([403, 404]).toContain(res.status())
      if (res.status() === 200) {
        const body = await res.json()
        expect(body.assetRequests ?? []).toHaveLength(0)
      }
    } finally {
      await ctx.close()
    }
  })

  test('the same browser session CANNOT fetch the foreign request by id, and no evidence leaks in the refusal', async ({
    browser,
  }) => {
    const foreign = seedForeignRequest()
    created.push(foreign.id)

    const ctx = await freshContext(browser, SUPPLIER_USER)
    try {
      const res = await ctx.request.get(`/api/v1/services/assetRequests/${foreign.id}`)
      expect([403, 404]).toContain(res.status())
      const raw = await res.text()
      expect(raw, 'no title/evidence metadata may leak in the refusal body').not.toContain(
        foreign.title,
      )
    } finally {
      await ctx.close()
    }
  })

  test('an EXTERNAL_SUPPLIER session cannot open the internal /suppliers admin page for their own supplier', async ({
    browser,
  }) => {
    // Not merely a REST probe: this proves the internal admin surface itself
    // (SuppliersAssetRequestsTab, gated on supplier_management:update for
    // writes, but the PAGE ROUTE for internal staff) does not silently render
    // for a zero-grant external party who happens to hold a valid session.
    const ctx = await freshContext(browser, SUPPLIER_USER)
    const page = await ctx.newPage()
    try {
      await page.goto(`/suppliers/${SUPPLIER_IDS.withPortal}?tab=asset-requests`)
      // Either bounced to /no-access (or /signin) or the admin chrome never
      // renders — assert the negative that matters: the internal "New
      // Request" control (supplier_management:create) is not on the page.
      await expect(page.getByRole('button', { name: 'New Request' })).toHaveCount(0)
    } finally {
      await ctx.close()
    }
  })

  test('the document-type and status lookups are no longer served anonymously', async () => {
    // The `request` test fixture is an APIRequestContext (already bound to a
    // session) and has no `newContext`. A genuinely anonymous probe has to
    // come from the module-level `request` factory instead.
    const anon = await playwrightRequest.newContext({ baseURL: BASE_URL })
    try {
      for (const path of [
        '/api/v1/services/assetRequestTypes',
        '/api/v1/services/assetRequestStatuses',
      ]) {
        const res = await anon.get(path)
        expect([400, 401, 403], `${path} must not answer anonymously`).toContain(res.status())
      }
    } finally {
      await anon.dispose()
    }
  })
})
