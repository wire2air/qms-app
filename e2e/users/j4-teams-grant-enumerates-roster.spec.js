// USER-J4 — 🔴 A `teams` grant is a user-directory grant. WRITTEN TO FAIL.
//
// Two mechanisms compose into a leak neither one intends.
//
// 1. `users_sel`'s extra_read branch (migration 20260709122100) is:
//
//      users.id = authz.current_user_id()
//      OR authz.has_permission('role_permission_management','read')
//      OR authz.has_permission('teams','read')
//
//    That is deliberate — it keeps user pickers and cross-feature name display
//    working for anyone who can read roles or teams.
//
// 2. `authz.has_permission(p_module, p_action)` ends with:
//
//      AND (rmp.action_id = p_action OR p_action = 'read')
//
//    When the requested action is 'read', the action column stops being
//    compared at all. ANY grant on the module satisfies it.
//
// Composed: `teams:create` — a grant about creating teams, which says nothing
// about seeing people — satisfies has_permission('teams','read'), which
// satisfies users_sel, which returns the entire staff roster over GraphQL.
//
// The grantee never asked for it and no admin ever ticked a user_management
// box. This is the read-fallback documented in the authz gotchas meeting the
// broad-read branch, and it is why `teams:create` is the persona here rather
// than `teams:read` — with :read the leak would be arguable as intended.
//
// The first assertion FAILS TODAY. The control PASSES and isolates the cause:
// a member with no grants at all sees only themselves, so it is the extra_read
// branch admitting teamsOnly, not company scope or an absent policy.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH, USERS } from '../fixtures/cast.js'
import { graphql } from '../fixtures/sites.js'

// PostGraphile runs with simple inflection here, so the roster connection is
// `users`, not `allUsers`. Getting that wrong is not a harmless typo: a bad
// field name errors, and an errors-only assertion would read the error as
// "refused" and go green while probing nothing. The explicit errors check below
// is what turns schema drift into a loud failure — it caught exactly this while
// this file was being written.
const ROSTER = `query { users { nodes { id email } } }`

async function rosterFor(browser, storageState) {
  const ctx = await browser.newContext({ storageState })
  const { body, errors } = await graphql(ctx, ROSTER)
  await ctx.close()
  expect(errors, 'Query.users must resolve — otherwise this probe is vacuous').toBeNull()
  return body.data.users.nodes.map((n) => n.email)
}

test.describe('USER-J4 · a teams grant enumerates the user roster', () => {
  test('🔴 teams:create does not admit the staff directory (FAILS TODAY)', async ({ browser }) => {
    const roster = await rosterFor(browser, AUTH.teamsOnly)

    // teamsOnly holds `teams:create` and nothing else. They should see
    // themselves (users_sel's self branch) and no one else.
    expect(
      roster.filter((e) => e !== USERS.teamsOnly.email),
      'a teams grant must not return other people',
    ).toEqual([])
  })

  test('🔴 and the leak includes addresses usable against credential reset (FAILS TODAY)', async ({
    browser,
  }) => {
    // Naming the consequence rather than just the count: what comes back is
    // every colleague's email address, which is the input the Security Center's
    // password-reset and MFA-reset flows are keyed on.
    const roster = await rosterFor(browser, AUTH.teamsOnly)
    expect(roster, 'the company owner must not be enumerable').not.toContain(USERS.owner.email)
  })

  test('CONTROL · a member with no grants at all sees only themselves (must pass today)', async ({
    browser,
  }) => {
    // This is what isolates the finding. noAccess differs from teamsOnly by
    // exactly one row in role_module_permissions — a row about TEAMS. If
    // noAccess is correctly limited to self, then that one teams row is what
    // opened the roster, and neither company scope nor a missing policy is.
    const roster = await rosterFor(browser, AUTH.noAccess)
    expect(roster, 'the self branch admits exactly one row').toEqual([USERS.noAccess.email])
  })
})
