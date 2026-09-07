// GRP-J1 — 🔴 The REST surface must not reopen the self-escalation hole that
// RLS closed on the GraphQL path.
//
// THE SHAPE OF THIS DEFECT, and why a module can be "fixed" and still broken.
// `users_on_teams` is how a team confers ROLES onto its members: adding a user
// to a team grants them every role that team holds. So "who may edit team
// membership" is exactly "who may grant roles", and a gap there is privilege
// escalation, not a data-entry bug.
//
// That was recognised and closed at the database — `users_on_teams`'s policy
// carries a conditional requiring a role-management grant when the target team
// carries roles. But RLS only fires on the GraphQL path: REST_RLS_ENABLED is
// off by default, so `PUT /v1/services/teams/:id` runs as the DB superuser with
// no policy in play at all, and `team.syncUsers()` had zero role-awareness.
// The fix that closed the hole on one path left the other one open, and the
// REST route is the easier one to reach with an API key.
//
// `assertMembershipWriteAllowed()` (controllers/teams.js) is the in-controller
// gate that closes it. This journey is its regression guard, driven through a
// real server rather than asserted from source.
//
// THE PERSONA. `teamJoiner` holds teams create/read/update and NOTHING else —
// no role_permission_management grant of any kind. That is the whole point:
// `teams:update` is the verb the REST route gates on, so before the fix it was
// sufficient, and the escalation needed no role-management permission at all.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH, USERS, TEAMS } from '../fixtures/cast.js'
import { sql, sqlValue } from '../fixtures/db.js'

const API = 'http://e2elab.localhost:4000'
const TEAM = `${API}/v1/services/teams`

/** Members of a team, live rows only. */
function memberCount(teamId, userId) {
  return Number(
    sqlValue(
      `SELECT count(*) FROM users_on_teams
        WHERE team_id = '${teamId}' AND user_id = '${userId}' AND deleted_at IS NULL`,
    ),
  )
}

function purgeMembership(teamId, userId) {
  sql(`DELETE FROM users_on_teams WHERE team_id = '${teamId}' AND user_id = '${userId}'`)
}

test.describe('GRP-J1 · REST cannot grant roles through team membership', () => {
  test.afterEach(() => purgeMembership(TEAMS.roleCarrying.id, USERS.teamJoiner.id))

  test('PRECONDITION · the target team really carries a role', () => {
    // Without this, the whole journey degrades into "a plain team accepted a
    // member", which is allowed and proves nothing.
    expect(
      Number(
        sqlValue(
          `SELECT count(*) FROM roles_on_teams
            WHERE team_id = '${TEAMS.roleCarrying.id}' AND deleted_at IS NULL`,
        ),
      ),
      'the role-carrying fixture must actually carry a role',
    ).toBeGreaterThan(0)
  })

  test('🔴 teams:update alone cannot add the caller to a role-carrying team', async ({
    browser,
  }) => {
    const ctx = await browser.newContext({ storageState: AUTH.teamJoiner })
    try {
      const res = await ctx.request.put(`${TEAM}/${TEAMS.roleCarrying.id}`, {
        data: { userIds: [USERS.teamJoiner.id] },
      })

      expect(
        res.status(),
        'a teams:update holder with no role-management grant must be refused',
      ).toBe(403)

      expect(
        memberCount(TEAMS.roleCarrying.id, USERS.teamJoiner.id),
        'and no membership row may exist afterwards',
      ).toBe(0)
    } finally {
      await ctx.close()
    }
  })

  test('🔴 …and therefore does not acquire the role the team carries', async ({ browser }) => {
    // The consequence, stated as the thing that actually matters. A 403 is the
    // mechanism; THIS is the property.
    const ctx = await browser.newContext({ storageState: AUTH.teamJoiner })
    try {
      await ctx.request.put(`${TEAM}/${TEAMS.roleCarrying.id}`, {
        data: { userIds: [USERS.teamJoiner.id] },
      })
    } finally {
      await ctx.close()
    }

    const carried = sqlValue(
      `SELECT count(*) FROM roles_on_teams rt
         JOIN users_on_teams ut ON ut.team_id = rt.team_id AND ut.deleted_at IS NULL
        WHERE rt.team_id = '${TEAMS.roleCarrying.id}' AND rt.deleted_at IS NULL
          AND ut.user_id = '${USERS.teamJoiner.id}'`,
    )
    expect(Number(carried), 'no role may reach the caller through this route').toBe(0)
  })

  test('CONTROL · the same caller CAN edit a team that carries no roles', async ({ browser }) => {
    // Decisive. Same persona, same endpoint, same payload shape — only the
    // target team differs. Without this, a gate that refused every membership
    // write would pass the two tests above and quietly break the feature.
    const ctx = await browser.newContext({ storageState: AUTH.teamJoiner })
    try {
      const res = await ctx.request.put(`${TEAM}/${TEAMS.plain.id}`, {
        data: { userIds: [USERS.teamJoiner.id] },
      })
      expect([200, 201], 'a role-less team stays editable with teams:update').toContain(
        res.status(),
      )
      expect(memberCount(TEAMS.plain.id, USERS.teamJoiner.id)).toBe(1)
    } finally {
      await ctx.close()
      purgeMembership(TEAMS.plain.id, USERS.teamJoiner.id)
    }
  })
})
