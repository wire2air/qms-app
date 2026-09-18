// PW-J2 · AUTH-S3 (P1, release condition C2) — `authLimiter` is a no-op.
//
// middleware/rateLimiter.js:9 reads:
//     max: process.env.NODE_ENV !== 'production' ? 10000 : 10000
// Both ternary branches are identical, and the in-line comment concedes it. 10 000
// requests per 15-minute window per IP is not a limit.
//
// This matters because authLimiter is the ONLY gate on 22 pre-authentication
// endpoints (00-inventory API-01, 02, 13…19, 21…26, 41, 42, 44…47, 56). Login is
// separately protected by the account lockout (j1), so the exposure is really the
// other 21 — MFA challenge verification, forced MFA enrolment, password-reset
// confirmation, invitation accept, token refresh, e-sign PIN reset, portal login.
//
// HISTORY: this was 🔴 FAILS-TODAY and reproduced the defect (30/30 un-throttled).
// C2 is now fixed, so it is a GREEN RELEASE GATE.
//
// The fix is deliberately two-tier, because a single tight limit would have broken
// the harness and real users alike — auth.setup.js signs in 23 personas from one IP
// in ~5 seconds, and an office behind one NAT address looks the same:
//   * `authLimiter`       — coarse abuse ceiling, 300/15min/IP (was 10000).
//   * `strictAuthLimiter` — 20/15min/IP, mounted only where a burst is NEVER
//     legitimate: /mfa/verify, /password/reset, /invitation/accept,
//     /esign-pin/reset. Applies in every environment, no dev escape hatch.
//
// The probe targets /v1/auth/mfa/verify: it carries the strict limiter, and the
// limiter is mounted BEFORE express.json()/validate() so it answers before the body
// is even parsed — which is why an intentionally invalid body still exercises it.
import { test, expect } from '@playwright/test'
import { anonPost, burst, expectNoThrottle } from '../fixtures/authentication.js'

const ENDPOINT = '/v1/auth/mfa/verify'
const ATTEMPTS = 30
// Distinct source per test so one test's budget cannot starve another's.
const SOURCE = '203.0.113.31'

test.describe('PW-J2 · sensitive pre-auth endpoints are rate limited', () => {
  test('GATE · thirty rapid requests from one client get throttled (C2)', async () => {
    const results = await burst(ATTEMPTS, (i) =>
      anonPost(ENDPOINT, { pendingToken: `nope-${i}`, code: '000000' }, { source: SOURCE }),
    )
    const statuses = results.map((r) => r.status)
    const throttled = statuses.filter((s) => s === 429)

    // Diagnostic for the report: show the shape of what came back.
    const distinct = [...new Set(statuses)].sort()
    expect(
      throttled.length,
      `AUTH-S3 regression: ${ATTEMPTS} sequential requests to ${ENDPOINT} produced zero ` +
        `429s (statuses seen: ${distinct.join(', ')}). strictAuthLimiter must stay mounted ` +
        `on this route and its max must stay finite (release condition C2).`,
    ).toBeGreaterThan(0)
  })

  test('CONTROL · the route exists and rejects on its merits, not with a 404 (must pass today)', async () => {
    // Without this, the gate above could "pass" against a 404 — and a 404 is not a
    // rate limit. A bad pendingToken must produce a 4xx that is NOT 404 or 429.
    const { status } = await anonPost(
      ENDPOINT,
      { pendingToken: 'definitely-not-valid', code: '000000' },
      { source: '203.0.113.32' },
    )
    expect(status, `${ENDPOINT} is mounted`).not.toBe(404)
    expect([400, 401, 403, 422]).toContain(status)
  })

  test('CONTROL · the limiter is per-source, so it cannot lock out the whole world (must pass today)', async () => {
    // A limiter keyed globally instead of per-IP would "pass" the gate above while
    // being a self-inflicted outage. A fresh source must still be served.
    const fresh = await anonPost(
      ENDPOINT,
      { pendingToken: 'x', code: '000000' },
      { source: '198.51.100.77' },
    )
    expectNoThrottle([fresh.status])
  })
})
