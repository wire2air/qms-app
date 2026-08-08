// PW-J11 · CONTROL: a PORTAL_ONLY session cannot touch the main app.
//
// The floor portal (`POST /v1/portal/auth/login`, API-56) authenticates the SAME
// person row as the main app but stamps `sessionScope = 'PORTAL_ONLY'` on the
// session. That single string is the entire boundary between an external
// floor/supplier user tapping through a form on a shop-floor tablet and the full
// QMS surface — documents, CAPAs, audit records, the security centre. It is
// enforced by two four-line guards in `utils/permissions.js` (one in `requireAuth`,
// one in `requireCompanyAccessWithoutTransaction`) and, until now, by no test at
// all. Deleting either guard breaks nothing that any existing suite would notice:
// the portal keeps working, the main app keeps working, and a stolen tablet cookie
// quietly inherits its owner's whole RBAC.
//
// ── WHY THE OWNER ───────────────────────────────────────────────────────────
// This drives the boundary with the tenant's OWNER, who bypasses every permission
// check (`utils/userPermissions.js:33-39` short-circuits `isOwner`). That is
// deliberate and it is the strongest available form of the test: if the most
// privileged identity in the tenant is still refused, the refusal is demonstrably
// about SESSION SCOPE and not about permissions. It also sidesteps granting
// `portal:access` to a shared role, which would widen every other suite's persona.
//
// ── WHY THIS ONE IS NOT PAGE-DRIVEN ─────────────────────────────────────────
// Doc 05 lists S-11 as `m/[moduleKey]/`, implying a portal sign-in page. There
// isn't one: `src/pages/m/[moduleKey]/[[id]].vue` is the generic admin-defined
// module renderer reached from `/supplier`, and the SPA has no floor-portal login
// surface at all (the only `portal` strings in `src/` are a reserved-subdomain
// entry and two comments). Doc 14 specifies this journey at the HTTP layer for
// that reason, and that is where it is built. The page-driven mandate is carried
// by PW-J6, J7 and J10.
//
// ── SEED GAP THIS SPEC WORKS AROUND ─────────────────────────────────────────
// `e2e-seed.sql` contains ZERO `portal_access_grants` rows and grants `portal:*` to
// no role, so no seeded persona can complete a portal login. Rather than widen the
// shared seed, this spec creates its own grant in beforeAll and removes it in
// afterAll — one row, in a table no other E2E suite reads.
import { test, expect } from '@playwright/test'
import { USERS, PASSWORD, COMPANY_ID, AUTH } from '../fixtures/cast.js'
import { sql, sqlValue } from '../fixtures/db.js'
import { API_ORIGIN, TENANT_CODE, jarContext, sessionStoreValue, sidFromSetCookie } from '../fixtures/authPages.js'

const SUBJECT = USERS.owner
/** Fixed id so a crashed run cannot leave a duplicate behind. */
const GRANT_ID = 'e2e9c000-0000-4000-8000-0000000000b1'

/** A main-app endpoint behind `requireAuth`. */
const MAIN_APP_REQUIRE_AUTH = '/v1/auth/session'
/** A main-app endpoint behind `requireCompanyAccess` — the second, parallel guard. */
const MAIN_APP_COMPANY_SCOPED = '/v1/services/sites'

const PORTAL_REFUSAL = 'PORTAL_ONLY session cannot access main app endpoints'

function grantExists() {
  return Number(sqlValue(`SELECT count(*) FROM portal_access_grants WHERE id = '${GRANT_ID}'`) || 0) > 0
}

test.beforeAll(() => {
  // Clear by (company_id, user_id) as well as by id — the table carries a unique
  // index on that pair, so a leftover row under a different id would make the
  // insert fail rather than upsert onto GRANT_ID.
  sql(
    `DELETE FROM portal_access_grants WHERE id = '${GRANT_ID}' OR (company_id = '${COMPANY_ID}' AND user_id = '${SUBJECT.id}')`,
  )
  sql(
    `INSERT INTO portal_access_grants (id, company_id, user_id, enabled, notes, created_at, updated_at)
     VALUES ('${GRANT_ID}', '${COMPANY_ID}', '${SUBJECT.id}', true, 'PW-J11 temporary grant', NOW(), NOW())`,
  )
})

test.afterAll(() => {
  sql(`DELETE FROM portal_access_grants WHERE id = '${GRANT_ID}' OR (company_id = '${COMPANY_ID}' AND user_id = '${SUBJECT.id}')`)
})

/** Log in through the portal and return the live jar plus the parsed body. */
async function portalSignIn() {
  const ctx = await jarContext()
  const res = await ctx.post('/v1/portal/auth/login', {
    // ⚠️ UPPERCASE. `resolveCompanyBySlug` does an exact `where: { code: tenantSlug }`
    // against companies.code, which is seeded 'E2ELAB'. Sending 'e2elab' returns a
    // deliberately vague 401 "Invalid credentials" that is indistinguishable from a
    // wrong password.
    data: { tenantSlug: TENANT_CODE, email: SUBJECT.email, password: PASSWORD },
    failOnStatusCode: false,
  })
  return { ctx, res, sid: sidFromSetCookie(res.headersArray()) }
}

test.describe('PW-J11 · a PORTAL_ONLY session is confined to the portal', () => {
  test('GATE · a PORTAL_ONLY session is refused on the main app surface', async () => {
    expect(grantExists(), 'the temporary portal grant was created').toBe(true)

    const { ctx, res, sid } = await portalSignIn()
    try {
      const body = await res.json().catch(() => null)
      expect(
        res.status(),
        `portal login failed (${res.status()}): ${JSON.stringify(body)}`,
      ).toBe(200)
      expect(body?.sessionScope, 'the portal stamps the session PORTAL_ONLY').toBe('PORTAL_ONLY')
      expect(body?.user?.email).toBe(SUBJECT.email)

      // The scope is really on the stored session, not just echoed in the response.
      // That distinction matters: the guards read `req.session.sessionScope`, so a
      // response that says PORTAL_ONLY while the store says otherwise would be a
      // boundary that does not exist.
      expect(
        sessionStoreValue(sid)?.sessionScope,
        'the express-session record in Redis carries sessionScope=PORTAL_ONLY',
      ).toBe('PORTAL_ONLY')

      // ── THE GATE — requireAuth path (utils/permissions.js:57-59) ───────────
      const main = await ctx.get(MAIN_APP_REQUIRE_AUTH, { failOnStatusCode: false })
      expect(
        main.status(),
        'PRIVILEGE BOUNDARY BREACH: a PORTAL_ONLY session reached a main-app ' +
          'endpoint. requireAuth must reject sessionScope === PORTAL_ONLY — without ' +
          'it a floor-tablet cookie inherits the holder’s entire QMS access.',
      ).toBe(403)
      expect(
        (await main.json().catch(() => ({})))?.message,
        'and says exactly why',
      ).toBe(PORTAL_REFUSAL)

      // ── THE GATE — requireCompanyAccess path (the parallel guard) ──────────
      // Two separate copies of this check exist; a fix applied to only one of them
      // is the likely regression, so both are pinned.
      const scoped = await ctx.get(MAIN_APP_COMPANY_SCOPED, { failOnStatusCode: false })
      expect(
        scoped.status(),
        'PRIVILEGE BOUNDARY BREACH: the company-scoped guard let a PORTAL_ONLY ' +
          'session through. requireCompanyAccessWithoutTransaction carries its own ' +
          'copy of the check — both must hold.',
      ).toBe(403)
      expect((await scoped.json().catch(() => ({})))?.message).toBe(PORTAL_REFUSAL)
    } finally {
      await ctx.dispose()
    }
  })

  test('CONTROL · the same cookie DOES work on the portal surface', async () => {
    // Without this the GATE proves nothing: a session that was simply never
    // established also gets refused everywhere. This is what makes the 403 above a
    // statement about SCOPE rather than about a broken login.
    const { ctx, res } = await portalSignIn()
    try {
      expect(res.status(), 'portal login succeeded').toBe(200)

      const me = await ctx.get('/v1/portal/me', { failOnStatusCode: false })
      expect(
        me.status(),
        'the very same cookie is accepted on /v1/portal/me — the session is alive, ' +
          'it is only confined',
      ).toBe(200)

      const body = await me.json()
      expect(body?.user?.email).toBe(SUBJECT.email)
      expect(body?.sessionScope).toBe('PORTAL_ONLY')
      expect(body?.grant?.id, 'and it resolves the grant this spec created').toBe(GRANT_ID)
      expect(body?.grant?.enabled).toBe(true)

      // The portal login bumps last_login_at — DB proof the handshake really ran
      // rather than being served from anything cached.
      expect(
        sqlValue(`SELECT last_login_at FROM portal_access_grants WHERE id = '${GRANT_ID}'`),
        'the grant records the portal sign-in',
      ).not.toBeNull()
    } finally {
      await ctx.dispose()
    }
  })

  test('CONTROL · the same person’s FULL session reaches the main app normally', async ({
    browser,
  }) => {
    // The other half of the counterweight. The GATE says "this identity is refused
    // on /v1/auth/session"; without this it could be refused because the endpoint
    // is broken, or because the owner lacks something. Same person, same endpoint,
    // FULL scope → 200. The only variable is the session scope.
    const context = await browser.newContext({ storageState: AUTH.owner })
    try {
      const res = await context.request.get(`${API_ORIGIN}${MAIN_APP_REQUIRE_AUTH}`, {
        failOnStatusCode: false,
      })
      expect(
        res.status(),
        'the owner’s ordinary FULL session reaches the same endpoint the ' +
          'PORTAL_ONLY session was refused on',
      ).toBe(200)

      const scoped = await context.request.get(`${API_ORIGIN}${MAIN_APP_COMPANY_SCOPED}`, {
        failOnStatusCode: false,
      })
      expect(scoped.status(), 'and the company-scoped one too').toBe(200)
    } finally {
      await context.close()
    }
  })

  test('CONTROL · revoking the grant closes the portal too', async () => {
    // The grant is the admin's off-switch for portal access without touching roles.
    // If a disabled grant still authenticated, the boundary would only be as good as
    // the permission set — which for this persona is "everything".
    const { ctx, res } = await portalSignIn()
    try {
      expect(res.status()).toBe(200)
      expect((await ctx.get('/v1/portal/me', { failOnStatusCode: false })).status()).toBe(200)

      sql(`UPDATE portal_access_grants SET enabled = false WHERE id = '${GRANT_ID}'`)

      const after = await ctx.get('/v1/portal/me', { failOnStatusCode: false })
      expect(
        after.status(),
        'a live portal session goes dark the moment the grant is disabled',
      ).toBe(403)
      expect((await after.json().catch(() => ({})))?.message).toBe('PORTAL_ACCESS_REVOKED')

      // And a fresh login is refused at the door.
      const retry = await portalSignIn()
      try {
        expect(retry.res.status(), 'and a new portal login is refused').toBe(403)
        expect((await retry.res.json().catch(() => ({})))?.error?.message).toContain(
          'PORTAL_ACCESS_DENIED',
        )
      } finally {
        await retry.ctx.dispose()
      }
    } finally {
      sql(`UPDATE portal_access_grants SET enabled = true WHERE id = '${GRANT_ID}'`)
      await ctx.dispose()
    }
  })
})
