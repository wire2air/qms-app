// GRP-J2 — REST team reads require a grant (F-07).
//
// `routes/teams.js` mounted `enforcePermission` on its three write verbs and
// omitted it from both GETs — the same three-of-five shape this program has now
// found and closed on `sites`, `departments` and `suppliers`. It is a
// convention that was followed consistently rather than an oversight in one
// file, which is why it is worth a journey per module rather than one shared
// note.
//
// RLS does not cover for it: REST_RLS_ENABLED is off by default, so these ran
// as the DB superuser and no policy fired. And a team roster is not neutral
// data — it is the membership half of the role graph, so an ungated list tells
// any authenticated member which teams exist and, via the detail read, who is
// in them.
//
// The static half — that the gate is mounted, and mounted AFTER
// requireCompanyAccess so it is not dead code — is asserted in
// qms/backend/api/tests/routePermissions.test.js's snapshot.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH, TEAMS } from '../fixtures/cast.js'

const API = 'http://e2elab.localhost:4000'
const TEAM = `${API}/v1/services/teams`

test.describe('GRP-J2 · REST team reads require a grant', () => {
  test('GET /teams rejects a zero-permission member', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: AUTH.noAccess })
    try {
      const res = await ctx.request.get(TEAM)
      expect(res.status(), 'the list must require teams:read').toBe(403)
    } finally {
      await ctx.close()
    }
  })

  test('GET /teams/:id rejects a zero-permission member', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: AUTH.noAccess })
    try {
      const res = await ctx.request.get(`${TEAM}/${TEAMS.roleCarrying.id}`)
      expect(res.status(), 'the detail read must require teams:read').toBe(403)
    } finally {
      await ctx.close()
    }
  })

  test('the refused list discloses no roster at all', async ({ browser }) => {
    // Asserted on the BODY as well as the status. A 403 whose body still
    // carried the payload would satisfy the two tests above and leak anyway —
    // an unlikely failure, but the cheap assertion is the one worth having
    // because the expensive one is a breach.
    const ctx = await browser.newContext({ storageState: AUTH.noAccess })
    try {
      const res = await ctx.request.get(TEAM)
      const body = await res.text()
      expect(body).not.toContain(TEAMS.roleCarrying.name)
      expect(body).not.toContain(TEAMS.plain.name)
    } finally {
      await ctx.close()
    }
  })

  test('CONTROL · a teams:read holder is admitted', async ({ browser }) => {
    // Without this, deleting the route entirely would pass every test above.
    const ctx = await browser.newContext({ storageState: AUTH.teamJoiner })
    try {
      const res = await ctx.request.get(TEAM)
      expect(res.status()).toBe(200)
    } finally {
      await ctx.close()
    }
  })

  test('CONTROL · the write routes were and remain gated', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: AUTH.noAccess })
    try {
      const created = await ctx.request.post(TEAM, { data: { name: 'E2E GJ2 must not exist' } })
      expect(created.status(), 'POST is gated on teams:create').toBe(403)

      const deleted = await ctx.request.delete(`${TEAM}/${TEAMS.plain.id}`)
      expect(deleted.status(), 'DELETE is gated on teams:delete').toBe(403)
    } finally {
      await ctx.close()
    }
  })
})
