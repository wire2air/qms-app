// USER-J4 — 🔴→✅ A `teams` grant is no longer a user-directory grant.
// FIXED 2026-08-07. (Filename kept for traceability with the pack's journey id.)
//
// WHAT WAS WRONG. Two mechanisms composed into a leak neither one intended.
//
// 1. `users_sel`'s extra_read branch (migration 20260709122100) carried:
//
//      OR authz.has_permission('role_permission_management','read')
//      OR authz.has_permission('teams','read')
//
//    Deliberate at the time — it kept user pickers and cross-feature name
//    display working for anyone who could read roles or teams.
//
// 2. `authz.has_permission(p_module, p_action)` ends with:
//
//      AND (rmp.action_id = p_action OR p_action = 'read')
//
//    When the requested action is 'read', the action column stops being
//    compared at all. ANY grant on the module satisfies it.
//
// Composed: `teams:create` — a grant about creating teams, which says nothing
// about seeing people — satisfied has_permission('teams','read'), which
// satisfied users_sel, which returned the entire staff roster. The grantee
// never asked for it and no admin ever ticked a user_management box.
//
// THE FIX (migration 20260807140000) drops both branches. What they existed for
// is already covered: migration 20260805130000 made the directory follow site
// visibility, so every caller reads themselves, org-wide users, and anyone
// sharing one of their sites — which is what a people-picker needs. The
// branches only ever widened that from "my sites" to "the whole company".
//
// NOT fixed here: has_permission's `OR p_action = 'read'` fallback itself. It
// is a schema-wide predicate every module's policy calls, and changing it is an
// authz-wide change with its own regression pass. Dropping the two branches
// removes THIS module's exposure to it.
//
// WHAT THESE TESTS NOW PIN. The seed places teamsOnly and userSiteReader at the
// SECONDARY site and everyone else at PRIMARY, with `supplier` org-wide
// (site_id IS NULL) — so "site visibility" and "the whole company" are
// different sets here, and a regression in either direction is visible.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH, USERS, SUPPLIER_USER } from '../fixtures/cast.js'
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

test.describe('USER-J4 · a teams grant does not enumerate the user roster', () => {
  test('✅ teams:create does not admit the staff directory', async ({ browser }) => {
    const roster = await rosterFor(browser, AUTH.teamsOnly)

    // teamsOnly holds `teams:create` and nothing else, and lives at the
    // Secondary site. Exact set, because Secondary is a deliberately
    // two-person site: themselves, their one site colleague, and the org-wide
    // supplier account that every caller can see. Anything else appearing here
    // means a branch has been widened back.
    expect(
      roster.sort(),
      'a teams grant contributes nothing beyond site visibility',
    ).toEqual([SUPPLIER_USER.email, USERS.teamsOnly.email, USERS.userSiteReader.email].sort())
  })

  test('✅ and the addresses usable against credential reset stay out of reach', async ({
    browser,
  }) => {
    // Naming the consequence rather than just the count: what used to come back
    // was every colleague's email address, which is the input the Security
    // Center's password-reset and MFA-reset flows are keyed on.
    const roster = await rosterFor(browser, AUTH.teamsOnly)
    expect(roster, 'the company owner must not be enumerable').not.toContain(USERS.owner.email)
  })

  test('CONTROL · the site-visibility baseline is what is doing the work', async ({ browser }) => {
    // noAccess holds NO grants at all and differs from teamsOnly by exactly one
    // row in role_module_permissions — a row about TEAMS. If the two see rosters
    // of the same SHAPE (own site + org-wide) and differing only by which site
    // they stand in, then the teams row contributes nothing, which is the whole
    // claim of this file.
    //
    // Asserted as properties rather than an exact set: noAccess is at Primary,
    // where most of the cast lives and where any new persona lands, so an exact
    // list here would go red every time an unrelated suite adds a fixture.
    const roster = await rosterFor(browser, AUTH.noAccess)

    expect(roster, 'their own row').toContain(USERS.noAccess.email)
    expect(roster, 'a colleague at the same site').toContain(USERS.owner.email)
    expect(roster, 'the org-wide account').toContain(SUPPLIER_USER.email)
    expect(roster, 'nobody from the other site').not.toContain(USERS.teamsOnly.email)
    expect(roster, 'nobody from the other site').not.toContain(USERS.userSiteReader.email)
  })
})
