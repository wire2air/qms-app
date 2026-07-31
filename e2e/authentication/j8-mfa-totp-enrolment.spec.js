// PW-J8 · AUTH-S6 — TOTP enrolment and challenge. FIRST COVERAGE OF THE MFA SURFACE.
//
// `controllers/auth/mfa.js` + `mfaHelpers.js` are the two largest auth controllers
// and had ZERO tests of any kind before this file (00-inventory ATC-01…14 has no
// mfa.test.js). Ten endpoints, API-08…17.
//
// This spec drives the real protocol end to end — it computes its own RFC 6238
// codes (fixtures/authentication.js `totp`) rather than stubbing the verifier, so
// it proves the server agrees with the standard.
//
// SAFETY — read before editing:
//   * It runs against `authmfa@e2e.test` ONLY. That persona is deliberately absent
//     from cast.js, because an active factor makes login return
//     `{ mfaRequired: true, pendingToken }` instead of a session
//     (controllers/auth/authFlow.js:195-206) — enrolling a factor on a cast
//     persona would break auth.setup.js for the entire harness.
//   * It clears factors in beforeAll AND afterAll so a crashed run cannot leave
//     the account un-loggable.
import { test, expect } from '@playwright/test'
import {
  MFA_PERSONA,
  PASSWORD,
  anonContext,
  clearMfa,
  mfaFactorCount,
  activeMfaFactorCount,
  recoveryCodeCount,
  loginExpectingMfa,
  totp,
  secondsLeftInTotpWindow,
} from '../fixtures/authentication.js'

const EMAIL = MFA_PERSONA.email

/** A logged-in API context for the MFA persona (no factor enrolled yet). */
async function signedInContext() {
  const ctx = await anonContext()
  const res = await ctx.post('/v1/auth/login', {
    data: { email: EMAIL, password: PASSWORD },
    failOnStatusCode: false,
  })
  // Success is a 302 into /v1/auth/handoff, which the context follows by default,
  // ending with a session cookie on this context.
  expect([200, 302]).toContain(res.status())
  return ctx
}

/**
 * Avoid the classic TOTP flake: a code generated at 29.9s into a window is
 * evaluated by the server in the next one. If the window is nearly over, wait it
 * out — cheaper than a retry loop and it makes failures meaningful.
 */
async function inFreshTotpWindow() {
  const left = secondsLeftInTotpWindow()
  if (left < 3) await new Promise((r) => setTimeout(r, (left + 1) * 1000))
}

test.beforeAll(() => clearMfa(EMAIL))
test.afterAll(() => clearMfa(EMAIL))

test.describe('PW-J8 · TOTP enrolment, challenge, and recovery codes', () => {
  test('enrol a factor, then login demands and accepts the challenge', async () => {
    clearMfa(EMAIL)
    expect(activeMfaFactorCount(EMAIL), 'baseline: no factor in force').toBe(0)

    // ── Enrol ───────────────────────────────────────────────────────────────
    const ctx = await signedInContext()
    let recoveryCodes = []
    // Hoisted: /totp/setup returns the secret ONCE (a second call answers 409
    // ALREADY_ENROLLED), so the challenge leg below must reuse this exact value.
    let secret = null
    try {
      const setup = await ctx.post('/v1/auth/mfa/totp/setup', { failOnStatusCode: false })
      expect(
        setup.status(),
        'MFA setup must be available — a 503 here means MFA_ENCRYPTION_KEY is unset',
      ).toBe(200)
      const body = await setup.json()
      secret = body.secret
      const { otpauthUri } = body
      expect(secret, 'setup returns the shared secret').toBeTruthy()
      expect(otpauthUri, 'and an otpauth:// URI for the authenticator app').toContain('otpauth://')

      await inFreshTotpWindow()
      const activate = await ctx.post('/v1/auth/mfa/totp/activate', {
        data: { code: totp(secret) },
        failOnStatusCode: false,
      })
      expect(activate.status(), 'a self-computed RFC 6238 code activates the factor').toBe(200)
      const activated = await activate.json()
      expect(activated.enrolled).toBe(true)
      recoveryCodes = activated.recoveryCodes || []
      expect(recoveryCodes.length, 'activation hands back recovery codes').toBeGreaterThan(0)

      // DB truth, not just the response.
      expect(activeMfaFactorCount(EMAIL), 'an ACTIVE factor is now in force').toBe(1)
      expect(recoveryCodeCount(EMAIL), 'recovery codes are persisted').toBe(recoveryCodes.length)

      const status = await ctx.get('/v1/auth/mfa/status', { failOnStatusCode: false })
      expect(status.status()).toBe(200)
    } finally {
      await ctx.dispose()
    }

    // ── Login now demands the second factor ─────────────────────────────────
    const challenge = await loginExpectingMfa(EMAIL)
    expect(challenge.status, 'login no longer issues a session outright').toBe(200)
    expect(challenge.body?.mfaRequired, 'it reports that MFA is required').toBe(true)
    expect(challenge.body?.pendingToken, 'and hands back a pending token').toBeTruthy()

    // ── Satisfy it ──────────────────────────────────────────────────────────
    const verifyCtx = await anonContext()
    try {
      await inFreshTotpWindow()
      expect(secret, 'the enrolment secret is still in scope for the challenge').toBeTruthy()
      const verify = await verifyCtx.post('/v1/auth/mfa/verify', {
        data: { pendingToken: challenge.body.pendingToken, method: 'totp', code: totp(secret) },
        failOnStatusCode: false,
      })
      expect(verify.status(), 'a valid TOTP completes the challenge').toBe(200)
    } finally {
      await verifyCtx.dispose()
    }
  })

  test('a wrong code is refused and does not enrol anything', async () => {
    clearMfa(EMAIL)
    const ctx = await signedInContext()
    try {
      const setup = await ctx.post('/v1/auth/mfa/totp/setup', { failOnStatusCode: false })
      expect(setup.status()).toBe(200)

      const bad = await ctx.post('/v1/auth/mfa/totp/activate', {
        data: { code: '000000' },
        failOnStatusCode: false,
      })
      expect(bad.status(), 'an invalid activation code is rejected').toBe(400)
      // `/totp/setup` inserts the factor as status='PENDING' straight away, so a
      // row EXISTS here by design. What must not happen is that row becoming
      // ACTIVE — that is the difference between "setup started" and "second
      // factor in force", and conflating them made this assertion fail falsely.
      expect(mfaFactorCount(EMAIL), 'the pending setup row is still there').toBeGreaterThan(0)
      expect(activeMfaFactorCount(EMAIL), 'but NO factor was activated').toBe(0)
    } finally {
      await ctx.dispose()
    }
  })

  test('activating with no pending setup is a 409, not a silent success', async () => {
    clearMfa(EMAIL)
    const ctx = await signedInContext()
    try {
      const res = await ctx.post('/v1/auth/mfa/totp/activate', {
        data: { code: '123456' },
        failOnStatusCode: false,
      })
      expect(res.status(), 'NO_PENDING is reported explicitly').toBe(409)
    } finally {
      await ctx.dispose()
    }
  })

  test('CONTROL · with no factor enrolled, login returns a session directly (must pass today)', async () => {
    // Anchors the whole spec: proves the `mfaRequired` branch above is caused by
    // the enrolment, not by something else breaking login for this persona.
    clearMfa(EMAIL)
    const res = await loginExpectingMfa(EMAIL)
    expect(res.status, 'a factor-free login is the ordinary 302 into handoff').toBe(302)
    expect(res.body?.mfaRequired, 'and no challenge is demanded').toBeFalsy()
  })
})
