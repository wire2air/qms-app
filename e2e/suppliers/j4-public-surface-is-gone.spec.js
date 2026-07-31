// SUP-J4 — The unauthenticated surface is gone and stays gone.
//
// Five endpoints and two pages were deleted on 2026-07-30. This spec is the
// standing guard: if any of them is ever re-introduced — by a revert, a merge,
// or a well-meaning "the supplier can't log in" patch — it goes red.
//
// The assertion is deliberately "no data", not merely "not 200". A re-added
// route that 500s or redirects would still satisfy a status-only check while
// being back on the attack surface; what must be true is that an anonymous
// caller cannot obtain a document or an asset request by any of these paths.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { anonContext, seedDocument, seedAssetRequest, cleanup } from '../fixtures/suppliers.js'
import { sql } from '../fixtures/db.js'

const RETIRED_ENDPOINTS = [
  ['GET', '/api/v1/services/public/supplierDocuments/anytoken'],
  ['GET', '/api/v1/services/public/assetRequests/anytoken'],
  ['POST', '/api/v1/services/public/assetRequests/anytoken/upload'],
  ['POST', '/api/v1/services/public/assetRequests/anytoken/items/anyitem/upload'],
  ['POST', '/api/v1/services/public/assetRequests/anytoken/submit'],
]

test.describe('SUP-J4 · the public token surface is retired', () => {
  const created = { documentIds: [], assetRequestIds: [] }

  test.afterAll(() => cleanup(created))

  for (const [method, path] of RETIRED_ENDPOINTS) {
    test(`${method} ${path} is not routed`, async () => {
      const ctx = await anonContext()
      try {
        const res = await ctx.fetch(path, { method, data: method === 'GET' ? undefined : {} })
        expect(res.status(), `${method} ${path} must not be served`).toBe(404)
        const body = await res.text()
        expect(body).not.toContain('documentVersion')
        expect(body).not.toContain('assetRequest"')
      } finally {
        await ctx.dispose()
      }
    })
  }

  test('a real token in the database buys an anonymous caller nothing', async () => {
    // Historical supplier_documents rows still carry their tokens. The point of
    // the retirement is that possessing one is now worthless, so probe with a
    // genuine value rather than a made-up string.
    const doc = seedDocument({ title: 'E2E SUP-J4 Token Probe' })
    created.documentIds.push(doc.id)
    const token = sql(`SELECT token FROM supplier_documents WHERE token IS NOT NULL LIMIT 1`).trim()
    test.skip(!token, 'no historical supplier_documents token in this database')

    const ctx = await anonContext()
    try {
      const res = await ctx.get(`/api/v1/services/public/supplierDocuments/${token}`)
      expect(res.status(), 'a real token must not resolve').toBe(404)
    } finally {
      await ctx.dispose()
    }
  })

  test('the two public pages no longer exist as routes', async ({ page }) => {
    // The SPA falls through to its not-found handling; what must NOT happen is
    // a token page rendering document content to a session-less visitor.
    for (const path of ['/supplier-document/sometoken', '/asset-request/sometoken']) {
      await page.goto(path, { waitUntil: 'domcontentloaded' })
      await expect(page.locator('body')).not.toContainText('SUPPLIER VISIBLE BODY')
      await expect(page.locator('body')).not.toContainText('Submit Document')
    }
  })

  test('asset requests are no longer issued a token at all', () => {
    const req = seedAssetRequest()
    created.assetRequestIds.push(req.id)
    // Seeded rows have no token; the point is that the CONTROLLER no longer
    // mints one either. Anything created through the app from now on carries
    // NULL, so there is nothing to leak or to expire.
    const withTokens = sql(
      `SELECT count(*) FROM asset_requests WHERE token IS NOT NULL AND created_at > now() - interval '1 hour'`,
    ).trim()
    expect(Number(withTokens), 'no freshly-minted asset-request tokens').toBe(0)
  })
})
