/**
 * RS-J1 · J3 · J4 · J5 — the external path, walked end to end.
 *
 * Until this file, no request had been sent to /v1/share/:token by anyone but
 * its author (record-sharing/22 §8, QA 52 "a floor"). This walks it the way a
 * supplier would: an internal user shares an NC from its rail card → the mail
 * arrives → a browser with NO session opens the link → asks for a code → reads
 * it out of the mailbox → verifies → reads the allow-listed projection →
 * downloads the attachment → the sharer withdraws → the page, the file and the
 * code all stop working.
 *
 * Serial on purpose: one external context carries one verified session through
 * every step, which is what keeps this file to FIVE strict-limited OTP calls
 * (request, immediate re-issue probe, wrong verify, right verify, post-revoke
 * request) out of the 20/15 min the whole machine shares.
 *
 * The seeded NC (e2e-seed.sql §42) carries RS930-marked values in four INTERNAL
 * columns and a stored-XSS payload in its containment field; before the first
 * test this file uploads three real files (an inline image, an attachment, and
 * an unrelated file the link must refuse to serve) and points the NC at the
 * first two.
 */
import { test, expect } from '@playwright/test'
import { AUTH, USERS } from '../fixtures/cast.js'
import {
  SHARE,
  SHARE_DOMAIN,
  RUN,
  ATTACHMENT_MARKER,
  SHARE_INPUT_PLACEHOLDER,
  extEmail,
  purgeShareLinks,
  apiAs,
  anonApi,
  anonPage,
  uploadAsset,
  setNcAttachments,
  PNG_1PX,
  pdfBytes,
  waitForMail,
  mailCount,
  tokenFrom,
  codeFrom,
  linkFor,
  viewRowCount,
  otpCleared,
  openShare,
  openNcShareCard,
  expectCardLists,
} from '../fixtures/recordSharing.js'

test.describe.configure({ mode: 'serial' })
test.use({ storageState: AUTH.author })

const RECIPIENT = extEmail('j1')
const SHARED_SUBJECT = `Nonconformance ${SHARE.nc.number} shared with you`
const OTP_SUBJECT = 'Your verification code'
const DAY = 86_400_000

let authorApi
const asset = {}
let token
let external // { ctx, page } — the recipient's browser, no account
const beaconHits = []
const dialogs = []
let reissue // the immediate second request-code, recorded inside its ~60 s window

test.beforeAll(async () => {
  purgeShareLinks()
  authorApi = await apiAs(AUTH.author)
  asset.image = await uploadAsset(authorApi, { name: 'rs930-photo.png', mimeType: 'image/png', buffer: PNG_1PX })
  asset.file = await uploadAsset(authorApi, {
    name: 'rs930-evidence.pdf',
    mimeType: 'application/pdf',
    buffer: pdfBytes(),
  })
  // A real object in the same tenant and bucket that NO shared record references.
  asset.stray = await uploadAsset(authorApi, {
    name: 'rs930-unrelated.pdf',
    mimeType: 'application/pdf',
    buffer: pdfBytes('RS930-NOT-SHARED'),
  })
  setNcAttachments({ imageId: asset.image, fileId: asset.file, fileName: 'rs930-evidence.pdf' })
})

test.afterAll(async () => {
  await authorApi?.dispose()
  await external?.ctx.close()
})

test('RS-J1a · the sharer shares the NC from its rail card — one SHARE row, owned by the sharer, 30 days', async ({ page }) => {
  const card = await openNcShareCard(page)
  const input = card.getByPlaceholder(SHARE_INPUT_PLACEHOLDER)
  await input.fill(RECIPIENT)
  await input.press('Enter')
  await expect(page.getByText(`Shared with ${RECIPIENT}.`).first()).toBeVisible()

  const link = linkFor(SHARE.nc.id, RECIPIENT)
  expect(link, 'record_share_links row').not.toBeNull()
  expect(link).toMatchObject({
    origin: 'SHARE',
    createdBy: USERS.author.id,
    revokedAt: '',
    verifiedAt: '',
    viewCount: 0,
  })
  const ttl = link.expiresAt - Date.now()
  expect(ttl).toBeGreaterThan(29 * DAY)
  expect(ttl).toBeLessThanOrEqual(30 * DAY + 60_000)

  // The row reaches the card through the sync broadcast, not the response.
  await expectCardLists(card, RECIPIENT)
  await expect(card.getByText('never opened')).toBeVisible()
})

test('RS-J1b · the mail carries a /share/ link, and the link opens a code gate that names neither the record nor the recipient', async ({ browser }) => {
  const mail = await waitForMail(RECIPIENT, { subject: SHARED_SUBJECT })
  token = tokenFrom(mail.html)
  expect(token, 'token in the share mail').toBeTruthy()

  external = await anonPage(browser)
  // Every request to the third-party host named in the stored payload, for the
  // whole external session. The page must never make one.
  await external.ctx.route(/evil\.test/, (route) => {
    beaconHits.push(route.request().url())
    return route.abort()
  })
  external.page.on('dialog', (d) => {
    dialogs.push(d.message())
    d.dismiss().catch(() => {})
  })

  await external.page.goto(`/share/${token}`)
  await expect(
    external.page.getByRole('heading', { name: 'A Nonconformance has been shared with you' }),
  ).toBeVisible()
  const local = RECIPIENT.split('@')[0]
  const masked = `${local[0]}${'•'.repeat(local.length - 1)}@${SHARE_DOMAIN}`
  await expect(external.page.getByText(masked)).toBeVisible()

  const text = await external.page.locator('body').innerText()
  expect(text).not.toContain(RECIPIENT)
  expect(text).not.toContain(SHARE.nc.number)
  expect(text).not.toContain(SHARE.nc.title)

  // The API behind the gate says exactly as little.
  const anon = await anonApi()
  const gate = await openShare(anon, token)
  await anon.dispose()
  expect(gate.status).toBe(200)
  expect(Object.keys(gate.body).filter((k) => k !== 'meta').sort()).toEqual([
    'label',
    'maskedEmail',
    'needsVerification',
  ])
})

test('RS-J1c · the code goes to the address ON THE LINK (a body-supplied address is ignored); a wrong code is refused; the right one opens the record', async () => {
  const page = external.page
  const attacker = `attacker-${RUN}@evil-inbox.test`

  // MTC-S04, through the page's own call: a tampering visitor rewrites the
  // request-code body to name a mailbox they control.
  await page.route('**/api/v1/share/*/request-code', (route) =>
    route.continue({ postData: JSON.stringify({ email: attacker, to: attacker }) }),
  )
  await page.getByRole('button', { name: 'Email me a code' }).click()
  const codeInput = page.getByPlaceholder('6-digit code')
  await expect(codeInput).toBeVisible()
  await page.unroute('**/api/v1/share/*/request-code')

  let otpMail = await waitForMail(RECIPIENT, { subject: OTP_SUBJECT })
  expect(otpMail.subject, 'the code is never on the envelope').not.toMatch(/\d{6}/)
  let code = codeFrom(otpMail.html)
  expect(code).toMatch(/^\d{6}$/)
  expect(await mailCount(attacker), 'nothing was sent to the address in the body').toBe(0)

  // The immediate re-issue, recorded now because the cooldown window is only
  // open for ~60 s. Asserted in its own test below.
  const again = await page.request.post(`/api/v1/share/${token}/request-code`, { data: {} })
  reissue = { status: again.status(), body: (await again.text()).slice(0, 300) }
  if (again.status() === 200) {
    // No cooldown: that call burned the first code and mailed a second.
    otpMail = await waitForMail(RECIPIENT, { subject: OTP_SUBJECT, min: 2 })
    code = codeFrom(otpMail.html)
  }

  const wrong = code === '000000' ? '111111' : '000000'
  await codeInput.fill(wrong)
  await page.getByRole('button', { name: 'Open the Nonconformance' }).click()
  await expect(page.getByText('That code is not correct.').first()).toBeVisible()
  await expect(page.getByRole('heading', { name: SHARE.nc.number })).toHaveCount(0)

  await codeInput.fill(code)
  await page.getByRole('button', { name: 'Open the Nonconformance' }).click()
  await expect(page.getByRole('heading', { name: SHARE.nc.number })).toBeVisible()
  // The title shows twice once verified — under the heading and as the "Title"
  // field of the Summary section; the header line is the one asserted here.
  await expect(page.getByRole('paragraph').filter({ hasText: SHARE.nc.title })).toBeVisible()

  const link = linkFor(SHARE.nc.id, RECIPIENT)
  expect(link.verifiedAt, 'verified_at stamped').not.toBe('')
  expect(link.viewCount).toBe(1)
  expect(viewRowCount(link.id)).toBe(1)
})

test('RS-M-01 remainder · a code cannot be re-issued for the same link inside the cooldown', async () => {
  expect(reissue, 'probe recorded by RS-J1c').toBeTruthy()
  expect(reissue.status, `immediate re-issue answered ${reissue.status}: ${reissue.body}`).toBe(429)
})

test('RS-J4 · the projection IS the allow-list — internal fields are absent from the page and the raw JSON, stored markup arrives inert (MTC-S01, MTC-S09)', async () => {
  const page = external.page
  const text = await page.locator('body').innerText()
  for (const v of SHARE.internalValues) expect(text, `page shows ${v}`).not.toContain(v)

  // What the supplier needs to act IS there.
  await expect(page.getByText('What was found')).toBeVisible()
  await expect(page.getByText('LOT-RS-930', { exact: true })).toBeVisible()
  await expect(page.getByText('Quarantined lot LOT-RS-930.')).toBeVisible()

  // "Including in view-source": the payload the page was built from.
  const res = await page.request.get(`/api/v1/share/${token}`)
  expect(res.status()).toBe(200)
  const raw = await res.text()
  for (const v of SHARE.internalValues) expect(raw, `JSON carries ${v}`).not.toContain(v)
  for (const k of SHARE.internalKeys) expect(raw, `JSON carries key ${k}`).not.toContain(`"${k}"`)
  expect(raw).not.toContain('<script')
  expect(raw).not.toContain('evil.test')
  expect(raw).not.toMatch(/<a[\s>]/i)

  expect(dialogs, 'no stored script ran').toEqual([])
  await expect(page.locator('a[href*="evil.test"]')).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'click here' })).toHaveCount(0)
  expect(beaconHits, 'no request ever left for evil.test').toEqual([])
})

test('RS-J5 · files: the attachment and the inline image serve through the share route; an unreferenced asset 404s exactly like a missing one; an unverified session gets 401 (MTC-05, MTC-S06)', async () => {
  const page = external.page
  const fileUrl = `/api/v1/share/${token}/files/${asset.file}`

  await expect(page.getByRole('heading', { name: 'Attachments' })).toBeVisible()
  const attachment = page.getByRole('link', { name: /rs930-evidence\.pdf/ })
  await expect(attachment).toBeVisible()
  await expect(attachment).toHaveAttribute('href', fileUrl)
  await expect(attachment, 'shown with its size').toContainText('KB')
  const file = await page.request.get(fileUrl)
  expect(file.status()).toBe(200)
  expect((await file.body()).toString('utf8')).toContain(ATTACHMENT_MARKER)
  expect(file.headers()['cache-control']).toContain('no-store')

  // Inline image: rewritten from the authenticated /v1/files route onto the
  // share route, actually loaded, and opened full size on click.
  const img = page.locator('dd img').first()
  await expect(img).toHaveAttribute('src', `/api/v1/share/${token}/files/${asset.image}`)
  await expect.poll(() => img.evaluate((el) => (el.complete ? el.naturalWidth : 0))).toBeGreaterThan(0)
  // A thumbnail, not the camera's full frame (MTC-05: "~12rem").
  expect(await img.evaluate((el) => getComputedStyle(el).maxWidth)).toBe('192px')
  await img.click()
  const viewer = page.getByRole('dialog', { name: 'rs930-inline-photo' })
  await expect(viewer).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(viewer).toHaveCount(0)

  const stray = await page.request.get(`/api/v1/share/${token}/files/${asset.stray}`)
  const missing = await page.request.get(
    `/api/v1/share/${token}/files/00000000-0000-4000-8000-000000000000`,
  )
  expect(stray.status()).toBe(404)
  expect(missing.status()).toBe(404)
  expect((await stray.json()).error.message).toBe((await missing.json()).error.message)

  const anon = await anonApi()
  const unverified = await anon.get(fileUrl)
  await anon.dispose()
  expect(unverified.status(), 'a file cannot sit behind less than the summary').toBe(401)
})

test('RS-L-06 · the share page carries a Content-Security-Policy that blocks a third-party load even if markup got past the sanitiser', async () => {
  const page = external.page
  const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content')
  expect(csp, 'CSP meta on the external page').toBeTruthy()
  for (const directive of ["img-src 'self' data: blob:", "script-src 'self'", "connect-src 'self'", "object-src 'none'", "base-uri 'none'"]) {
    expect(csp).toContain(directive)
  }
  // Simulate the failure the CSP exists for: a beacon <img> that the sanitiser
  // missed. The browser must refuse it before any request is made.
  const violation = await page.evaluate(
    () =>
      new Promise((resolve) => {
        document.addEventListener(
          'securitypolicyviolation',
          (e) => resolve({ directive: e.effectiveDirective, blocked: e.blockedURI }),
          { once: true },
        )
        const img = new Image()
        img.src = 'https://evil.test/csp-probe.gif'
        document.body.appendChild(img)
        setTimeout(() => resolve(null), 3_000)
      }),
  )
  expect(violation, 'a securitypolicyviolation fired').toMatchObject({ directive: 'img-src' })
  expect(violation.blocked).toContain('evil.test')
  expect(beaconHits, 'blocked before the network').toEqual([])
})

test('RS-J3 · withdrawing from the card is immediate — the open page, the file and the code all die (MTC-S02)', async ({ page }) => {
  const card = await openNcShareCard(page)
  // The CSP is scoped to the external page: the app's own pages carry none.
  await expect(page.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveCount(0)
  await expectCardLists(card, RECIPIENT)
  // The card saw the visit (view_count reaches IndexedDB through sync).
  await expect(card.getByText(/viewed \d+×/)).toBeVisible({ timeout: 45_000 })

  await card.getByRole('button', { name: `Withdraw access for ${RECIPIENT}` }).click()
  await expect(page.getByText(`Access withdrawn for ${RECIPIENT}.`).first()).toBeVisible()

  const link = linkFor(SHARE.nc.id, RECIPIENT)
  expect(link.revokedAt, 'revoked_at').not.toBe('')
  expect(link.revokedBy).toBe(USERS.author.id)
  expect(otpCleared(link.id), 'in-flight code nulled').toBe(true)
  await expect(card.getByText(`Withdrawn: ${RECIPIENT}`)).toBeVisible({ timeout: 45_000 })

  // The external browser still holds a session that PASSED the code. It no
  // longer matters: every request re-checks the link first.
  const x = external.page
  expect((await x.request.get(`/api/v1/share/${token}/files/${asset.file}`)).status()).toBe(404)
  expect((await x.request.get(`/api/v1/share/${token}`)).status()).toBe(404)
  await x.reload()
  await expect(x.getByText('This link is no longer valid.')).toBeVisible()
  await expect(x.getByText(SHARE.nc.title)).toHaveCount(0)
  const code = await x.request.post(`/api/v1/share/${token}/request-code`, { data: {} })
  expect(code.status()).toBe(404)
})
