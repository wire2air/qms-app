// USER-J2 — 🔴 REST roster reads are ungated. WRITTEN TO FAIL AGAINST CURRENT CODE.
//
// backend/api/routes/users.js mounts enforcePermission on the write routes and
// on neither read route:
//
//   POST   /v1/services/users        enforcePermission('user_management','create')  ✅
//   PUT    /v1/services/users/:id    enforcePermission('user_management','update')  ✅
//   DELETE /v1/services/users/:id    enforcePermission('user_management','delete')  ✅
//   GET    /v1/services/users        requireCompanyAccess only                       ❌
//   GET    /v1/services/users/:id    requireCompanyAccess only                       ❌
//
// RLS does not cover for the gap. REST_RLS_ENABLED defaults off, so Sequelize
// connects as the DB superuser and `users_sel` never fires on this path at all —
// the policy's careful read branches are simply not in the loop for REST.
//
// The payload is the staff directory: names, emails, job titles, site and
// department placement, status. For a QMS that is the org chart of everyone who
// signs records, one curl away from any authenticated member — including a
// contractor or an external supplier-portal account with zero grants.
//
// This is the `users` instance of the same defect PW-J11 documents for `sites`.
// Same shape, higher blast radius, because the roster is also the input to
// social engineering against the credential-reset flows in the Security Center.
//
// The two "must be rejected" assertions FAIL TODAY (the routes return 200). The
// two controls PASS today and pin the shape: the write routes are correctly
// gated and a real grant is admitted, so this is two missing mounts, not an
// absent gating mechanism.
import { test, expect } from '@playwright/test'
import { AUTH, USERS } from '../fixtures/cast.js'

const API = 'http://e2elab.localhost:4000'

test.describe('USER-J2 · REST user reads are ungated', () => {
  test('🔴 GET /v1/services/users rejects a zero-permission member (FAILS TODAY)', async ({
    browser,
  }) => {
    const ctx = await browser.newContext({ storageState: AUTH.noAccess })
    const res = await ctx.request.get(`${API}/v1/services/users`)
    expect(res.status(), 'roster list must require user_management:read').toBe(403)
    await ctx.close()
  })

  test('🔴 GET /v1/services/users/:id rejects a zero-permission member (FAILS TODAY)', async ({
    browser,
  }) => {
    // Reading one user is the worse half in practice: it is addressable. Given
    // an id from any other surface, this returns that person's record without
    // any user_management grant at all.
    const ctx = await browser.newContext({ storageState: AUTH.noAccess })
    const res = await ctx.request.get(`${API}/v1/services/users/${USERS.owner.id}`)
    expect(res.status(), 'roster detail must require user_management:read').toBe(403)
    await ctx.close()
  })

  test('CONTROL · the write routes ARE gated (must pass today)', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: AUTH.noAccess })

    const created = await ctx.request.post(`${API}/v1/services/users`, {
      data: { firstName: 'E2E', lastName: 'J2MustNotExist', email: 'j2-must-not-exist@e2e.test' },
    })
    expect(created.status(), 'POST is gated on user_management:create').toBe(403)

    const updated = await ctx.request.put(`${API}/v1/services/users/${USERS.auditor.id}`, {
      data: { jobTitle: 'E2E J2 renamed' },
    })
    expect(updated.status(), 'PUT is gated on user_management:update').toBe(403)

    const deleted = await ctx.request.delete(`${API}/v1/services/users/${USERS.auditor.id}`)
    expect(deleted.status(), 'DELETE is gated on user_management:delete').toBe(403)

    await ctx.close()
  })

  test('CONTROL · a holder of user_management:read is admitted (must pass today)', async ({
    browser,
  }) => {
    // Proves the failures above are about the missing gate, not about the
    // endpoint being broken or the seed lacking a grant. The E2E Author role
    // carries user_management:read at tenant scope.
    const ctx = await browser.newContext({ storageState: AUTH.author })
    const res = await ctx.request.get(`${API}/v1/services/users`)
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body.users ?? body), 'list payload shape').toBeTruthy()
    await ctx.close()
  })
})
