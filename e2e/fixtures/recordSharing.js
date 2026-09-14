// Record Sharing E2E helpers — the `recordSharing` project.
//
// External share links: an internal user mints a link to ONE record for an
// outside email address; the recipient opens /share/:token with no account,
// receives a one-time code at that same address, verifies, and reads a curated,
// allow-listed projection of the record (qms/backend/api/services/shareProjections).
//
// Fixtures live in qms/database/e2e-seed.sql §42. Personas are reused from the
// cast — see that section's header for who holds which `manage_access`.
//
// ── The OTP budget (read before adding a journey) ─────────────────────────────
// POST /v1/share/:token/request-code and /verify sit on `strictAuthLimiter`:
// 20 requests / 15 min / IP, shared with the MFA / reset / invitation / PIN
// routes every other suite uses. A full `recordSharing` run spends SEVEN of them
// (j1: five, j3: two). Everything that can be asserted without a verified
// session — the code gate, the uniform 404, the reuse semantics, revocation of
// an unverified link — is asserted without one. Never loop on these endpoints,
// and never present a different X-Forwarded-For to escape the limiter.
import { request, expect } from '@playwright/test'
import { Buffer } from 'node:buffer'
import { BASE_URL, COMPANY_ID, USERS, PASSWORD, SITES } from './cast.js'
import { sql, sqlValue } from './db.js'

export const MAILHOG = process.env.E2E_MAILHOG || 'http://localhost:8025'

/** Every external recipient in this suite lives here, so one purge finds them all. */
export const SHARE_DOMAIN = 'share.e2e.test'

/** Per-process run tag: recipient addresses never collide with an earlier run's mail. */
export const RUN = Date.now().toString(36)

/** A fresh external address for one journey. Lowercase, as the server stores it. */
export function extEmail(tag) {
  return `rs-${tag}-${RUN}@${SHARE_DOMAIN}`
}

// Seeded by e2e-seed.sql §42.
export const SHARE = {
  nc: {
    id: 'e2e5f000-0000-4000-8000-000000000930',
    number: 'NC-SHR-930',
    title: 'Share fixture NC (RS-930)',
    siteId: SITES.primary.id,
  },
  ncOtherSite: {
    id: 'e2e5f000-0000-4000-8000-000000000931',
    number: 'NC-SHR-931',
    title: 'Share fixture NC, secondary site (RS-931)',
    siteId: SITES.secondary.id,
  },
  ncClosed: {
    id: 'e2e5f000-0000-4000-8000-000000000932',
    number: 'NC-SHR-932',
    title: 'Share fixture NC, closed (RS-932)',
    bodyText: 'RS932 closed evidence record for the audit package.',
  },
  doc: {
    id: 'e2e5f100-0000-4000-8000-000000000930',
    number: 'DSHR-930',
    title: 'Share Fixture SOP (RS-930)',
    sectionText: 'RS930 PURPOSE',
  },
  audit: { id: 'e2e5f400-0000-4000-8000-000000000930', number: 'AUD-SHR-930' },
  // Values seeded into NC-930's INTERNAL columns (cost_of_nc, credit_from_supplier,
  // root_cause, disposition_notes). None may appear on the external page or in
  // the raw response. Both number renderings are listed because a leak could
  // surface either way.
  internalValues: [
    '93017.55',
    '93,017.55',
    '93042.25',
    '93,042.25',
    'RS930-INTERNAL-ROOT-CAUSE',
    'RS930-INTERNAL-DISPOSITION',
  ],
  // Model attribute names that must never be keys of the projection.
  internalKeys: ['costOfNc', 'creditFromSupplier', 'rootCause', 'dispositionNotes', 'ownerId', 'departmentId', 'pendingReviewers'],
}

const FIXTURE_IDS = [SHARE.nc.id, SHARE.ncOtherSite.id, SHARE.ncClosed.id, SHARE.doc.id, SHARE.audit.id]

const q = (s) => `'${String(s).replace(/'/g, "''")}'`

// ── Database ──────────────────────────────────────────────────────────────────

/**
 * Remove every share link on the §42 fixtures and every link to a suite
 * address. Secrets, views and package items cascade. Called at the top of each
 * file, so a file never inherits another's links — and never touches a link
 * any other suite could own (§42's records are shared by nothing else).
 */
export function purgeShareLinks() {
  sql(
    `DELETE FROM record_share_links WHERE company_id = ${q(COMPANY_ID)}
       AND (entity_id IN (${FIXTURE_IDS.map(q).join(',')}) OR email LIKE ${q(`%@${SHARE_DOMAIN}`)})`,
  )
}

/**
 * All links on one record, oldest first. Empty strings stand in for NULLs;
 * `expiresAt` is epoch milliseconds (Postgres' timestamptz text is not
 * something Date.parse reads reliably).
 */
export function linksFor(entityId) {
  const out = sql(
    `SELECT id, email, origin, coalesce(created_by::text, ''), coalesce(revoked_at::text, ''),
            coalesce(revoked_by::text, ''), (extract(epoch FROM expires_at) * 1000)::bigint,
            coalesce(verified_at::text, ''), view_count
       FROM record_share_links WHERE entity_id = ${q(entityId)} ORDER BY created_at`,
  )
  if (!out) return []
  return out.split('\n').map((line) => {
    const [id, email, origin, createdBy, revokedAt, revokedBy, expiresAt, verifiedAt, viewCount] =
      line.split('|')
    return {
      id,
      email,
      origin,
      createdBy,
      revokedAt,
      revokedBy,
      expiresAt: Number(expiresAt),
      verifiedAt,
      viewCount: Number(viewCount),
    }
  })
}

/** The newest link for (record, address), or null. */
export function linkFor(entityId, email) {
  const rows = linksFor(entityId).filter((l) => l.email === email.toLowerCase())
  return rows.length ? rows[rows.length - 1] : null
}

/** Live (unrevoked) rows for (record, address) — the partial unique index's population. */
export function liveLinkCount(entityId, email) {
  return Number(
    sqlValue(
      `SELECT count(*) FROM record_share_links WHERE entity_id = ${q(entityId)}
         AND lower(email) = lower(${q(email)}) AND revoked_at IS NULL`,
    ),
  )
}

export function viewRowCount(linkId) {
  return Number(sqlValue(`SELECT count(*) FROM record_share_link_views WHERE share_link_id = ${q(linkId)}`))
}

/** Is the in-flight code gone? (revocation must null it). */
export function otpCleared(linkId) {
  return sqlValue(`SELECT otp_hash IS NULL FROM record_share_link_secrets WHERE share_link_id = ${q(linkId)}`) === 't'
}

/** The manifest of a package link, as "EntityType:id" strings. */
export function packageItems(linkId) {
  const out = sql(
    `SELECT entity_type || ':' || entity_id FROM record_share_link_items
      WHERE record_share_link_id = ${q(linkId)} ORDER BY entity_type`,
  )
  return out ? out.split('\n') : []
}

/** MTC-S03's own recipe: push a link past its expiry. */
export function expireLink(linkId) {
  sql(`UPDATE record_share_links SET expires_at = now() - interval '1 day' WHERE id = ${q(linkId)}`)
}

export function setLinkExpiry(linkId, interval) {
  sql(`UPDATE record_share_links SET expires_at = now() + interval ${q(interval)} WHERE id = ${q(linkId)}`)
}

/**
 * Point NC-930's description at real uploaded assets: one inline image (the
 * editor's `<img data-id>` shape) and one attached file (the
 * `[qms-attachments]::` manifest the editor appends). Both shapes feed
 * collectRecordAssets — the file endpoint's authorisation rule.
 */
export function setNcAttachments({ imageId, fileId, fileName }) {
  const manifest = JSON.stringify([{ assetId: fileId, name: fileName, mimeType: 'application/pdf' }])
  const html =
    `<p>Seeded for the recordSharing suite. Do not edit.</p>` +
    `<figure><img data-id="${imageId}" src="/api/v1/files/${COMPANY_ID}/rs930.png" alt="rs930-inline-photo"></figure>` +
    `\n[qms-attachments]::${manifest}`
  sql(`UPDATE nonconformances SET description = ${q(html)} WHERE id = ${q(SHARE.nc.id)}`)
}

// ── REST ──────────────────────────────────────────────────────────────────────

/** An API context carrying a saved persona session. Callers dispose it. */
export function apiAs(storageState, baseURL = BASE_URL) {
  return request.newContext({ baseURL, storageState })
}

/**
 * An API context with NO cookies. The empty storageState is load-bearing: a
 * context created inside a test otherwise inherits that test's storageState —
 * see freshContext() in fixtures/sites.js.
 */
export function anonApi(baseURL = BASE_URL) {
  return request.newContext({ baseURL, storageState: { cookies: [], origins: [] } })
}

/**
 * A just-minted session for a cast member — for personas whose saved state a
 * mid-run grant/site change could have made stale. One login on authLimiter.
 */
export async function freshApi(userKey, baseURL = BASE_URL) {
  const user = USERS[userKey]
  const api = await request.newContext({ baseURL, storageState: { cookies: [], origins: [] } })
  const login = await api.post('/api/v1/auth/login', { data: { email: user.email, password: PASSWORD } })
  expect(login.ok(), `fresh login ${userKey} → ${login.status()}`).toBeTruthy()
  return api
}

async function outcome(res) {
  const text = await res.text()
  let body = null
  try {
    body = JSON.parse(text)
  } catch {
    body = text
  }
  return { status: res.status(), body, message: body?.error?.message ?? null }
}

export async function mintShare(api, { entityType, entityId, emails }) {
  return outcome(
    await api.post('/api/v1/services/recordShareLinks', { data: { entityType, entityId, emails } }),
  )
}

export async function mintPackage(api, { auditInstanceId, emails, items, mode }) {
  return outcome(
    await api.post('/api/v1/services/recordShareLinks/package', {
      data: { auditInstanceId, emails, items, mode },
    }),
  )
}

export async function revokeShare(api, linkId) {
  return outcome(await api.post(`/api/v1/services/recordShareLinks/${linkId}/revoke`, { data: {} }))
}

/** GET /v1/share/:token on a given (anonymous or verified) context. */
export async function openShare(api, token) {
  return outcome(await api.get(`/api/v1/share/${token}`))
}

/**
 * Upload a real file the way the editor does, so the share file endpoint has
 * an object in the private bucket to stream. Returns the asset id.
 */
export async function uploadAsset(api, { name, mimeType, buffer }) {
  const res = await api.post('/api/v1/files/upload', {
    multipart: { file: { name, mimeType, buffer }, fileType: 'ASSET' },
  })
  const text = await res.text()
  expect(res.status(), `upload ${name} → ${res.status()} ${text.slice(0, 200)}`).toBe(201)
  return JSON.parse(text).asset.id
}

export const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

/** A marker string the download assertion reads back out of the bytes. */
export const ATTACHMENT_MARKER = 'RS930-ATTACHMENT-BODY'
export function pdfBytes(marker = ATTACHMENT_MARKER) {
  return Buffer.from(`%PDF-1.4\n% ${marker}\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF\n`)
}

// ── MailHog ───────────────────────────────────────────────────────────────────
// Mail is sent by the worker (graphile job), so every read polls.

/** Quoted-printable → UTF-8, byte-accurate (a naive char-by-char decode breaks "·"). */
function decodeQuotedPrintable(input) {
  const soft = String(input).replace(/=\r?\n/g, '')
  const bytes = []
  for (let i = 0; i < soft.length; i++) {
    const hex = soft.slice(i + 1, i + 3)
    if (soft[i] === '=' && /^[0-9A-Fa-f]{2}$/.test(hex)) {
      bytes.push(parseInt(hex, 16))
      i += 2
    } else {
      bytes.push(...Buffer.from(soft[i], 'utf8'))
    }
  }
  return Buffer.from(bytes).toString('utf8')
}

/** RFC 2047 encoded-words, as MailHog hands back a non-ASCII Subject. */
function decodeHeader(value) {
  return String(value ?? '')
    .replace(/\?=\s+=\?/g, '?==?')
    .replace(/=\?([^?]+)\?([QqBb])\?([^?]*)\?=/g, (_, _charset, enc, text) =>
      enc.toUpperCase() === 'B'
        ? Buffer.from(text, 'base64').toString('utf8')
        : decodeQuotedPrintable(text.replace(/_/g, ' ')),
    )
}

function decodeBody(body, encoding) {
  const enc = String(encoding || '').toLowerCase()
  if (enc === 'quoted-printable') return decodeQuotedPrintable(body)
  if (enc === 'base64') return Buffer.from(String(body).replace(/\s+/g, ''), 'base64').toString('utf8')
  return String(body ?? '')
}

function parseMessage(item) {
  const headers = item.Content?.Headers || {}
  let html = decodeBody(item.Content?.Body, headers['Content-Transfer-Encoding']?.[0])
  const parts = item.MIME?.Parts || []
  const htmlPart = parts.find((p) => (p.Headers?.['Content-Type']?.[0] || '').includes('text/html'))
  if (htmlPart) html = decodeBody(htmlPart.Body, htmlPart.Headers?.['Content-Transfer-Encoding']?.[0])
  return {
    id: item.ID,
    created: Date.parse(item.Created),
    subject: decodeHeader(headers.Subject?.[0]),
    to: (item.To || []).map((t) => `${t.Mailbox}@${t.Domain}`.toLowerCase()),
    html,
  }
}

/** Every message addressed to `email`, newest first. */
export async function mailsTo(email) {
  const ctx = await request.newContext({ baseURL: MAILHOG })
  try {
    const res = await ctx.get(`/api/v2/search?kind=to&query=${encodeURIComponent(email)}&limit=100`)
    expect(res.ok(), `MailHog search → ${res.status()}`).toBeTruthy()
    const items = ((await res.json()).items || []).map(parseMessage)
    return items
      .filter((m) => m.to.includes(email.toLowerCase()))
      .sort((a, b) => b.created - a.created)
  } finally {
    await ctx.dispose()
  }
}

/**
 * Wait until at least `min` messages to `email` match `subject` (substring or
 * RegExp); return the newest.
 */
export async function waitForMail(email, { subject = null, min = 1, timeoutMs = 45_000 } = {}) {
  const matches = (m) =>
    !subject || (subject instanceof RegExp ? subject.test(m.subject) : m.subject.includes(subject))
  const deadline = Date.now() + timeoutMs
  let seen = []
  while (Date.now() < deadline) {
    seen = await mailsTo(email)
    const hits = seen.filter(matches)
    if (hits.length >= min) return hits[0]
    await new Promise((r) => setTimeout(r, 1_000))
  }
  throw new Error(
    `No ${min}× mail to ${email} matching ${subject} within ${timeoutMs}ms — saw: ${JSON.stringify(seen.map((m) => m.subject))}`,
  )
}

export async function mailCount(email, subject = null) {
  const all = await mailsTo(email)
  return subject ? all.filter((m) => m.subject.includes(subject)).length : all.length
}

/** The share token out of a "shared with you" mail. */
export function tokenFrom(html) {
  return html.match(/\/share\/([A-Za-z0-9_-]{30,})/)?.[1] ?? null
}

/** The six-digit code out of a verification mail (share-link-otp.ejs: `<span><%= code %></span>`). */
export function codeFrom(html) {
  return html.match(/<span>\s*(\d{6})\s*<\/span>/)?.[1] ?? null
}

// ── Browser ───────────────────────────────────────────────────────────────────

/** A cookie-free browser page — the external recipient, who has no account. */
export async function anonPage(browser, baseURL = BASE_URL) {
  const ctx = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] } })
  return { ctx, page: await ctx.newPage() }
}

/**
 * The record's "Share externally" rail card. BaseRailCard is collapsible by
 * default, so its title is a disclosure BUTTON ("Share externally",
 * aria-expanded), not a heading. `.last()` picks the innermost div containing
 * it — BaseRailCard's own root — since every ancestor matches too.
 */
export function shareCard(page) {
  return page
    .locator('div')
    .filter({ has: page.getByRole('button', { name: 'Share externally' }) })
    .last()
}

export const SHARE_INPUT_PLACEHOLDER = 'name@company.com, another@company.com'

/**
 * Open an NC and wait for its share card. The NC is read out of IndexedDB, so a
 * cold context pays one syncEngine bootstrap first — hence the long wait.
 */
export async function openNcShareCard(page, ncId = SHARE.nc.id) {
  await page.goto(`/nonconformances/${ncId}`, { waitUntil: 'domcontentloaded' })
  const card = shareCard(page)
  await expect(card).toBeVisible({ timeout: 90_000 })
  return card
}

/** A live link row reaches the card only after the sync broadcast lands. */
export async function expectCardLists(card, email, { timeout = 45_000 } = {}) {
  await expect(card.getByText(email, { exact: true })).toBeVisible({ timeout })
}
