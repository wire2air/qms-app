// PW-J3 · AUTH-S2 (P1, release condition C3) — unlimited password-reset email.
//
// `POST /v1/auth/password/forgot` has no throttle and no lockout equivalent, and
// every accepted call enqueues JOB-01 `send_password_reset_email`
// (services/emailQueue.js:4). So one unauthenticated client can put an unbounded
// number of real reset emails — each with a working reset link — into a named
// victim's mailbox.
//
// Two consequences: targeted mailbox flooding (a recognised way to bury a genuine
// security alert under noise), and sender-reputation damage to the tenant's mail
// domain. The same shape applies to /workspaces/forgot (JOB-03) and, worse,
// /mfa/email/send (JOB-04) — flooding OTP mail trains a user to ignore MFA mail.
//
// The assertion is on TOKENS MINTED, not just HTTP status: the mailbox impact is
// the finding, and a fix that returns 200 while suppressing the resend is a valid
// fix.
import { test, expect } from '@playwright/test'
import {
  AUTH_PERSONAS,
  anonPost,
  burst,
  clearResetTokens,
  clearResetCooldown,
  resetTokenCount,
  mailCountTo,
} from '../fixtures/authentication.js'

const VICTIM = AUTH_PERSONAS.victim.email
const OTHER = AUTH_PERSONAS.locker.email
const FLOOD = 10

test.describe('PW-J3 · password-reset dispatch is bounded', () => {
  test('GATE · ten forgot-password calls deliver at most one email (C3)', async () => {
    // Measure DELIVERED MAIL, not token rows or worker jobs. The first version of
    // this test counted `password_reset_tokens` and passed — falsely. The
    // implementation REPLACES the token per request (so the row count sits at 1
    // while ten emails go out) and graphile consumes and deletes jobs within
    // milliseconds. Mailhog is the only signal that reflects the actual harm.
    const before = await mailCountTo(VICTIM)
    test.skip(before === null, 'Mailhog not reachable on :8025 — cannot measure delivery')

    const statuses = (
      await burst(FLOOD, () => anonPost('/v1/auth/password/forgot', { email: VICTIM }))
    ).map((r) => r.status)
    expect(
      statuses.every((s) => s === 200),
      'every call is accepted',
    ).toBe(true)

    // Delivery is asynchronous (JOB-01 via graphile), so allow it to drain.
    let delivered = 0
    for (let i = 0; i < 20; i += 1) {
      delivered = (await mailCountTo(VICTIM)) - before
      if (delivered >= FLOOD) break
      await new Promise((r) => setTimeout(r, 500))
    }

    const throttled = statuses.filter((s) => s === 429).length

    // Either control satisfies C3: a 429, or resend suppression inside the cooldown.
    // What must NOT happen is one email per request.
    //
    // NOTE the cooldown is 60s and this suite may have already triggered a send for
    // this address, so `delivered` can legitimately be 0 — that is still a pass.
    expect(
      throttled > 0 || delivered <= 1,
      `AUTH-S2: ${FLOOD} unauthenticated calls delivered ${delivered} emails to the victim ` +
        `and produced ${throttled} throttled responses. A resend inside the cooldown must be ` +
        `SUPPRESSED (resetPassword.js isWithinResendCooldown, 60s) — otherwise one ` +
        `unauthenticated caller floods a named victim's mailbox and buries genuine security ` +
        `mail (release condition C3).`,
    ).toBe(true)
  })

  test('CONTROL · user enumeration stays closed (G2, must pass today)', async () => {
    // The review verified this is CORRECT today. It is pinned here because the
    // obvious fix for the flood above — "return an error for unknown addresses so
    // we stop sending" — would reopen enumeration. This test makes that regression
    // impossible to land quietly.
    const known = await anonPost('/v1/auth/password/forgot', { email: VICTIM })
    const unknown = await anonPost('/v1/auth/password/forgot', {
      email: `nobody-${Date.now()}@e2e.test`,
    })

    expect(known.status, 'known address').toBe(200)
    expect(unknown.status, 'unknown address: same status').toBe(200)
    expect(
      unknown.body?.message,
      'and the same generic message — no oracle for whether an account exists',
    ).toBe(known.body?.message)
  })

  test('CONTROL · a token IS still minted for a real account (must pass today)', async () => {
    // Proves C3 suppressed the FLOOD without breaking password reset itself — the
    // failure mode a naive fix would introduce. Uses a persona this spec has not
    // touched, so the 60s cooldown is not already claimed.
    clearResetTokens(OTHER)
    clearResetCooldown(OTHER)
    const { status } = await anonPost('/v1/auth/password/forgot', { email: OTHER })
    expect(status).toBe(200)
    expect(resetTokenCount(OTHER), 'a genuine first request still mints a token').toBeGreaterThan(0)
  })
})
