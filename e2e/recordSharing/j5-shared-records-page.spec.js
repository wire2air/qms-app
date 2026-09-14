/**
 * RS-J6 (RS-H-01) · RS-J9 — the company-wide Shared Records page.
 *
 * RS-H-01: `'/shared-records'.startsWith('/share')` is true, so until the
 * segment-aware isPublicRoute (2026-09-08) a typed URL, a bookmark or a hard
 * refresh booted this page down the PUBLIC branch — no company init, no sync, no
 * permissions — and showed an empty table with no error. Client-side navigation
 * worked, which is why nobody saw it. The pack asked for this spec to be written
 * red; the fix landed first, so it is written as the regression guard.
 *
 * The three links (live, withdrawn, expired) are made in beforeAll so every
 * status the page derives is on screen at once. No OTP calls.
 */
import { test, expect } from '@playwright/test'
import { AUTH, USERS } from '../fixtures/cast.js'
import {
  SHARE,
  extEmail,
  purgeShareLinks,
  apiAs,
  mintShare,
  revokeShare,
  linkFor,
  expireLink,
} from '../fixtures/recordSharing.js'

test.use({ storageState: AUTH.author })

const ACTIVE = extEmail('j5-active')
const WITHDRAWN = extEmail('j5-withdrawn')
const EXPIRED = extEmail('j5-expired')

test.beforeAll(async () => {
  purgeShareLinks()
  const api = await apiAs(AUTH.author)
  try {
    const r = await mintShare(api, {
      entityType: 'Nonconformance',
      entityId: SHARE.nc.id,
      emails: [ACTIVE, WITHDRAWN, EXPIRED],
    })
    expect(r.status, r.message).toBe(200)
    expect((await revokeShare(api, linkFor(SHARE.nc.id, WITHDRAWN).id)).status).toBe(200)
    expireLink(linkFor(SHARE.nc.id, EXPIRED).id)
  } finally {
    await api.dispose()
  }
})

function row(page, email) {
  return page.getByRole('row').filter({ hasText: email })
}

test('RS-J6 / RS-H-01 · /shared-records survives a hard load and a hard refresh — app chrome, rows, derived statuses (MTC-S10)', async ({ page }) => {
  // This context's FIRST navigation is a hard load of the URL; the reload is the
  // hard refresh the finding named. Either would have taken the public branch.
  await page.goto('/shared-records', { waitUntil: 'domcontentloaded' })
  await page.reload({ waitUntil: 'domcontentloaded' })

  await expect(page.locator('aside').first(), 'the app sidebar, not the bare public shell').toBeVisible({
    timeout: 60_000,
  })
  await expect(row(page, ACTIVE)).toBeVisible({ timeout: 60_000 })
  await expect(row(page, ACTIVE)).toContainText('Active')
  await expect(row(page, ACTIVE)).toContainText(SHARE.nc.number)
  await expect(row(page, WITHDRAWN)).toContainText('Withdrawn')
  await expect(row(page, EXPIRED)).toContainText('Expired')
})

test('RS-J9 · search by recipient and by record number; a mixed bulk withdrawal acts on the live link only, says "1 of 3", and names who loses access (MTC-07, MTC-08)', async ({ page }) => {
  await page.goto('/shared-records', { waitUntil: 'domcontentloaded' })
  await expect(row(page, ACTIVE)).toBeVisible({ timeout: 60_000 })

  // The table's own box — the top bar carries the app-wide search, also "Search…".
  const search = page.getByLabel('Search table')
  await search.fill(ACTIVE)
  await expect(row(page, WITHDRAWN)).toHaveCount(0)
  await expect(row(page, ACTIVE)).toBeVisible()
  await search.fill(SHARE.nc.number)
  for (const e of [ACTIVE, WITHDRAWN, EXPIRED]) await expect(row(page, e)).toBeVisible()

  for (const e of [ACTIVE, WITHDRAWN, EXPIRED]) {
    await row(page, e).getByRole('checkbox', { name: 'Select row' }).check()
  }
  const bulk = page.getByRole('button', { name: /Withdraw access/ })
  await expect(bulk).toContainText('(1 of 3)')
  await bulk.click()

  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText(`1 person loses access immediately: ${ACTIVE}`)
  await expect(dialog).not.toContainText(WITHDRAWN)
  await expect(dialog).not.toContainText(EXPIRED)
  await dialog.getByRole('button', { name: 'Withdraw', exact: true }).click()
  await expect(page.getByText('Access withdrawn for 1 link.').first()).toBeVisible()

  expect(linkFor(SHARE.nc.id, ACTIVE).revokedAt, 'the live link').not.toBe('')
  expect(linkFor(SHARE.nc.id, EXPIRED).revokedAt, 'the expired link was not touched').toBe('')
  expect(linkFor(SHARE.nc.id, WITHDRAWN).revokedBy).toBe(USERS.author.id)
  await expect(row(page, ACTIVE)).toContainText('Withdrawn', { timeout: 45_000 })
})
