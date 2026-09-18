// PW-J14 · Idle sign-out, in the browser.
//
// The server has always enforced the company's `sessionIdleMinutes`, but only
// when something asked it to — so a page left open sat there looking signed in
// until someone clicked. On a shared workstation that defeats the setting
// entirely. The client now watches real user input and signs itself out.
//
// Waiting out a real 45-minute timeout is not a test strategy: the watcher
// compares wall-clock timestamps against `qms.lastActivity` in localStorage, so
// rewinding that key is exactly what the browser would see after an idle
// stretch — the same trick the delay-step journeys use on `delay_until`.
//
// The sign-out is REAL — it destroys the server session — so the test that
// crosses the line logs in for itself rather than spending the shared owner
// cookie every other spec in the run depends on.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH, USERS, PASSWORD } from '../fixtures/cast.js'
import { sqlValue } from '../fixtures/db.js'

const COMPANY = 'e2e00001-0000-4000-8000-000000000001'
const ACTIVITY_KEY = 'qms.lastActivity'

/** The tenant's configured idle window, in ms — the same number the session
 *  hands the client, read from the source of truth rather than hardcoded. */
function idleMs() {
  const minutes = Number(
    sqlValue(`SELECT session_idle_minutes FROM org_security_settings WHERE company_id = '${COMPANY}'`),
  )
  expect(minutes, 'the tenant configures an idle timeout').toBeGreaterThan(0)
  return minutes * 60 * 1000
}

/** Pretend the last human action was `agoMs` ago. */
async function rewindActivity(page, agoMs) {
  await page.evaluate(
    ([key, ago]) => localStorage.setItem(key, String(Date.now() - ago)),
    [ACTIVITY_KEY, agoMs],
  )
}

/**
 * A throwaway session of our own, so signing it out costs the suite nothing.
 * Mirrors fixtures/auth.setup.js: login answers 302 with a one-time handoff
 * token, which we complete against this context to land the cookie.
 */
async function freshOwnerContext(browser) {
  const ctx = await browser.newContext()
  const login = await ctx.request.post('/api/v1/auth/login', {
    data: { email: USERS.owner.email, password: PASSWORD },
    maxRedirects: 0,
  })
  expect(login.status(), `login → ${login.status()}`).toBe(302)
  const token = new URL(login.headers()['location']).searchParams.get('token')
  const handoff = await ctx.request.get(`/api/v1/auth/handoff?token=${token}`, { maxRedirects: 0 })
  expect([200, 302]).toContain(handoff.status())
  return ctx
}

async function openApp(browser, ctxIn = null) {
  const ctx = ctxIn ?? (await browser.newContext({ storageState: AUTH.owner }))
  const page = await ctx.newPage()
  await page.goto('/capas')
  // Wait for the shell, so the watcher has mounted and stamped first.
  await expect(page.getByText('CAPAs').first()).toBeVisible({ timeout: 60_000 })
  return { ctx, page }
}

test.describe('PW-J14 · idle sign-out', () => {
  test('the session tells the client how long it may idle', async ({ browser }) => {
    const { ctx, page } = await openApp(browser)
    const session = await page.evaluate(async () => {
      const r = await fetch('/api/v1/auth/session', { credentials: 'include' })
      const j = await r.json()
      return j?.data?.session ?? j?.session
    })
    // Without this the client cannot know when to act, and the timeout stays
    // a server-only rule that an open page never learns about.
    expect(session.sessionIdleMs, 'idle window is published to the client').toBe(idleMs())
    expect(session.sessionAbsoluteExpiry, 'so is the absolute cap').toBeTruthy()
    await ctx.close()
  })

  test('warns before signing out, and staying resets the clock', async ({ browser }) => {
    test.setTimeout(180_000)
    const { ctx, page } = await openApp(browser)

    // 30s short of the cut-off — inside the one-minute warning window.
    await rewindActivity(page, idleMs() - 30_000)
    await expect(page.getByText('Still there?')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText(/signed out in \d+ seconds?/)).toBeVisible()

    // Staying is a deliberate click: mere mouse movement must not dismiss it,
    // or walking past the screen would keep a session alive indefinitely.
    await page.getByRole('button', { name: 'Stay signed in' }).click()
    await expect(page.getByText('Still there?')).toBeHidden({ timeout: 10_000 })

    const idleAfter = await page.evaluate(
      (key) => Date.now() - Number(localStorage.getItem(key)),
      ACTIVITY_KEY,
    )
    expect(idleAfter, 'the idle clock restarted').toBeLessThan(15_000)
    await ctx.close()
  })

  test('past the window it signs out, says why, and the session is really gone', async ({
    browser,
  }) => {
    test.setTimeout(180_000)
    // Its own session: this one ends up destroyed.
    const { ctx, page } = await openApp(browser, await freshOwnerContext(browser))

    await rewindActivity(page, idleMs() + 5_000)
    await page.waitForURL(/\/signin/, { timeout: 40_000 })

    // Landing on a bare login screen reads as a crash; the reason is what makes
    // it read as the security setting working.
    await expect(page.getByText(/signed out because of inactivity/i)).toBeVisible({
      timeout: 20_000,
    })

    // And it is a real sign-out, not just a redirect — otherwise the session
    // would still be usable by anyone who pressed Back.
    const status = await page.evaluate(async () => {
      const r = await fetch('/api/v1/auth/session', { credentials: 'include' })
      return r.status
    })
    expect(status, 'the server session was destroyed').toBe(401)
    await ctx.close()
  })
})
