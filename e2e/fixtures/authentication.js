// Shared flows + DB/Redis readers for the authentication journeys
// (docs/modules/authentication/14-playwright-journeys.md).
//
// Two things make this module's fixtures different from every other suite's:
//
//  1. Authentication journeys are DESTRUCTIVE to credentials. Probing the account
//     lockout leaves the target at HTTP 423 for the rest of the run. Every
//     lockout helper here is paired with `clearLockout`, and specs must call it in
//     afterAll — see AUTH_PERSONAS below for why we use throwaway accounts too.
//
//  2. Almost nothing here can go through a browser context. These are pre-auth
//     HTTP probes, so they use a genuinely cookie-free APIRequestContext. That is
//     `storageState: { cookies: [], origins: [] }` — NOT the default. Without it,
//     `request.newContext()` inherits the test's `use.storageState` and the login
//     it performs destroys that role's session via handoff's session.regenerate().
//     See e2e/README.md and fixtures/sites.js:62-76.

import { execFileSync } from 'node:child_process'
import { createHmac } from 'node:crypto'
import { expect, request } from '@playwright/test'
import { sql, sqlValue } from './db.js'
// Single source of truth for the `resend:<scope>:<email>` cooldown key — see
// clearResetCooldown at the bottom of this file for why it is not duplicated here.
import { clearResendCooldown } from './authPages.js'

// Re-exported so a spec already importing from this module can reach the scoped
// form (`clearResendCooldown('mfaotp', email)`) without a second import.
export { clearResendCooldown }

/**
 * Direct API origin. Pre-auth probes bypass Vite so the status codes are the
 * API's own.
 *
 * MUST be the tenant host, not `localhost:4000`. A browser context matches
 * cookies by URL host, so a storageState cookie scoped to `e2elab.localhost` is
 * simply not sent to `localhost` — setting a `Host:` header does not help, and the
 * request arrives unauthenticated (401). This cost three false CONTROL failures
 * the first time this suite ran.
 */
export const API_ORIGIN = process.env.E2E_API_ORIGIN || 'http://e2elab.localhost:4000'
export const TENANT_HOST = 'e2elab.localhost'
/** Mailhog HTTP API — the only reliable "was mail actually delivered" signal. */
export const MAILHOG = process.env.E2E_MAILHOG || 'http://localhost:8025'

/**
 * Throwaway credential personas (e2e-seed.sql §27). NO other suite touches these.
 * Never point a lockout or mail-flood probe at a shared persona such as
 * `author@e2e.test` — that locks half the suite out for the rest of the run.
 */
export const AUTH_PERSONAS = {
  victim: { email: 'authvictim@e2e.test', id: 'e2e10000-0000-4000-8000-000000000023' },
  locker: { email: 'authlocker@e2e.test', id: 'e2e10000-0000-4000-8000-000000000024' },
}

/** The seeded password. Does NOT satisfy the tenant password policy — see setPassword note. */
export const PASSWORD = '12345678'
/**
 * Policy-compliant password for any leg that SETS one (invitation accept, reset,
 * forced change). The live policy requires upper + lower + number with
 * minStrengthScore 3, so PASSWORD above is rejected there — existing personas only
 * work because the seed writes hashes directly, bypassing validation.
 */
export const COMPLIANT_PASSWORD = 'E2eAuth!2026'

/**
 * A cookie-free API context aimed at the API origin with the tenant Host header.
 * Callers must dispose it.
 */
export async function anonContext({ source = null } = {}) {
  return request.newContext({
    baseURL: API_ORIGIN,
    // Load-bearing — see the header comment. Do not remove.
    storageState: { cookies: [], origins: [] },
    // `source` presents a distinct client IP via X-Forwarded-For. The API sets
    // `trust proxy` (app.js:25), so this becomes `req.ip` — which is what the
    // (email, source)-scoped lockout keys on. Without it an "attacker" and a
    // "victim" driven from the same test machine are indistinguishable, and the
    // AUTH-S1 fix cannot be observed at all.
    ...(source ? { extraHTTPHeaders: { 'X-Forwarded-For': source } } : {}),
  })
}

/** One login attempt from a clean client. Returns the HTTP status. */
export async function attemptLogin(email, password, { source = null } = {}) {
  const ctx = await anonContext({ source })
  try {
    const res = await ctx.post('/v1/auth/login', {
      data: { email, password },
      failOnStatusCode: false,
      maxRedirects: 0, // a success is a 302 into /v1/auth/handoff; don't follow it
    })
    return res.status()
  } finally {
    await ctx.dispose()
  }
}

/**
 * Fire `count` sequential requests and return the status list. Sequential rather
 * than parallel on purpose: a rate limiter and a lockout counter are both
 * order-sensitive, and a burst of parallel requests can interleave so the Nth
 * response is not the Nth attempt.
 */
export async function burst(count, fn) {
  const out = []
  for (let i = 0; i < count; i += 1) out.push(await fn(i))
  return out
}

/** `count` wrong-password logins against one account. Returns the status list. */
export async function failLogins(email, count, { source = null } = {}) {
  return burst(count, (i) => attemptLogin(email, `wrong-${i}-${Date.now()}`, { source }))
}

/** POST a JSON body to a pre-auth endpoint from a clean client. */
export async function anonPost(path, data, { source = null } = {}) {
  const ctx = await anonContext({ source })
  try {
    const res = await ctx.post(path, { data, failOnStatusCode: false })
    let body = null
    try {
      body = await res.json()
    } catch {
      /* non-JSON is fine for a status-only probe */
    }
    return { status: res.status(), body }
  } finally {
    await ctx.dispose()
  }
}

// ── Lockout state ───────────────────────────────────────────────────────────

/**
 * Redis is the AUTHORITY for lockout (utils/loginLockout.js:6-9); the users
 * columns are a mirror kept for admin visibility. So a reset has to clear both,
 * and a read that only checks the DB can be stale.
 */
export function clearLockout(email) {
  // The AUTH-S1 fix scopes keys to (email, source) — `login_fail:<email>|<ip>` —
  // and adds `login_sources:<email>`, so deleting the two legacy email-only keys is
  // no longer enough. Match by prefix instead.
  //
  // `.toLowerCase()` is not cosmetic: loginLockout.js builds every key through
  // `String(email).toLowerCase()` (emailKey/scopedKey), so a mixed-case address here
  // would produce a glob that matches nothing and a clear that silently clears
  // nothing — the same failure shape as the pwreset_sent bug below. Inert while every
  // persona is lowercase, which is exactly why it would go unnoticed. authGuards.js
  // already normalises; these did not.
  const key = String(email).toLowerCase()
  deleteRedisPattern(`login_fail:${key}*`)
  deleteRedisPattern(`login_lock:${key}*`)
  deleteRedisPattern(`login_sources:${key}*`)
  // NOTE the SQL below is deliberately NOT lowercased — it compares against the
  // stored column, not against a Redis key.
  sql(`UPDATE users SET locked_until = NULL, failed_login_count = 0 WHERE email = '${email}'`)
}

export function clearAllAuthLockouts() {
  for (const p of Object.values(AUTH_PERSONAS)) clearLockout(p.email)
  clearSourceCounters()
}

/**
 * Drop every per-source failure counter. Required between spray probes: the
 * ceiling is global to a source, so one test's failures would otherwise bleed into
 * the next test's budget and produce a 429 nobody asked for.
 */
export function clearSourceCounters() {
  deleteRedisPattern('login_ipfail:*')
}

/** DEL every key matching a glob, via a Lua eval so it is one round trip. */
function deleteRedisPattern(pattern) {
  redis(
    `EVAL "local k=redis.call('keys',ARGV[1]) for i,v in ipairs(k) do redis.call('del',v) end return #k" 0 "${pattern}"`,
  )
}

/**
 * True when Redis holds a lock for this email from ANY source.
 * Prefix match, because the enforced key is `login_lock:<email>|<source>`.
 */
export function isLockedInRedis(email) {
  // Lowercased for the reason clearLockout documents — loginLockout.js keys on the
  // lowercased address, so an un-normalised probe reads "not locked" for a lock that
  // very much exists, i.e. it fails OPEN. That is the worse direction for a probe
  // whose whole job is to assert a lockout happened.
  const n = redis(
    `EVAL "return #redis.call('keys',ARGV[1])" 0 "login_lock:${String(email).toLowerCase()}*"`,
  ).trim()
  return Number(n) > 0
}

/** True when Redis holds a lock for this email from one SPECIFIC source. */
export function isLockedForSource(email, source) {
  return (
    Number(
      redis(`EXISTS "login_lock:${String(email).toLowerCase()}|${source}"`).trim(),
    ) > 0
  )
}

/** The DB mirror of lock state. */
export function lockMirror(email) {
  return {
    lockedUntil: sqlValue(`SELECT locked_until FROM users WHERE email = '${email}'`),
    failedCount: Number(
      sqlValue(`SELECT failed_login_count FROM users WHERE email = '${email}'`) || 0,
    ),
  }
}

// ── TOTP (RFC 6238) ─────────────────────────────────────────────────────────
//
// Implemented here rather than pulled in as a dependency: it is ~25 lines, and a
// test that generates its own codes proves the server's verifier agrees with the
// standard rather than with a shared library's quirks.

/** Decode an RFC 4648 base32 secret (no padding required) to bytes. */
function base32Decode(input) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  const clean = String(input).toUpperCase().replace(/=+$/, '').replace(/\s/g, '')
  let bits = 0
  let value = 0
  const out = []
  for (const ch of clean) {
    const idx = alphabet.indexOf(ch)
    if (idx === -1) throw new Error(`base32Decode: bad character '${ch}'`)
    value = (value << 5) | idx
    bits += 5
    if (bits >= 8) {
      bits -= 8
      out.push((value >>> bits) & 0xff)
    }
  }
  return Buffer.from(out)
}

/**
 * Current 6-digit TOTP for a base32 secret.
 * @param {string} secret base32, as returned by /v1/auth/mfa/totp/setup
 * @param {number} [stepOffset] shift by whole 30s windows (for skew tests)
 */
export function totp(secret, stepOffset = 0) {
  const counter = Math.floor(Date.now() / 1000 / 30) + stepOffset
  const buf = Buffer.alloc(8)
  buf.writeUInt32BE(Math.floor(counter / 2 ** 32), 0)
  buf.writeUInt32BE(counter >>> 0, 4)
  const hmac = createHmac('sha1', base32Decode(secret)).update(buf).digest()
  const offset = hmac[hmac.length - 1] & 0x0f
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    (hmac[offset + 1] << 16) |
    (hmac[offset + 2] << 8) |
    hmac[offset + 3]
  return String(code % 1_000_000).padStart(6, '0')
}

/**
 * Seconds until the current TOTP window ends. Used to avoid the classic flake:
 * generating a code at 29.9s into a window and having the server evaluate it in
 * the next one.
 */
export function secondsLeftInTotpWindow() {
  return 30 - (Math.floor(Date.now() / 1000) % 30)
}

// ── MFA state ───────────────────────────────────────────────────────────────

export const MFA_PERSONA = { email: 'authmfa@e2e.test', id: 'e2e10000-0000-4000-8000-000000000025' }

/**
 * Remove every factor and recovery code for an email.
 *
 * Must run in BOTH beforeAll and afterAll of any MFA spec: an active factor makes
 * `POST /v1/auth/login` return `{ mfaRequired }` instead of a session, so a
 * crashed run would otherwise leave the account un-loggable for the next one.
 */
export function clearMfa(email) {
  const sub = `(SELECT id FROM users WHERE email = '${email}')`
  sql(`DELETE FROM mfa_recovery_codes WHERE user_id IN ${sub}`)
  sql(`DELETE FROM mfa_factors WHERE user_id IN ${sub}`)
}

/**
 * ALL factor rows, any status. Note `/totp/setup` inserts a row with
 * `status='PENDING'` immediately, so this is non-zero from setup onward — it is
 * NOT the same question as "is a second factor in force". Use
 * `activeMfaFactorCount` for that; conflating the two produced a false failure
 * the first time PW-J8 ran.
 */
export function mfaFactorCount(email) {
  return Number(
    sqlValue(
      `SELECT count(*) FROM mfa_factors f JOIN users u ON u.id = f.user_id
        WHERE u.email = '${email}'`,
    ) || 0,
  )
}

/** Factors actually in force — the ones that make login demand a challenge. */
export function activeMfaFactorCount(email) {
  return Number(
    sqlValue(
      `SELECT count(*) FROM mfa_factors f JOIN users u ON u.id = f.user_id
        WHERE u.email = '${email}' AND f.status = 'ACTIVE' AND f.deleted_at IS NULL`,
    ) || 0,
  )
}

export function recoveryCodeCount(email) {
  return Number(
    sqlValue(
      `SELECT count(*) FROM mfa_recovery_codes c JOIN users u ON u.id = c.user_id
        WHERE u.email = '${email}'`,
    ) || 0,
  )
}

/**
 * Log in expecting the MFA challenge rather than a session.
 * Returns the parsed body so the caller can read `pendingToken`.
 */
export async function loginExpectingMfa(email, password = PASSWORD) {
  const ctx = await anonContext()
  try {
    const res = await ctx.post('/v1/auth/login', {
      data: { email, password },
      failOnStatusCode: false,
      maxRedirects: 0,
    })
    let body = null
    try {
      body = await res.json()
    } catch {
      /* a 302 (no MFA) has no JSON body — the caller asserts on status */
    }
    return { status: res.status(), body }
  } finally {
    await ctx.dispose()
  }
}

/** Run a redis-cli command in the dev Redis container. */
function redis(command) {
  const container = process.env.E2E_REDIS_CONTAINER || 'qms-redis-1'
  return execFileSync('docker', ['exec', container, 'sh', '-lc', `redis-cli ${command}`], {
    encoding: 'utf8',
  })
}

// ── DB readers ──────────────────────────────────────────────────────────────

/** Count login_events rows of a given type for an email, newest-first window. */
export function loginEventCount(email, eventType) {
  return Number(
    sqlValue(
      `SELECT count(*) FROM login_events WHERE email = '${email}' AND event_type = '${eventType}'`,
    ) || 0,
  )
}

/** Live (unrevoked) session rows for an email. */
export function activeSessionCount(email) {
  return Number(
    sqlValue(
      `SELECT count(*) FROM user_sessions WHERE email = '${email}' AND revoked_at IS NULL`,
    ) || 0,
  )
}

/**
 * How many emails Mailhog has actually delivered to an address.
 *
 * This — not `password_reset_tokens` and not the graphile job table — is the
 * signal for a mail-flood probe. Token rows are REPLACED on each request (only the
 * newest link stays valid), and worker jobs are consumed and deleted within
 * milliseconds, so both read as "1" or "0" while the victim's inbox fills up.
 */
export async function mailCountTo(email) {
  const ctx = await request.newContext({ baseURL: MAILHOG })
  try {
    const res = await ctx.get(
      `/api/v2/search?kind=to&query=${encodeURIComponent(email)}&limit=500`,
      { failOnStatusCode: false },
    )
    if (!res.ok()) return null // Mailhog absent — caller should skip, not fail
    return (await res.json()).total ?? 0
  } catch {
    return null
  } finally {
    await ctx.dispose()
  }
}

/** Outstanding password-reset tokens for a user. Replaced per request — see mailCountTo. */
export function resetTokenCount(email) {
  return Number(
    sqlValue(
      `SELECT count(*) FROM password_reset_tokens t
         JOIN users u ON u.id = t.user_id
        WHERE u.email = '${email}'`,
    ) || 0,
  )
}

/** Delete outstanding reset tokens so a flood probe starts from a known baseline. */
export function clearResetTokens(email) {
  sql(
    `DELETE FROM password_reset_tokens
      WHERE user_id IN (SELECT id FROM users WHERE email = '${email}')`,
  )
}

/**
 * Assert a burst produced no 429 at all — i.e. the limiter never engaged.
 * Kept as a helper so the 🔴 specs and their eventual green versions read the same.
 */
export function expectNoThrottle(statuses) {
  expect(statuses.filter((s) => s === 429)).toHaveLength(0)
}

/**
 * Drop the password-reset resend cooldown for an address (C3).
 *
 * Any test that wants to observe a FIRST send must clear this, or it is measuring
 * a suppressed resend left over from an earlier test and will conclude the mail
 * pipeline is broken.
 *
 * ⚠️ THE KEY THIS USED TO DELETE — `pwreset_sent:<email>` — HAS NEVER EXISTED.
 * Do not "restore" it. The guard is `utils/resendCooldown.js:43`, which claims
 * `resend:<scope>:<email>` with `SET NX EX`; there is no earlier name in the API's
 * history, so the old body was deleting a key nothing ever wrote. It cleared
 * nothing, and the next `/v1/auth/password/forgot` inside the 60 s window was
 * suppressed — with a byte-identical 200, because `requestPasswordReset` returns
 * the same GENERIC_MESSAGE *before* it mints a token or enqueues mail. The only
 * observable symptom is an email that never arrives, which surfaces ~45 s later as
 * a Mailhog polling timeout that reads like "the worker is down".
 *
 * Delegates to `clearResendCooldown` rather than carrying a second copy of the key
 * shape. That helper is already scope-parameterised — the same guard fronts
 * `/workspaces/forgot` and `/mfa/email/send`, which need `resend:mfaotp:` etc. —
 * and already applies the server's own `trim().toLowerCase()` normalisation. Two
 * independent spellings of one Redis key is precisely how these drifted apart.
 */
export function clearResetCooldown(email) {
  clearResendCooldown('pwreset', email)
}
