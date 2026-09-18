// PW-J9 · AUTH-S6 — the forced-MFA enrolment token lifecycle.
//
// **Release condition #3.** `mfa_enroll_pending:<token>` is the only credential in
// this codebase that stands in for a session BEFORE one exists: hand it to
// `/v1/auth/mfa/required/complete` and you get a full signed-in session back. Doc
// 11 calls that shape "where session-fixation and replay bugs live", and doc 19
// recorded every question below as **unknown** — "'unknown' on a session-issuing
// token path is not an acceptable release state for a P0."
//
// This spec answers them. Four properties, each asserted at the database or Redis
// layer rather than on a status code alone:
//
//   single-use  — redeeming consumes the Redis key; a replay is refused.
//   expiry      — a token whose key is gone is refused on EVERY leg, not just the
//                 last one, and leaves no half-built factor behind.
//   provenance  — the factor row it writes carries the TOKEN's user_id/company_id.
//                 Nothing in the request body can redirect it at someone else.
//   no drift    — a token minted for A is not redeemable while acting as B, and a
//                 token left unredeemed does not become a free session the moment
//                 the account is enrolled by some other route.
//
// ── How the policy is installed (read before editing) ─────────────────────────
// The forced-enrolment branch only runs when the tenant REQUIRES MFA and the
// subject's grace window has elapsed. `requireMfaForTenant()` writes that policy
// for the WHOLE E2ELAB tenant, so it is installed with a ten-year grace and the
// subject is forced by back-dating only their own anchor. A `graceDays: 0` policy
// would shove every other suite's persona into an enrolment wizard mid-run. See
// the header of fixtures/authMfa.js.
//
// ── Personas ──────────────────────────────────────────────────────────────────
// A = authmfa@e2e.test    (the enrolment subject — same persona PW-J8 uses, and
//                          deliberately absent from cast.js: an active factor
//                          makes login return a challenge instead of a session,
//                          which would break auth.setup.js for the whole harness)
// B = authlocker@e2e.test (the "other user". A throwaway credential persona from
//                          e2e-seed.sql §27 that holds no grants. NOTE the
//                          coupling: PW-J1's CONTROL and PW-J5 both LOCK this
//                          account, so every leg here clears its lockout first.)
//
// Both are cleared of factors in beforeAll AND afterAll — a crashed run must not
// leave either account un-loggable.
//
// ── Build status: 10 green (2026-08-08) ──────────────────────────────────────
// Doc 19 listed both of doc 14's probes as "outcome unknown". They are now known,
// and both HOLD: a consumed token is refused with 401 PENDING_EXPIRED on all
// three legs, and nothing about a request — body fields, a different user's live
// session, or a second live token — can steer an enrolment at anyone but the
// token's own subject.
//
// This spec also turned up a genuine MFA bypass, which it carried as a 🔴 for one
// release and which has SINCE BEEN FIXED. `/required/complete` used to gate on
// `isMfaEnrolled(email)` — "is this ACCOUNT enrolled?" rather than "did THIS token
// do the enrolling" — so a forced-enrolment token that was minted and pocketed
// still redeemed for a full session, no second factor ever presented, for the rest
// of its 15-minute TTL as soon as the account became enrolled by any other route.
// Reproduced end to end at the time: the stale token's holder came back with a live
// session as authmfa@e2e.test.
//
// The fix moved the evidence onto the token itself. `markPendingEnrollmentFactorProven`
// sets `factorProven` on the pending record, and ONLY `/required/activate` calls it;
// `/required/complete` now refuses 409 NOT_ENROLLED unless `pending.factorProven`
// is set (controllers/auth/mfa.js:551). `/required/setup` on an already-enrolled
// account no longer answers `{ alreadyEnrolled: true }` either — it mints an
// ordinary MFA challenge and returns `{ challengeRequired, pendingToken,
// availableFactors }`, so the bearer is made to prove the factor that now exists
// instead of being waved through. The last test in this file is the regression
// pin for both halves and is green.
import { test, expect } from '@playwright/test'
import {
  AUTH_PERSONAS,
  MFA_PERSONA,
  PASSWORD,
  anonContext,
  clearLockout,
  clearMfa,
  totp,
} from '../fixtures/authentication.js'
import { sqlValue } from '../fixtures/db.js'
import {
  E2ELAB_COMPANY_ID,
  ENROLLMENT_TTL_SECONDS,
  clearMfaPolicy,
  enrolmentTokenExists,
  enrolmentTokenTtl,
  expireEnrolmentToken,
  factorCountByStatus,
  forceEnrolmentNow,
  inFreshTotpWindow,
  loginNoRedirect,
  mintEnrolmentToken,
  releaseFromForcedEnrolment,
  requireMfaForTenant,
  sessionIdentity,
  signedInContext,
  tenantMfaMode,
  totpFactorRow,
  unusedRecoveryCodes,
} from '../fixtures/authMfa.js'

const A = MFA_PERSONA.email
const A_ID = MFA_PERSONA.id
const B = AUTH_PERSONAS.locker.email

// Distinct client sources per leg. `authLimiter` (300 / 15 min) and the account
// lockout are both keyed on req.ip, which the API takes from X-Forwarded-For, so
// sharing one source with PW-J1…J5 would make this suite's budget depend on
// theirs. RFC 5737 documentation range; .9/.31/.32/.51 are already taken.
const SRC = {
  gate: '203.0.113.90',
  control: '203.0.113.91',
  replay: '203.0.113.92',
  expiry: '203.0.113.93',
  crossBody: '203.0.113.94',
  crossSession: '203.0.113.95',
  crossToken: '203.0.113.96',
  sibling: '203.0.113.97',
}

/** Statuses that count as "the server refused". A 302 here means a session. */
const REFUSED = [400, 401, 403, 409]

function enrolmentRequiredEvents() {
  return Number(
    sqlValue(
      `SELECT count(*) FROM login_events
        WHERE email = '${A}' AND event_type = 'MFA_ENROLLMENT_REQUIRED'`,
    ) || 0,
  )
}

function forcedEnrolmentLogins() {
  return Number(
    sqlValue(
      `SELECT count(*) FROM login_events
        WHERE email = '${A}' AND event_type = 'LOGIN_SUCCESS' AND auth_method = 'mfa:enrolled'`,
    ) || 0,
  )
}

/**
 * `recordSecurityEvent` is fire-and-forget — the handler answers before the
 * `login_events` INSERT lands. Reading the count straight after the response is
 * therefore a race, and one that fails maybe one run in five. Poll instead.
 */
async function countReaches(read, expected, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs
  let last = read()
  while (last < expected && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 400))
    last = read()
  }
  return last
}

/** Put the subject back at "forced, not yet enrolled". */
function resetSubject() {
  clearMfa(A)
  clearLockout(A)
  forceEnrolmentNow(A)
}

/**
 * Drive setup → activate for one token; returns the activation response.
 *
 * NOTE for the caller: `/required/activate` can answer 200 with
 * `{ enrolled: true, recoveryCodes, sessionExpired: true }` when the pending token
 * dies between the code check and the proven-stamp. The enrolment itself is durable
 * in that case, but the token can no longer complete sign-in — so a following
 * `/required/complete` answers 401 PENDING_EXPIRED, not a session. The window is a
 * 15-minute TTL expiring inside one HTTP call, so it is not reachable in practice
 * here; if a `[200, 302]` assertion on /complete ever fails with a 401, check
 * `activate`'s body for `sessionExpired` before suspecting the guard.
 */
async function enrolWithToken(ctx, pendingToken) {
  const setup = await ctx.post('/v1/auth/mfa/required/setup', {
    data: { pendingToken },
    failOnStatusCode: false,
  })
  expect(setup.status(), 'forced-enrolment setup is reachable with a live token').toBe(200)
  const { secret } = await setup.json()
  await inFreshTotpWindow()
  const activate = await ctx.post('/v1/auth/mfa/required/activate', {
    data: { pendingToken, code: totp(secret) },
    failOnStatusCode: false,
  })
  return { secret, activate }
}

test.beforeAll(() => {
  clearMfa(A)
  clearMfa(B)
  clearLockout(A)
  clearLockout(B)
  requireMfaForTenant()
})

test.afterAll(() => {
  clearMfa(A)
  clearMfa(B)
  clearLockout(A)
  clearLockout(B)
  // Order matters: drop the policy LAST so nothing can be forced into enrolment
  // between the factor cleanup and the policy removal.
  clearMfaPolicy()
})

test.describe('PW-J9 · forced-MFA enrolment token: single-use, expiry, and whose identity it carries', () => {
  test('CONTROL · the policy really forces enrolment — login hands back a token, not a session (must pass today)', async () => {
    // Anchors every GATE below. If this fails, the tenant policy did not install
    // (60s Redis cache in services/orgSecuritySettings.js) and the other tests
    // would be probing an ordinary login, not the forced-enrolment path.
    resetSubject()
    expect(tenantMfaMode(), 'the tenant policy row is installed').toBe('REQUIRED_FOR_ALL')
    const eventsBefore = enrolmentRequiredEvents()

    const res = await loginNoRedirect(A, { source: SRC.gate })
    expect(res.status, 'a forced login answers 200 with a body, not a 302 into handoff').toBe(200)
    expect(res.body?.mfaEnrollmentRequired, 'the response names the forced-enrolment branch').toBe(true)
    expect(res.body?.pendingToken, 'and carries the enrolment token').toBeTruthy()

    // No factor exists yet — the token is the ONLY thing standing between this
    // caller and a session, which is exactly why the rest of the spec exists.
    expect(factorCountByStatus(A, 'ACTIVE'), 'no second factor is in force yet').toBe(0)

    const ttl = enrolmentTokenTtl(res.body.pendingToken)
    expect(ttl, 'the token is live in Redis').toBeGreaterThan(0)
    expect(ttl, `and bounded by its ${ENROLLMENT_TTL_SECONDS}s TTL`).toBeLessThanOrEqual(
      ENROLLMENT_TTL_SECONDS,
    )

    expect(
      await countReaches(enrolmentRequiredEvents, eventsBefore + 1),
      'the gate is audited — a forced enrolment leaves an MFA_ENROLLMENT_REQUIRED row',
    ).toBe(eventsBefore + 1)
  })

  test('CONTROL · a person still inside the grace window signs in normally (must pass today)', async () => {
    // Without this, every GATE could be passing because the tenant policy simply
    // blocks everyone — a login that never succeeds is not an enrolment gate.
    clearMfa(B)
    clearLockout(B)
    releaseFromForcedEnrolment(B)

    const res = await loginNoRedirect(B, { source: SRC.control })
    expect(res.status, 'an un-forced login is the ordinary 302 into handoff').toBe(302)
    expect(res.body?.mfaEnrollmentRequired, 'no enrolment is demanded of them').toBeFalsy()
    expect(factorCountByStatus(B, 'ACTIVE'), 'and they gained no factor').toBe(0)
  })

  test('GATE · redeeming the token enrols the TOKEN’s owner and consumes the key', async () => {
    resetSubject()
    const completions = forcedEnrolmentLogins()
    const pendingToken = await mintEnrolmentToken(A, { source: SRC.gate })

    const ctx = await anonContext({ source: SRC.gate })
    try {
      const { activate } = await enrolWithToken(ctx, pendingToken)
      expect(activate.status(), 'a self-computed RFC 6238 code activates the factor').toBe(200)
      const activated = await activate.json()
      expect(activated.enrolled).toBe(true)
      expect(activated.recoveryCodes?.length, 'activation hands back recovery codes').toBeGreaterThan(0)

      // PROVENANCE — the row belongs to the token's subject, not to whoever asked.
      const factor = totpFactorRow(A)
      expect(factor?.status, 'the factor is ACTIVE').toBe('ACTIVE')
      expect(factor?.userId, 'written against the token’s user_id').toBe(A_ID)
      expect(factor?.companyId, 'and the token’s company_id').toBe(E2ELAB_COMPANY_ID)
      expect(unusedRecoveryCodes(A), 'recovery codes are persisted unused').toBe(
        activated.recoveryCodes.length,
      )

      // Deliberate ordering in the product: activate does NOT sign you in, so the
      // client can show the recovery codes first. Pin it — if a future change
      // starts issuing the session here, `complete`'s "is the factor active?"
      // guard stops protecting anything.
      expect(
        await sessionIdentity(ctx),
        'activation alone does not sign the caller in — /complete does',
      ).toBeNull()

      const complete = await ctx.post('/v1/auth/mfa/required/complete', {
        data: { pendingToken },
        failOnStatusCode: false,
      })
      // Success is a 302 into the tenant's /v1/auth/handoff, which this context
      // follows by default and which lands the session cookie on it — so the
      // status is 200 (handoff followed) or 302 (not followed). Never a 4xx.
      expect(
        [200, 302],
        `completing the flow establishes the session (got ${complete.status()})`,
      ).toContain(complete.status())
      expect(await sessionIdentity(ctx), 'and it is the subject’s own session').toBe(A)
    } finally {
      await ctx.dispose()
    }

    expect(enrolmentTokenExists(pendingToken), 'the token key is gone — it was consumed').toBe(false)
    expect(
      await countReaches(forcedEnrolmentLogins, completions + 1),
      'and the sign-in is audited as auth_method mfa:enrolled',
    ).toBe(completions + 1)
  })

  test('GATE · a consumed token cannot be replayed — on any of the three legs', async () => {
    resetSubject()
    const pendingToken = await mintEnrolmentToken(A, { source: SRC.replay })

    const ctx = await anonContext({ source: SRC.replay })
    try {
      const { secret, activate } = await enrolWithToken(ctx, pendingToken)
      expect(activate.status(), 'the enrolment itself succeeds').toBe(200)
      const complete = await ctx.post('/v1/auth/mfa/required/complete', {
        data: { pendingToken },
        failOnStatusCode: false,
      })
      expect([200, 302], `first redemption succeeds (got ${complete.status()})`).toContain(
        complete.status(),
      )
      expect(enrolmentTokenExists(pendingToken), 'which consumes the key').toBe(false)

      // A fresh, session-free client replays the token it captured. This is the
      // attacker's view: they hold the token, nothing else.
      const attacker = await anonContext({ source: SRC.replay })
      try {
        for (const [leg, body] of [
          ['complete', { pendingToken }],
          ['setup', { pendingToken }],
          ['activate', { pendingToken, code: totp(secret) }],
        ]) {
          const res = await attacker.post(`/v1/auth/mfa/required/${leg}`, {
            data: body,
            failOnStatusCode: false,
          })
          expect(res.status(), `replaying the consumed token at /required/${leg} is refused`).toBe(401)
          expect((await res.json())?.error?.code, 'with PENDING_EXPIRED').toBe('PENDING_EXPIRED')
        }
        expect(
          await sessionIdentity(attacker),
          'and the replay issued no session at all',
        ).toBeNull()
      } finally {
        await attacker.dispose()
      }
    } finally {
      await ctx.dispose()
    }

    // The replay must not have disturbed the enrolment it was replaying.
    expect(factorCountByStatus(A, 'ACTIVE'), 'exactly one factor survives').toBe(1)
  })

  test('GATE · an expired token is refused on every leg and leaves nothing half-built', async () => {
    resetSubject()
    const pendingToken = await mintEnrolmentToken(A, { source: SRC.expiry })
    expect(enrolmentTokenTtl(pendingToken)).toBeGreaterThan(0)

    // Redis expiry IS key deletion, so this is the real 15-minute-elapsed state.
    expireEnrolmentToken(pendingToken)
    expect(enrolmentTokenExists(pendingToken), 'the token has expired').toBe(false)

    const ctx = await anonContext({ source: SRC.expiry })
    try {
      for (const [leg, body] of [
        ['setup', { pendingToken }],
        ['activate', { pendingToken, code: '123456' }],
        ['complete', { pendingToken }],
      ]) {
        const res = await ctx.post(`/v1/auth/mfa/required/${leg}`, {
          data: body,
          failOnStatusCode: false,
        })
        expect(res.status(), `an expired token is refused at /required/${leg}`).toBe(401)
      }
      expect(await sessionIdentity(ctx), 'no session was issued').toBeNull()
    } finally {
      await ctx.dispose()
    }

    // The load-bearing half: an expired token must not have started an enrolment.
    // `/required/setup` inserts a PENDING factor row as its first act, so a count
    // of zero here is what proves the refusal happened BEFORE any write.
    expect(factorCountByStatus(A, 'PENDING'), 'no pending factor was created').toBe(0)
    expect(factorCountByStatus(A, 'ACTIVE'), 'and nothing was activated').toBe(0)
  })

  test('GATE · cross-user (body): identity comes from the token, never from the request', async () => {
    // The cheapest way to steer a pre-session endpoint at someone else is to name
    // them in the body. The token carries { email, userId, companyId }; if any of
    // those can be overridden, an attacker with their OWN valid token can write a
    // factor row against a colleague's account.
    resetSubject()
    clearMfa(B)
    const pendingToken = await mintEnrolmentToken(A, { source: SRC.crossBody })

    const ctx = await anonContext({ source: SRC.crossBody })
    try {
      const setup = await ctx.post('/v1/auth/mfa/required/setup', {
        data: {
          pendingToken,
          // Every identity field the handler reads off the pending record.
          email: B,
          userId: AUTH_PERSONAS.locker.id,
          companyId: E2ELAB_COMPANY_ID,
        },
        failOnStatusCode: false,
      })
      expect([200, 400], 'the injected keys are either ignored or rejected outright').toContain(
        setup.status(),
      )

      if (setup.status() === 200) {
        const { secret } = await setup.json()
        await inFreshTotpWindow()
        const activate = await ctx.post('/v1/auth/mfa/required/activate', {
          data: { pendingToken, code: totp(secret), email: B, userId: AUTH_PERSONAS.locker.id },
          failOnStatusCode: false,
        })
        expect(activate.status(), 'activation follows the token, not the injected identity').toBe(200)
      }
    } finally {
      await ctx.dispose()
    }

    // The only assertions that matter: whose rows exist.
    const factor = totpFactorRow(A)
    if (factor) {
      expect(factor.userId, 'any factor written belongs to the token’s subject').toBe(A_ID)
      expect(factor.companyId, 'in the token’s company').toBe(E2ELAB_COMPANY_ID)
    }
    expect(
      factorCountByStatus(B, 'PENDING') + factorCountByStatus(B, 'ACTIVE'),
      'the named-in-the-body user gained NO factor row of any status',
    ).toBe(0)
    expect(unusedRecoveryCodes(B), 'and no recovery codes').toBe(0)
  })

  test('GATE · cross-user (session): A’s enrolment token is not redeemable while acting as B', async () => {
    // Doc 14's second probe. B holds a perfectly good session of their own and
    // presents a token minted for A. Nothing here may end with B's client holding
    // A's identity, and B must never acquire A's factor.
    resetSubject()
    clearMfa(B)
    clearLockout(B)
    releaseFromForcedEnrolment(B)

    const bCtx = await signedInContext(B, { source: SRC.crossSession })
    try {
      expect(await sessionIdentity(bCtx), 'B starts out signed in as themselves').toBe(B)

      const pendingToken = await mintEnrolmentToken(A, { source: SRC.crossSession })
      const setup = await bCtx.post('/v1/auth/mfa/required/setup', {
        data: { pendingToken },
        failOnStatusCode: false,
      })

      // Order matters: wait out a nearly-finished window FIRST, then compute the
      // code. Computing it first and then sleeping produces a code the server
      // evaluates one window late — which made this test pass on a stale-code
      // 400 (leaving A un-enrolled, so /complete answered 409 NOT_ENROLLED) and
      // never exercise the cross-user question at all.
      let code = '123456'
      if (setup.status() === 200) {
        const { secret } = await setup.json()
        await inFreshTotpWindow()
        code = totp(secret)
      }
      const activate = await bCtx.post('/v1/auth/mfa/required/activate', {
        data: { pendingToken, code },
        failOnStatusCode: false,
      })
      // Not the assertion — just proof that the leg under test really ran, so a
      // refusal at /complete below cannot be a side effect of a broken enrolment.
      expect(
        [200, 400, 401, 403, 409],
        `the activate leg answered coherently (got ${activate.status()})`,
      ).toContain(activate.status())

      const complete = await bCtx.post('/v1/auth/mfa/required/complete', {
        data: { pendingToken },
        failOnStatusCode: false,
      })
      expect(
        REFUSED,
        `completing A's forced enrolment from B's authenticated client must be refused (got ${complete.status()})`,
      ).toContain(complete.status())

      // The consequence, asserted independently of the status code: B's client
      // must still be B. Silently swapping a live session's identity is the
      // session-fixation shape doc 11 warned about on this path.
      expect(
        await sessionIdentity(bCtx),
        'B’s own session was neither replaced by A’s nor destroyed',
      ).toBe(B)
    } finally {
      await bCtx.dispose()
    }

    expect(
      factorCountByStatus(B, 'PENDING') + factorCountByStatus(B, 'ACTIVE'),
      'B gained no factor from A’s enrolment token',
    ).toBe(0)
  })

  test('GATE · cross-user (tokens): B’s token cannot activate the secret minted for A', async () => {
    // Two forced users, two live tokens, one secret. If `activate` matched the
    // code against anything other than the PENDING factor belonging to its OWN
    // token's subject, this is where it would show.
    resetSubject()
    clearMfa(B)
    clearLockout(B)
    forceEnrolmentNow(B)

    const tokenA = await mintEnrolmentToken(A, { source: SRC.crossToken })
    const tokenB = await mintEnrolmentToken(B, { source: SRC.crossToken })
    expect(tokenA, 'the two tokens are distinct').not.toBe(tokenB)

    const ctx = await anonContext({ source: SRC.crossToken })
    try {
      const setupA = await ctx.post('/v1/auth/mfa/required/setup', {
        data: { pendingToken: tokenA },
        failOnStatusCode: false,
      })
      expect(setupA.status()).toBe(200)
      const secretA = (await setupA.json()).secret

      const setupB = await ctx.post('/v1/auth/mfa/required/setup', {
        data: { pendingToken: tokenB },
        failOnStatusCode: false,
      })
      expect(setupB.status()).toBe(200)

      await inFreshTotpWindow()
      const crossed = await ctx.post('/v1/auth/mfa/required/activate', {
        data: { pendingToken: tokenB, code: totp(secretA) },
        failOnStatusCode: false,
      })
      expect(
        REFUSED,
        `A's code must not activate B's factor (got ${crossed.status()})`,
      ).toContain(crossed.status())

      // CONTROL for this test: B's OWN code does activate B, so the refusal above
      // is code-binding rather than "activate is simply broken for B".
      const secretB = (await setupB.json()).secret
      await inFreshTotpWindow()
      const own = await ctx.post('/v1/auth/mfa/required/activate', {
        data: { pendingToken: tokenB, code: totp(secretB) },
        failOnStatusCode: false,
      })
      expect(own.status(), 'CONTROL · B’s own code activates B’s factor').toBe(200)
    } finally {
      await ctx.dispose()
    }

    expect(factorCountByStatus(B, 'ACTIVE'), 'B ends with exactly their own factor').toBe(1)
    expect(factorCountByStatus(A, 'ACTIVE'), 'and A was never activated by B’s traffic').toBe(0)
  })

  test('GATE · a token left unredeemed must not become a session once the account is enrolled', async () => {
    // The subtle one, and the reason `complete` carries a guard at all. Its own
    // comment states the intent: "only finish once the factor is actually active —
    // the token alone must not open a session without a completed second factor."
    //
    // WAS RED, NOW GREEN. The original guard asked "is this ACCOUNT enrolled?", not
    // "did THIS token enrol it". So: password-holder logs in, pockets token T1, and
    // walks away. The real owner then enrols (here, via a second forced-enrolment
    // token — self-service or an admin reset gets to the same place). T1 was still
    // live for up to 15 minutes, and redeeming it handed the holder a session having
    // never presented a second factor — against the very policy that forced
    // enrolment. That was reproduced end to end.
    //
    // The evidence now lives on the token, not on the account: `/required/activate`
    // is the only caller of `markPendingEnrollmentFactorProven`, and
    // `/required/complete` refuses unless `pending.factorProven` is set
    // (controllers/auth/mfa.js:551). The stale token below never went through
    // activate, so it carries no proof and is refused — which is exactly what this
    // test now pins. Do not relax it back to a status-only assertion: the
    // security-relevant half is `sessionIdentity(holder)` being null.
    resetSubject()

    const stale = await mintEnrolmentToken(A, { source: SRC.sibling })
    const legitimate = await mintEnrolmentToken(A, { source: SRC.sibling })
    expect(stale, 'two independent tokens').not.toBe(legitimate)

    const owner = await anonContext({ source: SRC.sibling })
    try {
      const { activate } = await enrolWithToken(owner, legitimate)
      expect(activate.status(), 'the owner completes a genuine enrolment').toBe(200)
      const complete = await owner.post('/v1/auth/mfa/required/complete', {
        data: { pendingToken: legitimate },
        failOnStatusCode: false,
      })
      expect([200, 302], `the owner's own redemption works (got ${complete.status()})`).toContain(
        complete.status(),
      )
      expect(factorCountByStatus(A, 'ACTIVE'), 'the account is now enrolled').toBe(1)
    } finally {
      await owner.dispose()
    }

    // The stale token was never redeemed, so it is still in Redis.
    expect(enrolmentTokenExists(stale), 'the stale token has not expired yet').toBe(true)

    const holder = await anonContext({ source: SRC.sibling })
    try {
      const res = await holder.post('/v1/auth/mfa/required/complete', {
        data: { pendingToken: stale },
        failOnStatusCode: false,
      })
      // Identity FIRST: the security consequence is "who is this client now",
      // not the status code. Asserting the code first would report a bare
      // "expected 4xx, got 200" and bury the finding.
      const identity = await sessionIdentity(holder)
      expect(
        identity,
        `a stale enrolment token signed its holder in as ${identity} (HTTP ${res.status()}) ` +
          'without them ever presenting a second factor — the account was enrolled by a ' +
          'DIFFERENT token, so /required/complete accepted a caller who proved nothing but ' +
          'the password. This is a regression of the factorProven guard: complete must ask ' +
          '"did THIS token activate a factor", never "is this account enrolled"',
      ).toBeNull()
      expect(
        REFUSED,
        `and the request itself must be refused (got ${res.status()})`,
      ).toContain(res.status())
    } finally {
      await holder.dispose()
    }
  })

  test('CONTROL · with the policy lifted, the subject signs in without any enrolment step (must pass today)', async () => {
    // Closes the loop: proves the whole spec was driven by the tenant policy and
    // that afterAll's teardown genuinely restores an ordinary login. Without it a
    // leaked policy row would silently break every other suite in the next run.
    clearMfa(A)
    clearLockout(A)
    clearMfaPolicy()
    expect(tenantMfaMode(), 'the policy row is gone').toBeNull()

    const res = await loginNoRedirect(A, { source: SRC.control, password: PASSWORD })
    expect(res.status, 'an ordinary 302 into handoff').toBe(302)
    expect(res.body?.mfaEnrollmentRequired, 'and no enrolment demanded').toBeFalsy()

    // Re-install it so afterAll tears down the same state every path leaves.
    requireMfaForTenant()
  })
})
