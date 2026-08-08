// Admin Security Center fixtures (PW-J13) — the 8 endpoints of
// `controllers/admin/securityCenter.js`, API-48…55.
//
// WHY THIS FILE EXISTS SEPARATELY FROM fixtures/authentication.js
//
// Every other authentication journey is *self-service*: the caller acts on their
// own credentials, so identity scoping is the whole story. The Security Center is
// the module's only surface where one person acts on ANOTHER person's credential
// state, gated by a real permission string. That needs a different cast:
//
//   * a NON-OWNER admin that genuinely holds `security:manage`. Owners
//     short-circuit the check at securityCenter.js:21 and never reach the
//     permission lookup at all, so driving these journeys as `owner@e2e.test`
//     would assert nothing about the grant.
//   * a SAME-EMAIL PAIR across two tenants. `users_company_email_unique` is
//     UNIQUE on (company_id, lower(btrim(email))) — email is unique PER COMPANY,
//     not globally — so one address legitimately exists in two workspaces (a
//     consultant working with two client companies). Meanwhile every credential
//     table this controller mutates (`user_sessions`, `user_devices`,
//     `mfa_factors`, `mfa_recovery_codes`) is keyed by EMAIL ALONE. That mismatch
//     is what the isolation spec probes, and it cannot be probed without the pair.
//
// SAFETY — read before editing:
//   * This cast is PRIVATE to the j13 specs. It is deliberately absent from
//     cast.js and from e2e-seed.sql, and is seeded/reset by the specs themselves,
//     because the Security Center's actions are destructive to credentials
//     (suspend flips a user INACTIVE; force-password-reset locks them into a
//     forced change; reset-mfa destroys factors). Pointing any of them at a
//     shared persona would break the rest of the harness mid-run.
//   * `j13admin@e2e.test` is the ONLY persona here that ever logs in. The others
//     must never be given an ACTIVE totp factor and then logged in — an active
//     factor makes /v1/auth/login return `{ mfaRequired: true }` instead of a
//     session (authFlow.js:195-206).
//   * All ids live in reserved `e2e19000-` / `e2e39000-` ranges so they cannot
//     collide with e2e-seed.sql's allocations.
import { COMPANY_ID, ALT_COMPANY_ID } from './cast.js'
import { sql, sqlValue } from './db.js'
import { API_ORIGIN, PASSWORD, anonContext } from './authentication.js'

export { API_ORIGIN, PASSWORD }

/** Argon2id hash of the shared E2E password `12345678` (same value e2e-seed.sql writes). */
const PASSWORD_HASH =
  '$argon2id$v=19$m=65536,t=3,p=4$0G1ro9Aqx/gzbRQGaUK0uQ$qd3LbNumQRq0B+fhX8NNny73S4pfNCPcWFS/81KSue4'

const SEC_ROLE_ID = 'e2e39000-0000-4000-8000-000000000001'

/**
 * The j13 cast.
 *
 * `twinA` and `twinB` SHARE AN EMAIL ADDRESS across the two tenants. That is the
 * entire point of the pair — see the header note on users_company_email_unique.
 */
export const J13 = {
  /** Non-owner holder of `security:manage`. The actor for every action. */
  admin: {
    id: 'e2e19000-0000-4000-8000-000000000001',
    email: 'j13admin@e2e.test',
    companyId: COMPANY_ID,
  },
  /** Ordinary same-tenant target — the happy path for all six actions. */
  target: {
    id: 'e2e19000-0000-4000-8000-000000000002',
    email: 'j13target@e2e.test',
    companyId: COMPANY_ID,
  },
  /** Tenant A half of the same-email pair — the user the admin is ENTITLED to act on. */
  twinA: {
    id: 'e2e19000-0000-4000-8000-000000000003',
    email: 'j13twin@e2e.test',
    companyId: COMPANY_ID,
  },
  /** Tenant B half — a stranger to the admin. Must never be touched. */
  twinB: {
    id: 'e2e19000-0000-4000-8000-000000000004',
    email: 'j13twin@e2e.test',
    companyId: ALT_COMPANY_ID,
  },
  /** Tenant-B-only user with a UNIQUE email — the clean cross-tenant 404 target. */
  altOnly: {
    id: 'e2e19000-0000-4000-8000-000000000005',
    email: 'j13alt@e2e.test',
    companyId: ALT_COMPANY_ID,
  },
}

/** Every email this fixture owns. Used to scope destructive resets. */
const OWNED_EMAILS = ['j13admin@e2e.test', 'j13target@e2e.test', 'j13twin@e2e.test', 'j13alt@e2e.test']
const emailList = OWNED_EMAILS.map((e) => `'${e}'`).join(',')

/** The six per-user action endpoints, in the order doc 08 lists them (API-50…55). */
export const ACTIONS = [
  { action: 'unlock', eventType: 'ACCOUNT_UNLOCKED', api: 'API-50' },
  { action: 'reset-mfa', eventType: 'MFA_RESET_BY_ADMIN', api: 'API-51' },
  { action: 'force-password-reset', eventType: 'FORCED_PASSWORD_RESET', api: 'API-52' },
  { action: 'force-logout', eventType: 'FORCED_LOGOUT', api: 'API-53' },
  { action: 'suspend', eventType: 'USER_SUSPENDED', api: 'API-54' },
  { action: 'activate', eventType: 'USER_ACTIVATED', api: 'API-55' },
]

export function actionUrl(userId, action) {
  return `${API_ORIGIN}/v1/admin/security/users/${userId}/${action}`
}

// ── Seeding ─────────────────────────────────────────────────────────────────

/**
 * Create the cast. Idempotent — safe to call in every beforeAll.
 *
 * The role carries `security:manage` and NOTHING else, so a 403 from these
 * endpoints for another persona can only mean the permission is missing rather
 * than some unrelated grant being absent.
 */
export function seedSecurityCenterCast() {
  sql(`
    INSERT INTO users (id, first_name, last_name, email, user_status_id, company_id, kind,
                       invite_sent, password, is_owner, created_at, updated_at) VALUES
      ('${J13.admin.id}',  'J13','Admin','${J13.admin.email}',  'ACTIVE','${COMPANY_ID}',    'INTERNAL', true, '${PASSWORD_HASH}', false, NOW(), NOW()),
      ('${J13.target.id}', 'J13','Target','${J13.target.email}','ACTIVE','${COMPANY_ID}',    'INTERNAL', true, '${PASSWORD_HASH}', false, NOW(), NOW()),
      ('${J13.twinA.id}',  'J13','TwinA','${J13.twinA.email}',  'ACTIVE','${COMPANY_ID}',    'INTERNAL', true, '${PASSWORD_HASH}', false, NOW(), NOW()),
      ('${J13.twinB.id}',  'J13','TwinB','${J13.twinB.email}',  'ACTIVE','${ALT_COMPANY_ID}','INTERNAL', true, '${PASSWORD_HASH}', false, NOW(), NOW()),
      ('${J13.altOnly.id}','J13','AltOnly','${J13.altOnly.email}','ACTIVE','${ALT_COMPANY_ID}','INTERNAL', true, '${PASSWORD_HASH}', false, NOW(), NOW())
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO roles (id, company_id, name, description, status_id, created_at, updated_at) VALUES
      ('${SEC_ROLE_ID}', '${COMPANY_ID}', 'J13 Security Admin',
       'security:manage and nothing else (PW-J13)', 'ACTIVE', NOW(), NOW())
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO roles_on_users (id, user_id, role_id, company_id, created_at, updated_at) VALUES
      ('e2e3a000-0000-4000-8000-000000000001', '${J13.admin.id}', '${SEC_ROLE_ID}', '${COMPANY_ID}', NOW(), NOW())
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO authz.role_module_permissions (company_id, role_id, module_id, action_id, scope_id, granted_by)
    SELECT '${COMPANY_ID}', '${SEC_ROLE_ID}', ma.module_id, ma.action_id, 'tenant', NULL
    FROM authz.module_actions ma
    WHERE ma.module_id = 'security' AND ma.action_id = 'manage'
    ON CONFLICT (company_id, role_id, module_id, action_id) DO NOTHING;
  `)
}

/**
 * Exclusive lower bound for audit reads, refreshed by every `resetSecurityState`.
 *
 * `login_events` CANNOT be cleaned up: a `prevent_login_event_mutation()` trigger
 * rejects UPDATE and DELETE outright ("login_events rows are immutable"), which is
 * correct for a 21 CFR Part 11 ledger and means per-test isolation has to come
 * from a timestamp instead. Every audit reader below is scoped to
 * `created_at > mark` so one test cannot be satisfied by another's row — without
 * it, the second test asserting FORCED_LOGOUT would pass on the first test's
 * evidence.
 */
let auditMark = null

/**
 * Return every j13 persona to a known-clean credential state.
 *
 * Scoped to OWNED_EMAILS throughout — this suite must never truncate a shared
 * table.
 */
export function resetSecurityState() {
  sql(`
    UPDATE users SET must_change_password = false, user_status_id = 'ACTIVE',
                     locked_until = NULL, failed_login_count = 0
      WHERE email IN (${emailList});
    DELETE FROM user_sessions      WHERE email IN (${emailList});
    DELETE FROM user_devices       WHERE email IN (${emailList});
    DELETE FROM mfa_recovery_codes WHERE email IN (${emailList});
    DELETE FROM mfa_factors        WHERE email IN (${emailList});
  `)
  // Taken from the database clock, not the test runner's — they are different
  // machines often enough (docker VM) that host time would skew the window.
  auditMark = sqlValue('SELECT clock_timestamp()')
}

/** `AND created_at > mark`, or nothing before the first reset. */
function sinceMark() {
  return auditMark ? `AND created_at > '${auditMark}'::timestamptz` : ''
}

/**
 * Give a user the full set of security state the six actions are supposed to
 * clear: a live lock, a live session, a trusted device, an active TOTP factor and
 * a recovery code.
 *
 * `fingerprint` must be unique per email — `user_devices_email_fingerprint_unique`
 * is UNIQUE on (email, device_fingerprint_hash) with NO company column, so the
 * twin pair would collide on a shared value.
 *
 * NOTE the same shape applies to `mfa_factors_one_active_totp`, UNIQUE on (email)
 * WHERE type='totp' AND status='ACTIVE' — so only ONE of the two twins may hold an
 * active TOTP factor at a time. Pass `totp: false` for the other.
 */
export function armUser(user, { fingerprint, totp = true } = {}) {
  const fp = fingerprint || `j13fp-${user.id.slice(-4)}`
  sql(`
    UPDATE users SET locked_until = NOW() + interval '30 minutes', failed_login_count = 5
      WHERE id = '${user.id}';

    INSERT INTO user_sessions (company_id, user_id, email, session_id, scope, expires_at)
    VALUES ('${user.companyId}', '${user.id}', '${user.email}',
            'j13-sess-${user.id.slice(-4)}', 'FULL', NOW() + interval '1 day')
    ON CONFLICT (session_id) DO NOTHING;

    INSERT INTO user_devices (company_id, user_id, email, device_fingerprint_hash,
                              trusted, trusted_until, trust_token_hash)
    VALUES ('${user.companyId}', '${user.id}', '${user.email}', '${fp}',
            true, NOW() + interval '30 days', 'j13trust-${user.id.slice(-4)}')
    ON CONFLICT (email, device_fingerprint_hash)
      DO UPDATE SET trusted = true, trusted_until = NOW() + interval '30 days',
                    trust_token_hash = 'j13trust-${user.id.slice(-4)}';

    INSERT INTO mfa_recovery_codes (company_id, user_id, email, code_hash, batch_id)
    VALUES ('${user.companyId}', '${user.id}', '${user.email}', 'j13-code-hash', gen_random_uuid());

    ${
      totp
        ? `INSERT INTO mfa_factors (company_id, user_id, email, type, status, confirmed_at)
           VALUES ('${user.companyId}', '${user.id}', '${user.email}', 'totp', 'ACTIVE', NOW());`
        : ''
    }
  `)
}

/** Seed a login_events row directly, used to prove the events feed is company-scoped. */
export function seedLoginEvent(user, { eventType = 'LOGIN_SUCCESS', reason }) {
  sql(`
    INSERT INTO login_events (company_id, user_id, email, event_type, outcome, reason)
    VALUES ('${user.companyId}', '${user.id}', '${user.email}', '${eventType}', 'INFO', '${reason}')
  `)
}

// ── DB readers ──────────────────────────────────────────────────────────────
//
// Every reader keys on user_id, never email. For the twin pair an email-keyed
// count spans BOTH tenants and would quietly make the isolation assertions
// meaningless — the exact failure mode this suite exists to detect.

const num = (q) => Number(sqlValue(q) || 0)

/** `{ mustChangePassword, status, locked, failedCount }` for one user row. */
export function securityState(user) {
  const row = sql(
    `SELECT must_change_password::text, user_status_id, (locked_until IS NOT NULL)::text, failed_login_count
       FROM users WHERE id = '${user.id}'`,
  )
  const [mcp, status, locked, fails] = row.split('|')
  return {
    mustChangePassword: mcp === 'true',
    status,
    locked: locked === 'true',
    failedCount: Number(fails),
  }
}

export function liveSessionCount(user) {
  return num(`SELECT count(*) FROM user_sessions WHERE user_id = '${user.id}' AND revoked_at IS NULL`)
}

export function trustedDeviceCount(user) {
  return num(`SELECT count(*) FROM user_devices WHERE user_id = '${user.id}' AND trusted`)
}

export function activeTotpCount(user) {
  return num(
    `SELECT count(*) FROM mfa_factors
      WHERE user_id = '${user.id}' AND status = 'ACTIVE' AND deleted_at IS NULL`,
  )
}

export function recoveryCodeCount(user) {
  return num(`SELECT count(*) FROM mfa_recovery_codes WHERE user_id = '${user.id}'`)
}

/**
 * One snapshot of everything the six actions can touch. Comparing two snapshots
 * is how the isolation spec states "nothing about tenant B changed" in a single
 * assertion whose failure message names the field that moved.
 */
export function snapshot(user) {
  return {
    ...securityState(user),
    liveSessions: liveSessionCount(user),
    trustedDevices: trustedDeviceCount(user),
    activeTotp: activeTotpCount(user),
    recoveryCodes: recoveryCodeCount(user),
  }
}

/** Rows in `login_events` for an email+type, scoped to the company that recorded them. */
export function securityEventCount(email, eventType, companyId) {
  return num(
    `SELECT count(*) FROM login_events
      WHERE email = '${email}' AND event_type = '${eventType}'
        AND company_id = '${companyId}' ${sinceMark()}`,
  )
}

/**
 * Newest `login_events` row for an email+type as
 * `{ companyId, userId, actorUserId, outcome, reason }`, or null.
 *
 * `recordSecurityEvent` is fire-and-forget (securityEvents.js:56) — the HTTP
 * response can land before the row does — so callers must poll via
 * `waitForSecurityEvent` rather than read once.
 */
export function latestSecurityEvent(email, eventType) {
  const out = sql(
    `SELECT coalesce(company_id::text,''), coalesce(user_id::text,''),
            coalesce(actor_user_id::text,''), outcome, coalesce(reason,'')
       FROM login_events
      WHERE email = '${email}' AND event_type = '${eventType}' ${sinceMark()}
      ORDER BY created_at DESC LIMIT 1`,
  )
  if (!out) return null
  const [companyId, userId, actorUserId, outcome, reason] = out.split('|')
  return { companyId, userId, actorUserId, outcome, reason }
}

/** Poll until the fire-and-forget audit row lands. Throws with context on timeout. */
export async function waitForSecurityEvent(email, eventType, { timeoutMs = 15_000 } = {}) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const row = latestSecurityEvent(email, eventType)
    if (row) return row
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error(
    `no login_events row appeared for ${email} / ${eventType} within ${timeoutMs}ms — ` +
      `recordSecurityEvent is fire-and-forget, so this means it was never called or it threw`,
  )
}

// ── Acting as the admin ─────────────────────────────────────────────────────

/**
 * A logged-in APIRequestContext for `j13admin@e2e.test`.
 *
 * Built by a real login rather than a storageState file because this persona is
 * deliberately absent from cast.js and auth.setup.js (see the header). The
 * cookie-free base context is load-bearing — see doc 14 convention 3.
 *
 * Caller must dispose.
 */
export async function adminContext() {
  const ctx = await anonContext()
  const res = await ctx.post('/v1/auth/login', {
    data: { email: J13.admin.email, password: PASSWORD },
    failOnStatusCode: false,
    // Do NOT follow the redirect. A success is a 302 into /v1/auth/handoff whose
    // Location points at the FRONTEND origin (`:5173/api/v1/auth/handoff?token=…`),
    // which this API-only suite has no reason to depend on — following it makes
    // the fixture fail whenever vite is down or proxying elsewhere. The session
    // cookie is set by this 302 itself, which the session check below proves.
    maxRedirects: 0,
  })
  if (![200, 302].includes(res.status())) {
    await ctx.dispose()
    throw new Error(`j13admin login failed (${res.status()}) — is the cast seeded?`)
  }

  // Prove the cookie is a usable session before any test leans on it; otherwise a
  // broken login shows up as a wall of confusing 400s from requireCompanyAccess.
  const session = await ctx.get('/v1/auth/session', { failOnStatusCode: false })
  const body = session.ok() ? await session.json() : null
  if (body?.session?.email !== J13.admin.email) {
    await ctx.dispose()
    throw new Error(
      `j13admin session not established (session → ${session.status()}, email=${body?.session?.email})`,
    )
  }
  return ctx
}
