// GRP-J3 — Deleting a role-carrying group revokes what it was granting.
//
// NOT IN THE PACK. The pack's own permission matrix claimed a team delete
// "revoke[s] every role ... for every live member". It did not.
//
// `authz.has_permission`'s team branch joins users_on_teams and roles_on_teams
// but never joins `teams` itself, so `teams.deleted_at` was never consulted —
// and nothing cascaded the soft delete to the two pivots. A deleted group kept
// granting its roles to every member, indefinitely, with the group gone from
// every list in the UI. That is the worst shape a privilege bug can take: the
// evidence of it disappears from the interface while the grant persists.
//
// Fixed by `teams_cascade_revoke_on_delete_trg` (migration 20260907421000),
// which soft-deletes both pivots on the NULL -> NOT NULL transition of
// `teams.deleted_at`. SECURITY DEFINER deliberately — it is a system cascade,
// not a permission decision, so it must not be filtered by whatever RLS the
// deleting caller's own grants would satisfy on the pivots. A `teams:delete`
// holder without role-management would otherwise have the cascade match zero
// rows silently (an RLS-denied UPDATE returns rowCount 0; it does not raise)
// while the team row itself deleted successfully.
//
// This journey drives it through the real HTTP surface. The database-level
// proof, including the control that the cascade is scoped to the deleted team
// and does not blanket-revoke, is in
// qms/backend/api/tests/integration/groupsTeams/cascade-revoke-on-delete.test.js.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH, COMPANY_ID, USERS } from '../fixtures/cast.js'
import { sql, sqlValue } from '../fixtures/db.js'

const API = 'http://e2elab.localhost:4000'
const TEAM_ID = 'e2e9a000-0000-4000-8000-0000000000c1'
const NAME = 'E2E GJ3 Doomed Team'

/** A throwaway role-carrying team, built with the same role the seed already grants. */
function buildTeam() {
  const roleId = sqlValue(
    `SELECT role_id FROM roles_on_teams
      WHERE team_id = 'e2e3b000-0000-4000-8000-000000000001' AND deleted_at IS NULL LIMIT 1`,
  )
  sql(`DELETE FROM users_on_teams WHERE team_id = '${TEAM_ID}'`)
  sql(`DELETE FROM roles_on_teams WHERE team_id = '${TEAM_ID}'`)
  sql(`DELETE FROM teams WHERE id = '${TEAM_ID}'`)
  sql(`INSERT INTO teams (id, company_id, name, is_leadership, color, created_at, updated_at)
       VALUES ('${TEAM_ID}', '${COMPANY_ID}', '${NAME}', false, '#000000', NOW(), NOW())`)
  sql(`INSERT INTO users_on_teams (id, team_id, user_id, company_id, created_at, updated_at)
       VALUES (gen_random_uuid(), '${TEAM_ID}', '${USERS.teamJoiner.id}', '${COMPANY_ID}', NOW(), NOW())`)
  sql(`INSERT INTO roles_on_teams (id, team_id, role_id, company_id, created_at, updated_at)
       VALUES (gen_random_uuid(), '${TEAM_ID}', '${roleId}', '${COMPANY_ID}', NOW(), NOW())`)
  return roleId
}

function livePivots() {
  return {
    members: Number(
      sqlValue(
        `SELECT count(*) FROM users_on_teams WHERE team_id = '${TEAM_ID}' AND deleted_at IS NULL`,
      ),
    ),
    roles: Number(
      sqlValue(
        `SELECT count(*) FROM roles_on_teams WHERE team_id = '${TEAM_ID}' AND deleted_at IS NULL`,
      ),
    ),
  }
}

test.describe('GRP-J3 · deleting a group revokes the roles it granted', () => {
  test.beforeEach(buildTeam)
  test.afterAll(() => {
    sql(`DELETE FROM users_on_teams WHERE team_id = '${TEAM_ID}'`)
    sql(`DELETE FROM roles_on_teams WHERE team_id = '${TEAM_ID}'`)
    sql(`DELETE FROM teams WHERE id = '${TEAM_ID}'`)
  })

  test('PRECONDITION · the team starts with a live member and a live role', () => {
    expect(livePivots(), 'the fixture is a genuinely role-carrying team').toEqual({
      members: 1,
      roles: 1,
    })
  })

  test('🔴 deleting the group soft-deletes BOTH pivots', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: AUTH.owner })
    try {
      const res = await ctx.request.delete(`${API}/v1/services/teams/${TEAM_ID}`)
      expect([200, 204], 'the delete itself succeeds').toContain(res.status())
    } finally {
      await ctx.close()
    }

    expect(
      sqlValue(`SELECT coalesce(deleted_at::text,'') FROM teams WHERE id = '${TEAM_ID}'`),
      'the team is soft-deleted',
    ).not.toBe('')

    expect(
      livePivots(),
      'and neither pivot may still be granting anything',
    ).toEqual({ members: 0, roles: 0 })
  })

  test('CONTROL · an untouched team keeps its members and roles', async ({ browser }) => {
    // Proves the cascade is scoped to the deleted team rather than a blanket
    // revoke — the failure mode that would "pass" the test above while
    // destroying every other team's grants.
    const ctx = await browser.newContext({ storageState: AUTH.owner })
    try {
      await ctx.request.delete(`${API}/v1/services/teams/${TEAM_ID}`)
    } finally {
      await ctx.close()
    }

    const survivors = Number(
      sqlValue(
        `SELECT count(*) FROM roles_on_teams
          WHERE team_id = 'e2e3b000-0000-4000-8000-000000000001' AND deleted_at IS NULL`,
      ),
    )
    expect(survivors, 'the seeded role-carrying team is unaffected').toBeGreaterThan(0)
  })
})
