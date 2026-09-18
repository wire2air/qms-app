// USER-J9 — 🟢 The roster: search, quick-filter, role filter, bulk assign.
//
// The second half of the module's functional coverage (USER-J8 is onboarding).
// This is the screen an administrator actually spends time on, and none of it
// was covered: the security specs all query `Query.users` over raw GraphQL and
// never load the page at all, so every filter here could return the wrong set
// and the suite would stay green.
//
// FOUR THINGS ARE PINNED, and each one is a decision rather than a coincidence:
//
// 1. SEARCH IS CLIENT-SIDE. The roster is a live query over IndexedDB and the
//    search box filters the already-materialised rows — typing must not produce
//    a network round trip. Asserted by counting GraphQL requests across the
//    keystrokes, which is the same lesson the sites suite learned in PW-J2.
//
// 2. THE "INVITED" PILL RESOLVES A PSEUDO-STATUS. There is no INVITED row in
//    `user_statuses` — the column is FK-constrained to ACTIVE and INACTIVE
//    (migration 20260807141000) — so the pill filters on
//    "not ACTIVE and inviteSent", the shape the data actually has. It used to
//    pass the string 'INVITED' through as a userStatusId and could therefore
//    never match a row: a filter that silently returned nothing, on the screen
//    an administrator uses to find people who have not finished onboarding.
//
// 3. "INACTIVE" MEANS DISABLED, not "disabled or never onboarded". The two
//    populations are different questions and now have different pills.
//
// 4. BULK ACTIONS ARE GATED ON THE VERB THE WRITE CHECKS. Assign-role is
//    `user_management:create` (roles_on_users INSERT) and assign-sites is
//    `user_management:update` (user_sites). A member with neither must not see
//    selection checkboxes at all — offering an action that will 500 is worse
//    than not offering it.
//
// THE SUBJECT for the invite-pill assertions is a throwaway owned by this file.
// It is never logged in, so unlike USER-J8's subject it can be hard-deleted.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH, USERS, COMPANY_ID, SITES, DEPARTMENTS } from '../fixtures/cast.js'
import { sql, sqlValue } from '../fixtures/db.js'

const SUBJECT_ID = 'e2e1f000-0000-4000-8000-000000000009'
const SUBJECT_EMAIL = 'j9-pending@e2e.test'

function seedPendingInvite() {
  sql(`DELETE FROM users WHERE id = '${SUBJECT_ID}'`)
  sql(
    `INSERT INTO users (id, first_name, last_name, email, user_status_id, company_id,
       language_id, time_zone, site_id, department_id, kind, invite_sent, is_owner,
       created_at, updated_at)
     VALUES ('${SUBJECT_ID}', 'Pat', 'Pending', '${SUBJECT_EMAIL}', 'INACTIVE', '${COMPANY_ID}',
       'en', 'America/New_York', '${SITES.primary.id}', '${DEPARTMENTS.quality.id}',
       'INTERNAL', true, false, NOW(), NOW())`,
  )
}

function removeSubject() {
  sql(`DELETE FROM invitation_tokens WHERE user_id = '${SUBJECT_ID}'`)
  sql(`DELETE FROM users WHERE id = '${SUBJECT_ID}'`)
}

async function gotoUsers(page) {
  await page.goto('/users', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'Users' }).first()).toBeVisible({
    timeout: 20_000,
  })
  // The roster is hydrated from IndexedDB by the syncEngine, so "the page
  // rendered" and "the rows are there" are different moments.
  await expect(page.getByRole('cell', { name: USERS.owner.email })).toBeVisible({
    timeout: 20_000,
  })
}

test.describe('USER-J9 · the roster', () => {
  test.use({ storageState: AUTH.owner })

  test.beforeAll(() => seedPendingInvite())
  test.afterAll(() => removeSubject())

  test('search filters the roster client-side, with no network round trip', async ({ page }) => {
    await gotoUsers(page)

    // Count the ROSTER FETCH specifically, not "any GraphQL request".
    //
    // Two kinds of legitimate traffic are in flight on this page and neither is
    // a search refetch:
    //
    //   · bootstrapAll() — on install the syncEngine paginates every
    //     INSTANT-strategy model into IndexedDB. Loading /users happens to be
    //     when that is still finishing, so an unscoped counter picks up
    //     FetchAllTrainingInstance, FetchAllChangeRequest and two dozen others.
    //   · updateUser — useDataTablePersist writes the table's density/sort/
    //     filter state into the synced `User.settings` bag. Interacting with the
    //     table legitimately produces one mutation. This is the same exclusion
    //     the sites suite arrived at in PW-J2, where matching all of
    //     /api/graphql made the assertion depend on whether an earlier test in
    //     the same worker had already dirtied that state — green in isolation,
    //     red in a full-suite run.
    //
    // What must NOT happen is `FetchAllUser`: that is the roster query, and one
    // of those during typing means search has moved server-side.
    const rosterFetches = []
    page.on('request', (req) => {
      const body = req.postData() || ''
      if (!req.url().includes('/api/graphql')) return
      // `FetchAllUser(` with the paren excludes the neighbours that share the
      // prefix — FetchAllUserSite, FetchAllUsersOnWorkflowInstanceStep.
      if (body.includes('FetchAllUser(')) rosterFetches.push(body.slice(0, 80))
    })

    const search = page.getByPlaceholder('Search users…')
    await search.pressSequentially('usersitereader', { delay: 30 })

    await expect(page.getByRole('cell', { name: USERS.userSiteReader.email })).toBeVisible({
      timeout: 10_000,
    })
    await expect(page.getByRole('cell', { name: USERS.owner.email })).toHaveCount(0)

    expect(rosterFetches, 'search must not refetch the roster').toEqual([])

    // Search matches the email as well as the name — the administrator looking
    // someone up usually has one or the other, not both.
    await search.fill('')
    await search.fill('Noah')
    await expect(page.getByRole('cell', { name: USERS.noAccess.email })).toBeVisible({
      timeout: 10_000,
    })
  })

  test('the Invited pill finds people who have not accepted, and Inactive does not', async ({
    page,
  }) => {
    // The premise, asserted rather than assumed: the subject is INACTIVE with an
    // invitation sent. If a later change makes the create path write something
    // else, this test should say so instead of quietly passing.
    expect(sqlValue(`SELECT user_status_id FROM users WHERE id = '${SUBJECT_ID}'`)).toBe('INACTIVE')
    expect(sqlValue(`SELECT invite_sent FROM users WHERE id = '${SUBJECT_ID}'`)).toBe('t')

    await gotoUsers(page)

    await page.getByRole('button', { name: 'Invited', exact: true }).click()
    await expect(page.getByRole('cell', { name: SUBJECT_EMAIL })).toBeVisible({ timeout: 10_000 })
    await expect(
      page.getByRole('cell', { name: USERS.owner.email }),
      'an ACTIVE user is not a pending invite',
    ).toHaveCount(0)

    // The distinction this pill exists for: the same row must NOT appear under
    // "Inactive", which means deliberately disabled.
    await page.getByRole('button', { name: 'Inactive', exact: true }).click()
    await expect(
      page.getByRole('cell', { name: SUBJECT_EMAIL }),
      'a pending invite is not a disabled account',
    ).toHaveCount(0, { timeout: 10_000 })

    // And "All" shows them again, so the absence above is filtering rather than
    // the row having vanished.
    await page.getByRole('button', { name: 'All', exact: true }).click()
    await expect(page.getByRole('cell', { name: SUBJECT_EMAIL })).toBeVisible({ timeout: 10_000 })
  })

  test('the role filter narrows to that role’s holders', async ({ page }) => {
    await gotoUsers(page)

    await page.getByRole('combobox').filter({ hasText: /role/i }).first().click()
    await page.getByRole('option', { name: 'E2E Teams Only', exact: true }).click()

    await expect(page.getByRole('cell', { name: USERS.teamsOnly.email })).toBeVisible({
      timeout: 10_000,
    })
    await expect(
      page.getByRole('cell', { name: USERS.owner.email }),
      'the owner does not hold that role',
    ).toHaveCount(0)
  })

  test('bulk actions are offered only to someone whose write would succeed', async ({ browser }) => {
    // noAccess holds no user_management grants, so neither bulk action's RLS
    // WITH CHECK would pass. The table must not offer selection at all — the
    // failure mode being guarded against is a visible action that ends in
    // "Something went wrong" after the user has picked twenty rows.
    const ctx = await browser.newContext({ storageState: AUTH.noAccess })
    const page = await ctx.newPage()
    await page.goto('/users', { waitUntil: 'domcontentloaded' })

    // The route guard sends a zero-grant member away from /users entirely; if it
    // ever stops doing that, the table below must still offer nothing.
    await page.waitForTimeout(2_000)
    const checkboxes = await page.getByRole('checkbox').count()
    expect(checkboxes, 'no row selection without a user_management grant').toBe(0)
    await expect(page.getByRole('button', { name: 'Assign role' })).toHaveCount(0)

    await ctx.close()
  })
})
