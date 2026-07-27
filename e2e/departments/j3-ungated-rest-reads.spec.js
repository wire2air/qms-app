// DEPT-J3 — 🔴 Ungated REST reads. WRITTEN TO FAIL.
//
// `backend/api/routes/departments.js` mounts enforcePermission on exactly the
// same three of six routes that `sites` does, and omits it from the same three:
//
//   POST   /v1/services/departments            enforcePermission(create)  ✅ :139
//   PUT    /v1/services/departments/:id        enforcePermission(update)  ✅ :228
//   DELETE /v1/services/departments/:id        enforcePermission(delete)  ✅ :263
//   GET    /v1/services/departments            requireCompanyAccess only  ❌ :57
//   GET    /v1/services/departments/:id        requireCompanyAccess only  ❌ :97
//   PUT    /v1/services/departments/checkcode  requireCompanyAccess only  ❌ :175
//
// Two identically-shaped modules with the identical omission is what makes this
// worth stating as a pattern rather than a one-off: the reads were never gated
// in either, so this is a convention that was followed consistently, not an
// oversight in one file. RLS does not cover for it — REST_RLS_ENABLED defaults
// off, so these run as the DB superuser and no policy fires.
//
// Departments leak slightly more than sites do: the payload carries
// `supervisor_user_id`, so an ungated list is also a map of who supervises what.
import { test, expect } from '@playwright/test'
import { AUTH, DEPARTMENTS, SITES } from '../fixtures/cast.js'

const API = 'http://e2elab.localhost:4000'

test.describe('DEPT-J3 · REST department reads are ungated', () => {
  test('🔴 GET /departments rejects a zero-permission member (FAILS TODAY)', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: AUTH.noAccess })
    const res = await ctx.request.get(`${API}/v1/services/departments`)
    expect(res.status(), 'list must require departments:read').toBe(403)
    await ctx.close()
  })

  test('🔴 GET /departments/:id rejects a zero-permission member (FAILS TODAY)', async ({
    browser,
  }) => {
    const ctx = await browser.newContext({ storageState: AUTH.noAccess })
    const res = await ctx.request.get(`${API}/v1/services/departments/${DEPARTMENTS.quality.id}`)
    expect(res.status(), 'detail must require departments:read').toBe(403)
    await ctx.close()
  })

  test('🔴 PUT /departments/checkcode rejects a zero-permission member (FAILS TODAY)', async ({
    browser,
  }) => {
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

  test('🔴 the ungated list also discloses who supervises each department (FAILS TODAY)', async ({
    browser,
  }) => {
    // The bit that makes this worse than the sites equivalent. Not a separate
    // defect — the same missing gate — but a different disclosure, so it is
    // asserted separately rather than assumed.
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

    const updated = await ctx.request.put(`${API}/v1/services/departments/${DEPARTMENTS.quality.id}`, {
      data: { name: 'E2E DJ3 renamed' },
    })
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
