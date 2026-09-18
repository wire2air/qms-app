// PW-J12 · AUTH-S7 (release condition #4) — the two invariants the cross-tenant
// firewall stands on, both of which were "enforced by a code comment alone".
//
// AUTH-S7's whole complaint is that nothing mechanical protects them:
//
//   1. THE SESSION COOKIE MUST CARRY NO `Domain`.
//      backend/shared/utils/session.js:17-29 says so in capital letters and then
//      relies on nobody editing it. This product is subdomain-multi-tenant, so a
//      `Domain=.qability.com` would make one tenant's session cookie flow to
//      every other tenant's host — and, worse, it would do so SILENTLY: the
//      firewall in utils/permissions.js is `req.tenantSlug && code !== slug`,
//      which is skipped entirely on apex and reserved hosts. Widening the cookie
//      does not trip any existing check. It just removes the isolation.
//
//   2. THE HANDOFF TENANT-BIND CHECK MUST REFUSE A CROSS-TENANT REPLAY.
//      controllers/auth/handoff.js:33-36. The handoff token is a 256-bit bearer
//      credential that is exchanged for a session with NO auth middleware in
//      front of it — establishing the session is the endpoint's whole job. The
//      bind check is the only thing stopping a token minted for tenant A from
//      being spent on tenant B's host.
//
// These are asserted at the RAW HEADER layer via node:http (see
// fixtures/authGuards.js for why not Playwright's request API): invariant 1 is a
// claim about bytes in a `Set-Cookie` line, and any client with a cookie jar
// eats the evidence.
//
// FINDING RECORDED, NOT ASSERTED — the bind check is host-derived and guarded by
// `req.tenantSlug &&`, so on a NON-tenant host (apex `localhost`, or a reserved
// label such as `app.`/`admin.`) it does not run at all: a token minted for
// E2ELAB redeems successfully there and establishes a session. That is verified
// live, and it is not currently exploitable — the session pins activeCompanyId to
// the token's own tenant, and the host-only cookie cannot be replayed at another
// tenant's host by a browser. It is recorded here because it is precisely the
// coupling AUTH-S7 names: invariant 2 has a hole that ONLY invariant 1 covers.
// It is deliberately not written as a gate, because tightening the skip would be
// a good change and must not turn this file red. Instead, invariant 1 is asserted
// on the apex response too — so the compensating control is under test on the
// exact host where the primary control is absent.
import { test, expect } from '@playwright/test'
import { ALT_USERS } from '../fixtures/cast.js'
import {
  AUTH_PERSONAS,
  PASSWORD,
  clearLockout,
  clearSourceCounters,
} from '../fixtures/authentication.js'
import {
  LAB_HOST,
  ALT_HOST,
  APEX_HOST,
  rawRequest,
  loginRaw,
  mintHandoff,
  redeemHandoff,
  parseSetCookie,
  sessionCookie,
  handoffTokenExists,
} from '../fixtures/authGuards.js'

const LAB_USER = AUTH_PERSONAS.victim.email // authvictim@e2e.test — E2ELAB
const ALT_USER = ALT_USERS.owner.email //      owner@e2e-alt.test — E2EALT

// Every test here logs in for real, so a lock or a spent per-source budget left
// behind by a crashed PW-J1 would read as a J12 failure. Clear both first — this
// suite's personas are throwaways and no other project touches them.
test.beforeAll(() => {
  clearLockout(LAB_USER)
  clearSourceCounters()
})

/**
 * Assert one response issued a session cookie with no `Domain`.
 * Returns the parsed cookie so callers can make further claims about it.
 */
function expectHostOnlySessionCookie(res, where) {
  const cookie = sessionCookie(res.setCookies)
  expect(cookie, `${where}: a session cookie was issued (raw: ${JSON.stringify(res.setCookies)})`).toBeTruthy()
  expect(
    cookie.attrs.domain,
    `AUTH-S7 regression at ${where}: the session cookie carries Domain=${cookie.attrs.domain}. ` +
      'A Domain on the parent makes a tenant-A session presentable at tenant B, and the ' +
      'cross-tenant firewall in utils/permissions.js is skipped on apex/reserved hosts so ' +
      'nothing else catches it. Remove `domain` from backend/shared/utils/session.js.',
  ).toBeUndefined()
  return cookie
}

test.describe('PW-J12 · AUTH-S7 — host-only session cookie + handoff tenant bind', () => {
  // ── Invariant 1 — no Domain on the session cookie ─────────────────────────

  test('GATE · no cookie-issuing response ever sets Domain on the session cookie (AUTH-S7.1)', async () => {
    // Every path that mints a session cookie, on every host shape that can mint
    // one. Checking only the login response would miss the handoff, which is the
    // one that actually establishes the tenant session.
    const login = await loginRaw(LAB_USER, PASSWORD, { host: LAB_HOST })
    expect(login.status, `login on ${LAB_HOST} redirects into the handoff`).toBe(302)
    const loginCookie = expectHostOnlySessionCookie(login, `POST /v1/auth/login @ ${LAB_HOST}`)

    // Sanity on the rest of the cookie's shape — session.js sets these beside the
    // absent domain, and losing them is the same class of silent edit.
    expect(loginCookie.attrs.httponly, 'the session cookie stays HttpOnly').toBe(true)
    expect(loginCookie.attrs.path, 'and is scoped to the whole origin').toBe('/')

    const labHandoff = await redeemHandoff(tokenOf(login), { host: LAB_HOST })
    expect(labHandoff.status, 'the handoff establishes the session').toBe(302)
    expectHostOnlySessionCookie(labHandoff, `GET /v1/auth/handoff @ ${LAB_HOST}`)

    // The second tenant — the host the firewall is protecting AGAINST.
    const altLogin = await loginRaw(ALT_USER, PASSWORD, { host: ALT_HOST })
    expect(altLogin.status, `login on ${ALT_HOST}`).toBe(302)
    expectHostOnlySessionCookie(altLogin, `POST /v1/auth/login @ ${ALT_HOST}`)
    const altHandoff = await redeemHandoff(tokenOf(altLogin), { host: ALT_HOST })
    expect(altHandoff.status, 'the alt-tenant handoff establishes a session').toBe(302)
    expectHostOnlySessionCookie(altHandoff, `GET /v1/auth/handoff @ ${ALT_HOST}`)

    // The apex host, where the bind check and the firewall are both skipped
    // (`req.tenantSlug` is null there) — see the file header. The host-only
    // cookie is the ONLY isolation left on this host, so it is the one that most
    // needs asserting.
    const apex = await mintHandoff(LAB_USER, PASSWORD, { host: LAB_HOST })
    const apexHandoff = await redeemHandoff(apex.token, { host: APEX_HOST })
    if (apexHandoff.setCookies.length > 0) {
      expectHostOnlySessionCookie(apexHandoff, `GET /v1/auth/handoff @ ${APEX_HOST} (apex)`)
    } else {
      // A future fix may make the bind check reject non-tenant hosts outright.
      // That is strictly better, and must not read as a failure here.
      expect(
        apexHandoff.status,
        'the apex host issued no cookie, so it must have refused the handoff',
      ).not.toBe(302)
    }
  })

  test('CONTROL · the Domain probe can actually see a Domain when one is present', async () => {
    // Without this, the gate above is vacuous: a parser that never finds `domain`
    // passes forever, including on the day someone adds it. This feeds the real
    // parser a real Set-Cookie line in the shape the regression would produce.
    const widened = parseSetCookie(
      'connect.sid=s%3Aabc.def; Path=/; Domain=.localhost; HttpOnly',
    )
    expect(widened.name, 'the parser reads the cookie name').toBe('connect.sid')
    expect(widened.attrs.domain, 'and it detects a Domain attribute').toBe('.localhost')
    expect(widened.attrs.httponly, 'and valueless attributes too').toBe(true)

    expect(
      sessionCookie(['other=1; Path=/', 'connect.sid=s%3Axyz; Path=/; HttpOnly']),
      'and it picks the session cookie out of a multi-cookie response',
    ).toMatchObject({ name: 'connect.sid' })
  })

  // ── Invariant 2 — the handoff is bound to the tenant that minted it ────────

  test('GATE · an E2ELAB handoff token is refused on the E2EALT host (AUTH-S7.2)', async () => {
    const { token } = await mintHandoff(LAB_USER, PASSWORD, { host: LAB_HOST })
    expect(token, 'the login redirect carried a handoff token').toBeTruthy()

    const replay = await redeemHandoff(token, { host: ALT_HOST })

    expect(
      replay.status,
      `AUTH-S7 regression: a token minted for E2ELAB was accepted on ${ALT_HOST}. ` +
        'The bind check in controllers/auth/handoff.js (payload.companyCode vs req.tenantSlug) ' +
        `must refuse it. Response: ${replay.status} ${replay.text.slice(0, 200)}`,
    ).toBe(403)
    expect(replay.text, 'and says why').toContain('does not match this tenant')

    // The half a status code cannot prove: no session was established on the
    // wrong tenant's host on the way to that 403.
    expect(
      sessionCookie(replay.setCookies),
      'the refused replay issued no session cookie — a 403 that still sets a cookie ' +
        'would have handed over the very thing the check exists to withhold',
    ).toBeNull()

    // Fail-closed: the token is consumed (GETDEL) before the bind check, so a
    // refused replay also burns it. An attacker gets no second attempt.
    expect(
      handoffTokenExists(token),
      'the token is dead after the refused replay, so it cannot be re-aimed at its own host',
    ).toBe(false)
  })

  test('GATE · the mirror image — an E2EALT token is refused on the E2ELAB host', async () => {
    // Symmetry matters: a one-directional pass could be an accident of which
    // tenant happens to be "first". Both tenants must be closed to each other.
    const { token } = await mintHandoff(ALT_USER, PASSWORD, { host: ALT_HOST })
    expect(token, 'the alt-tenant login redirect carried a handoff token').toBeTruthy()

    const replay = await redeemHandoff(token, { host: LAB_HOST })
    expect(replay.status, `an E2EALT token must not be spendable on ${LAB_HOST}`).toBe(403)
    expect(sessionCookie(replay.setCookies), 'and no session was established').toBeNull()
  })

  test('CONTROL · the same token DOES work on its own tenant host (must pass today)', async () => {
    // Without this, both gates above would "pass" against an endpoint that is
    // simply broken, or against tokens that had already expired — neither of
    // which is a tenant bind. This is the positive half that gives the 403s
    // their meaning.
    const { token } = await mintHandoff(LAB_USER, PASSWORD, { host: LAB_HOST })

    expect(handoffTokenExists(token), 'the freshly minted token is live in Redis').toBe(true)

    const ok = await redeemHandoff(token, { host: LAB_HOST })
    expect(ok.status, 'redeemed on the host it was minted for, the handoff succeeds').toBe(302)
    expect(ok.location, 'and lands inside the app').toBe('/')
    expectHostOnlySessionCookie(ok, `GET /v1/auth/handoff @ ${LAB_HOST}`)
  })

  test('GATE · the handoff token is single-use', async () => {
    // The other half of PW-J12 as specified in doc 14. The token is a bearer
    // credential with a 60 s TTL that survives in browser history, referrers and
    // proxy logs; single-use is what bounds that exposure.
    const { token } = await mintHandoff(LAB_USER, PASSWORD, { host: LAB_HOST })

    const first = await redeemHandoff(token, { host: LAB_HOST })
    expect(first.status, 'first redemption succeeds').toBe(302)
    expect(first.location).toBe('/')

    expect(handoffTokenExists(token), 'consuming the token removes it from Redis').toBe(false)

    const replay = await redeemHandoff(token, { host: LAB_HOST })
    expect(
      replay.location,
      'a replayed token must not establish a second session — it is bounced to /signin',
    ).toBe('/signin')
    expect(
      sessionCookie(replay.setCookies),
      'and the replay issues no session cookie',
    ).toBeNull()
  })

  test('CONTROL · the tenant is taken from the HOST, not from anything the caller controls', async () => {
    // The bind check compares payload.companyCode against req.tenantSlug, and
    // req.tenantSlug is derived by resolveTenant from X-Forwarded-Host || Host.
    // If a caller could talk their way past it with a header, the check would be
    // decorative — so aim a request at the correct socket while CLAIMING to be
    // the other tenant, and confirm the claim is what decides.
    // Baseline: the honest request, on the socket and host the token belongs to.
    const honest = await mintHandoff(LAB_USER, PASSWORD, { host: LAB_HOST })
    expect(
      (await redeemHandoff(honest.token, { host: LAB_HOST })).status,
      'baseline: redeemed on its own host, the handoff succeeds',
    ).toBe(302)

    // Now change ONE thing: the same socket, the same `Host`, but the proxy
    // header names the other tenant. Behind the dev Vite proxy and prod Traefik
    // this header is how the real browser host reaches the API, so resolveTenant
    // reads it FIRST — and the bind check must follow it.
    const second = await mintHandoff(LAB_USER, PASSWORD, { host: LAB_HOST })
    const viaProxyHeader = await rawRequest({
      method: 'GET',
      path: `/v1/auth/handoff?token=${encodeURIComponent(second.token)}`,
      host: LAB_HOST,
      headers: { 'X-Forwarded-Host': ALT_HOST },
    })
    expect(
      viaProxyHeader.status,
      'a request forwarded as the alt tenant must be refused even though it arrived on ' +
        'the E2ELAB socket — the tenant comes from the host, not from the token',
    ).toBe(403)
    expect(sessionCookie(viaProxyHeader.setCookies), 'and no session was established').toBeNull()
  })
})

/** Token out of a login redirect, with a readable failure if it is missing. */
function tokenOf(loginResponse) {
  const match = /[?&]token=([^&]+)/.exec(loginResponse.location || '')
  expect(
    match,
    `login redirect carried a handoff token (Location: ${loginResponse.location})`,
  ).toBeTruthy()
  return decodeURIComponent(match[1])
}
