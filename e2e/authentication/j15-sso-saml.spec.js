// PW-J15 · SAML SSO — the endpoints that turn an assertion into a session.
//
// This covers the parts that can be exercised without a real identity provider:
// what we publish, what we redirect to, and — most importantly — what we
// REFUSE. The happy path needs Okta to sign something, so it stays a manual
// check; everything here is a guard that must hold on its own.
//
// ── Why the Origin header appears in these tests ───────────────────────────
// A live Okta login returned an opaque 500 for two days while every curl
// reproduction passed. The difference was one header: an identity provider
// POSTs the assertion from ITS OWN origin, and our CORS allowlist was
// rejecting that before the request reached any handler. Requests without an
// Origin are allowed, so testing without one tested the wrong thing entirely.
// Several tests below therefore send an IdP-shaped Origin deliberately.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH } from '../fixtures/cast.js'
import { sql, sqlValue } from '../fixtures/db.js'

const COMPANY = 'e2e00001-0000-4000-8000-000000000001'
const IDP_ORIGIN = 'https://e2e-idp.okta.com'

/** A connection good enough to route on; the certificate never has to verify,
 *  because every test here asserts a REFUSAL before signature checking. */
function seedConnection({ enforced = false, idpInitiated = false } = {}) {
  sql(`
    DELETE FROM sso_connections WHERE company_id = '${COMPANY}';
    INSERT INTO org_security_settings (company_id, sso_enabled)
    VALUES ('${COMPANY}', true)
    ON CONFLICT (company_id) DO UPDATE SET sso_enabled = true;
    INSERT INTO sso_connections
      (company_id, protocol, status, display_name, idp_entity_id, idp_sso_url,
       idp_certificates, email_domains, enforced, allow_idp_initiated)
    VALUES ('${COMPANY}', 'SAML', 'ACTIVE', 'E2E IdP',
            '${IDP_ORIGIN}/exk1', '${IDP_ORIGIN}/app/x/sso/saml',
            ARRAY['MIIDe2eTestCertificate=='], ARRAY['e2e.test'],
            ${enforced}, ${idpInitiated});
  `)
  // The settings service caches for 60s; sign-in must see this immediately.
  sql(`SELECT 1`)
}

function clearConnections() {
  sql(`
    DELETE FROM sso_connections WHERE company_id = '${COMPANY}';
    UPDATE org_security_settings SET sso_enabled = false WHERE company_id = '${COMPANY}';
  `)
}

test.describe('PW-J15 · SAML SSO', () => {
  test.afterAll(() => clearConnections())

  test('the sign-in page offers the tenant’s provider, and only safe details', async ({
    browser,
  }) => {
    seedConnection()
    const ctx = await browser.newContext()
    const page = await ctx.newPage()
    // Cache-tolerant: the settings service holds login methods for up to a
    // minute, so allow the button to appear rather than demanding it at once.
    await expect(async () => {
      await page.goto('/signin')
      await expect(page.getByRole('button', { name: /E2E IdP/ })).toBeVisible({ timeout: 5_000 })
    }).toPass({ timeout: 90_000 })

    const body = await page.evaluate(async () => {
      const r = await fetch('/api/v1/auth/login-methods')
      return r.json()
    })
    const conn = (body?.sso ?? body?.data?.sso ?? [])[0]
    expect(conn?.displayName).toBe('E2E IdP')
    // Unauthenticated endpoint: a button needs an id and a name and nothing
    // else. Domains would let anyone enumerate who a tenant federates with.
    expect(Object.keys(conn).sort()).toEqual(['displayName', 'id'])
    await ctx.close()
  })

  test('SP metadata is publishable, and carries no secret', async ({ browser }) => {
    seedConnection()
    const ctx = await browser.newContext({ storageState: AUTH.owner })
    const page = await ctx.newPage()
    await page.goto('/')
    const res = await page.request.get('/api/v1/auth/sso/metadata')
    expect(res.status()).toBe(200)
    const xml = await res.text()

    // What the customer's IdP admin consumes.
    expect(xml).toContain('EntityDescriptor')
    expect(xml).toContain('/api/v1/auth/sso/acs')
    expect(xml).toContain('WantAssertionsSigned="true"')
    // Never a private key, whatever else changes here.
    expect(xml).not.toMatch(/PRIVATE KEY/i)
    await ctx.close()
  })

  test('sign-in redirects to the IdP with a request it can answer', async ({ browser }) => {
    seedConnection()
    const ctx = await browser.newContext()
    const page = await ctx.newPage()
    await page.goto('/signin')

    const res = await page.request.get('/api/v1/auth/sso/login?email=someone@e2e.test', {
      maxRedirects: 0,
    })
    const location = res.headers()['location'] ?? ''
    expect(location, 'redirects to the configured IdP').toContain(IDP_ORIGIN)
    // Without a SAMLRequest the IdP has nothing to respond to.
    expect(location).toContain('SAMLRequest=')
    // RelayState carries the connection id and never a URL — a URL there would
    // make this endpoint an open redirect.
    const relay = new URL(location).searchParams.get('RelayState')
    expect(relay ?? '').not.toMatch(/^https?:/)
    await ctx.close()
  })

  test('an unknown email domain is not routed anywhere', async ({ browser }) => {
    seedConnection()
    const ctx = await browser.newContext()
    const page = await ctx.newPage()
    await page.goto('/signin')
    const res = await page.request.get('/api/v1/auth/sso/login?email=nobody@unclaimed.example', {
      maxRedirects: 0,
    })
    expect(res.headers()['location'] ?? '').toContain('error=sso_no_connection')
    await ctx.close()
  })

  test('the ACS refuses a forged assertion — and answers the IdP, not CORS', async ({
    browser,
  }) => {
    seedConnection()
    const ctx = await browser.newContext()
    const page = await ctx.newPage()
    await page.goto('/signin')

    const res = await page.request.post('/api/v1/auth/sso/acs', {
      // The header that made this fail in production: an IdP posts from its
      // own origin, which is never in a tenant's CORS allowlist.
      headers: { origin: IDP_ORIGIN, 'content-type': 'application/x-www-form-urlencoded' },
      data: `SAMLResponse=${encodeURIComponent(Buffer.from('<forged/>').toString('base64'))}`,
      maxRedirects: 0,
    })

    // A refusal, not a crash: a 500 here renders raw JSON at someone mid-login.
    expect(res.status(), 'refused by redirect, never a 5xx').toBe(302)
    expect(res.headers()['location'] ?? '').toContain('/signin?error=')
    // No session was granted on the way past.
    expect(String(res.headers()['set-cookie'] ?? '')).not.toMatch(/connect\.sid/)

    // And it is recorded, because a burst of invalid assertions is a signal.
    await expect(async () => {
      expect(
        sqlValue(
          `SELECT count(*) FROM login_events
            WHERE auth_method = 'saml' AND outcome = 'FAILURE'
              AND created_at > NOW() - INTERVAL '2 minutes'`,
        ),
      ).not.toBe('0')
    }).toPass({ timeout: 20_000 })
    await ctx.close()
  })

  test('IdP-initiated sign-in is refused unless the connection allows it', async ({ browser }) => {
    seedConnection({ idpInitiated: false })
    const ctx = await browser.newContext()
    const page = await ctx.newPage()
    await page.goto('/signin')

    const res = await page.request.post('/api/v1/auth/sso/acs', {
      headers: { origin: IDP_ORIGIN, 'content-type': 'application/x-www-form-urlencoded' },
      // No RelayState and no InResponseTo — the shape of a tile click.
      data: `SAMLResponse=${encodeURIComponent(Buffer.from('<x/>').toString('base64'))}`,
      maxRedirects: 0,
    })
    // Named specifically, so an admin looks at the switch rather than at
    // certificates.
    expect(res.headers()['location'] ?? '').toContain('sso_idp_initiated_disabled')
    await ctx.close()
  })

  test('a garbage RelayState is a routing miss, never a database error', async ({ browser }) => {
    seedConnection()
    const ctx = await browser.newContext()
    const page = await ctx.newPage()
    await page.goto('/signin')

    const res = await page.request.post('/api/v1/auth/sso/acs', {
      headers: { origin: IDP_ORIGIN, 'content-type': 'application/x-www-form-urlencoded' },
      // IdPs put whatever the admin configured here — very often a URL.
      data: 'SAMLResponse=eA%3D%3D&RelayState=https://evil.example/callback',
      maxRedirects: 0,
    })
    expect(res.status(), 'a non-uuid RelayState must not reach the uuid column').toBe(302)
    expect(res.headers()['location'] ?? '', 'and never redirects off-site').toContain('/signin?')
    await ctx.close()
  })
})
