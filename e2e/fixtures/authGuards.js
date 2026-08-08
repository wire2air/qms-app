// Raw-HTTP + Redis probes for the two AUTH-S7 invariants (PW-J12) and the
// lockout-policy reader PW-J5 uses.
//
// WHY node:http AND NOT PLAYWRIGHT'S request API
// ----------------------------------------------
// PW-J12's first invariant is a claim about a *header*, not about a status code:
// the session cookie must carry no `Domain` attribute. Every HTTP client between
// the test and the wire is a chance to lose that evidence — Playwright's
// APIRequestContext owns a cookie jar that consumes `Set-Cookie`, and `headers()`
// folds repeated headers together. `node:http` hands back `res.rawHeaders`
// verbatim, so the assertion is made against the bytes the server actually sent.
//
// It also sidesteps DNS entirely: we connect to 127.0.0.1 and set the `Host`
// header ourselves. That is not a shortcut — it is the only way to aim a request
// at `e2ealt.localhost` while being certain which socket it lands on, which is
// exactly what a cross-tenant replay test has to control. (Node's global fetch
// cannot be used here at all: undici captures `dns.lookup` at process start, so
// the `*.localhost` shim in fixtures/localhostDns.js never reaches it.)
import http from 'node:http'
import { execFileSync } from 'node:child_process'
import { sqlRow } from './db.js'

const API_PORT = Number(process.env.E2E_API_PORT || 4000)
/** Tenant hosts. The port is carried in `Host:` for realism; parseTenantFromHost strips it. */
export const LAB_HOST = `e2elab.localhost:${API_PORT}`
export const ALT_HOST = `e2ealt.localhost:${API_PORT}`
/** A host with NO tenant label — `parseTenantFromHost` returns { kind: 'apex' }. */
export const APEX_HOST = `localhost:${API_PORT}`

/**
 * One raw HTTP request to the API, with an explicit `Host`.
 *
 * Returns the status, the untouched `set-cookie` lines, the `Location`, and the
 * body. Redirects are never followed — a handoff's whole story is in its 3xx.
 */
export function rawRequest({ method = 'GET', path, host, headers = {}, body = null }) {
  return new Promise((resolve, reject) => {
    const payload = body == null ? null : Buffer.from(JSON.stringify(body))
    const req = http.request(
      {
        host: '127.0.0.1',
        port: API_PORT,
        method,
        path,
        headers: {
          Host: host,
          ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': payload.length } : {}),
          ...headers,
        },
        timeout: 20_000,
      },
      (res) => {
        const chunks = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () =>
          resolve({
            status: res.statusCode,
            // Node already collects repeated Set-Cookie lines into an array.
            setCookies: res.headers['set-cookie'] || [],
            location: res.headers.location || null,
            rawHeaders: res.rawHeaders,
            text: Buffer.concat(chunks).toString('utf8'),
          }),
        )
      },
    )
    req.on('timeout', () => req.destroy(new Error(`timeout: ${method} ${path} @ ${host}`)))
    req.on('error', reject)
    if (payload) req.write(payload)
    req.end()
  })
}

/**
 * Parse one `Set-Cookie` line into `{ name, value, attrs }`.
 *
 * Attribute keys are lower-cased; valueless attributes (`HttpOnly`, `Secure`)
 * map to `true`. Deliberately hand-rolled rather than pulled from a library:
 * this parser IS the assertion for invariant 1, so a CONTROL in the spec feeds
 * it a synthetic `Domain=` header to prove it can see one at all.
 */
export function parseSetCookie(line) {
  const parts = String(line).split(';')
  const [name, ...valueParts] = parts[0].split('=')
  const attrs = {}
  for (const part of parts.slice(1)) {
    const idx = part.indexOf('=')
    if (idx === -1) attrs[part.trim().toLowerCase()] = true
    else attrs[part.slice(0, idx).trim().toLowerCase()] = part.slice(idx + 1).trim()
  }
  return { name: name.trim(), value: valueParts.join('='), attrs }
}

/** The express-session cookie among a response's Set-Cookie lines, or null. */
export function sessionCookie(setCookies) {
  for (const line of setCookies) {
    const parsed = parseSetCookie(line)
    if (parsed.name === 'connect.sid') return { ...parsed, raw: line }
  }
  return null
}

/**
 * `POST /v1/auth/login` on a given tenant host, cookie-free, no redirect follow.
 * A success is `302` to the handoff URL — the token is in `Location`.
 */
export function loginRaw(email, password, { host = LAB_HOST } = {}) {
  return rawRequest({ method: 'POST', path: '/v1/auth/login', host, body: { email, password } })
}

/** Pull the handoff token out of a login redirect's Location, or null. */
export function tokenFromLocation(location) {
  if (!location) return null
  const match = /[?&]token=([^&]+)/.exec(location)
  return match ? decodeURIComponent(match[1]) : null
}

/**
 * Mint a handoff token bound to the tenant `host` belongs to, by logging in
 * there. Returns `{ token, loginResponse }`.
 *
 * Uses the login redirect rather than `GET /v1/auth/switch` on purpose: `switch`
 * requires the caller to already hold a session AND to be a member of the target
 * company, and no E2E persona belongs to both tenants — so it cannot produce the
 * token this journey needs. Both endpoints call the same `mintHandoffToken`, so
 * the artifact under test is identical.
 */
export async function mintHandoff(email, password, { host = LAB_HOST } = {}) {
  const loginResponse = await loginRaw(email, password, { host })
  return { token: tokenFromLocation(loginResponse.location), loginResponse }
}

/** `GET /v1/auth/handoff?token=…` on a given host, no redirect follow. */
export function redeemHandoff(token, { host = LAB_HOST } = {}) {
  return rawRequest({
    method: 'GET',
    path: `/v1/auth/handoff?token=${encodeURIComponent(token)}`,
    host,
  })
}

// ── Redis ───────────────────────────────────────────────────────────────────

function redis(...args) {
  const container = process.env.E2E_REDIS_CONTAINER || 'qms-redis-1'
  return execFileSync('docker', ['exec', container, 'redis-cli', ...args], {
    encoding: 'utf8',
  }).trim()
}

/** Does the handoff token still exist in Redis? (`handoff:<token>`, 60 s TTL.) */
export function handoffTokenExists(token) {
  return redis('EXISTS', `handoff:${token}`) === '1'
}

/**
 * TTL in seconds of the enforced lock key for (email, source).
 * -2 = no such key, -1 = key with no expiry (which would itself be a defect:
 * a lock that never expires is a permanent account outage).
 */
export function lockTtlSeconds(email, source) {
  return Number(redis('TTL', `login_lock:${String(email).toLowerCase()}|${source}`))
}

// ── Policy ──────────────────────────────────────────────────────────────────

/**
 * The lockout thresholds the API will actually apply to this tenant.
 *
 * Mirrors `services/passwordPolicy.js getPolicyForCompany`: a `password_policies`
 * row wins, otherwise `DEFAULT_POLICY`. Derived rather than hard-coded so the
 * spec cannot quietly drift away from the product — if someone gives E2ELAB its
 * own policy row, the test adapts instead of failing for the wrong reason.
 */
export function lockoutPolicy(companyId) {
  const row = sqlRow(
    `SELECT max_failed_attempts, lockout_duration_minutes
       FROM password_policies WHERE company_id = '${companyId}'`,
  )
  if (!row) {
    // DEFAULT_POLICY (services/passwordPolicy.js) — the values a tenant with no
    // row of its own gets.
    return { maxFailedAttempts: 5, lockoutDurationMinutes: 15, source: 'DEFAULT_POLICY' }
  }
  return {
    maxFailedAttempts: Number(row[0]),
    lockoutDurationMinutes: Number(row[1]),
    source: 'password_policies row',
  }
}

// ── Barriers ────────────────────────────────────────────────────────────────

/**
 * Poll a synchronous predicate until it holds.
 *
 * `waitForSqlValue` in fixtures/db.js cannot express these: several of the rows
 * this suite checks are written by fire-and-forget calls (`mirrorToUserRows`,
 * `recordSecurityEvent`) that the HTTP response does not wait for, and half the
 * conditions are "this value became NULL / zero again" — the exact shape
 * `isSqlReady` treats as *not ready*.
 */
export async function waitUntil(predicate, { label, timeoutMs = 15_000, intervalMs = 300 } = {}) {
  const deadline = Date.now() + timeoutMs
  let last
  for (;;) {
    last = predicate()
    if (last) return last
    if (Date.now() >= deadline) {
      throw new Error(`waitUntil timed out after ${timeoutMs}ms: ${label}`)
    }
    await new Promise((r) => setTimeout(r, intervalMs))
  }
}
