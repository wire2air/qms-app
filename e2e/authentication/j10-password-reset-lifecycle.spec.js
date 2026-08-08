// PW-J10 · Password reset: token single-use, policy enforced server-side.
//
// Drives BOTH public pages of the reset flow end to end — `forgot-password.vue`
// (S-04) and `reset-password.vue` (S-05) — which between them are the only way an
// unauthenticated person can change a credential. Neither had any coverage: doc 19
// scored the module at 0 of 11 pages driven, and the existing PW-J3 only counts how
// many emails a flood produces, never following one to the end.
//
// ── TWO THINGS DOC 14 GETS WRONG, VERIFIED AGAINST THE RUNNING SYSTEM ────────
//
// 1. "read the token from `password_reset_tokens`" — IMPOSSIBLE. That table stores
//    `token_hash` only (SHA-256; `controllers/auth/resetPassword.js:23-25`, and the
//    live schema has no plaintext column). The emailed link is the only place the
//    plaintext exists. This spec reads it out of Mailhog, which is strictly better
//    anyway: it proves the mail was actually delivered, not merely that a row
//    appeared. (PW-J3 learned the same lesson the hard way — see doc 14's
//    "harness lessons".)
//
// 2. "submit a non-compliant password and assert it is rejected by policy" — the
//    PAGE never lets you submit one. `ResetPasswordForm.vue:124` disables the
//    button until the strength meter's server-checked `meetsPolicy` is true. So the
//    journey has two distinct halves, and only the second is the security control:
//    the UI refusing to submit (a usability affordance) and the API refusing the
//    request (the actual enforcement). A test that only drove the page would prove
//    nothing about API-19, because it could never reach it.
//
// ── PERSONA CHOICE IS LOAD-BEARING ──────────────────────────────────────────
// `confirmPasswordReset` revokes EVERY session for the target email
// (resetPassword.js:185-186), so pointing this at a shared persona would destroy
// its storageState for the whole run. `authvictim@e2e.test` is a throwaway with no
// grants and no storageState. Teardown restores its seeded hash so PW-J1's "the
// victim can still log in with their correct password" keeps working — and because
// `12345678` does not satisfy the live policy, that restore can only be done as a
// direct hash write, never through the API.
import { test, expect } from '@playwright/test'
import { sqlValue } from '../fixtures/db.js'
import {
  AUTH_PERSONAS,
  PASSWORD,
  attemptLogin,
  anonPost,
  clearLockout,
  clearSourceCounters,
  clearResetTokens,
  resetTokenCount,
} from '../fixtures/authentication.js'
import {
  APP_ORIGIN,
  forgotPasswordForm,
  resetPasswordForm,
  freshCompliantPassword,
  passwordHashOf,
  restorePasswordHash,
  passwordHistoryIds,
  deletePasswordHistoryExcept,
  mailIdsTo,
  waitForResetToken,
  purgeSessions,
  clearResendCooldown,
  expectSignInPageRendered,
} from '../fixtures/authPages.js'

const SUBJECT = AUTH_PERSONAS.victim.email

/** Unique per run — `password_history` (depth 5) rejects a reused value. */
const NEW_PASSWORD = freshCompliantPassword('J10a')
const SECOND_PASSWORD = freshCompliantPassword('J10b')

/** Captured in beforeAll so teardown can put the account back exactly as seeded. */
let seededHash = null
let seededHistoryIds = []
/** Carried between tests: the token minted in the first GATE, replayed in the second. */
const state = { token: null, hashAfterReset: null }

test.beforeAll(async () => {
  seededHash = passwordHashOf(SUBJECT)
  expect(seededHash, 'the subject has a seeded password hash to restore later').toBeTruthy()
  seededHistoryIds = passwordHistoryIds(SUBJECT)

  clearLockout(SUBJECT)
  clearResetTokens(SUBJECT)
  clearResendCooldown('pwreset', SUBJECT)
})

test.afterAll(async () => {
  // Order matters: put the credential back BEFORE anything else can observe it.
  restorePasswordHash(SUBJECT, seededHash)
  deletePasswordHistoryExcept(SUBJECT, seededHistoryIds)
  clearResetTokens(SUBJECT)
  clearResendCooldown('pwreset', SUBJECT)
  clearLockout(SUBJECT)
  clearSourceCounters()
  purgeSessions(SUBJECT)

  // Prove the restore worked rather than trusting it — a half-restored persona
  // poisons PW-J1 in a way that looks like a lockout regression.
  expect(passwordHashOf(SUBJECT), 'the seeded hash was restored').toBe(seededHash)
})

test.describe('PW-J10 · a reset link changes the password exactly once', () => {
  test('GATE · the two public pages complete a real password reset', async ({ page }) => {
    clearResendCooldown('pwreset', SUBJECT)
    const knownMail = await mailIdsTo(SUBJECT)
    test.skip(knownMail === null, 'Mailhog is not reachable — the token is only in the email')

    const historyBefore = passwordHistoryIds(SUBJECT).length

    // ── S-04 · forgot-password.vue ─────────────────────────────────────────
    await page.goto(`${APP_ORIGIN}/forgot-password`)
    const forgot = forgotPasswordForm(page)
    await expect(
      page.getByText('Reset your password').first(),
      'the forgot-password form rendered',
    ).toBeVisible()
    await expect(forgot.email, 'the Email input is on screen').toBeVisible()
    await expect(forgot.submit, 'the Send reset link button is on screen').toBeVisible()

    await forgot.email.fill(SUBJECT)
    await expect(forgot.email).toHaveValue(SUBJECT)
    await forgot.submit.click()

    // The page switches to its confirmation state. This copy is deliberately
    // identical for a known and an unknown address (G2, enumeration stays closed),
    // so it is evidence the SUBMIT happened — not evidence the account exists.
    await expect(
      page.getByText('Check your email'),
      'the page confirmed the request',
    ).toBeVisible({ timeout: 20_000 })

    // The DB half of the same act.
    await expect
      .poll(() => resetTokenCount(SUBJECT), {
        message: 'no password_reset_tokens row appeared — the page did not reach the API',
        timeout: 20_000,
      })
      .toBe(1)

    // ── The email ──────────────────────────────────────────────────────────
    const mail = await waitForResetToken(SUBJECT, knownMail)
    state.token = mail.token
    expect(mail.url, 'the link points at the tenant’s own host, not the apex').toContain(
      '/reset-password?token=',
    )

    // ── S-05 · reset-password.vue ──────────────────────────────────────────
    await page.goto(`${APP_ORIGIN}/reset-password?token=${mail.token}`)
    const reset = resetPasswordForm(page)
    await expect(page.getByText('Set new password'), 'the reset form rendered').toBeVisible()

    await reset.password.fill(NEW_PASSWORD)
    await reset.confirm.fill(NEW_PASSWORD)
    // `{ exact: true }` on both placeholders matters — 'New password' is a
    // substring of 'Confirm new password'. Assert the values landed where intended.
    await expect(reset.password).toHaveValue(NEW_PASSWORD)
    await expect(reset.confirm).toHaveValue(NEW_PASSWORD)

    // The submit unlocks only once PasswordStrengthMeter's server round-trip
    // returns meetsPolicy — so an enabled button is itself proof the meter ran.
    await expect(
      reset.submit,
      'the strength meter accepted a compliant password and unlocked submit',
    ).toBeEnabled({ timeout: 20_000 })

    await reset.submit.click()

    // The page reports success and sends the user to their tenant's sign-in.
    await page.waitForURL(/\/signin/, { timeout: 30_000 })
    await expectSignInPageRendered(page)

    // ── The database half ──────────────────────────────────────────────────
    const usedAt = sqlValue(
      `SELECT used_at FROM password_reset_tokens t JOIN users u ON u.id = t.user_id
        WHERE u.email = '${SUBJECT}' ORDER BY t.created_at DESC LIMIT 1`,
    )
    expect(usedAt, 'the token is stamped consumed').not.toBeNull()

    // password_history is why reuse prevention can exist at all.
    expect(
      passwordHistoryIds(SUBJECT).length,
      'password_history gained a row for the new credential',
    ).toBe(historyBefore + 1)

    state.hashAfterReset = passwordHashOf(SUBJECT)
    expect(state.hashAfterReset, 'the stored hash actually changed').not.toBe(seededHash)

    // ── And the credential really is the new one ───────────────────────────
    expect(
      await attemptLogin(SUBJECT, NEW_PASSWORD),
      'the new password signs in',
    ).toBe(302)
    expect(
      await attemptLogin(SUBJECT, PASSWORD),
      'the OLD password no longer signs in — a reset that leaves the old credential ' +
        'working is not a reset',
    ).toBe(401)

    clearLockout(SUBJECT)
  })

  test('GATE · the consumed token cannot be replayed', async () => {
    test.skip(!state.token, 'the first GATE did not produce a token')

    // A reset link lands in a mailbox and lives in browser history, proxy logs and
    // "recently visited". Single-use is what stops a second party — or the same
    // person weeks later — re-opening it and taking the account over.
    const replay = await anonPost('/v1/auth/password/reset', {
      token: state.token,
      password: SECOND_PASSWORD,
    })

    expect(
      replay.status,
      'AUTH regression: a consumed reset token was accepted a second time. ' +
        'confirmPasswordReset must filter on usedAt: null (resetPassword.js:136).',
    ).toBe(400)
    expect(replay.body?.error?.message).toContain('invalid or has expired')

    // The load-bearing half: the 400 means the WRITE did not happen. A refusal that
    // still changed the password would be worse than no refusal at all.
    expect(
      passwordHashOf(SUBJECT),
      'the password is untouched by the replay',
    ).toBe(state.hashAfterReset)
    expect(
      await attemptLogin(SUBJECT, SECOND_PASSWORD),
      'and the password the replay tried to set does not work',
    ).toBe(401)

    clearLockout(SUBJECT)
  })

  test('GATE · a weak password is refused by the SERVER, not just by the page', async ({ page }) => {
    // Mint a fresh token: the previous one is spent.
    clearResendCooldown('pwreset', SUBJECT)
    const knownMail = await mailIdsTo(SUBJECT)
    test.skip(knownMail === null, 'Mailhog is not reachable')

    const forgot = await anonPost('/v1/auth/password/forgot', { email: SUBJECT })
    expect(forgot.status, 'a fresh reset was requested').toBe(200)
    const mail = await waitForResetToken(SUBJECT, knownMail)

    // ── Half 1 (usability): the page refuses to submit `12345678` ───────────
    // This is the client meter doing its job — NOT a security control.
    await page.goto(`${APP_ORIGIN}/reset-password?token=${mail.token}`)
    const reset = resetPasswordForm(page)
    await expect(page.getByText('Set new password')).toBeVisible()

    await reset.password.fill(PASSWORD) // '12345678' — fails upper/lower/number + strength
    await reset.confirm.fill(PASSWORD)
    await expect(reset.password).toHaveValue(PASSWORD)

    // Give the debounced (300ms) server validate call time to answer, then confirm
    // the button never unlocks. Negative assertions need a settle window or they
    // pass before the thing they are watching for could have happened.
    await page.waitForTimeout(2_000)
    await expect(
      reset.submit,
      'the page keeps submit disabled for a password that fails the policy',
    ).toBeDisabled()

    // The checklist tells the user WHY, rather than leaving a dead button.
    await expect(
      page.getByText('An uppercase letter'),
      'the policy checklist explains the refusal',
    ).toBeVisible()

    // ── Half 2 (the actual control): the API refuses it too ─────────────────
    // THE GATE. A client-side meter is advice; API-19 is enforcement. Bypassing
    // the page is the entire point — that is what an attacker does.
    const direct = await anonPost('/v1/auth/password/reset', {
      token: mail.token,
      password: PASSWORD,
    })

    expect(
      direct.status,
      'AUTH regression: the reset endpoint accepted a policy-violating password ' +
        'when called directly. API-19 must validate server-side rather than trust ' +
        'the client meter (resetPassword.js:154-167).',
    ).toBe(422)
    expect(direct.body?.error?.code, 'and says so as a policy failure').toBe('PASSWORD_POLICY')
    expect(
      Array.isArray(direct.body?.error?.issues) && direct.body.error.issues.length,
      'with the specific issues enumerated',
    ).toBeTruthy()

    // The rejection is a clean validation failure: it must not burn the token, or a
    // user who fat-fingers a weak password would need a whole new email.
    expect(
      sqlValue(
        `SELECT used_at FROM password_reset_tokens t JOIN users u ON u.id = t.user_id
          WHERE u.email = '${SUBJECT}' ORDER BY t.created_at DESC LIMIT 1`,
      ),
      'the token survives a rejected attempt',
    ).toBeNull()

    // And the credential is untouched.
    expect(passwordHashOf(SUBJECT), 'the stored password did not change').toBe(
      state.hashAfterReset,
    )
  })
})
