// SMK-005 · the "Log out" button actually ends the session.
//
// authentication/j7 proves the server-side mechanism (PUT /v1/auth/signout is
// global) over HTTP; nothing drove the actual control a user clicks. The account
// menu at the bottom of MainSidebar.vue calls logoutCurrentSession()
// (src/utils/currentSession.js): PUT /v1/auth/signout, wipe the company IDBs,
// then navigate to /signin. A regression anywhere in that chain — the button
// unwired, the PUT swallowed, the redirect happening without the PUT — leaves a
// user who believes they are signed out holding a live session.
//
// PERSONA: sign-out is GLOBAL (every session for the email is destroyed), so a
// shared cast.js persona would take its storageState — and every later spec —
// down with it. `authlocker@e2e.test` (seed §27) is the throwaway j7 also uses: no
// grants, no storageState file. Its lockout counters and sessions are cleared on
// both sides of the test.
import { test, expect } from '@playwright/test'
import { PASSWORD } from '../fixtures/cast.js'
import { AUTH_PERSONAS, clearLockout, clearSourceCounters } from '../fixtures/authentication.js'
import {
  APP_ORIGIN,
  signInThroughPage,
  sessionKeyExists,
  sessionRowBySid,
  purgeSessions,
  expectSignInPageRendered,
} from '../fixtures/authPages.js'

const SUBJECT = AUTH_PERSONAS.locker

test.beforeAll(() => {
  purgeSessions(SUBJECT.email)
  clearLockout(SUBJECT.email)
})
test.afterAll(() => {
  purgeSessions(SUBJECT.email)
  clearLockout(SUBJECT.email)
  clearSourceCounters()
})

test.describe('SMK-005 · sign out through the UI', () => {
  test(
    'Log out from the account menu revokes the session server-side',
    { tag: ['@smoke', '@p0'] },
    async ({ browser }) => {
      test.setTimeout(120_000)
      // Explicitly empty — never inherit a stored persona session.
      const context = await browser.newContext({ storageState: { cookies: [], origins: [] } })
      const page = await context.newPage()
      try {
        const { sid } = await signInThroughPage(page, SUBJECT.email, PASSWORD)
        expect(sid, 'signed in through the page').toBeTruthy()

        const before = await context.request.get(`${APP_ORIGIN}/api/v1/auth/session`, {
          failOnStatusCode: false,
        })
        expect(before.status(), 'session is live before sign-out').toBe(200)
        expect(
          sessionRowBySid(sid)?.revokedAt ?? null,
          'user_sessions row is live before sign-out',
        ).toBeNull()

        // The account-menu trigger is the sidebar button carrying the user's name
        // (users row: first 'Lock', last 'AuthLocker').
        const menuTrigger = page
          .locator('aside')
          .getByRole('button', { name: /AuthLocker/ })
          .first()
        await expect(menuTrigger, 'app shell with the account menu rendered').toBeVisible({
          timeout: 60_000,
        })
        // Let the boot requests settle so none of them lands after the destroy and
        // re-saves the session (see authPages.quiescePage for that race).
        await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {})

        const logout = page.getByRole('button', { name: 'Log out', exact: true })
        await expect(async () => {
          if (!(await logout.isVisible().catch(() => false))) await menuTrigger.click()
          await expect(logout).toBeVisible({ timeout: 3_000 })
        }).toPass({ timeout: 20_000 })

        const signoutPut = page.waitForResponse(
          (r) => r.url().includes('/v1/auth/signout') && r.request().method() === 'PUT',
          { timeout: 15_000 },
        )
        await logout.click()
        const put = await signoutPut
        expect(put.status(), 'PUT /v1/auth/signout succeeded').toBeLessThan(400)

        await expect(page, 'landed on the sign-in page').toHaveURL(/\/signin/, { timeout: 20_000 })
        await expectSignInPageRendered(page)

        // ── Server-side: the cookie the browser still holds is dead ──
        await expect
          .poll(
            async () =>
              (
                await context.request.get(`${APP_ORIGIN}/api/v1/auth/session`, {
                  failOnStatusCode: false,
                })
              ).status(),
            {
              message: 'GET /api/v1/auth/session with the old cookie must be 401',
              timeout: 10_000,
            },
          )
          .toBe(401)
        expect(sessionKeyExists(sid), 'Redis auth:<sid> was destroyed').toBe(false)
        await expect
          .poll(() => sessionRowBySid(sid)?.revokedAt ?? null, {
            message: 'user_sessions.revoked_at is set for the signed-out session',
            timeout: 10_000,
          })
          .not.toBeNull()
      } finally {
        await context.close()
      }
    },
  )
})
