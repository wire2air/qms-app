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
import { sessionIdentity, unusedRecoveryCodes, usedRecoveryCodes } from '../fixtures/authMfa.js'

const EMAIL = MFA_PERSONA.email

/**
 * Distinct client sources for the two legs added for release condition #7.
 *
 * `/v1/auth/mfa/verify` is mounted behind `strictAuthLimiter` — 20 requests per
 * 15 minutes keyed on req.ip — and PW-J2 deliberately fires 30 at it. Sharing a
 * source with that spec (or with each other) would make these gates fail with a
 * 429 that has nothing to do with recovery codes. RFC 5737 documentation range.
 */
const SRC = { recovery: '198.51.100.90', disable: '198.51.100.91' }

/** A logged-in API context for the MFA persona (no factor enrolled yet). */
async function signedInContext({ source = null } = {}) {
  const ctx = await anonContext({ source })
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

/**
 * Enrol the persona from scratch via the authenticated self-service path.
 * Returns the shared secret and the one-time recovery codes.
 */
async function enrolSelfService({ source = null } = {}) {
  clearMfa(EMAIL)
  const ctx = await signedInContext({ source })
  try {
    const setup = await ctx.post('/v1/auth/mfa/totp/setup', { failOnStatusCode: false })
    expect(setup.status(), 'MFA setup is available — a 503 means MFA_ENCRYPTION_KEY is unset').toBe(200)
    const { secret } = await setup.json()
    await inFreshTotpWindow()
    const activate = await ctx.post('/v1/auth/mfa/totp/activate', {
      data: { code: totp(secret) },
      failOnStatusCode: false,
    })
    expect(activate.status(), 'the factor activates').toBe(200)
    const { recoveryCodes } = await activate.json()
    expect(recoveryCodes?.length, 'a batch of recovery codes is issued').toBeGreaterThan(1)
    return { secret, recoveryCodes }
  } finally {
    await ctx.dispose()
  }
}

/**
 * Answer a login challenge with a recovery code from a clean client.
 * Returns the HTTP status AND who the resulting session belongs to — a 200 alone
 * would not distinguish "code accepted" from "endpoint answered politely".
 */
async function loginWithRecoveryCode(code, source) {
  const challenge = await loginExpectingMfa(EMAIL)
  expect(challenge.body?.mfaRequired, 'the enrolled persona is challenged').toBe(true)
  const ctx = await anonContext({ source })
  try {
    const res = await ctx.post('/v1/auth/mfa/verify', {
      data: { pendingToken: challenge.body.pendingToken, method: 'recovery_code', code },
      failOnStatusCode: false,
    })
    return { status: res.status(), identity: await sessionIdentity(ctx) }
  } finally {
    await ctx.dispose()
  }
}

/** A full session for the persona AFTER enrolment — i.e. one that passed the challenge. */
async function challengedInContext(secret, source) {
  const ctx = await anonContext({ source })
  const login = await ctx.post('/v1/auth/login', {
    data: { email: EMAIL, password: PASSWORD },
    failOnStatusCode: false,
    maxRedirects: 0,
  })
  expect(login.status(), 'an enrolled persona gets a challenge, not a session').toBe(200)
  const { pendingToken } = await login.json()
  await inFreshTotpWindow()
  const verify = await ctx.post('/v1/auth/mfa/verify', {
    data: { pendingToken, method: 'totp', code: totp(secret) },
    failOnStatusCode: false,
  })
  expect([200, 302], `the challenge is satisfied (got ${verify.status()})`).toContain(verify.status())
  return ctx
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

  // ── Release condition #7: the two claims doc 14 makes that the shipped spec
  // never checked. Doc 14's PW-J8 paragraph ends "Then assert a recovery code
  // works exactly once (second use refused) and that mfa/disable requires
  // re-authentication" — neither sentence had a matching assertion until now, so
  // the module's two credential-destroying operations were described but unproven.

  test('GATE · a recovery code is accepted exactly once', async () => {
    // A recovery code is a *bearer password* that bypasses the authenticator, so
    // "single use" is the only thing that keeps a screenshot of the printout from
    // becoming a permanent second key. `consumeRecoveryCode` stamps `used_at`
    // under a `WHERE used_at IS NULL` guard; this asserts on that column, not on
    // the response, because a code could be accepted while the stamp silently
    // failed and the response would look identical.
    const { recoveryCodes } = await enrolSelfService({ source: SRC.recovery })
    const total = recoveryCodes.length
    expect(unusedRecoveryCodes(EMAIL), 'the whole batch starts unused').toBe(total)
    expect(usedRecoveryCodes(EMAIL), 'and none are spent').toBe(0)

    const first = await loginWithRecoveryCode(recoveryCodes[0], SRC.recovery)
    expect([200, 302], `a fresh recovery code satisfies the challenge (got ${first.status})`).toContain(
      first.status,
    )
    expect(first.identity, 'and issues a real session for the right person').toBe(EMAIL)
    expect(unusedRecoveryCodes(EMAIL), 'exactly one code was spent').toBe(total - 1)
    expect(usedRecoveryCodes(EMAIL), 'and it is stamped used_at in the DB').toBe(1)

    const replay = await loginWithRecoveryCode(recoveryCodes[0], SRC.recovery)
    expect(
      [400, 401],
      `the SAME recovery code must not work twice (got ${replay.status})`,
    ).toContain(replay.status)
    expect(replay.identity, 'the replay issued no session').toBeNull()
    expect(unusedRecoveryCodes(EMAIL), 'and consumed nothing else').toBe(total - 1)
    expect(usedRecoveryCodes(EMAIL), 'the used tally is unchanged').toBe(1)

    // CONTROL · without this, the refusal above could mean "recovery codes stopped
    // working entirely" rather than "that one was already spent".
    const other = await loginWithRecoveryCode(recoveryCodes[1], SRC.recovery)
    expect([200, 302], `a DIFFERENT unused code still works (got ${other.status})`).toContain(
      other.status,
    )
    expect(other.identity).toBe(EMAIL)
    expect(unusedRecoveryCodes(EMAIL), 'a second code is now spent').toBe(total - 2)
    expect(usedRecoveryCodes(EMAIL)).toBe(2)
  })

  test('GATE · disabling MFA demands a current factor — a live session alone is not enough', async () => {
    // Stripping the second factor is the single most valuable thing a hijacked
    // session can do: it converts a temporary foothold into permanent access and
    // removes the control that would have blocked the next login. So `mfa/disable`
    // must re-verify, and every refusal below is paired with a DB read proving the
    // factor and its recovery codes actually survived.
    const { secret, recoveryCodes } = await enrolSelfService({ source: SRC.disable })
    const ctx = await challengedInContext(secret, SRC.disable)
    try {
      expect(await sessionIdentity(ctx), 'the caller holds a genuine, fully-authenticated session').toBe(
        EMAIL,
      )

      const noProof = await ctx.post('/v1/auth/mfa/disable', {
        data: {},
        failOnStatusCode: false,
      })
      expect(
        [400, 401, 403, 422],
        `a session with no factor proof cannot disable MFA (got ${noProof.status()})`,
      ).toContain(noProof.status())

      const wrongProof = await ctx.post('/v1/auth/mfa/disable', {
        data: { method: 'totp', code: '000000' },
        failOnStatusCode: false,
      })
      expect(wrongProof.status(), 'nor can a session with a wrong code').toBe(400)

      expect(activeMfaFactorCount(EMAIL), 'the factor is still in force').toBe(1)
      expect(recoveryCodeCount(EMAIL), 'and the recovery codes are untouched').toBe(
        recoveryCodes.length,
      )

      // CONTROL · the session really is usable, so the two refusals were the
      // re-authentication gate rather than an expired cookie.
      const status = await ctx.get('/v1/auth/mfa/status', { failOnStatusCode: false })
      expect(status.status(), 'the same session reads MFA status fine').toBe(200)

      await inFreshTotpWindow()
      const withProof = await ctx.post('/v1/auth/mfa/disable', {
        data: { method: 'totp', code: totp(secret) },
        failOnStatusCode: false,
      })
      expect(withProof.status(), 'a current TOTP does disable it').toBe(200)
    } finally {
      await ctx.dispose()
    }

    expect(activeMfaFactorCount(EMAIL), 'no factor remains in force').toBe(0)
    expect(recoveryCodeCount(EMAIL), 'and the recovery codes are revoked with it').toBe(0)
  })
})
