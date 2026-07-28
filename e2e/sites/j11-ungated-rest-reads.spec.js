// PW-J11 — 🔴 Ungated REST reads. WRITTEN TO FAIL AGAINST CURRENT CODE.
//
// backend/api/routes/sites.js mounts enforcePermission on exactly three of its
// six routes:
//
//   POST   /v1/services/sites            enforcePermission('sites','create')  ✅
//   PUT    /v1/services/sites/:id        enforcePermission('sites','update')  ✅
//   DELETE /v1/services/sites/:id        enforcePermission('sites','delete')  ✅
//   GET    /v1/services/sites            requireCompanyAccess only            ❌
//   GET    /v1/services/sites/:id        requireCompanyAccess only            ❌
//   PUT    /v1/services/sites/checkcode  requireCompanyAccess only            ❌
//
// The three unguarded routes are readable by ANY authenticated member of the
// company, including one holding zero permissions of any kind. RLS does not
// cover for it: REST_RLS_ENABLED defaults off, so Sequelize connects as the DB
// superuser and `sites_sel` never fires on this path at all.
//
// This is not the same finding as the UI guard (PW-J5). PW-J5 proves the SPA
// refuses to render the page. This proves the data is one curl away regardless,
// which is why an ADMIN-tier route guard is not a substitute for a route gate.
//
// The three "must be rejected" assertions FAIL TODAY (the routes return 200).
// The two control assertions PASS today and pin the shape of the defect: the
// write routes are correctly gated, so this is three missing mounts, not an
// absent gating mechanism.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH, SITES } from '../fixtures/cast.js'

const API = 'http://e2elab.localhost:4000'

test.describe('PW-J11 · REST sites reads are ungated', () => {
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
