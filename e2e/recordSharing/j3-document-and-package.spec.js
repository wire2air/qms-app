/**
 * RS-C-01 · RS-H-02 · the Audit Records Package.
 *
 * The two features added on 2026-08-25 were grantable to nobody until migration
 * 20260912200000 registered their `manage_access` verbs: sharing a controlled
 * document answered 403 to 49 of 53 users, and the whole package flow sat
 * behind the same check. The persona that proves the fix is a Document
 * Controller who is neither the document's author nor a company owner — the
 * owner bypass is exactly what hid the defect.
 *
 * RS-H-02 is the RLS half: a Document share link used to be gated by the App
 * Builder module (`records:read`), so the people who read the SOP could not see
 * who it had been sent to.
 *
 * Serial: the package journey mints through the auditee Share tab and then
 * walks the external manifest with TWO OTP calls.
 */
import { test, expect } from '@playwright/test'
import { AUTH, USERS, COMPANY_ID } from '../fixtures/cast.js'
import { sqlValue, sqlAsAppUser } from '../fixtures/db.js'
import {
  SHARE,
  extEmail,
  purgeShareLinks,
  apiAs,
  anonApi,
  anonPage,
  mintShare,
  openShare,
  waitForMail,
  tokenFrom,
  codeFrom,
  linkFor,
  packageItems,
  viewRowCount,
} from '../fixtures/recordSharing.js'

test.describe.configure({ mode: 'serial' })

const DOC_EMAIL = extEmail('j3-doc')
const DOC_DENIED = extEmail('j3-doc-denied')
const PKG_EMAIL = extEmail('j3-pkg')
let docToken
let pkgToken
let pkgLinkId

test.beforeAll(() => purgeShareLinks())

test('RS-C-01 · a Document Controller who neither wrote nor owns the document can share it; document_control:read alone cannot', async () => {
  // The premise, or the test proves nothing: no owner bypass, no authorship.
  expect(sqlValue(`SELECT is_owner FROM users WHERE id = '${USERS.controller.id}'`)).toBe('f')
  expect(
    sqlValue(
      `SELECT coalesce(author_id::text, '') || '|' || coalesce(user_id::text, '') FROM documents WHERE id = '${SHARE.doc.id}'`,
    ),
  ).not.toContain(USERS.controller.id)

  const controller = await apiAs(AUTH.controller)
  const auditor = await apiAs(AUTH.auditor)
  try {
    const ok = await mintShare(controller, {
      entityType: 'Document',
      entityId: SHARE.doc.id,
      emails: [DOC_EMAIL],
    })
    expect(ok.status, ok.message).toBe(200)
    expect(linkFor(SHARE.doc.id, DOC_EMAIL)).toMatchObject({
      origin: 'SHARE',
      createdBy: USERS.controller.id,
    })
    docToken = tokenFrom(
      (await waitForMail(DOC_EMAIL, { subject: `Document ${SHARE.doc.number} shared with you` })).html,
    )
    const anon = await anonApi()
    const gate = await openShare(anon, docToken)
    await anon.dispose()
    expect(gate.body).toMatchObject({ needsVerification: true, label: 'Document' })

    // CONTROL: reading the document is not a licence to send it outside.
    const denied = await mintShare(auditor, {
      entityType: 'Document',
      entityId: SHARE.doc.id,
      emails: [DOC_DENIED],
    })
    expect(denied.status).toBe(403)
    expect(linkFor(SHARE.doc.id, DOC_DENIED)).toBeNull()
  } finally {
    await controller.dispose()
    await auditor.dispose()
  }
})

test('RS-H-02 · under RLS the Document share link is visible to document_control:read holders — and to nobody without it', async () => {
  const seen = (userId) =>
    sqlAsAppUser(
      `SELECT count(*) FROM record_share_links WHERE entity_type = 'Document' AND entity_id = '${SHARE.doc.id}';`,
      { userId, companyId: COMPANY_ID },
    )
  for (const [who, expected] of [
    [USERS.controller, '1'], // shared it
    [USERS.auditor, '1'], // reads the SOP, so may see who has it
    [USERS.noAccess, '0'], // no document access at all
  ]) {
    const r = seen(who.id)
    expect(r.ok, r.error).toBe(true)
    expect(r.output.split('\n').pop(), who.email).toBe(expected)
  }
})

test('RS-PKG-1 · the auditee assembles an Audit Records Package on the audit Share tab — one link, a two-item manifest, one mail', async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: AUTH.author })
  const page = await ctx.newPage()
  try {
    await page.goto(`/auditee/${SHARE.audit.id}`, { waitUntil: 'domcontentloaded' })
    const shareTab = page.getByRole('tab', { name: 'Share' })
    await expect(shareTab).toBeVisible({ timeout: 90_000 })
    await shareTab.click()

    const docRow = page.locator('label').filter({ hasText: SHARE.doc.number })
    await expect(docRow).toBeVisible({ timeout: 60_000 })
    await docRow.getByRole('checkbox').check()

    // The record picker opens on CAPAs / Closed; switch the type to NCs.
    await page.getByRole('combobox').filter({ hasText: 'CAPAs' }).first().click()
    await page.getByRole('option', { name: 'NCs', exact: true }).click()
    const ncRow = page.locator('label').filter({ hasText: SHARE.ncClosed.number })
    await expect(ncRow).toBeVisible({ timeout: 30_000 })
    await ncRow.getByRole('checkbox').check()
    await expect(page.getByText('2 selected')).toBeVisible()

    await page.getByPlaceholder('auditor@registrar.com').fill(PKG_EMAIL)
    await page.getByRole('button', { name: 'Share package' }).click()
    await expect(
      page.getByText('Shared — the package now holds 2 record(s) for 1 recipient.').first(),
    ).toBeVisible()
  } finally {
    await ctx.close()
  }

  const link = linkFor(SHARE.audit.id, PKG_EMAIL)
  expect(link).toMatchObject({ origin: 'AUDIT_PACKAGE', createdBy: USERS.author.id })
  pkgLinkId = link.id
  expect(packageItems(link.id)).toEqual([
    `Document:${SHARE.doc.id}`,
    `Nonconformance:${SHARE.ncClosed.id}`,
  ])
  const mail = await waitForMail(PKG_EMAIL, { subject: `Audit Records Package ${SHARE.audit.number}` })
  expect(mail.subject).toContain('2 items')
  pkgToken = tokenFrom(mail.html)
  expect(pkgToken).toBeTruthy()
})

test('RS-PKG-2 · one code opens the whole package — manifest → document → back → NC — and the manifest is the boundary', async ({ browser }) => {
  const { ctx, page } = await anonPage(browser)
  try {
    await page.goto(`/share/${pkgToken}`)
    await expect(
      page.getByRole('heading', { name: 'An Audit Records Package has been shared with you' }),
    ).toBeVisible()
    await page.getByRole('button', { name: 'Email me a code' }).click()
    const code = codeFrom((await waitForMail(PKG_EMAIL, { subject: 'Your verification code' })).html)
    expect(code).toMatch(/^\d{6}$/)
    await page.getByPlaceholder('6-digit code').fill(code)
    await page.getByRole('button', { name: 'Open the Audit Records Package' }).click()

    await expect(page.getByRole('heading', { name: SHARE.audit.number })).toBeVisible()
    await expect(page.getByText('2 records shared with you')).toBeVisible()

    await page.getByRole('button', { name: new RegExp(SHARE.doc.number) }).click()
    await expect(page.getByRole('heading', { name: SHARE.doc.number })).toBeVisible()
    await expect(page.getByText(new RegExp(SHARE.doc.sectionText))).toBeVisible()
    await expect(page.getByText(/RS930 STEP ONE/)).toBeVisible()

    await page.getByRole('button', { name: '← All shared records' }).click()
    await page.getByRole('button', { name: new RegExp(SHARE.ncClosed.number) }).click()
    await expect(page.getByRole('heading', { name: SHARE.ncClosed.number })).toBeVisible()
    await expect(page.getByText(SHARE.ncClosed.bodyText)).toBeVisible()

    // The boundary: only items on THIS link's manifest, only on a package link,
    // only for a session that passed THIS link's code.
    const foreign = await page.request.get(
      `/api/v1/share/${pkgToken}/items/00000000-0000-4000-8000-000000000000`,
    )
    expect(foreign.status()).toBe(404)
    const notAPackage = await page.request.get(
      `/api/v1/share/${docToken}/items/00000000-0000-4000-8000-000000000000`,
    )
    expect(notAPackage.status()).toBe(404)
    const itemId = sqlValue(
      `SELECT id FROM record_share_link_items WHERE record_share_link_id = '${pkgLinkId}' LIMIT 1`,
    )
    const anon = await anonApi()
    const unverified = await anon.get(`/api/v1/share/${pkgToken}/items/${itemId}`)
    await anon.dispose()
    expect(unverified.status()).toBe(401)

    // Manifest + two items, all against the one link.
    expect(viewRowCount(pkgLinkId)).toBe(3)
  } finally {
    await ctx.close()
  }
})
