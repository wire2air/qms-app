// PW-J11 — REST sites reads must require `sites:read`.
//
// ✅ RESOLVED 2026-08-11 by commit ae766ed9, which mounted
// `enforcePermission('sites', 'read')` on all three previously-ungated routes.
// All six routes in backend/api/routes/sites.js are now gated (:51 :93 :132
// :188 :238 :273). The assertions below now PASS and are kept as the standing
// regression guard — the finding is closed only for as long as they stay green.
// The mechanism description that follows documents the ORIGINAL defect; read it
// as history, not as current behaviour.
//
// ── The original defect (closed) ────────────────────────────────────────────
// Three of the six routes carried `requireCompanyAccess` only:
//
//   GET    /v1/services/sites            requireCompanyAccess only            ❌
//   GET    /v1/services/sites/:id        requireCompanyAccess only            ❌
//   PUT    /v1/services/sites/checkcode  requireCompanyAccess only            ❌
//
// They were readable by ANY authenticated member of the company, including one
// holding zero permissions of any kind. RLS did not cover for it:
// REST_RLS_ENABLED defaults off, so Sequelize connects as the DB superuser and
// `sites_sel` never fires on this path at all.
//
// This was never the same finding as the UI guard (PW-J5). PW-J5 proves the SPA
// refuses to render the page. This proved the data was one curl away regardless,
// which is why an ADMIN-tier route guard is not a substitute for a route gate.
//
// ── Why these three routes still exist ──────────────────────────────────────
// Deletion was considered and rejected: this spec, `j6` (cross-tenant isolation
// on GET /:id) and `e2e/authentication/j11` (GET /v1/services/sites as the
// canonical requireCompanyAccess endpoint) all call them, and they are a
// published, api-key-reachable OpenAPI surface. `checkcode` is gated on
// `sites:read` rather than a write verb because reading is what it discloses —
// it is an oracle for which site codes and names exist in a tenant.
//
// The two CONTROL tests pin the shape of the closed finding: the write routes
// were always correctly gated, so this was three missing mounts, not an absent
// gating mechanism.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH, SITES } from '../fixtures/cast.js'

const API = 'http://e2elab.localhost:4000'

test.describe('PW-J11 · REST sites reads require sites:read', () => {
  test('GET /v1/services/sites rejects a zero-permission member', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: AUTH.noAccess })
    const res = await ctx.request.get(`${API}/v1/services/sites`)
    expect(res.status(), 'list must require sites:read').toBe(403)
    await ctx.close()
  })

  test('GET /v1/services/sites/:id rejects a zero-permission member', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: AUTH.noAccess })
    const res = await ctx.request.get(`${API}/v1/services/sites/${SITES.primary.id}`)
    expect(res.status(), 'detail must require sites:read').toBe(403)
    await ctx.close()
  })

  test('PUT /v1/services/sites/checkcode rejects a zero-permission member', async ({ browser }) => {
    // The mildest of the three and still a real leak: it is an oracle for which
    // site codes and names exist in a tenant, answerable by anyone with a
    // session. `name` is required by checkSiteCodeSchema — sending a valid body
    // matters, because a 400 would mean this probe never reached the handler
    // and proved nothing about the gate.
    const ctx = await browser.newContext({ storageState: AUTH.noAccess })
    const res = await ctx.request.put(`${API}/v1/services/sites/checkcode`, {
      data: { name: SITES.primary.name, code: SITES.primary.code },
    })
    expect(res.status(), 'checkcode must not be reachable without a sites grant').not.toBe(400)
    expect(res.status(), 'checkcode must require a sites grant').toBe(403)
    await ctx.close()
  })

  test('CONTROL · the write routes ARE gated (must pass today)', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: AUTH.noAccess })

    const created = await ctx.request.post(`${API}/v1/services/sites`, {
      data: { name: 'E2E J11 must not exist', code: 'E2EJ11', timezone: 'America/New_York' },
    })
    expect(created.status(), 'POST is gated on sites:create').toBe(403)

    const updated = await ctx.request.put(`${API}/v1/services/sites/${SITES.primary.id}`, {
      data: { name: 'E2E J11 renamed' },
    })
    expect(updated.status(), 'PUT is gated on sites:update').toBe(403)

    const deleted = await ctx.request.delete(`${API}/v1/services/sites/${SITES.primary.id}`)
    expect(deleted.status(), 'DELETE is gated on sites:delete').toBe(403)

    await ctx.close()
  })

  test('CONTROL · a holder of sites:read is admitted (must pass today)', async ({ browser }) => {
    // Proves the failures above are about the *missing gate*, not about the
    // endpoints being broken or the seed lacking a grant.
    const ctx = await browser.newContext({ storageState: AUTH.siteAdmin })
    const res = await ctx.request.get(`${API}/v1/services/sites`)
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body.sites), 'list payload shape').toBeTruthy()
    await ctx.close()
  })
})
