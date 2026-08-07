// USER-J5 — a site-scoped `user_management:read` grant is evaluated per site.
//
// ✅ RESOLVED 2026-08-04 by migration 20260804120000-bind-site-scope-org-modules,
// which set user_management's site_col from NULL to 'site_id'. Everything below
// describes what the defect WAS — read it as history. The assertions now pin the
// fixed behaviour and stand as the regression guard.
//
// HISTORY: 🔴 A site-scoped `user_management:read` grant returns nothing.
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
import { AUTH, USERS, SITES, SUPPLIER_USER } from '../fixtures/cast.js'
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

  test('the grantee sees the other people at their own site', async ({ browser }) => {
    const roster = await rosterFor(browser, AUTH.userSiteReader)
    expect(
      roster.map((n) => n.email),
      'a site-scoped user_management:read must return that site’s roster',
    ).toContain(USERS.teamsOnly.email)
  })

  test('the grantee does not see the other site’s people', async ({ browser }) => {
    // HISTORY: while site_col was NULL this was green for the WRONG reason —
    // the grantee saw almost nobody at all, so read with the test above it said
    // "under-returning", not "correctly filtered". It was kept precisely so
    // that when the binding was fixed (migration 20260804120000) both halves
    // were already pinned. It now means what it says.
    const roster = await rosterFor(browser, AUTH.userSiteReader)
    expect(
      roster.map((n) => n.email),
      'the Primary-site owner is not at this grantee’s site',
    ).not.toContain(USERS.owner.email)
  })

  test('the roster is EXACTLY their own site — no more, no less', async ({ browser }) => {
    // HISTORY: until migration 20260804120000 this pinned the DEFECT — the
    // roster was [userSiteReader] alone, because site_col = NULL meant the site
    // grant contributed nothing and only users_sel's self branch admitted a
    // row. It was written to go RED the day the binding was fixed; that day has
    // come.
    //
    // Retargeted at the FIXED set rather than deleted, because an exact-set
    // assertion is the only one here that catches a regression in BOTH
    // directions — the two tests above catch under- and over-returning one at a
    // time, and neither would notice a third site's user appearing.
    //
    // "Their own site" INCLUDES the org-wide accounts. Migration 20260805130000
    // admits `site_id IS NULL` rows to every caller, deliberately: an
    // unplaced user belongs to no site and must not vanish from the pickers of
    // every site. `supplier` is the seed's one such row, and it is the reason
    // this assertion is three emails rather than two — an earlier version
    // listed only the two Secondary-site people and went red the day that
    // migration landed.
    //
    // Sorted on both sides: `Query.users` promises no ordering, and the old
    // one-element form never exercised that.
    const roster = await rosterFor(browser, AUTH.userSiteReader)
    expect(
      roster.map((n) => n.email).sort(),
      'a site-scoped user_management:read returns that site’s roster plus org-wide, and nothing else',
    ).toEqual(
      [SUPPLIER_USER.email, USERS.teamsOnly.email, USERS.userSiteReader.email].sort(),
    )
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
