// ROLE-J3 — 🛡 Escalation PATH B: the same promotion, reached sideways.
//
// Path A (ROLE-J2) is the obvious one: write `roles_on_users`. Path B is the
// reason that fix alone was not enough, and it is the more instructive of the
// two, because nothing about it looks like permission management:
//
//     persona: teams:update ("may edit teams")
//     INSERT INTO users_on_teams (self, <a role-carrying team>)  → INSERT 0 1
//     ... and authz.has_permission now resolves through
//         users_on_teams ⋈ roles_on_teams ⋈ role_module_permissions
//
// Same outcome as path A. No `roles_on_users` row is ever written, so a guard
// that watched only that table would report nothing. The tenant's authority
// model has TWO edges into a role, and the cycle-1 fix that closed one of them
// would have left the other wide open — "the migration finished the noun and not
// the verbs", as doc 20 puts it.
//
// THE FIX IS CONDITIONAL, AND THAT IS THE HARD PART. Joining a team needs
// `teams:update` alone UNLESS the team confers roles, in which case it also
// needs `role_permission_management:update`. Widening the gate unconditionally
// would have broken ordinary team administration — a directory grouping that
// carries no roles is not a permission-management act, and treating it as one
// makes every tenant's team admin useless for no security gain.
//
// So the interesting assertions here are the CONTROLS. A suite that only proved
// "the role-carrying team is refused" cannot tell a working conditional from a
// blanket denial, and a blanket denial is a regression that would ship green.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH, USERS, ROLES, TEAMS, COMPANY_ID, PRIZE_CAPABILITY } from '../fixtures/cast.js'
import { graphql, expectMutationExists } from '../fixtures/sites.js'
import { sqlValue } from '../fixtures/db.js'
import {
  membershipCount,
  hasCapabilityInDb,
  canJoinTeamInDb,
  restoreRolesFixtures,
  withBorrowedRole,
  writeSql,
} from '../fixtures/roles.js'

const CREATE_USER_ON_TEAM = `
  mutation Join($input: CreateUsersOnTeamInput!) {
    createUsersOnTeam(input: $input) { usersOnTeam { id userId teamId } }
  }`

function joinInput(userId, teamId) {
  const now = new Date().toISOString()
  return {
    input: { usersOnTeam: { userId, teamId, companyId: COMPANY_ID, createdAt: now, updatedAt: now } },
  }
}

/** Attempt the join through the app's own write path. True = refused. */
async function refused(ctx, userId, teamId) {
  const { errors } = await graphql(ctx, CREATE_USER_ON_TEAM, joinInput(userId, teamId))
  return errors !== null && errors !== undefined
}

test.describe('ROLE-J3 · joining a team is not a way to grant yourself a role', () => {
  test.beforeEach(() => restoreRolesFixtures())
  test.afterAll(() => restoreRolesFixtures())

  test('PRECONDITION · one team carries a role, one does not, and the actor holds only teams', async ({
    browser,
  }) => {
    const perms = sqlValue(
      `SELECT array_to_string(authz.effective_permission_strings('${USERS.teamJoiner.id}', '${COMPANY_ID}'), ' ')`,
    )
    expect(perms, 'the actor can administer teams').toContain('teams:update')
    expect(perms, 'and holds NO permission-management grant — the premise').not.toContain(
      'role_permission_management',
    )

    // The two teams differ in exactly one respect. If that stops being true the
    // conditional below is untestable, so assert it rather than assume the seed.
    expect(
      sqlValue(`SELECT count(*) FROM roles_on_teams
                 WHERE team_id = '${TEAMS.roleCarrying.id}' AND deleted_at IS NULL`),
      'the role-carrying team really carries a live role grant',
    ).toBe('1')
    expect(
      sqlValue(`SELECT count(*) FROM roles_on_teams
                 WHERE team_id = '${TEAMS.plain.id}' AND deleted_at IS NULL`),
      'the plain team carries none',
    ).toBe('0')
    expect(
      sqlValue(`SELECT role_id FROM roles_on_teams WHERE team_id = '${TEAMS.roleCarrying.id}'`),
      'and the role it carries is the prize',
    ).toBe(ROLES.prize.id)

    const ctx = await browser.newContext({ storageState: AUTH.teamJoiner })
    await expectMutationExists(ctx, 'createUsersOnTeam')
    await ctx.close()
  })

  test('🛡 teams:update cannot join a team that carries a role', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: AUTH.teamJoiner })
    try {
      expect(
        await refused(ctx, USERS.teamJoiner.id, TEAMS.roleCarrying.id),
        'self-join of a role-carrying team must be refused',
      ).toBe(true)
      expect(membershipCount(USERS.teamJoiner.id, TEAMS.roleCarrying.id), 'no row written').toBe(0)
    } finally {
      await ctx.close()
    }
  })

  test('🛡 END-TO-END · the capability is not inherited through the team edge', async ({
    browser,
  }) => {
    // The assertion that makes path B mean something. `has_permission` resolves
    // through users_on_teams ⋈ roles_on_teams, so this is the query that would
    // have flipped false→true before the fix.
    const attacker = { id: USERS.teamJoiner.id, companyId: COMPANY_ID }
    expect(
      hasCapabilityInDb(attacker, PRIZE_CAPABILITY.module, PRIZE_CAPABILITY.action),
      'before',
    ).toBe(false)

    const ctx = await browser.newContext({ storageState: AUTH.teamJoiner })
    expect(await refused(ctx, USERS.teamJoiner.id, TEAMS.roleCarrying.id)).toBe(true)
    await ctx.close()

    expect(
      hasCapabilityInDb(attacker, PRIZE_CAPABILITY.module, PRIZE_CAPABILITY.action),
      'after — the team edge did not move the attacker\'s authority',
    ).toBe(false)
  })

  test('🛡 nor by adding somebody else to the role-carrying team', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: AUTH.teamJoiner })
    try {
      expect(await refused(ctx, USERS.noAccess.id, TEAMS.roleCarrying.id), 'third party').toBe(true)
      expect(membershipCount(USERS.noAccess.id, TEAMS.roleCarrying.id)).toBe(0)
    } finally {
      await ctx.close()
    }
  })

  test('CONTROL · ordinary team administration still works — the plain team joins', async ({
    browser,
  }) => {
    // THE most important test in this file. The conditional exists so that this
    // keeps working; a blanket denial would satisfy every assertion above and be
    // a serious regression. Same actor, same permission, same mutation — only
    // the team's role-carrying status differs.
    const ctx = await browser.newContext({ storageState: AUTH.teamJoiner })
    try {
      expect(
        await refused(ctx, USERS.teamJoiner.id, TEAMS.plain.id),
        'joining a role-LESS team is directory work and must still succeed',
      ).toBe(false)
      expect(membershipCount(USERS.teamJoiner.id, TEAMS.plain.id), 'the row is really there').toBe(1)
    } finally {
      await ctx.close()
    }
  })

  test('CONTROL · revoking a team\'s role grant re-opens membership', async ({ browser }) => {
    // The gate is conditional on a LIVE role grant (`rt.deleted_at IS NULL`). If
    // it keyed on the row's existence instead, revoking a team's role would
    // permanently freeze its membership — a team could never be demoted back to
    // an ordinary group. This is the boundary between the two controls.
    const ctx = await browser.newContext({ storageState: AUTH.teamJoiner })
    try {
      expect(
        await refused(ctx, USERS.teamJoiner.id, TEAMS.roleCarrying.id),
        'refused while the team carries a role',
      ).toBe(true)

      writeSql(
        `UPDATE roles_on_teams SET deleted_at = NOW() WHERE team_id = '${TEAMS.roleCarrying.id}'`,
      )

      expect(
        await refused(ctx, USERS.teamJoiner.id, TEAMS.roleCarrying.id),
        'permitted once the role grant is soft-deleted — the team is an ordinary group again',
      ).toBe(false)
      expect(membershipCount(USERS.teamJoiner.id, TEAMS.roleCarrying.id)).toBe(1)
    } finally {
      await ctx.close()
      restoreRolesFixtures()
    }
  })

  test('CONTROL · adding rpm:update to a team admin unlocks the role-carrying team', async () => {
    // The positive half of the conditional, and the one that names what the gate
    // actually says. The clause is an AND, not an OR:
    //
    //     teams:update  AND  (the team carries no role  OR  rpm:update)
    //
    // so the persona who may join a role-carrying team is not "an rpm holder"
    // but "a team administrator who ALSO holds rpm:update". roleAdmin holds no
    // `teams` grant at all and is correctly refused — asserting otherwise would
    // be asserting the gate is an OR, which is the loosening this whole file
    // exists to prevent.
    //
    // Built by BORROWING rather than by seeding a fifth persona, so the same
    // actor is observed refused and then permitted. That makes the grant the
    // demonstrated cause, which a static persona could never show.
    const joiner = { id: USERS.teamJoiner.id, companyId: COMPANY_ID }

    expect(
      canJoinTeamInDb(joiner, TEAMS.roleCarrying.id),
      'before: teams:update alone is refused',
    ).toBe(false)

    withBorrowedRole(USERS.teamJoiner.id, ROLES.roleAdmin.id, () => {
      expect(
        canJoinTeamInDb(joiner, TEAMS.roleCarrying.id),
        'after: teams:update + role_permission_management:update is permitted',
      ).toBe(true)
      // The other half of the AND is still required — the borrowed role does not
      // make an rpm holder into a team administrator.
      expect(
        canJoinTeamInDb({ id: USERS.roleAdmin.id, companyId: COMPANY_ID }, TEAMS.roleCarrying.id),
        'rpm:update WITHOUT teams:update is still refused — the clause is an AND',
      ).toBe(false)
    })

    expect(
      canJoinTeamInDb(joiner, TEAMS.roleCarrying.id),
      'and the borrow is fully reverted',
    ).toBe(false)
  })
})
