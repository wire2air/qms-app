// PW-J6 · Login happy path and its full side-effect set.
//
// THE MODULE'S FIRST PAGE-DRIVEN TEST. Doc 19 scored Automation at "0 of 11 pages
// driven": all 18 existing authentication tests fire pre-auth HTTP and assert on a
// status code, so `signin.vue` + `LoginForm.vue` — the single densest page in the
// module — had no regression protection beyond a render-only smoke check. Doc 19
// names PW-J6 as "the natural first one", because a successful login is the one
// flow whose correctness is entirely invisible at the HTTP layer: a 302 proves the
// credentials matched, and nothing more. The five artefacts a session actually
// consists of are written by four different best-effort code paths, each wrapped in
// its own try/catch, and ANY of them can silently stop firing without the login
// ever failing:
//
//   user_sessions   ← establishSessionTracking (services/sessionTracking.js:150)
//   login_events    ← recordSecurityEvent, fire-and-forget (utils/securityEvents.js:53)
//   user_devices    ← upsertDevice (controllers/auth/helpers.js:19)
//   last_logins     ← updateLastLogin, and ONLY on GET /v1/auth/session — so a probe
//                     that stops at the redirect can never observe it at all
//   auth:<sid>      ← the RedisStore behind express-session
//
// That last point is why this journey has to be page-driven rather than a two-call
// HTTP script: `last_logins` is written by the SPA's own boot round-trip. A test
// that stops at the 302 is not testing login, it is testing password comparison.
//
// Every assertion below is "the browser shows X" followed by "the database agrees".
import { test, expect } from '@playwright/test'
import { USERS, PASSWORD, COMPANY_ID } from '../fixtures/cast.js'
import { sqlValue } from '../fixtures/db.js'
import {
  AUTH_PERSONAS,
  clearLockout,
  clearSourceCounters,
} from '../fixtures/authentication.js'
import {
  APP_ORIGIN,
  expectSignInPageRendered,
  signInForm,
  sidFromContext,
  sidFromSetCookie,
  setCookieHeaders,
  jarContext,
  sessionKeyExists,
  sessionIndexMembers,
  loginEventCountSince,
  newestSessionRow,
  deviceCountSince,
  lastLoginAfter,
  nowIso,
} from '../fixtures/authPages.js'

// A granted persona, so the login lands in the real app and the SPA actually boots
// (which is what writes last_logins). Logging in is ADDITIVE — it mints a new
// session and touches nothing that the stored storageState session depends on — so
// unlike PW-J7 and PW-J10 this journey is safe to point at a shared persona.
const ACTOR = USERS.author

// The failed-login CONTROL uses the designated throwaway instead: a wrong password
// increments the (email, source) lockout counter, and doing that to a shared
// persona is exactly the mistake convention 1 of doc 14 exists to prevent.
const BAD_ACTOR = AUTH_PERSONAS.victim.email

test.afterAll(() => {
  clearLockout(BAD_ACTOR)
  clearSourceCounters()
})

test.describe('PW-J6 · signing in through the real page produces a complete session', () => {
  test('GATE · the sign-in page authenticates and writes every side effect', async ({ browser }) => {
    const since = nowIso()
    const context = await browser.newContext()
    const page = await context.newPage()

    try {
      // ── The page half ──────────────────────────────────────────────────────
      await page.goto(`${APP_ORIGIN}/signin`)
      await expectSignInPageRendered(page)

      const form = signInForm(page)
      await form.email.fill(ACTOR.email)
      await form.password.fill(PASSWORD)

      // Prove the typing actually landed in the controls rather than being
      // swallowed by a locator that resolved to some other node.
      await expect(form.email).toHaveValue(ACTOR.email)
      await expect(form.password).toHaveValue(PASSWORD)

      await form.submit.click()

      // The browser is now authenticated: it holds a session cookie backed by a
      // live session, and the credential form is gone from the screen.
      //
      // The readiness condition is "the cookie resolves to a live Redis session",
      // not "a cookie exists". Login is a two-hop redirect and the browser briefly
      // holds the PRE-handoff cookie, which regenerate() then destroys — polling
      // for mere existence can capture that doomed id. See signInThroughPage.
      await expect
        .poll(
          async () => {
            const candidate = await sidFromContext(context)
            return candidate && sessionKeyExists(candidate) ? candidate : null
          },
          {
            message: 'no live session was established — the page did not complete a login',
            timeout: 30_000,
            intervals: [250, 250, 500, 500, 1000],
          },
        )
        .not.toBeNull()

      const sid = await sidFromContext(context)
      await expect(
        page.getByText('Welcome back'),
        'the sign-in form is gone — the SPA navigated into the app',
      ).toBeHidden()

      // ── The database half ──────────────────────────────────────────────────

      // 1. Redis holds the express-session under exactly the sid the browser has.
      //    This is the join that proves the cookie is live rather than merely
      //    well-formed — a stale or forged cookie has no key behind it.
      expect(
        sessionKeyExists(sid),
        `Redis has no auth:<sid> for the cookie the browser was issued (sid=${sid})`,
      ).toBe(true)

      // 2. …and the per-user index knows about it, which is what makes a later
      //    global sign-out able to reach this session (see PW-J7).
      expect(
        sessionIndexMembers(ACTOR.email),
        'the session is registered in user_sessions:<email>',
      ).toContain(sid)

      // 3. login_events carries a LOGIN_SUCCESS. Fire-and-forget, hence the poll.
      await expect
        .poll(() => loginEventCountSince(ACTOR.email, 'LOGIN_SUCCESS', since), {
          message: 'no LOGIN_SUCCESS row was appended to the login_events ledger',
          timeout: 20_000,
        })
        .toBeGreaterThan(0)

      // 4. A user_sessions shadow row exists, is scoped FULL, is live, and expires.
      //    `scope` is what PW-J11's PORTAL_ONLY boundary is measured against, and
      //    `expires_at` is what the absolute-timeout sweep keys on — a null there
      //    would mean a session that never ages out.
      const row = newestSessionRow(ACTOR.email)
      expect(row, 'a user_sessions shadow row was written for this login').not.toBeNull()
      expect(row.scope, 'the session is a FULL main-app session').toBe('FULL')
      expect(row.revokedAt, 'the fresh session is not revoked').toBeNull()
      expect(row.expiresAt, 'the session carries an absolute expiry').not.toBeNull()
      expect(row.userId, 'the row is attributed to the person who signed in').toBe(ACTOR.id)
      expect(row.companyId, 'and to the tenant they signed in to').toBe(COMPANY_ID)

      // 5. A device row for this browser's fingerprint, seen just now.
      expect(
        deviceCountSince(ACTOR.email, since),
        'a user_devices row was upserted for this browser',
      ).toBeGreaterThan(0)

      // 6. last_logins moved. Only GET /v1/auth/session writes this
      //    (controllers/auth/session.js:172), so it is the one assertion here that
      //    an HTTP-only probe structurally cannot make — it requires the SPA to
      //    have booted and asked "who am I".
      await expect
        .poll(() => lastLoginAfter(ACTOR.id, COMPANY_ID, since), {
          message:
            'last_logins was not refreshed — the SPA never completed its session ' +
            'round-trip, so the login did not actually land the user in the app',
          timeout: 30_000,
        })
        .toBe(true)
    } finally {
      await context.close()
    }
  })

  test('GATE · the session id CHANGES across the handoff (anti-session-fixation)', async () => {
    // Session fixation: an attacker plants a known session cookie on the victim's
    // browser, the victim authenticates, and the attacker's pre-known id is now an
    // authenticated session. `controllers/auth/handoff.js:61` defends against this
    // with session.regenerate() — but that is one line inside a callback, and
    // deleting it breaks nothing observable. Login still works. Only this
    // assertion notices.
    //
    // This leg has to drive raw HTTP rather than the page: the browser's fetch
    // follows the 302 chain internally, so the intermediate cookie is never
    // visible to a page-level test. That is a limitation of the observer, not a
    // gap in the journey — the page half is covered by the GATE above.
    const ctx = await jarContext()
    try {
      const login = await ctx.post('/v1/auth/login', {
        data: { email: ACTOR.email, password: PASSWORD },
        maxRedirects: 0,
        failOnStatusCode: false,
      })
      expect(login.status(), 'correct credentials redirect into the handoff').toBe(302)

      const preHandoffSid = sidFromSetCookie(login.headersArray())
      expect(preHandoffSid, 'the login response issued a session cookie').toBeTruthy()

      const location = login.headers()['location'] || ''
      const token = /token=([0-9a-fA-F]+)/.exec(location)?.[1]
      expect(token, `the redirect carries a handoff token (Location: ${location})`).toBeTruthy()

      // Redeem it on the same jar, so the pre-handoff cookie is presented — exactly
      // what a real browser does, and the only way regenerate() can be observed.
      const handoff = await ctx.get(`/v1/auth/handoff?token=${token}`, {
        maxRedirects: 0,
        failOnStatusCode: false,
      })
      expect(handoff.status(), 'the handoff redeems and redirects into the app').toBe(302)

      const postHandoffSid = sidFromSetCookie(handoff.headersArray())
      expect(postHandoffSid, 'the handoff issued a session cookie of its own').toBeTruthy()

      // THE GATE.
      expect(
        postHandoffSid,
        'AUTH regression: the session id survived the handoff unchanged. ' +
          'handoff.js must call session.regenerate() before req.login, or a ' +
          'pre-authentication cookie planted on this host becomes an authenticated one.',
      ).not.toBe(preHandoffSid)

      // And the old id is genuinely dead, not merely superseded — otherwise the
      // planted cookie would still work even though a new one was issued.
      expect(
        sessionKeyExists(preHandoffSid),
        'the pre-handoff session was destroyed, not just replaced',
      ).toBe(false)
      expect(sessionKeyExists(postHandoffSid), 'the post-handoff session is live').toBe(true)

      // Condition C8 rides here too: the cross-tenant firewall in
      // utils/permissions.js assumes the cookie is host-only. If a `Domain`
      // attribute ever appears, every tenant subdomain can present this cookie.
      for (const value of setCookieHeaders(handoff.headersArray())) {
        if (!value.startsWith('connect.sid=')) continue
        expect(
          value.toLowerCase(),
          'SECURITY INVARIANT: the session cookie must carry no Domain attribute ' +
            '(shared/utils/session.js) — a widened cookie silently disables the ' +
            'cross-tenant firewall',
        ).not.toContain('domain=')
      }
    } finally {
      await ctx.dispose()
    }
  })

  test('CONTROL · a wrong password on the same page produces NONE of it', async ({ browser }) => {
    // Without this the GATE above could pass for the wrong reason: if merely
    // LOADING /signin were enough to mint a session row, every assertion there
    // would still be green. This pins the side effects to successful
    // authentication specifically.
    const since = nowIso()
    const context = await browser.newContext()
    const page = await context.newPage()

    try {
      await page.goto(`${APP_ORIGIN}/signin`)
      await expectSignInPageRendered(page)

      const form = signInForm(page)
      await form.email.fill(BAD_ACTOR)
      await form.password.fill('definitely-not-the-password')
      await form.submit.click()

      // The page reports the failure to the user (error toasts render role="alert",
      // BaseToast.vue:67) and keeps them on the credential form.
      await expect(
        page.getByRole('alert'),
        'the page surfaced the failure instead of silently doing nothing',
      ).toBeVisible({ timeout: 15_000 })
      await expect(page.getByText('Welcome back'), 'the user is still on the sign-in form').toBeVisible()
      expect(page.url(), 'and still on /signin').toContain('/signin')

      // Nothing was established.
      expect(await sidFromContext(context), 'no session cookie was issued').toBeNull()
      expect(
        loginEventCountSince(BAD_ACTOR, 'LOGIN_SUCCESS', since),
        'no LOGIN_SUCCESS was recorded for a rejected credential',
      ).toBe(0)
      expect(
        Number(
          sqlValue(
            `SELECT count(*) FROM user_sessions WHERE email = '${BAD_ACTOR}' AND created_at >= '${since}'`,
          ) || 0,
        ),
        'no user_sessions row was created for a rejected credential',
      ).toBe(0)
    } finally {
      await context.close()
    }
  })

  test('CONTROL · the Forgot password link on the sign-in page reaches the reset flow', async ({
    page,
  }) => {
    // Cheap, but it is the only thing protecting the one navigation that connects
    // S-01 to S-04. PW-J10 drives /forgot-password directly by URL; if this
    // RouterLink broke, a real user could not GET there and every reset journey
    // would still be green.
    await page.goto(`${APP_ORIGIN}/signin`)
    await expectSignInPageRendered(page)

    await signInForm(page).forgotLink.click()

    await expect(page).toHaveURL(/\/forgot-password/)
    await expect(
      page.getByRole('button', { name: 'Send reset link' }),
      'the forgot-password form rendered',
    ).toBeVisible()
  })
})
