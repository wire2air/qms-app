// GRP-J4 — The working baseline: the route guard, own-membership visibility,
// and tenant isolation. GREEN-EXPECTED.
//
// Everything the module gets right, asserted so that fixes for J1–J3 cannot
// quietly break it. Two of these are load-bearing rather than decorative:
//
//  * OWN-MEMBERSHIP READ. `teams`' binding gained an `extra_read_sql` branch
//    this cycle so a user can always see the teams they belong to, with no
//    teams:read grant — the same shape as the departments picker baseline. If
//    a future policy regeneration drops it, every "my teams" surface empties
//    for ordinary users and the symptom appears days later, far from the cause.
//  * TENANT ISOLATION. `users_on_teams` and `roles_on_teams` gained composite
//    foreign keys this cycle, so a team cannot hold a foreign role or a foreign
//    member. That is enforced at the storage layer; this asserts the ordinary
//    consequence a person would notice.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH, ALT_BASE_URL, COMPANY_ID, TEAMS, USERS } from '../fixtures/cast.js'
import { sql, sqlValue } from '../fixtures/db.js'

async function gotoGroups(page) {
  await page.goto('/groups', { waitUntil: 'domcontentloaded' })
}

test.describe('GRP-J4 · guard, own-membership visibility and isolation', () => {
  test('a user with no teams grant is redirected off /groups', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: AUTH.noAccess })
    const page = await ctx.newPage()
    await gotoGroups(page)
    await expect(page).toHaveURL(/\/no-access/, { timeout: 20_000 })
    await ctx.close()
  })

  test('a teams:read holder reaches the page', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: AUTH.teamJoiner })
    const page = await ctx.newPage()
    await gotoGroups(page)
    await expect(page).not.toHaveURL(/\/no-access/, { timeout: 20_000 })
    await ctx.close()
  })

  test('MECHANISM · the own-membership read branch is on the live policy', () => {
    // Pinned as text because the branch is invisible in behaviour for anyone
    // who also holds teams:read — which is most personas — so a behavioural
    // assertion alone would keep passing after the branch was dropped.
    // `replace(..., chr(10), ' ')` is not cosmetic: sqlValue() hands back only
    // the FIRST LINE of psql's output, and a policy expression this long wraps
    // — `users_on_teams` lands on line 2, so the unflattened query returns a
    // prefix that never contains the string being asserted, and the test fails
    // while the branch is present and working.
    const qual = sqlValue(
      `SELECT replace(pg_get_expr(polqual, polrelid), chr(10), ' ') FROM pg_policy p
         JOIN pg_class c ON c.oid = p.polrelid
        WHERE c.relname = 'teams' AND p.polcmd = 'r'`,
    )
    expect(qual, 'teams_sel must keep its own-membership branch').toContain('users_on_teams')
  })

  test('MECHANISM · both pivots are sealed to their own company', () => {
    // The composite foreign keys added this cycle. Asserted on the definition
    // rather than by counting constraints: a single-column FK also counts as
    // one, and a single-column FK is precisely the defect.
    const defs = sqlValue(
      `SELECT string_agg(pg_get_constraintdef(oid), ' | ' ORDER BY conname)
         FROM pg_constraint
        WHERE conrelid IN ('users_on_teams'::regclass, 'roles_on_teams'::regclass)
          AND contype = 'f'`,
    )
    expect(defs, 'a team member must be sealed to the team’s company').toContain('company_id)')
  })

  test('a tenant sees its own groups and no others', async ({ browser }) => {
    const own = await browser.newContext({ storageState: AUTH.owner })
    const p1 = await own.newPage()
    await gotoGroups(p1)
    await expect(p1.getByText(TEAMS.roleCarrying.name).first()).toBeVisible({ timeout: 20_000 })
    await own.close()

    const alt = await browser.newContext({ storageState: AUTH.altOwner, baseURL: ALT_BASE_URL })
    const p2 = await alt.newPage()
    await gotoGroups(p2)
    await expect(p2.getByText(TEAMS.roleCarrying.name)).toHaveCount(0)
    await alt.close()
  })

  test('MECHANISM · the seeded teams belong to this tenant only', () => {
    expect(
      sqlValue(
        `SELECT count(*) FROM teams
          WHERE id IN ('${TEAMS.roleCarrying.id}', '${TEAMS.plain.id}')
            AND company_id = '${COMPANY_ID}'`,
      ),
      'both fixtures are this tenant’s',
    ).toBe('2')
  })
})
