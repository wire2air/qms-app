/**
 * MTC-S07 · MTC-S08 — who may share, and which records.
 *
 * Sharing is its own verb rather than riding on `update` (record-sharing/10):
 * somebody trusted to fix a typo on an NC has not thereby been trusted to send
 * it to the supplier it accuses. The reviewer persona holds ncr:read AND
 * ncr:update and deliberately no ncr:manage_access (e2e-seed.sql §42b strips a
 * stray one), so it is the exact population that distinction is about.
 *
 * MTC-S08 was called "the one case most worth running, because nothing in the
 * test suite covers it": `manage_access` is checked at RECORD scope, so a
 * site-scoped sharer may share records at their own sites only.
 *
 * No OTP calls.
 */
import { test, expect } from '@playwright/test'
import { AUTH, USERS, COMPANY_ID, SITES } from '../fixtures/cast.js'
import { sqlValue } from '../fixtures/db.js'
import {
  SHARE,
  SHARE_INPUT_PLACEHOLDER,
  extEmail,
  purgeShareLinks,
  apiAs,
  freshApi,
  mintShare,
  revokeShare,
  linkFor,
  openNcShareCard,
  expectCardLists,
} from '../fixtures/recordSharing.js'

const LISTED = extEmail('j4-listed')
let listedId

test.beforeAll(async () => {
  purgeShareLinks()
  const author = await apiAs(AUTH.author)
  const r = await mintShare(author, {
    entityType: 'Nonconformance',
    entityId: SHARE.nc.id,
    emails: [LISTED],
  })
  await author.dispose()
  expect(r.status, r.message).toBe(200)
  listedId = linkFor(SHARE.nc.id, LISTED).id
})

test('MTC-S07 · ncr:update without ncr:manage_access — the card shows who has access but offers no controls, and the API refuses mint AND revoke', async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: AUTH.reviewer })
  const page = await ctx.newPage()
  try {
    const card = await openNcShareCard(page)
    // The list is not gated: RLS lets an NC reader see who it went to.
    await expectCardLists(card, LISTED)
    await expect(card.getByPlaceholder(SHARE_INPUT_PLACEHOLDER)).toHaveCount(0)
    await expect(card.getByRole('button', { name: /Withdraw access for/ })).toHaveCount(0)
  } finally {
    await ctx.close()
  }

  const reviewer = await apiAs(AUTH.reviewer)
  const noAccess = await apiAs(AUTH.noAccess)
  try {
    const denied = extEmail('j4-denied')
    const mint = await mintShare(reviewer, {
      entityType: 'Nonconformance',
      entityId: SHARE.nc.id,
      emails: [denied],
    })
    expect(mint.status, mint.message).toBe(403)
    const revoke = await revokeShare(reviewer, listedId)
    expect(revoke.status, revoke.message).toBe(403)
    expect(linkFor(SHARE.nc.id, LISTED).revokedAt, 'the refused revoke changed nothing').toBe('')
    expect(linkFor(SHARE.nc.id, denied)).toBeNull()

    // No grant on the module at all.
    const none = await mintShare(noAccess, {
      entityType: 'Nonconformance',
      entityId: SHARE.nc.id,
      emails: [denied],
    })
    expect(none.status, none.message).toBe(403)
  } finally {
    await reviewer.dispose()
    await noAccess.dispose()
  }
})

test('MTC-S08 · a SITE-scoped sharer can share an NC at their own site and gets 403 on one at another site', async () => {
  // Derived, not assumed: the sites suite moves this persona mid-run (PW-J7).
  const siteIds =
    sqlValue(
      `SELECT array_to_string(authz.effective_site_ids('${USERS.siteRoamer.id}'::uuid, '${COMPANY_ID}'::uuid), ',')`,
    ) || ''
  const atPrimary = siteIds.includes(SITES.primary.id)
  const atSecondary = siteIds.includes(SITES.secondary.id)
  expect(atPrimary !== atSecondary, `siteRoamer effective sites: ${siteIds}`).toBe(true)
  const [mine, other] = atPrimary ? [SHARE.nc, SHARE.ncOtherSite] : [SHARE.ncOtherSite, SHARE.nc]

  const own = extEmail('j4-own-site')
  const foreign = extEmail('j4-other-site')
  const roamer = await freshApi('siteRoamer')
  try {
    const ok = await mintShare(roamer, { entityType: 'Nonconformance', entityId: mine.id, emails: [own] })
    expect(ok.status, ok.message).toBe(200)
    expect(linkFor(mine.id, own)).not.toBeNull()

    const refused = await mintShare(roamer, {
      entityType: 'Nonconformance',
      entityId: other.id,
      emails: [foreign],
    })
    expect(refused.status, refused.message).toBe(403)
    expect(linkFor(other.id, foreign)).toBeNull()
  } finally {
    await roamer.dispose()
  }
})
