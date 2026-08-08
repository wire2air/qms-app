// Forced-MFA-enrolment support for PW-J9, plus the DB readers PW-J8's
// recovery-code and disable legs need.
//
// Everything here exists because the forced-enrolment flow is the ONE auth path
// that hands out a credential BEFORE a session exists. `mfa_enroll_pending:<token>`
// is a bearer token that, once redeemed, produces a full session — so its
// lifecycle (single-use, expiry, who it speaks for) is the whole security story,
// and none of it was covered before.
//
// ── Three things about this fixture that are easy to get wrong ────────────────
//
//  1. **Never issue DDL from a test.** `config/postgraphile.js` runs with
//     `watch: true`, so a `CREATE TABLE` / `DROP TABLE` — even a throwaway one —
//     fires PostGraphile's watch re-introspection and takes the API down for
//     minutes. This cost two multi-minute outages while this fixture was being
//     built. DML only.
//
//  2. **The org policy is tenant-wide while it is installed.** `requireMfaForTenant`
//     writes ONE `org_security_settings` row for E2ELAB, and every persona in the
//     tenant is then evaluated against it. It is therefore installed with a
//     ten-year grace window and the *subject* is forced by back-dating only their
//     own `users.mfa_grace_started_at`. That way a concurrent suite logging in as
//     `author@e2e.test` is untouched: their grace anchor is stamped at "now" and
//     they sail through. Installing it with `graceDays: 0` instead would force
//     EVERY persona in the tenant into an enrolment wizard and break every other
//     project in the run.
//
//  3. **The settings are cached in Redis for 60s** (`org_sec:<companyId>`,
//     services/orgSecuritySettings.js). Writing the row is not enough — the cache
//     key has to be dropped or the policy takes up to a minute to appear, which
//     reads exactly like "the gate does not work".
import { execFileSync } from 'node:child_process'
import { API_ORIGIN, PASSWORD, anonContext, secondsLeftInTotpWindow } from './authentication.js'
import { sql, sqlRow, sqlValue } from './db.js'

/** E2E Lab (Primary) — `companies.code = 'E2ELAB'`, the `e2elab.localhost` tenant. */
export const E2ELAB_COMPANY_ID = 'e2e00001-0000-4000-8000-000000000001'

/** Redis key space for the forced-enrolment token (mfaHelpers.js:388-389). */
export const ENROLLMENT_KEY_PREFIX = 'mfa_enroll_pending:'
/** Its documented TTL — 15 minutes, longer than the challenge token's 5. */
export const ENROLLMENT_TTL_SECONDS = 15 * 60
/** Redis key space for the ordinary post-password MFA *challenge* token. */
export const CHALLENGE_KEY_PREFIX = 'mfa_pending:'

// ── Redis ────────────────────────────────────────────────────────────────────
// authentication.js keeps its `redis()` private, so this file has its own.

function redis(...args) {
  const container = process.env.E2E_REDIS_CONTAINER || 'qms-redis-1'
  return execFileSync('docker', ['exec', container, 'redis-cli', ...args], {
    encoding: 'utf8',
    timeout: 15_000,
  }).trim()
}

/** Seconds left on an enrolment token, `-2` when the key does not exist. */
export function enrolmentTokenTtl(token) {
  return Number(redis('TTL', `${ENROLLMENT_KEY_PREFIX}${token}`))
}

/** Is the token still redeemable? (`EXISTS` — 1/0, not a TTL.) */
export function enrolmentTokenExists(token) {
  return redis('EXISTS', `${ENROLLMENT_KEY_PREFIX}${token}`) === '1'
}

/**
 * Drop an enrolment token's Redis key.
 *
 * This is EXACTLY the state a 15-minute TTL elapse leaves behind — Redis expiry
 * is a key deletion — so a probe built on it is testing real expiry semantics,
 * not a simulation. The alternative (sleeping 15 minutes) is not a test.
 */
export function expireEnrolmentToken(token) {
  redis('DEL', `${ENROLLMENT_KEY_PREFIX}${token}`)
}

// ── Org security policy ──────────────────────────────────────────────────────

/**
 * Make MFA mandatory for the E2ELAB tenant.
 *
 * `graceDays` defaults to ten years ON PURPOSE — see note 2 in the header. Force
 * an individual subject with `forceEnrolmentNow(email)` instead of shortening it.
 */
export function requireMfaForTenant({ graceDays = 3650 } = {}) {
  sql(
    `INSERT INTO org_security_settings (company_id, mfa_mode, mfa_grace_period_days)
       VALUES ('${E2ELAB_COMPANY_ID}', 'REQUIRED_FOR_ALL', ${graceDays})
     ON CONFLICT DO NOTHING`,
  )
  sql(
    `UPDATE org_security_settings
        SET mfa_mode = 'REQUIRED_FOR_ALL', mfa_grace_period_days = ${graceDays}
      WHERE company_id = '${E2ELAB_COMPANY_ID}'`,
  )
  redis('DEL', `org_sec:${E2ELAB_COMPANY_ID}`)
}

/**
 * Remove the policy and every grace anchor it stamped, tenant-wide.
 *
 * The anchors matter: `evaluateMfaEnrollmentGate` writes `mfa_grace_started_at`
 * on FIRST encounter for anyone who logs in while the policy is live, including
 * personas belonging to other suites. They are inert once the policy is gone
 * (the gate returns early on `OPTIONAL`), but leaving them behind would make a
 * later run start from a different baseline than the seed does.
 */
export function clearMfaPolicy() {
  sql(`DELETE FROM org_security_settings WHERE company_id = '${E2ELAB_COMPANY_ID}'`)
  sql(
    `UPDATE users SET mfa_grace_started_at = NULL
      WHERE company_id = '${E2ELAB_COMPANY_ID}' AND mfa_grace_started_at IS NOT NULL`,
  )
  redis('DEL', `org_sec:${E2ELAB_COMPANY_ID}`)
}

/** Back-date one person's grace anchor so their enrolment deadline has passed. */
export function forceEnrolmentNow(email) {
  sql(`UPDATE users SET mfa_grace_started_at = '2000-01-01' WHERE email = '${email}'`)
}

/** Put one person back INSIDE the grace window (anchor re-stamped on next login). */
export function releaseFromForcedEnrolment(email) {
  sql(`UPDATE users SET mfa_grace_started_at = NULL WHERE email = '${email}'`)
}

/** True when the tenant currently has a REQUIRED_* policy row. */
export function tenantMfaMode() {
  return sqlValue(
    `SELECT mfa_mode FROM org_security_settings WHERE company_id = '${E2ELAB_COMPANY_ID}'`,
  )
}

// ── Factor / recovery-code readers ───────────────────────────────────────────
//
// `sqlValue` hands back psql's FIRST LINE and returns null (not '') for an empty
// column, so every "is it empty" question below is asked as count(*).

/**
 * The person's newest TOTP factor row, or null.
 * `userId`/`companyId` are the point: they prove WHOSE enrolment a pre-session
 * endpoint actually wrote, which is the cross-user question.
 */
export function totpFactorRow(email) {
  const row = sqlRow(
    `SELECT status, user_id, company_id FROM mfa_factors
      WHERE email = '${email}' AND type = 'totp' AND deleted_at IS NULL
      ORDER BY created_at DESC LIMIT 1`,
  )
  if (!row) return null
  return { status: row[0], userId: row[1], companyId: row[2] }
}

export function factorCountByStatus(email, status) {
  return Number(
    sqlValue(
      `SELECT count(*) FROM mfa_factors
        WHERE email = '${email}' AND status = '${status}' AND deleted_at IS NULL`,
    ) || 0,
  )
}

export function unusedRecoveryCodes(email) {
  return Number(
    sqlValue(`SELECT count(*) FROM mfa_recovery_codes WHERE email = '${email}' AND used_at IS NULL`) || 0,
  )
}

export function usedRecoveryCodes(email) {
  return Number(
    sqlValue(
      `SELECT count(*) FROM mfa_recovery_codes WHERE email = '${email}' AND used_at IS NOT NULL`,
    ) || 0,
  )
}

// ── HTTP helpers ─────────────────────────────────────────────────────────────

/**
 * Wait out a nearly-finished TOTP window so a code generated here is still valid
 * when the server evaluates it. Same guard PW-J8 uses; duplicated rather than
 * exported from the spec so both files can use it.
 */
export async function inFreshTotpWindow() {
  const left = secondsLeftInTotpWindow()
  if (left < 4) await new Promise((r) => setTimeout(r, (left + 1) * 1000))
}

/**
 * One password login from a clean client, WITHOUT following the redirect.
 *
 * Returns `{ status, body }`. The three interesting shapes:
 *   302 + null body                          → ordinary session login
 *   200 + { mfaRequired, pendingToken }      → enrolled, challenge demanded
 *   200 + { mfaEnrollmentRequired, pendingToken } → forced enrolment (PW-J9)
 */
export async function loginNoRedirect(email, { source = null, password = PASSWORD } = {}) {
  const ctx = await anonContext({ source })
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
      /* a 302 has no JSON body */
    }
    return { status: res.status(), body }
  } finally {
    await ctx.dispose()
  }
}

/** Mint a forced-enrolment token for someone the policy already forces. */
export async function mintEnrolmentToken(email, { source = null } = {}) {
  const res = await loginNoRedirect(email, { source })
  if (res.status !== 200 || !res.body?.mfaEnrollmentRequired) {
    throw new Error(
      `expected a forced-enrolment login for ${email}, got ${res.status} ${JSON.stringify(res.body)}`,
    )
  }
  return res.body.pendingToken
}

/**
 * A cookie-free API context that has followed a login all the way through the
 * handoff, so it holds a real session cookie for `e2elab.localhost`.
 *
 * Only valid for a persona with NO active factor and no forced enrolment — an
 * enrolled persona gets `{ mfaRequired }` instead of a redirect. Callers must
 * dispose the context.
 */
export async function signedInContext(email, { source = null } = {}) {
  const ctx = await anonContext({ source })
  const res = await ctx.post('/v1/auth/login', {
    data: { email, password: PASSWORD },
    failOnStatusCode: false,
  })
  if (![200, 302].includes(res.status())) {
    await ctx.dispose()
    throw new Error(`signedInContext(${email}) failed: ${res.status()}`)
  }
  return ctx
}

/**
 * Who does this context's session belong to? `null` when it holds no session.
 * The load-bearing question for the cross-user probes: a 302 alone does not say
 * WHOSE session was issued.
 */
export async function sessionIdentity(ctx) {
  const res = await ctx.get(`${API_ORIGIN}/v1/auth/session`, { failOnStatusCode: false })
  if (res.status() !== 200) return null
  const body = await res.json()
  return body?.session?.email ?? null
}
