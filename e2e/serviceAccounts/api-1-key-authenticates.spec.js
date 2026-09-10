// SA-API-1 · An issued key authenticates against the REST surface.
//
// The base claim of the whole feature, and the one thing nothing automated had
// ever checked. A service account is created in the browser; the credential it
// exists to produce — an `sk_` key an external system sends to /v1/services —
// was only ever proven by hand.
//
// The path under test is three links long, and this file is the only place all
// three are exercised together:
//
//   requireAuthByApiKey   hashes the presented key, finds the api_keys row,
//                         checks revoked / expiry / owner status, and builds a
//                         USER-SHAPED principal (utils/principal.js) — `id` is
//                         the owning users row, not the key's id.
//   requireCompanyAccess  resolves the tenant from that principal rather than
//                         from a session, and pins it against the host.
//   enforcePermission     asks the ordinary PDP, which cannot tell it was an
//                         API key that called.
//
// WHY BOTH HEADER FORMS ARE THEIR OWN TEST. They are not two spellings of one
// branch: `req.headers['x-api-key'] || req.headers['authorization']?.replace(
// 'Bearer ', '')`. The second form is a string edit, so it is the one that can
// break on its own — and it is the form every generic HTTP client and SDK
// reaches for first.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH, COMPANY_ID } from '../fixtures/cast.js'
import { sqlValue } from '../fixtures/db.js'
import {
  GATED_READ,
  ROLE_INTEGRATION_ADMIN,
  accountTracker,
  bareContext,
  createAccount,
  errorMessage,
  issueKey,
  keyContext,
  read,
  redact,
  sha256,
} from './api-helpers.js'

test.use({ storageState: AUTH.intAdmin })

const owned = accountTracker()

test.describe('SA-API-1 · a service-account key authenticates', () => {
  let account
  let secret

  test.beforeAll(async ({ playwright }) => {
    // Own fixtures, per spec. A fresh account + key each run: nothing here can
    // pass against something the seed left lying around, because the seed
    // deliberately leaves nothing.
    const session = await playwright.request.newContext({ storageState: AUTH.intAdmin })
    account = owned.track(
      (
        await createAccount(session, {
          label: 'a1-authenticates',
          description: 'SA-API-1 fixture',
          roleIds: [ROLE_INTEGRATION_ADMIN],
        })
      ).id,
    )
    secret = (await issueKey(session, account, { name: 'SA-API-1 primary' })).secret
    await session.dispose()
  })

  test.afterAll(async ({ playwright }) => {
    await owned.cleanup(playwright)
  })

  test('x-api-key: sk_… reaches a gated read → 200', async ({ playwright }) => {
    const ctx = await keyContext(playwright, secret)
    const { status, json } = await read(await ctx.get(GATED_READ))
    expect(status, `x-api-key ${redact(secret)} → ${status}: ${errorMessage(json)}`).toBe(200)
    expect(Array.isArray(json.documents), 'the gated read returned its payload').toBe(true)
    await ctx.dispose()
  })

  test('Authorization: Bearer sk_… reaches the same read → 200', async ({ playwright }) => {
    const ctx = await keyContext(playwright, secret, { header: 'bearer' })
    const { status, json } = await read(await ctx.get(GATED_READ))
    expect(status, `bearer ${redact(secret)} → ${status}: ${errorMessage(json)}`).toBe(200)
    expect(Array.isArray(json.documents), 'the gated read returned its payload').toBe(true)
    await ctx.dispose()
  })

  test('CONTROL · the same context WITHOUT the key is refused → 401', async ({ playwright }) => {
    // The assertion that makes the two above mean anything.
    //
    // This file declares `test.use({ storageState: AUTH.intAdmin })`, and a
    // request context created inside a test inherits it unless told otherwise.
    // If that inheritance were leaking, requireAuthByApiKey would return early
    // on the session and never look at the key — every test in this directory
    // would be green while measuring intAdmin's cookie. A context built the
    // same way, minus the key header, has to be refused.
    const ctx = await bareContext(playwright)
    const { status, json } = await read(await ctx.get(GATED_READ))
    expect(status, 'no key, no session — the 200s above came from the key').toBe(401)
    expect(errorMessage(json)).toContain('Authentication required')
    await ctx.dispose()
  })

  test('the secret is 32 CSPRNG bytes, and only its SHA-256 is stored', async () => {
    // `sk_` + 64 hex chars = 32 bytes. Asserting the SHAPE is worth little on
    // its own; asserting that the DATABASE holds the digest and not the string
    // is what says the credential is unrecoverable by design.
    expect(secret).toMatch(/^sk_[0-9a-f]{64}$/)

    // The secret is never interpolated into a psql command line — fixtures/db.js
    // shells out, and an argv is readable by anything else on the box. The row
    // comes back and is compared in-process instead.
    //
    // One column per call, deliberately: `sqlValue` returns the FIRST
    // pipe-separated column of the first row, so a `a || '|' || b` expression
    // silently discards everything after the first field and half of what looks
    // like a multi-column assertion never runs.
    const where = `WHERE user_id = '${account}' AND revoked = false`
    expect(sqlValue(`SELECT key_hash FROM api_keys ${where}`), 'key_hash is sha256(secret)').toBe(
      sha256(secret),
    )
    for (const column of ['key_hash', 'name', "coalesce(label, '')"]) {
      expect(
        sqlValue(`SELECT ${column} FROM api_keys ${where}`),
        `api_keys.${column} does not hold the plaintext`,
      ).not.toBe(secret)
    }
  })

  test('the owner of the key is a machine identity — no email, no password', async () => {
    // Why this belongs in the credential file rather than the UI one: it is the
    // reason a leaked key cannot be turned into a login. `getUserFromEmail`
    // matches on LOWER(email), and NULL matches nothing, so there is no sign-in
    // surface to guard rather than one guarded by a filter.
    const of = (expr) => sqlValue(`SELECT ${expr} FROM users WHERE id = '${account}'`)
    expect(of('is_service_account'), 'flagged as a machine identity').toBe('t')
    expect(of("coalesce(email, '<null>')"), 'no email — hence no login surface').toBe('<null>')
    expect(of("coalesce(password, '<null>')"), 'no password (a CHECK constraint enforces it)').toBe(
      '<null>',
    )
    expect(of('company_id'), 'anchored in the tenant that created it').toBe(COMPANY_ID)
  })
})
