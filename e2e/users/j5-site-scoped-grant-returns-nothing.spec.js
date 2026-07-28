// USER-J5 — 🔴 A site-scoped `user_management:read` grant returns nothing.
// WRITTEN TO FAIL. Fourth table with the same defect.
//
// `authz.scope_allowed(module, action, p_owner, p_dept, p_site)` decides by
// comparing the GRANT's rank against row values passed in by the policy:
//
//   RETURN (v_rank >= 4)                                      -- tenant
//       OR (v_rank >= 3 AND p_site  IS NOT NULL AND p_site  = v_usite)
//       OR (v_rank >= 2 AND p_dept  IS NOT NULL AND p_dept  = v_udept)
//       OR (v_rank >= 1 AND p_owner IS NOT NULL AND p_owner = v_user);
//
// Which row values get passed comes from `authz.module_table_bindings`. The
// `user_management` binding (migration 20260709122100) is
// owner_col/dept_col/site_col = NULL, NULL, NULL — so `authz.apply_module_rls`
// generates the policy with three literal NULLs, and every branch below the
// first is unreachable. The expression collapses to `rank >= 4`.
//
// A site-scoped grant is rank 3. It saves without complaint, shows in the role
// editor as a real permission, and matches zero rows. Same silent failure as
// `sites` (PW-J10) and `departments` — this is the fourth table.
//
// THE WRINKLE that makes this journey different from PW-J10, and why the
// assertions are shaped the way they are: `users_sel` also carries an
// extra_read branch admitting you to YOUR OWN row unconditionally. So the
// grantee is never left with an empty list — they see exactly themselves. An
// assertion of "they see nothing" would fail for the wrong reason, and an
// assertion of "they see their own site" would pass for the wrong reason if
// they were the only person at it. Hence userSiteReader and teamsOnly are BOTH
// seeded at the Secondary site: the meaningful claim is "my site's OTHER people
// are visible, and the other site's people are not".
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH, USERS, SITES } from '../fixtures/cast.js'
import { graphql } from '../fixtures/sites.js'
import { sqlValue } from '../fixtures/db.js'

const ROSTER = `query { users { nodes { id email siteId } } }`

async function rosterFor(browser, storageState) {
  const ctx = await browser.newContext({ storageState })
  const { body, errors } = await graphql(ctx, ROSTER)
  await ctx.close()
  expect(errors, 'Query.users must resolve — otherwise this probe is vacuous').toBeNull()
  return body.data.users.nodes
}

test.describe('USER-J5 · a site-scoped user grant is not evaluated per site', () => {
  test('PRECONDITION · the grant is real, site-scoped, and both actors share a site', () => {
    expect(
      sqlValue(`SELECT rmp.scope_id FROM authz.role_module_permissions rmp
                JOIN roles_on_users ru ON ru.role_id = rmp.role_id
                WHERE ru.user_id = '${USERS.userSiteReader.id}' AND rmp.module_id = 'user_management'`),
      'userSiteReader holds user_management:read at SITE scope',
    ).toBe('site')

    // If these two ever drift apart, the positive assertion below stops meaning
    // anything — it would be asserting across sites, not within one.
    expect(sqlValue(`SELECT site_id FROM users WHERE id = '${USERS.userSiteReader.id}'`)).toBe(
      SITES.secondary.id,
    )
    expect(sqlValue(`SELECT site_id FROM users WHERE id = '${USERS.teamsOnly.id}'`)).toBe(
      SITES.secondary.id,
    )
  })

  test('🔴 the grantee sees the other people at their own site (FAILS TODAY)', async ({
    browser,
  }) => {
    const roster = await rosterFor(browser, AUTH.userSiteReader)
    expect(
      roster.map((n) => n.email),
      'a site-scoped user_management:read must return that site’s roster',
    ).toContain(USERS.teamsOnly.email)
  })

  test('the grantee does not see the other site’s people (passes — but vacuously)', async ({
    browser,
  }) => {
    // Deliberately recorded as a near-miss rather than a win. This assertion is
    // green, but not because scoping works — it is green because the grantee
    // sees almost nobody at all. Read together with the test above it says
    // "under-returning", not "correctly filtered". Kept so that the day the
    // binding is fixed, BOTH halves are already pinned and a regression to
    // over-returning is caught.
    const roster = await rosterFor(browser, AUTH.userSiteReader)
    expect(
      roster.map((n) => n.email),
      'the Primary-site owner is not at this grantee’s site',
    ).not.toContain(USERS.owner.email)
  })

  test('🔴 and what they actually get is only themselves (FAILS the day it is fixed)', async ({
    browser,
  }) => {
    // Pins the CURRENT behaviour precisely, so the defect has an exact
    // description rather than "returns too little". This test is written to go
    // RED when the binding is fixed — that is the signal to delete it and keep
    // the two above.
    const roster = await rosterFor(browser, AUTH.userSiteReader)
    expect(
      roster.map((n) => n.email),
      'today the site grant contributes nothing; only users_sel’s self branch does',
    ).toEqual([USERS.userSiteReader.email])
  })

  test('CONTROL · the same grant at TENANT scope does work (must pass today)', async ({
    browser,
  }) => {
    // Isolates the finding to the scope tier. The E2E Author role holds
    // user_management:read at tenant (rank 4), which clears `rank >= 4` — so
    // the module, the policy and the seed are all fine, and it is specifically
    // the sub-tenant scopes that evaluate to nothing.
    const roster = await rosterFor(browser, AUTH.author)
    expect(roster.length, 'a tenant-scoped grant returns the whole roster').toBeGreaterThan(5)
    expect(roster.map((n) => n.email)).toContain(USERS.owner.email)
  })
})
