// Page-driven helpers for the authentication journeys (PW-J6, J7, J10, J11).
//
// WHY THIS FILE EXISTS, separately from `fixtures/authentication.js`:
//
// `authentication.js` serves the module's PRE-AUTH HTTP probes — PW-J1…J5 fire
// raw requests from a cookie-free `APIRequestContext` and never open a page. That
// left the module scored at **0 of 11 pages driven** (doc 19): all 18 of its tests
// asserted on status codes, so nothing protected `signin.vue`,
// `forgot-password.vue` or `reset-password.vue` from a regression that only shows
// up in a browser. The helpers below are the browser half — they type into the
// real inputs, click the real buttons, and then prove the database agrees.
//
// LOCATOR RULES FOR THIS MODULE (learned the expensive way — a sibling module lost
// 13 specs to a locator that silently matched nothing after a label rename):
//
//   * Every string below was verified against the live DOM before it was written,
//     not read off a screenshot or a doc.
//   * `getByPlaceholder` is a SUBSTRING, CASE-INSENSITIVE match by default. On
//     `reset-password.vue` that is actively dangerous: `getByPlaceholder('New
//     password')` matches BOTH "New password" AND "Confirm new password" (verified:
//     count=2), so the strict-mode violation or, worse, the wrong field gets
//     filled. Every placeholder locator here passes `{ exact: true }`.
//   * A locator that matches nothing fails 25s later as a timeout, which reads like
//     a product bug. `expectSignInPageRendered` asserts the form is actually on
//     screen FIRST, so a rename fails fast and unambiguously.

import { execFileSync } from 'node:child_process'
import { expect, request } from '@playwright/test'
import { sql, sqlValue } from './db.js'

/** Tenant app origin (Vite). The sign-in form posts to `/api/...` on this host. */
export const APP_ORIGIN = process.env.E2E_BASE_URL || 'http://e2elab.localhost:5173'
/** Direct API origin. MUST be the tenant host — see fixtures/authentication.js. */
export const API_ORIGIN = process.env.E2E_API_ORIGIN || 'http://e2elab.localhost:4000'
export const MAILHOG = process.env.E2E_MAILHOG || 'http://localhost:8025'

/** express-session's default cookie name (no `name` option in shared/utils/session.js). */
export const SESSION_COOKIE = 'connect.sid'

/**
 * The E2ELAB tenant slug as `portalLogin` matches it.
 *
 * ⚠️ CASE-SENSITIVE. `controllers/portal/auth.js:26-28` does
 * `db.Company.findOne({ where: { code: tenantSlug } })` — an exact equality against
 * `companies.code`, which is seeded UPPERCASE. Passing 'e2elab' returns
 * 401 "Invalid credentials" (deliberately vague so tenant slugs can't be probed),
 * which is indistinguishable from a wrong password when you are debugging.
 */
export const TENANT_CODE = 'E2ELAB'

// ── Sign-in page (S-01 · signin.vue → LoginForm.vue) ────────────────────────

/** The three controls that make up the credential form. Verified against the DOM. */
export function signInForm(page) {
  return {
    email: page.getByPlaceholder('Email', { exact: true }),
    password: page.getByPlaceholder('Password', { exact: true }),
    submit: page.getByRole('button', { name: 'Sign in', exact: true }),
    forgotLink: page.getByRole('link', { name: 'Forgot password?' }),
  }
}

/**
 * Assert the sign-in page really rendered before touching it.
 *
 * This is the guard against the failure mode that cost a sibling module 13 specs:
 * if `LoginForm.vue`'s copy or placeholders change, this fails immediately with
 * "expected visible" instead of bleeding out as a 25s fill() timeout that looks
 * like the backend hung.
 */
export async function expectSignInPageRendered(page) {
  const form = signInForm(page)
  await expect(page.getByText('Welcome back')).toBeVisible()
  await expect(form.email, 'the Email input is on screen').toBeVisible()
  await expect(form.password, 'the Password input is on screen').toBeVisible()
  await expect(form.submit, 'the Sign in button is on screen').toBeVisible()
}

/**
 * Drive a real credential login through the real page.
 *
 * Deliberately NOT a fetch: the point of these journeys is that the PAGE works.
 * `LoginForm.submitForm()` posts to `/api/v1/auth/login`; `fetch` follows the 302
 * into `/v1/auth/handoff`, which regenerates the session and sets the final cookie,
 * and the component then assigns `window.location`.
 *
 * @returns {Promise<{ sid: string|null }>} the session id the browser ended up with
 */
export async function signInThroughPage(page, email, password, { origin = APP_ORIGIN } = {}) {
  await page.goto(`${origin}/signin`)
  await expectSignInPageRendered(page)

  const form = signInForm(page)
  await form.email.fill(email)
  await form.password.fill(password)
  await form.submit.click()

  // ⚠️ WAIT FOR A *SETTLED* SESSION, NOT MERELY FOR A COOKIE.
  //
  // Login is a two-hop redirect chain and the browser stores a cookie from BOTH
  // hops: `/v1/auth/login` issues sid1, then `/v1/auth/handoff` calls
  // session.regenerate() and issues sid2 while destroying sid1. A poll that
  // returns as soon as *any* cookie exists can therefore hand back sid1 — an id
  // that is about to stop existing. Every later assertion then reads "Redis has
  // no session for this cookie", which looks exactly like a broken login but is
  // really a race in the test. This cost PW-J7 three false failures before it was
  // pinned down.
  //
  // Requiring the sid to resolve to a LIVE Redis session is the real readiness
  // condition, and only the post-handoff id can satisfy it.
  //
  // Deliberately not waiting on a URL instead: where a persona lands depends on
  // their grants (an ungranted persona may be routed elsewhere), which is not
  // what this helper is asserting.
  await expect
    .poll(
      async () => {
        const candidate = await sidFromContext(page.context())
        return candidate && sessionKeyExists(candidate) ? candidate : null
      },
      {
        message:
          'the browser never settled on a session cookie backed by a live Redis session — ' +
          'the login did not complete through the handoff',
        timeout: 30_000,
        intervals: [250, 250, 500, 500, 1000],
      },
    )
    .not.toBeNull()

  return { sid: await sidFromContext(page.context()) }
}

/**
 * Park a signed-in page on about:blank so the SPA stops issuing requests.
 *
 * ⚠️ REQUIRED BEFORE ANY SIGN-OUT / SESSION-REVOKE ASSERTION.
 *
 * express-session writes the session back at the end of a request. A freshly
 * loaded SPA has several requests in flight (session hydrate, syncEngine
 * bootstrap, socket handshake), each holding a loaded session object. If one of
 * them finishes just AFTER `req.session.destroy()`, its write RESURRECTS the
 * `auth:<sid>` key that sign-out had already deleted — and the assertion "the
 * session is gone" fails intermittently, depending purely on how far the SPA got.
 * PW-J7's CONTROL failed exactly this way in a full-file run while passing when
 * the file ran alone.
 *
 * Navigating away first removes the source of those writes. Cookies live on the
 * BrowserContext, not the page, so the session itself is untouched and
 * `context.request` still carries it.
 */
export async function quiescePage(page) {
  await page.goto('about:blank')
  await page.waitForTimeout(500)
}

/**
 * The express-session id the browser currently holds, or null.
 *
 * The cookie value is `s:<sid>.<hmac>`, usually percent-encoded as `s%3A…`.
 * Redis stores the session under `auth:<sid>` (RedisStore prefix, shared/utils/session.js),
 * so this is the join key between "what the browser has" and "what the server has".
 */
export async function sidFromContext(context) {
  const cookies = await context.cookies()
  const raw = cookies.find((c) => c.name === SESSION_COOKIE)?.value
  return parseSid(raw)
}

/** Extract the sid out of a raw `connect.sid` cookie value. */
export function parseSid(raw) {
  if (!raw) return null
  const decoded = decodeURIComponent(raw)
  const body = decoded.startsWith('s:') ? decoded.slice(2) : decoded
  const sid = body.split('.')[0]
  return sid || null
}

/** Pull the sid out of a response's Set-Cookie headers (for redirect-level probes). */
export function sidFromSetCookie(headersArray) {
  for (const h of headersArray) {
    if (h.name.toLowerCase() !== 'set-cookie') continue
    const m = /connect\.sid=([^;]+)/.exec(h.value)
    if (m) return parseSid(m[1])
  }
  return null
}

/** Every Set-Cookie header value on a response, joined — for attribute assertions. */
export function setCookieHeaders(headersArray) {
  return headersArray.filter((h) => h.name.toLowerCase() === 'set-cookie').map((h) => h.value)
}

// ── Forgot-password page (S-04 · ForgotPasswordForm.vue) ────────────────────

export function forgotPasswordForm(page) {
  return {
    email: page.getByPlaceholder('Email', { exact: true }),
    submit: page.getByRole('button', { name: 'Send reset link' }),
  }
}

// ── Reset-password page (S-05 · ResetPasswordForm.vue) ──────────────────────

/**
 * ⚠️ `{ exact: true }` is load-bearing on both fields — see the header note.
 * Without it, 'New password' matches 'Confirm new password' too (count=2).
 */
export function resetPasswordForm(page) {
  return {
    password: page.getByPlaceholder('New password', { exact: true }),
    confirm: page.getByPlaceholder('Confirm new password', { exact: true }),
    submit: page.getByRole('button', { name: 'Reset password' }),
  }
}

// ── Passwords ───────────────────────────────────────────────────────────────

/**
 * A policy-compliant password that is UNIQUE per run.
 *
 * Uniqueness is not cosmetic: `password_history` keeps `historyDepth` (5) entries
 * and `validateNewPassword` rejects a reused one, so a fixed constant makes the
 * spec pass once and then fail on every re-run with "Don't reuse one of your last
 * 5 passwords" — a false red that looks like a policy regression.
 */
export function freshCompliantPassword(tag = 'J10') {
  return `E2e${tag}!${Date.now()}`
}

/** The stored argon2 hash(es) for an email, so a spec can put them back. */
export function passwordHashOf(email) {
  return sqlValue(`SELECT password FROM users WHERE email = '${email}'`)
}

/**
 * Restore a persona's password hash.
 *
 * Any spec that RESETS a password must call this in teardown. `12345678` is the
 * shared seed password and other journeys (PW-J1's "the victim can still log in
 * with their correct password") depend on it, but it does not satisfy the live
 * policy — so it can only ever be put back as a hash, never re-set through the API.
 */
export function restorePasswordHash(email, hash) {
  if (!hash) return
  sql(`UPDATE users SET password = '${hash}' WHERE email = '${email}'`)
}

export function passwordHistoryIds(email) {
  const out = sql(
    `SELECT h.id FROM password_history h JOIN users u ON u.id = h.user_id WHERE u.email = '${email}'`,
  )
  return out ? out.split('\n').filter(Boolean) : []
}

/** Drop history rows this run created, so the reuse check starts clean next time. */
export function deletePasswordHistoryExcept(email, keepIds) {
  const keep = keepIds.length ? keepIds.map((id) => `'${id}'`).join(',') : `'00000000-0000-0000-0000-000000000000'`
  sql(
    `DELETE FROM password_history WHERE user_id IN (SELECT id FROM users WHERE email = '${email}')
       AND id NOT IN (${keep})`,
  )
}

// ── Redis ───────────────────────────────────────────────────────────────────

/** Run a redis-cli command in the dev Redis container. */
export function redis(command) {
  const container = process.env.E2E_REDIS_CONTAINER || 'qms-redis-1'
  return execFileSync('docker', ['exec', container, 'sh', '-lc', `redis-cli ${command}`], {
    encoding: 'utf8',
  }).trim()
}

/** Is there a live express-session in Redis for this sid? */
export function sessionKeyExists(sid) {
  if (!sid) return false
  return redis(`EXISTS "auth:${sid}"`) === '1'
}

/**
 * The raw express-session JSON the server holds for a sid.
 *
 * Lets a spec assert on session-level fields the API never echoes back — most
 * importantly `sessionScope`, which is the whole basis of the PORTAL_ONLY boundary
 * and is otherwise only observable indirectly through a 403.
 */
export function sessionStoreValue(sid) {
  if (!sid) return null
  const raw = redis(`GET "auth:${sid}"`)
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

/** The per-user session index (`utils/sessionRegistry.js:24`) — what makes sign-out global. */
export function sessionIndexMembers(email) {
  const out = redis(`SMEMBERS "user_sessions:${String(email).toLowerCase()}"`)
  return out ? out.split('\n').map((s) => s.trim()).filter(Boolean) : []
}

export function deleteSessionIndex(email) {
  redis(`DEL "user_sessions:${String(email).toLowerCase()}"`)
}

/**
 * Drop the resend cooldown for an address so the NEXT request actually sends mail.
 *
 * THIS IS THE ONLY IMPLEMENTATION. `clearResetCooldown` in
 * `fixtures/authentication.js` now delegates here; it used to delete
 * `pwreset_sent:<email>`, a key name that never existed in the API at any point,
 * so it silently cleared nothing. The live key is `resend:<scope>:<email>`
 * (resendCooldown.js:43). When the old helper missed, the next `/password/forgot`
 * inside the 60s window was suppressed with a byte-identical 200 response, by
 * design — so the only symptom was that no email ever arrived, surfacing 45s later
 * as a mailbox-polling timeout that reads like "the worker is down". That cost
 * PW-J10 a full debugging cycle. Keep the key shape in one place.
 *
 * @param {string} scope 'pwreset' | 'mfaotp' | …
 */
export function clearResendCooldown(scope, email) {
  redis(`DEL "resend:${scope}:${String(email).trim().toLowerCase()}"`)
}

/** Forget every trace of a persona's sessions — both stores. Teardown only. */
export function purgeSessions(email) {
  for (const sid of sessionIndexMembers(email)) redis(`DEL "auth:${sid}"`)
  deleteSessionIndex(email)
  sql(
    `UPDATE user_sessions SET revoked_at = COALESCE(revoked_at, NOW()), revoked_reason = COALESCE(revoked_reason, 'e2e teardown')
      WHERE email = '${String(email).toLowerCase()}' AND revoked_at IS NULL`,
  )
}

// ── Mailhog ─────────────────────────────────────────────────────────────────

/** Minimal quoted-printable decode — enough to recover an ASCII URL from an HTML body. */
export function decodeQuotedPrintable(input) {
  return String(input)
    .replace(/=(?:\r\n|\n|\r)/g, '')
    .replace(/=([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
}

async function mailhogSearch(email, limit = 50) {
  const ctx = await request.newContext({ baseURL: MAILHOG })
  try {
    const res = await ctx.get(
      `/api/v2/search?kind=to&query=${encodeURIComponent(email)}&limit=${limit}`,
      { failOnStatusCode: false },
    )
    if (!res.ok()) return null
    return await res.json()
  } catch {
    return null
  } finally {
    await ctx.dispose()
  }
}

/** The Mailhog message ids currently addressed to `email` — snapshot before an action. */
export async function mailIdsTo(email) {
  const data = await mailhogSearch(email)
  if (!data) return null
  return (data.items || []).map((m) => m.ID)
}

/**
 * The password-reset token from the newest mail to `email` that is NOT in `knownIds`.
 *
 * ⚠️ THE TOKEN CANNOT COME FROM THE DATABASE. Doc 14 says "read the token from
 * `password_reset_tokens`", but that table stores only `token_hash` (SHA-256, see
 * `controllers/auth/resetPassword.js:23-25` and the live schema — there is no
 * plaintext column). The emailed link is the only place the plaintext exists, which
 * is exactly the property under test. Reading it from Mailhog also proves the mail
 * actually went out, not merely that a row appeared.
 */
export async function waitForResetToken(email, knownIds, { timeoutMs = 45_000 } = {}) {
  const seen = new Set(knownIds || [])
  const deadline = Date.now() + timeoutMs
  let lastSeenCount = seen.size
  while (Date.now() < deadline) {
    const data = await mailhogSearch(email)
    if (data) {
      lastSeenCount = (data.items || []).length
      for (const item of data.items || []) {
        if (seen.has(item.ID)) continue
        const body = decodeQuotedPrintable(item.Content?.Body || '')
        const match = /https?:\/\/[^\s"'<>]*\/reset-password\?token=([0-9a-fA-F]{32,})/.exec(body)
        if (match) return { token: match[1], url: match[0], id: item.ID }
      }
    }
    await new Promise((r) => setTimeout(r, 1_000))
  }
  throw new Error(
    `waitForResetToken timed out after ${timeoutMs}ms for ${email} ` +
      `(mailhog held ${lastSeenCount} messages to that address; ` +
      `is the worker running, and was the resend:pwreset:<email> cooldown cleared?)`,
  )
}

// ── HTTP contexts ───────────────────────────────────────────────────────────

/**
 * A cookie-free API context with its own jar.
 *
 * `storageState: { cookies: [], origins: [] }` is load-bearing — without it
 * `request.newContext()` inherits `use.storageState` and any login performed here
 * destroys the declaring role's session via handoff's `regenerate()`.
 * See `fixtures/authentication.js:12-16` and e2e/README.md.
 */
export async function jarContext({ baseURL = API_ORIGIN } = {}) {
  return request.newContext({ baseURL, storageState: { cookies: [], origins: [] } })
}

/**
 * Establish a real, fully-handed-off session over HTTP and return the live jar.
 *
 * The two hops are driven manually rather than by letting the client follow the
 * 302, because the redirect Location points at the Vite origin (`:5173/api/...`)
 * while this context is aimed at the API (`:4000`). Following it works, but going
 * through the proxy makes a failure ambiguous between "auth broke" and "the dev
 * proxy hiccuped". Caller must dispose the returned context.
 *
 * @returns {Promise<{ ctx: import('@playwright/test').APIRequestContext, sid: string }>}
 */
export async function establishSessionViaApi(email, password) {
  const ctx = await jarContext()
  const login = await ctx.post('/v1/auth/login', {
    data: { email, password },
    maxRedirects: 0,
    failOnStatusCode: false,
  })
  if (login.status() !== 302) {
    const body = await login.text().catch(() => '')
    await ctx.dispose()
    throw new Error(`establishSessionViaApi(${email}): expected 302, got ${login.status()} ${body}`)
  }
  const token = /token=([0-9a-fA-F]+)/.exec(login.headers()['location'] || '')?.[1]
  if (!token) {
    await ctx.dispose()
    throw new Error(`establishSessionViaApi(${email}): no handoff token in the redirect`)
  }
  const handoff = await ctx.get(`/v1/auth/handoff?token=${token}`, {
    maxRedirects: 0,
    failOnStatusCode: false,
  })
  const sid = sidFromSetCookie(handoff.headersArray())
  if (!sid) {
    await ctx.dispose()
    throw new Error(`establishSessionViaApi(${email}): handoff issued no session cookie`)
  }
  return { ctx, sid }
}

// ── DB readers ──────────────────────────────────────────────────────────────

export function loginEventCountSince(email, eventType, sinceIso) {
  return Number(
    sqlValue(
      `SELECT count(*) FROM login_events
        WHERE email = '${String(email).toLowerCase()}' AND event_type = '${eventType}'
          AND created_at >= '${sinceIso}'`,
    ) || 0,
  )
}

/** The newest live session shadow row for an email, as an object (or null). */
export function newestSessionRow(email) {
  const out = sql(
    `SELECT session_id, scope, revoked_at, expires_at, user_id, company_id, device_id
       FROM user_sessions WHERE email = '${String(email).toLowerCase()}'
      ORDER BY created_at DESC LIMIT 1`,
  )
  if (!out) return null
  const [sessionId, scope, revokedAt, expiresAt, userId, companyId, deviceId] = out
    .split('\n')[0]
    .split('|')
  return {
    sessionId,
    scope,
    revokedAt: revokedAt || null,
    expiresAt: expiresAt || null,
    userId: userId || null,
    companyId: companyId || null,
    deviceId: deviceId || null,
  }
}

export function sessionRowBySid(sid) {
  const out = sql(
    `SELECT scope, revoked_at, expires_at FROM user_sessions WHERE session_id = '${sid}' LIMIT 1`,
  )
  if (!out) return null
  const [scope, revokedAt, expiresAt] = out.split('\n')[0].split('|')
  return { scope, revokedAt: revokedAt || null, expiresAt: expiresAt || null }
}

export function deviceCountSince(email, sinceIso) {
  return Number(
    sqlValue(
      `SELECT count(*) FROM user_devices
        WHERE email = '${String(email).toLowerCase()}' AND last_seen_at >= '${sinceIso}'`,
    ) || 0,
  )
}

export function lastLoginAfter(userId, companyId, sinceIso) {
  return (
    Number(
      sqlValue(
        `SELECT count(*) FROM last_logins
          WHERE user_id = '${userId}' AND company_id = '${companyId}'
            AND last_login_date >= '${sinceIso}'`,
      ) || 0,
    ) > 0
  )
}

/** An ISO timestamp psql will accept, taken a moment before an action. */
export function nowIso() {
  return new Date().toISOString()
}
