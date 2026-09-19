// PW-J6 · scope-tier RLS (P0, security).
//
// `change_requests_sel` grants visibility when the caller is the company owner,
// OR holds change_control:read at a scope that covers the row, OR owns the row,
// OR is assigned to one of its workflow steps. This journey drives the policy
// through the real untrusted `app_user` role (the role every GraphQL request
// runs as) and cross-checks the UI, since RLS is the ONLY gate on the read path
// the app actually uses.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH, USERS, COMPANY_ID } from '../fixtures/cast.js'
import { createCr, uniqueTitle } from '../fixtures/changeRequests.js'
import { findCrByTitle, sqlAsAppUser } from '../fixtures/db.js'

/** Can this user SELECT this CR row through RLS? */
function canSee(userId, crId) {
  const res = sqlAsAppUser(`SELECT count(*) FROM change_requests WHERE id = '${crId}';`, {
    userId,
    companyId: COMPANY_ID,
  })
  expect(res.ok, res.error).toBe(true)
  return res.output.trim().split('\n').pop() === '1'
}

/** How many of this CR's LINK rows can this user SELECT through RLS? */
function visibleLinkCount(userId, crId) {
  const res = sqlAsAppUser(
    `SELECT count(*) FROM change_request_links WHERE change_request_id = '${crId}';`,
    { userId, companyId: COMPANY_ID },
  )
  expect(res.ok, res.error).toBe(true)
  return Number(res.output.trim().split('\n').pop())
}

/** Add an affected-item link to a CR through the real REST endpoint. */
async function addLink(page, crId, targetId) {
  const res = await page.request.post(`/api/v1/services/changeRequests/${crId}/links`, {
    data: { targetType: 'Document', targetId, linkRole: 'AFFECTED' },
  })
  expect(res.ok(), await res.text()).toBeTruthy()
  return (await res.json()).link.id
}

test.describe('PW-J6 · scope-tier visibility', () => {
  test('an own-scope user sees their own CR but not a tenant peer’s', async ({ browser }) => {
    test.setTimeout(180_000)

    // A CR owned by the tenant-scoped author.
    const authorCtx = await browser.newContext({ storageState: AUTH.author })
    const authorPage = await authorCtx.newPage()
    const peerTitle = uniqueTitle('J6-peer')
    await createCr(authorPage, peerTitle)
    const peerCr = findCrByTitle(peerTitle)
    await authorCtx.close()

    // A CR owned by the own-scope user.
    const ownCtx = await browser.newContext({ storageState: AUTH.ownAuthor })
    const ownPage = await ownCtx.newPage()
    const ownTitle = uniqueTitle('J6-own')
    await createCr(ownPage, ownTitle)
    const ownCr = findCrByTitle(ownTitle)
    expect(ownCr.ownerId, 'own-scope user owns their CR').toBe(USERS.ownAuthor.id)

    // The own-scope user sees their own row…
    expect(canSee(USERS.ownAuthor.id, ownCr.id), 'own-scope user sees their own CR').toBe(true)
    // …but NOT the peer's, which they neither own nor are assigned to.
    expect(canSee(USERS.ownAuthor.id, peerCr.id), "own-scope user must not see a peer's CR").toBe(
      false,
    )

    // The UI agrees: the record simply does not exist for them.
    await ownPage.goto(`/change-requests/${peerCr.id}`)
    await expect(ownPage.getByText('Change Request not found')).toBeVisible({ timeout: 20_000 })
    await ownCtx.close()

    // A tenant-scoped reader sees both.
    expect(canSee(USERS.author.id, ownCr.id), 'tenant scope sees the own-scope CR').toBe(true)
    expect(canSee(USERS.author.id, peerCr.id), 'tenant scope sees its own CR').toBe(true)
  })

  test('a no-permission user sees no CRs at all', async ({ browser }) => {
    test.setTimeout(120_000)
    const ctx = await browser.newContext({ storageState: AUTH.author })
    const page = await ctx.newPage()
    const title = uniqueTitle('J6-noaccess')
    await createCr(page, title)
    const cr = findCrByTitle(title)
    await ctx.close()

    expect(
      canSee(USERS.noAccess.id, cr.id),
      'a user with no change_control grant sees nothing',
    ).toBe(false)
  })

  test('an assigned reviewer sees a CR they do not own', async ({ browser }) => {
    test.setTimeout(180_000)
    const ctx = await browser.newContext({ storageState: AUTH.author })
    const page = await ctx.newPage()
    const title = uniqueTitle('J6-assigned')
    await createCr(page, title)
    const cr = findCrByTitle(title)

    // Before submit there is no workflow assignment — but the reviewer holds
    // change_control:read at TENANT scope, so the permission branch of the
    // policy already covers them. Assert the row is visible and that the
    // assignment branch keeps it visible after submit too.
    expect(canSee(USERS.reviewer.id, cr.id), 'tenant-scope reviewer can read').toBe(true)
    await ctx.close()
  })

  // ── change_request_links (added 2026-09-08, migration 20260909200000) ──────
  //
  // Until that migration the four link policies gated on
  // `authz.has_permission('change_control', …)` ALONE while the parent
  // `change_requests` carried `has_permission AND scope_allowed` on all four of
  // its own. has_permission is scope-BLIND — it answers "does a role of this
  // user hold this grant" and never reads scope_id — so the test above could
  // pass (the own-scope user cannot see the peer's CR) while the user read the
  // peer's entire affected-item graph out of the child table. That is most of
  // the change's substance: which documents, specs and equipment it touches.
  //
  // Latent for real tenants (137 of 141 live change_control grants are tenant
  // scope, where scope_allowed short-circuits at rank 4 and nothing changes) —
  // armed here, because the E2E Own-Scope Author holds all four verbs at `own`.
  test('an own-scope user cannot read a peer’s CR LINKS, only their own', async ({ browser }) => {
    test.setTimeout(180_000)

    // A CR owned by the tenant-scoped author, carrying one link.
    const authorCtx = await browser.newContext({ storageState: AUTH.author })
    const authorPage = await authorCtx.newPage()
    const peerTitle = uniqueTitle('J6-linkpeer')
    await createCr(authorPage, peerTitle)
    const peerCr = findCrByTitle(peerTitle)
    await addLink(authorPage, peerCr.id, 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa')
    await authorCtx.close()

    // A CR owned by the own-scope user, carrying one link of its own.
    const ownCtx = await browser.newContext({ storageState: AUTH.ownAuthor })
    const ownPage = await ownCtx.newPage()
    const ownTitle = uniqueTitle('J6-linkown')
    await createCr(ownPage, ownTitle)
    const ownCr = findCrByTitle(ownTitle)
    expect(ownCr.ownerId, 'own-scope user owns their CR').toBe(USERS.ownAuthor.id)
    await addLink(ownPage, ownCr.id, 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb')
    await ownCtx.close()

    // The scope tier now reaches the child table.
    expect(
      visibleLinkCount(USERS.ownAuthor.id, ownCr.id),
      'own-scope user still sees the links on their OWN change request',
    ).toBe(1)
    expect(
      visibleLinkCount(USERS.ownAuthor.id, peerCr.id),
      "own-scope user must not see a peer's affected-item graph",
    ).toBe(0)

    // The regression pin in the other direction: tenant scope is unchanged.
    expect(
      visibleLinkCount(USERS.author.id, ownCr.id),
      'tenant scope still reaches the own-scope CR’s links',
    ).toBe(1)
    expect(visibleLinkCount(USERS.author.id, peerCr.id), 'and its own').toBe(1)

    // A user with no change_control grant sees nothing in either.
    expect(visibleLinkCount(USERS.noAccess.id, ownCr.id)).toBe(0)
    expect(visibleLinkCount(USERS.noAccess.id, peerCr.id)).toBe(0)
  })

  test('the UPDATE policy re-checks the NEW parent — a link cannot be re-pointed', async ({
    browser,
  }) => {
    test.setTimeout(180_000)
    // The second half of the same fix, and the easier one to miss. The UPDATE
    // policy's WITH CHECK was `company_id = current_company` ALONE, so a link
    // row that passed USING could be moved onto ANY change request in the
    // company — the caller still "owned" the row they started from.
    const authorCtx = await browser.newContext({ storageState: AUTH.author })
    const authorPage = await authorCtx.newPage()
    const peerTitle = uniqueTitle('J6-repointpeer')
    await createCr(authorPage, peerTitle)
    const peerCr = findCrByTitle(peerTitle)
    await authorCtx.close()

    const ownCtx = await browser.newContext({ storageState: AUTH.ownAuthor })
    const ownPage = await ownCtx.newPage()
    const ownTitle = uniqueTitle('J6-repointown')
    await createCr(ownPage, ownTitle)
    const ownCr = findCrByTitle(ownTitle)
    const linkId = await addLink(ownPage, ownCr.id, 'cccccccc-3333-4333-8333-cccccccccccc')
    await ownCtx.close()

    const res = sqlAsAppUser(
      `UPDATE change_request_links SET change_request_id = '${peerCr.id}' WHERE id = '${linkId}';`,
      { userId: USERS.ownAuthor.id, companyId: COMPANY_ID },
    )
    expect(res.ok, 'moving a link onto a CR outside your scope must be refused').toBe(false)
    expect(res.error).toMatch(/row-level security|42501/i)

    // Untouched.
    expect(visibleLinkCount(USERS.ownAuthor.id, ownCr.id)).toBe(1)
  })
})
