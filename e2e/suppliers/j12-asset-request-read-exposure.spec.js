// SUP-J12 — Asset Request F-01: the read exposure, over the surface that
// actually serves it.
//
// This is the finding the whole hardening pass was built around, and it is
// worth being precise about why it needed an E2E case rather than only an RLS
// one. `asset_request_select_rls` has always carried a correct
// EXTERNAL_SUPPLIER branch — it scopes a portal user by identity and it fires
// on GraphQL. It was never consulted on REST, because `REST_RLS_ENABLED` is
// false by default. So the module had a correct policy AND a live exposure at
// the same time, and an RLS-only test would have reported the module safe.
//
// These cases therefore go through HTTP, as a logged-in EXTERNAL_SUPPLIER —
// a third-party organisation's employee, deliberately granted zero
// permissions — which is exactly the party the finding was about.
//
// Two-sided throughout: each refusal is paired with the request the SAME
// caller is entitled to make. A gate that refused everything would close the
// finding and take the supplier portal down with it (that is F-04), so
// "refused" alone is not evidence of a correct fix.
import { test, expect, request } from '@playwright/test'
import { BASE_URL, COMPANY_ID, SUPPLIER_IDS } from '../fixtures/cast.js'
import { sql } from '../fixtures/db.js'
import { portalContext, seedAssetRequest, cleanup } from '../fixtures/suppliers.js'

/** A request belonging to the OTHER supplier — the one the portal user is not. */
function seedForeignAssetRequest() {
  const title = `E2E Foreign Request ${process.pid}-${Date.now()}`
  // Wrapped in a CTE and SELECTed out: psql -tA prints the command tag next to
  // RETURNING output, so a bare `INSERT ... RETURNING id` hands back
  // "<uuid>\nINSERT 0 1" and every later use of it is a malformed uuid.
  const id = sql(`
    WITH r AS (
      INSERT INTO asset_requests
        (company_id, supplier_id, title, status_id, created_by, created_at, updated_at)
      VALUES ('${COMPANY_ID}', '${SUPPLIER_IDS.noPortal}', '${title}', 'PENDING',
              'e2e10000-0000-4000-8000-000000000001', now(), now())
      RETURNING id
    )
    SELECT id FROM r
  `)
  return { id, title }
}

test.describe('SUP-J12 — asset request read exposure (F-01)', () => {
  const created = []

  test.afterAll(() => {
    cleanup({ assetRequestIds: created })
  })

  test('a portal user CAN read their own supplier’s requests', async () => {
    // The positive half. Without it, every negative case below would also pass
    // against an endpoint that had simply been switched off.
    const own = seedAssetRequest({ title: `E2E Own Request ${Date.now()}` })
    created.push(own.id)

    const ctx = await portalContext()
    const res = await ctx.get(
      `/api/v1/services/suppliers/${SUPPLIER_IDS.withPortal}/assetRequests`,
    )
    expect(res.status(), 'the portal must keep working').toBe(200)
    const body = await res.json()
    const titles = (body.assetRequests ?? []).map((r) => r.title)
    expect(titles).toContain(own.title)
    await ctx.dispose()
  })

  test('a portal user CANNOT list another supplier’s requests', async () => {
    const foreign = seedForeignAssetRequest()
    created.push(foreign.id)

    const ctx = await portalContext()
    const res = await ctx.get(`/api/v1/services/suppliers/${SUPPLIER_IDS.noPortal}/assetRequests`)

    // 403 is the intended answer. A 200 carrying an empty list would ALSO be
    // acceptable behaviour from a data standpoint, so the assertion allows it
    // — but it must not carry the other supplier's rows.
    expect([403, 404]).toContain(res.status())
    if (res.status() === 200) {
      const body = await res.json()
      expect(body.assetRequests ?? []).toHaveLength(0)
    }
    await ctx.dispose()
  })

  test('a portal user CANNOT fetch another supplier’s request by id', async () => {
    // The id is a UUID, but this endpoint answered on company_id alone, so
    // possessing the id was sufficient — and API-08 additionally returns the
    // linked asset's filename, MIME type and storage path. Chained with the
    // Files-owned retrieval endpoint that has no per-record check, that is a
    // working exfiltration path for a competitor's evidence.
    const foreign = seedForeignAssetRequest()
    created.push(foreign.id)

    const ctx = await portalContext()
    const res = await ctx.get(`/api/v1/services/assetRequests/${foreign.id}`)
    expect([403, 404]).toContain(res.status())

    const raw = await res.text()
    expect(raw, 'no evidence metadata may leak in the refusal body').not.toContain(foreign.title)
    await ctx.dispose()
  })

  test('the document-type and status lookups are no longer anonymous', async () => {
    // `requireAuthByApiKey` resolves an API key when one is presented and calls
    // next() when none is — it is not an authentication gate. These two
    // endpoints carried nothing else, so they answered the open internet,
    // including this tenant's CUSTOM document-type names.
    // Through the same origin the app uses — hitting the API port directly
    // would 404 on the /api prefix and pass for the wrong reason.
    const anon = await request.newContext({ baseURL: BASE_URL })
    for (const path of ['/api/v1/services/assetRequestTypes', '/api/v1/services/assetRequestStatuses']) {
      const res = await anon.get(path)
      expect([400, 401, 403], `${path} must not answer anonymously`).toContain(res.status())
    }
    await anon.dispose()
  })
})
