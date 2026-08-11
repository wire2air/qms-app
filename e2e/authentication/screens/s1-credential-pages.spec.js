// Authentication screenshots · S1 — the credential-layer pages.
//   Sign-in (empty, and with the invalid-credentials error), forgot-password
//   (form + the submitted confirmation), and the reset-password screen's
//   invalid/expired-token state.
//
// SAFETY — read fixtures/authentication.js's header before extending this file:
//   * every browser context here is created WITHOUT a storageState, because a
//     login performed inside a test regenerates the session and would destroy
//     the saved auth state of whatever role it inherited (e2e/README.md);
//   * the one failed-login capture targets the suite's THROWAWAY persona
//     (AUTH_PERSONAS.victim), never a shared one, and clears the lockout in
//     afterAll — a locked shared account breaks every other suite;
//   * one wrong attempt is deliberately below the lockout threshold. This file
//     never provokes a lockout, so no locked-out screen is captured (see the
//     note at the bottom).
import { test, expect } from '../../../video/fixtures/videoTest.js'
import { BASE_URL } from '../../fixtures/cast.js'
import {
  expectSignInPageRendered,
  signInForm,
  forgotPasswordForm,
  resetPasswordForm,
} from '../../fixtures/authPages.js'
import { AUTH_PERSONAS, clearLockout, clearSourceCounters } from '../../fixtures/authentication.js'
import { shooter } from '../../fixtures/screenshots.js'

const shot = shooter('authentication')

/** A genuinely cookie-free context — never inherit a role's storageState here. */
async function anonPage(browser) {
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  return { ctx, page: await ctx.newPage() }
}

test.describe.serial('Authentication screenshots · credential pages', () => {
  test.afterAll(() => {
    // Undo anything the single failed attempt below left behind.
    clearLockout(AUTH_PERSONAS.victim.email)
    clearSourceCounters()
  })

  test('sign-in: empty form and the invalid-credentials error', async ({ browser }) => {
    test.setTimeout(180_000)
    const { ctx, page } = await anonPage(browser)

    await page.goto(`${BASE_URL}/signin`)
    await expectSignInPageRendered(page)
    await shot(page, 'signin')

    // One wrong password on the throwaway victim — below the lockout threshold.
    const form = signInForm(page)
    await form.email.fill(AUTH_PERSONAS.victim.email)
    await form.password.fill('definitely-not-the-password')
    await form.submit.click()
    // The form stays put and surfaces the failure; anchor on the page not
    // navigating away plus the error text the component renders.
    await expect(page).toHaveURL(/\/signin/)
    await expect(page.getByText(/invalid|incorrect|failed|wrong/i).first()).toBeVisible({
      timeout: 20_000,
    })
    await shot(page, 'signin-invalid-credentials')

    await ctx.close()
  })

  test('forgot password: form, then the submitted confirmation', async ({ browser }) => {
    test.setTimeout(180_000)
    const { ctx, page } = await anonPage(browser)

    await page.goto(`${BASE_URL}/signin`)
    await expectSignInPageRendered(page)
    await signInForm(page).forgotLink.click()

    const form = forgotPasswordForm(page)
    await expect(form.email).toBeVisible({ timeout: 20_000 })
    await expect(form.submit).toBeVisible()
    await shot(page, 'forgot-password')

    await form.email.fill(AUTH_PERSONAS.victim.email)
    await shot(page, 'forgot-password-filled')

    await form.submit.click()
    // The response is deliberately the same whether or not the address exists
    // (no account enumeration), so anchor on the form leaving the screen.
    await expect(form.submit).toHaveCount(0, { timeout: 30_000 })
    await shot(page, 'forgot-password-submitted')

    await ctx.close()
  })

  test('reset password: the screen an invalid or expired link lands on', async ({ browser }) => {
    test.setTimeout(180_000)
    const { ctx, page } = await anonPage(browser)

    // A syntactically valid but unknown token — the state a user reaches from a
    // stale email, which is the only reset screen reachable without minting a
    // real token (doing that would rewrite a persona's password).
    await page.goto(`${BASE_URL}/reset-password?token=e2e-screenshot-not-a-real-token`)
    const form = resetPasswordForm(page)
    // Either the form renders (and rejects on submit) or the page reports the
    // link is invalid — assert on whichever this build shows, then capture.
    await expect(form.password.or(page.getByText(/invalid|expired/i)).first()).toBeVisible({
      timeout: 30_000,
    })
    await shot(page, 'reset-password')

    await ctx.close()
  })
})

// NOT captured, deliberately:
//   * the locked-out screen — reaching it means driving a real account past the
//     lockout threshold, and lockout state is Redis-backed and shared. The
//     authentication journeys own that (with their own teardown); a screenshot
//     run is the wrong place to leave that footprint.
//   * MFA challenge / TOTP enrolment and invitation acceptance — both need a
//     mid-test login (session-regenerating) or a minted single-use token. They
//     belong in a spec built on the MFA/admin fixtures rather than here.
