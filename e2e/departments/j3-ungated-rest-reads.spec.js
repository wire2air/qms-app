// DEPT-J3 — REST department reads are gated.
// FIXED (D-H2, and PERM-R5 for checkcode). Written to fail; all four reds below
// turned green. All six routes on the router now carry a permission gate:
//
//   POST   /v1/services/departments            enforcePermission(create)  ✅
//   PUT    /v1/services/departments/:id        enforcePermission(update)  ✅
//   DELETE /v1/services/departments/:id        enforcePermission(delete)  ✅
//   GET    /v1/services/departments            enforcePermission(read)    ✅ (D-H2)
//   GET    /v1/services/departments/:id        enforcePermission(read)    ✅ (D-H2)
//   PUT    /v1/services/departments/checkcode  enforcePermission(read)    ✅ (PERM-R5)
//
// Two identically-shaped modules with the identical omission is what made this
// worth stating as a pattern rather than a one-off: the reads were never gated
// in either, so it was a convention followed consistently rather than an
// oversight in one file. `sites` closed its three first; this closed the last
// two here.
//
// RLS did not cover for it — REST_RLS_ENABLED defaults off, so these run as the
// DB superuser and no policy fires. That is also why the gate is a real
// widening of protection rather than a formality: `departments_sel` limits a
// grantless GraphQL reader to departments of their OWN sites (the picker
// baseline), while the ungated REST list returned every department in the
// tenant — and its payload carries `supervisor_user_id`, so it was additionally
// a map of who supervises what.
//
// The static half of this — that the gate is mounted, and mounted AFTER
// requireCompanyAccess so it is not dead code — is
// qms/backend/api/tests/departmentsReadRouteGates.test.js.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH, DEPARTMENTS, SITES } from '../fixtures/cast.js'

const API = 'http://e2elab.localhost:4000'

test.describe('DEPT-J3 · REST department reads require a grant', () => {
  test('GET /departments rejects a zero-permission member', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: AUTH.noAccess })
    const res = await ctx.request.get(`${API}/v1/services/departments`)
    expect(res.status(), 'list must require departments:read').toBe(403)
    await ctx.close()
  })

  test('GET /departments/:id rejects a zero-permission member', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: AUTH.noAccess })
    const res = await ctx.request.get(`${API}/v1/services/departments/${DEPARTMENTS.quality.id}`)
    expect(res.status(), 'detail must require departments:read').toBe(403)
    await ctx.close()
  })

  test('PUT /departments/checkcode rejects a zero-permission member', async ({ browser }) => {
    // `name` is required by checkDepartmentCodeSchema — sending a valid body
    // matters, because a 400 would mean the probe never reached the handler and
    // proved nothing about the gate.
    const ctx = await browser.newContext({ storageState: AUTH.noAccess })
    const res = await ctx.request.put(`${API}/v1/services/departments/checkcode`, {
      data: { name: DEPARTMENTS.quality.name, code: DEPARTMENTS.quality.code },
    })
    expect(res.status(), 'checkcode must not be reachable without a grant').not.toBe(400)
    expect(res.status(), 'checkcode must require a departments grant').toBe(403)
    await ctx.close()
  })

  test('the list does not disclose who supervises each department', async ({ browser }) => {
    // The bit that made this worse than the sites equivalent. Not a separate
    // defect — the same missing gate — but a different disclosure, so it is
    // asserted separately rather than assumed. The `if` below is deliberate:
    // should the gate ever be removed, this reports WHAT LEAKED rather than
    // just a status code, which is the more useful failure message.
    const ctx = await browser.newContext({ storageState: AUTH.noAccess })
    const res = await ctx.request.get(`${API}/v1/services/departments`)
    if (res.status() === 200) {
      const body = await res.json().catch(() => null)
      const list = body?.departments ?? []
      const leaks = list.some((d) => 'supervisorUserId' in d)
      expect(leaks, 'supervisor assignments must not be readable without a grant').toBe(false)
    }
    expect(res.status()).toBe(403)
    await ctx.close()
  })

  test('CONTROL · the write routes ARE gated (must pass today)', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: AUTH.noAccess })

    const created = await ctx.request.post(`${API}/v1/services/departments`, {
      data: { name: 'E2E DJ3 must not exist', code: 'DJ3NO', siteId: SITES.primary.id },
    })
    expect(created.status(), 'POST is gated on departments:create').toBe(403)

    const updated = await ctx.request.put(
      `${API}/v1/services/departments/${DEPARTMENTS.quality.id}`,
      {
        data: { name: 'E2E DJ3 renamed' },
      },
    )
    expect(updated.status(), 'PUT is gated on departments:update').toBe(403)

    const deleted = await ctx.request.delete(
      `${API}/v1/services/departments/${DEPARTMENTS.quality.id}`,
    )
    expect(deleted.status(), 'DELETE is gated on departments:delete').toBe(403)

    await ctx.close()
  })

  test('CONTROL · a holder of departments:read is admitted (must pass today)', async ({
    browser,
  }) => {
    const ctx = await browser.newContext({ storageState: AUTH.deptAdmin })
    const res = await ctx.request.get(`${API}/v1/services/departments`)
    expect(res.status()).toBe(200)
    await ctx.close()
  })
})
