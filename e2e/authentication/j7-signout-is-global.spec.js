// PW-J7 · Sign-out is global (AUTH-S4).
//
// Session cookies are host-only BY DESIGN (shared/utils/session.js — no `domain`,
// because the cross-tenant firewall depends on it). The consequence is that one
// person routinely holds SEVERAL independent express-session rows: one per tenant
// subdomain, plus the apex / OAuth-callback host. A plain `req.session.destroy()`
// reaches exactly one of them, and the survivors silently re-admit the user the
// next time they land on that host — which is not a logout, it is a logout-shaped
// animation.
//
// `utils/sessionRegistry.js` is the fix: every established session is mirrored into
// a Redis SET at `user_sessions:<email>`, and sign-out deletes every `auth:<sid>`
// the set names. This journey is the only thing that holds that mechanism in place.
// It has no unit test that exercises the real store, and nothing about it is
// visible from a single-session HTTP probe: with one session, a broken global
// sign-out and a working one are indistinguishable.
//
// ── PERSONA CHOICE IS LOAD-BEARING ──────────────────────────────────────────
// This spec calls a GLOBAL sign-out, which destroys every session for the target
// email — INCLUDING the storageState that `auth.setup.js` minted for the rest of
// the harness. Pointing it at a shared persona would 401 every later spec in the
// run (and every other agent's run). `authlocker@e2e.test` is a throwaway from
// e2e-seed.sql §27 that holds no grants and has no storageState file, so there is
// nothing to break. NEVER repoint this at a cast.js persona.
import { test, expect } from '@playwright/test'
import { USERS, PASSWORD } from '../fixtures/cast.js'
import { sqlValue } from '../fixtures/db.js'
import { AUTH_PERSONAS, clearLockout, clearSourceCounters } from '../fixtures/authentication.js'
import {
  API_ORIGIN,
  APP_ORIGIN,
  signInThroughPage,
  sessionKeyExists,
  sessionIndexMembers,
  deleteSessionIndex,
  purgeSessions,
  quiescePage,
  establishSessionViaApi,
  sessionRowBySid,
  expectSignInPageRendered,
} from '../fixtures/authPages.js'

const SUBJECT = AUTH_PERSONAS.locker.email
/** A bystander, used only to prove the destroy is email-scoped. Never signed out. */
const BYSTANDER = USERS.noAccess

test.beforeAll(() => {
  purgeSessions(SUBJECT)
  clearLockout(SUBJECT)
})
test.afterAll(() => {
  purgeSessions(SUBJECT)
  clearLockout(SUBJECT)
  clearSourceCounters()
})

/** Two independent browser sessions for the same person, both via the real page. */
async function twoSignedInBrowsers(browser) {
  const contextA = await browser.newContext()
  const contextB = await browser.newContext()
  const pageA = await contextA.newPage()
  const pageB = await contextB.newPage()

  const { sid: sidA } = await signInThroughPage(pageA, SUBJECT, PASSWORD)
  const { sid: sidB } = await signInThroughPage(pageB, SUBJECT, PASSWORD)

  expect(sidA, 'the two browsers hold genuinely different sessions').not.toBe(sidB)
  expect(sessionKeyExists(sidA), 'session A is live in Redis').toBe(true)
  expect(sessionKeyExists(sidB), 'session B is live in Redis').toBe(true)

  // Stop both SPAs before any test signs out — an in-flight request that lands
  // after destroy() re-saves the session and un-deletes it. See quiescePage.
  await quiescePage(pageA)
  await quiescePage(pageB)

  return { contextA, contextB, pageA, pageB, sidA, sidB }
}

test.describe('PW-J7 · signing out of one session signs out of all of them', () => {
  test('GATE · sign-out from one browser kills the sibling session', async ({ browser }) => {
    const { contextA, contextB, pageB, sidA, sidB } = await twoSignedInBrowsers(browser)

    try {
      // Both sessions are indexed — this is what sign-out will walk.
      const indexed = sessionIndexMembers(SUBJECT)
      expect(indexed, 'session A is in the user_sessions:<email> index').toContain(sidA)
      expect(indexed, 'session B is in the user_sessions:<email> index').toContain(sidB)

      // Baseline: browser B is genuinely usable right now. Without this the final
      // 401 would prove nothing — a session that never worked also returns 401.
      const before = await contextB.request.get(`${API_ORIGIN}/v1/auth/session`, {
        failOnStatusCode: false,
      })
      expect(before.status(), 'browser B has a working session before sign-out').toBe(200)

      // ── The act: sign out of A only ─────────────────────────────────────────
      const out = await contextA.request.put(`${API_ORIGIN}/v1/auth/signout`, {
        failOnStatusCode: false,
      })
      expect(out.status(), 'sign-out succeeded').toBe(200)

      // ── THE GATE ────────────────────────────────────────────────────────────
      expect(sessionKeyExists(sidA), 'the signing browser’s own session is gone').toBe(false)
      expect(
        sessionKeyExists(sidB),
        'AUTH-S4 regression: signing out of one host left the SIBLING session alive. ' +
          'destroyUserSessions() must delete every auth:<sid> named by ' +
          'user_sessions:<email> (utils/sessionRegistry.js:57-71) — otherwise the ' +
          'surviving apex/tenant session silently re-admits the user.',
      ).toBe(false)

      expect(
        sessionIndexMembers(SUBJECT),
        'and the index itself is cleared, so nothing dangles',
      ).toHaveLength(0)

      // ── The page half: browser B is really logged out, not just server-side ──
      const after = await contextB.request.get(`${API_ORIGIN}/v1/auth/session`, {
        failOnStatusCode: false,
      })
      expect(after.status(), 'browser B can no longer reach an authenticated endpoint').toBe(401)

      await pageB.goto(`${APP_ORIGIN}/`)
      await expect(pageB, 'and reloading browser B lands back on the sign-in page').toHaveURL(
        /\/signin/,
        { timeout: 30_000 },
      )
      await expectSignInPageRendered(pageB)
    } finally {
      await contextA.close()
      await contextB.close()
    }
  })

  test('GATE · "sign out my other devices" really does end the other session', async ({
    browser,
  }) => {
    // ── A REAL DEFECT, FOUND BY THIS JOURNEY. FIXED — now a regression pin. ────
    //
    // WAS RED. Global sign-out (the GATE above) worked because it goes through the
    // Redis index, which is keyed correctly. EVERY OTHER session-termination control
    // in the product goes through the `user_sessions` table instead — and that
    // table's `session_id` used to be wrong for every row it had ever written.
    //
    // Why: `establishSessionTracking()` is called from `handleUserRedirection`
    // (controllers/auth/helpers.js:81) using the session id as it stands DURING
    // /v1/auth/login. `handoff.js:61` then calls `session.regenerate()`, which
    // destroys that session and mints a new id — and the handoff only updates the
    // Redis index (`recordUserSession`), never the shadow row. So the row names a
    // session that stopped existing milliseconds after it was written, while the
    // browser holds an id the table has never heard of.
    //
    // Measured directly:
    //     PRE-handoff  sid SuyzQqPKTqgHgG6RoxjAdIGH_uRkPMFJ → user_sessions rows: 1
    //     POST-handoff sid cnIkiZlt8Qz8GBbD_S_pXUsD8zXvhJlv → user_sessions rows: 0   ← the live one
    //
    // `revokeRow()` (services/sessionTracking.js:78-85) therefore deletes
    // `auth:<pre-handoff-sid>`, which is already gone, and stamps `revoked_at` on a
    // row nothing authenticates against. The live session sails on. Measured:
    // POST /v1/auth/sessions/revoke-others answered 200 {"revoked":3} and the
    // target session still returned 200 from /v1/auth/session afterwards.
    //
    // Everything that reads `user_sessions.session_id` inherits this:
    //   • POST /v1/auth/sessions/revoke-others  — "sign out my other devices"
    //   • POST /v1/auth/sessions/revoke-all
    //   • DELETE /v1/auth/sessions/:id          — per-row revoke in Active Sessions (CMP-13)
    //   • removeDevice()                        — revoking a trusted device
    //   • revokeBySessionId()                   — so sign-out never stamps the row
    //   • touchSession()                        — last-seen never updates
    //
    // The security consequence was the point: a person who spots a session they do
    // not recognise, clicks revoke, and is told it worked, was still compromised.
    //
    // THE FIX, now landed: `handoff.js` calls `retargetSessionTracking` immediately
    // after `session.regenerate()`, next to `recordUserSession`, so the shadow row is
    // re-pointed at the post-handoff id. The row and the browser now agree, and every
    // consumer in the list above inherits the correction.
    //
    // This test went green with no edits, exactly as predicted, and is now the
    // regression pin. The assertion below is deliberately still phrased as "B's
    // session must be gone" — if the retarget is ever dropped, it fails here first.
    const { contextA, contextB, sidA, sidB } = await twoSignedInBrowsers(browser)

    try {
      // Both sessions are genuinely usable right now.
      expect(
        (await contextB.request.get(`${API_ORIGIN}/v1/auth/session`, { failOnStatusCode: false })).status(),
        'browser B works before the revoke',
      ).toBe(200)

      // A drives the Active Sessions control: "sign out everywhere except here".
      const revoke = await contextA.request.post(
        `${API_ORIGIN}/v1/auth/sessions/revoke-others`,
        { failOnStatusCode: false },
      )
      expect(revoke.status(), 'the revoke endpoint answers').toBe(200)
      const reported = (await revoke.json().catch(() => ({})))?.revoked
      expect(reported, 'and reports that it revoked something').toBeGreaterThan(0)

      // ── THE ASSERTION THAT USED TO FAIL ─────────────────────────────────────
      expect(
        sessionKeyExists(sidB),
        `"sign out my other devices" reported revoked=${reported} but browser B's ` +
          'session is still live in Redis — the original defect has regressed. It means ' +
          'user_sessions.session_id is holding the PRE-handoff id again, so revokeRow() ' +
          'deletes a key that no longer exists and never touches the session the browser ' +
          'is actually using. Check that handoff.js still calls retargetSessionTracking ' +
          'after session.regenerate(). See the header.',
      ).toBe(false)

      expect(
        (await contextB.request.get(`${API_ORIGIN}/v1/auth/session`, { failOnStatusCode: false })).status(),
        'and browser B can still make authenticated requests after being "revoked"',
      ).toBe(401)

      // The bookkeeping half — the explanation for the failure above.
      expect(
        sessionRowBySid(sidB),
        `no user_sessions row is keyed to the live session id (sid=${sidB}); the ` +
          'shadow row was written against the pre-handoff id',
      ).not.toBeNull()

      // A's own row too, so sign-out and the Active Sessions list agree with reality.
      await contextA.request.put(`${API_ORIGIN}/v1/auth/signout`, { failOnStatusCode: false })
      const rowA = sessionRowBySid(sidA)
      expect(rowA, `no user_sessions row for the signing session (sid=${sidA})`).not.toBeNull()
      expect(rowA.revokedAt, 'the signing session’s shadow row is stamped revoked').not.toBeNull()
    } finally {
      await contextA.close()
      await contextB.close()
    }
  })

  test('KNOWN-GAP · without the Redis index, sign-out cannot reach the sibling (AUTH-S4)', async ({
    browser,
  }) => {
    // The mechanism has exactly one point of failure and no fallback: if
    // `user_sessions:<email>` is missing — evicted under memory pressure, expired
    // (the index carries its own 24h TTL, refreshed only on the NEXT login, so a
    // long-lived session can outlive its own index entry), or lost to a Redis
    // restart — then destroyUserSessions() enumerates an empty set and returns 0,
    // and every sibling session survives a sign-out that reported success.
    //
    // This test DOCUMENTS that gap rather than failing on it. It asserts today's
    // behaviour, so it stays green while the gap is open and goes RED the moment a
    // fallback lands (e.g. sweeping user_sessions rows by email). When that
    // happens, invert the two assertions below — a red here is good news.
    const { contextA, contextB, sidA, sidB } = await twoSignedInBrowsers(browser)

    try {
      deleteSessionIndex(SUBJECT)
      expect(sessionIndexMembers(SUBJECT), 'the index is gone, as if evicted').toHaveLength(0)

      const out = await contextA.request.put(`${API_ORIGIN}/v1/auth/signout`, {
        failOnStatusCode: false,
      })
      expect(out.status(), 'sign-out still reports success').toBe(200)

      expect(sessionKeyExists(sidA), 'the caller’s own session is destroyed regardless').toBe(false)

      expect(
        sessionKeyExists(sidB),
        'KNOWN-GAP FLIPPED — the sibling session is now cleaned up even without the ' +
          'Redis index. AUTH-S4 has been fixed: invert this assertion to toBe(false) ' +
          'and update the comment above.',
      ).toBe(true)

      // And it is genuinely usable, not merely present — the gap is exploitable.
      const still = await contextB.request.get(`${API_ORIGIN}/v1/auth/session`, {
        failOnStatusCode: false,
      })
      expect(still.status(), 'the surviving session still authenticates').toBe(200)
    } finally {
      await contextA.close()
      await contextB.close()
    }
  })

  test('CONTROL · sign-out is scoped to the signer — a bystander stays signed in', async ({
    browser,
  }) => {
    // Without this, every assertion above could pass because sign-out flushes the
    // whole session store. "Everyone is logged out" also satisfies "the sibling is
    // logged out"; only a bystander distinguishes a scoped destroy from a bulk one.
    const bystander = await establishSessionViaApi(BYSTANDER.email, PASSWORD)
    const context = await browser.newContext()
    const page = await context.newPage()

    try {
      const { sid } = await signInThroughPage(page, SUBJECT, PASSWORD)
      expect(sessionKeyExists(sid), 'the subject is signed in').toBe(true)
      expect(sessionKeyExists(bystander.sid), 'the bystander is signed in').toBe(true)
      await quiescePage(page)

      const out = await context.request.put(`${API_ORIGIN}/v1/auth/signout`, {
        failOnStatusCode: false,
      })
      expect(out.status()).toBe(200)

      expect(sessionKeyExists(sid), 'the subject is signed out').toBe(false)
      expect(
        sessionKeyExists(bystander.sid),
        'an unrelated user’s session survived — sign-out destroys sessions by email, ' +
          'not the whole store',
      ).toBe(true)

      const probe = await bystander.ctx.get('/v1/auth/session', { failOnStatusCode: false })
      expect(probe.status(), 'and the bystander can still use theirs').toBe(200)

      expect(
        Number(
          sqlValue(
            `SELECT count(*) FROM user_sessions WHERE email = '${BYSTANDER.email}' AND revoked_at IS NULL`,
          ) || 0,
        ),
        'the bystander still has live session rows',
      ).toBeGreaterThan(0)
    } finally {
      await bystander.ctx.dispose()
      await context.close()
    }
  })
})
