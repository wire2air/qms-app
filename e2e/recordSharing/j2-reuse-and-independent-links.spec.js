/**
 * RS-J2 · MTC-02 · MTC-03 · MTC-04 — one live link per (record, address), and
 * links that are independent of each other.
 *
 * The service's own header states the rule: a notification firing OPENED and
 * then CLOSED must not leave two live credentials with one person, or the owner
 * revokes the link they can see while the recipient still holds another. So a
 * re-share EXTENDS the live row and re-issues its token — and the token in the
 * first mail must stop working.
 *
 * None of this needs a verified session, so this file spends no OTP calls:
 * "the old token is dead" is the uniform 404 and "the new one is live" is the
 * code gate.
 */
import { test, expect } from '@playwright/test'
import { AUTH } from '../fixtures/cast.js'
import {
  SHARE,
  SHARE_INPUT_PLACEHOLDER,
  extEmail,
  purgeShareLinks,
  apiAs,
  anonApi,
  mintShare,
  openShare,
  waitForMail,
  tokenFrom,
  linkFor,
  linksFor,
  liveLinkCount,
  setLinkExpiry,
  openNcShareCard,
  expectCardLists,
} from '../fixtures/recordSharing.js'

test.use({ storageState: AUTH.author })

const SUBJECT = `Nonconformance ${SHARE.nc.number} shared with you`
const DAY = 86_400_000

test.beforeAll(() => purgeShareLinks())

test('RS-J2 · re-sharing to the same address reuses the live link — one row, expiry pushed out, the first token dead (MTC-03)', async ({ page }) => {
  const email = extEmail('j2-reuse')
  const api = await apiAs(AUTH.author)
  try {
    const first = await mintShare(api, {
      entityType: 'Nonconformance',
      entityId: SHARE.nc.id,
      emails: [email],
    })
    expect(first.status, first.message).toBe(200)
    expect(first.body.shared[0].reused).toBe(false)
    const token1 = tokenFrom((await waitForMail(email, { subject: SUBJECT })).html)
    const before = linkFor(SHARE.nc.id, email)
    setLinkExpiry(before.id, '2 days') // so "pushed out" is observable

    // Through the card, in capitals: the same recipient, case-insensitively.
    const card = await openNcShareCard(page)
    const input = card.getByPlaceholder(SHARE_INPUT_PLACEHOLDER)
    await input.fill(email.toUpperCase())
    await input.press('Enter')
    await expect(
      page
        .getByText(`Sent a fresh link to ${email} — they already had access, so no second link was created.`)
        .first(),
    ).toBeVisible()

    expect(liveLinkCount(SHARE.nc.id, email)).toBe(1)
    expect(linksFor(SHARE.nc.id).filter((l) => l.email === email), 'not even a revoked twin').toHaveLength(1)
    const after = linkFor(SHARE.nc.id, email)
    expect(after.id).toBe(before.id)
    expect(after.expiresAt - Date.now()).toBeGreaterThan(29 * DAY)

    const token2 = tokenFrom((await waitForMail(email, { subject: SUBJECT, min: 2 })).html)
    expect(token2).toBeTruthy()
    expect(token2).not.toBe(token1)

    const anon = await anonApi()
    const dead = await openShare(anon, token1)
    const live = await openShare(anon, token2)
    await anon.dispose()
    expect(dead.status, 'the token in the first mail').toBe(404)
    expect(live.status).toBe(200)
    expect(live.body.needsVerification).toBe(true)
  } finally {
    await api.dispose()
  }
})

test('23505 · concurrent shares to one new address converge on ONE live link — none of them 500s', async () => {
  const email = extEmail('j2-race')
  const api = await apiAs(AUTH.author)
  try {
    const results = await Promise.all(
      [1, 2, 3].map(() =>
        mintShare(api, { entityType: 'Nonconformance', entityId: SHARE.nc.id, emails: [email] }),
      ),
    )
    expect(
      results.map((r) => r.status),
      JSON.stringify(results.map((r) => r.message)),
    ).toEqual([200, 200, 200])
    expect(liveLinkCount(SHARE.nc.id, email)).toBe(1)
    const id = linkFor(SHARE.nc.id, email).id
    expect(new Set(results.map((r) => r.body.shared[0].shareLink.id))).toEqual(new Set([id]))
    expect(results.filter((r) => r.body.shared[0].reused === false)).toHaveLength(1)
  } finally {
    await api.dispose()
  }
})

test('MTC-02 / MTC-04 · one paste, mixed separators, three people → three independent links; withdrawing one leaves the other two working', async ({ page }) => {
  const [a, b, c] = ['a', 'b', 'c'].map((t) => extEmail(`j2-multi-${t}`))
  const card = await openNcShareCard(page)
  const input = card.getByPlaceholder(SHARE_INPUT_PLACEHOLDER)
  await input.fill(`${a}, ${b}; ${c}`)
  await input.press('Enter')
  await expect(page.getByText('Shared with 3 people.').first()).toBeVisible()

  const rows = [a, b, c].map((e) => linkFor(SHARE.nc.id, e))
  expect(rows.every(Boolean), 'one row per address').toBe(true)
  expect(new Set(rows.map((r) => r.id)).size).toBe(3)
  const tokens = []
  for (const e of [a, b, c]) tokens.push(tokenFrom((await waitForMail(e, { subject: SUBJECT })).html))
  expect(new Set(tokens).size, 'three distinct tokens').toBe(3)

  await expectCardLists(card, b)
  await card.getByRole('button', { name: `Withdraw access for ${b}` }).click()
  await expect(page.getByText(`Access withdrawn for ${b}.`).first()).toBeVisible()

  const anon = await anonApi()
  try {
    expect((await openShare(anon, tokens[1])).status).toBe(404)
    expect((await openShare(anon, tokens[0])).body.needsVerification).toBe(true)
    expect((await openShare(anon, tokens[2])).body.needsVerification).toBe(true)
  } finally {
    await anon.dispose()
  }
  expect(linkFor(SHARE.nc.id, a).revokedAt).toBe('')
  expect(linkFor(SHARE.nc.id, c).revokedAt).toBe('')
  await expect(card.getByText(`Withdrawn: ${b}`)).toBeVisible({ timeout: 45_000 })
})
