// SA-API-7 · A credential that is not a live credential gets 401.
//
// The boring half of an authentication path, and the half that fails open when
// it fails. Three shapes, each reaching a DIFFERENT branch of
// requireAuthByApiKey, which is why they are not one parameterised test:
//
//   garbage / unknown   no `api_keys` row for the digest → 401 "Invalid API
//                       key", and the digest is negative-cached for 5 minutes
//                       so a brute-force attempt stops touching the database.
//   empty header        `!apiKey` → `next()` with no principal, and
//                       requireCompanyAccess answers 401 "Authentication
//                       required". A DIFFERENT message, from a different
//                       middleware — worth pinning, because an empty string
//                       hashing to a valid-looking digest would be the classic
//                       version of this bug.
//   expired             the row exists and is NOT revoked; only `expires_at`
//                       stops it → 401 "API key expired".
//
// EXPIRY IS THE ONE WITH TEETH. It is enforced twice — once against the DB row
// and once against the CACHED principal — and the cached branch reads
// `apiKeyData.apiKeyExpiresAt`, a deliberately qualified name. The obvious
// spelling (`expiresAt`, unqualified on a user-shaped principal) is a field
// that does not exist there: it would read `undefined`, the comparison would be
// skipped, and an expired key would keep working for the life of its cache.
// That is a bug you cannot see by reading the happy path, so this file expires
// a key that is otherwise perfectly valid and gives the cache a chance to be
// wrong about it.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH } from '../fixtures/cast.js'
import { sqlValue } from '../fixtures/db.js'
import {
  GATED_READ,
  ROLE_INTEGRATION_ADMIN,
  accountTracker,
  createAccount,
  errorMessage,
  issueKey,
  keyContext,
  read,
} from './api-helpers.js'

test.use({ storageState: AUTH.intAdmin })

const owned = accountTracker()

async function statusWithKey(playwright, secret) {
  const ctx = await keyContext(playwright, secret)
  const { status, json } = await read(await ctx.get(GATED_READ))
  await ctx.dispose()
  return { status, message: errorMessage(json) }
}

test.describe('SA-API-7 · malformed, unknown and expired credentials', () => {
  let account

  test.beforeAll(async ({ request }) => {
    account = owned.track(
      (await createAccount(request, { label: 'a7-expiry', roleIds: [ROLE_INTEGRATION_ADMIN] })).id,
    )
  })

  test.afterAll(async ({ playwright }) => {
    await owned.cleanup(playwright)
  })

  test('a malformed key → 401', async ({ playwright }) => {
    const res = await statusWithKey(playwright, 'sk_not-a-real-key')
    expect(res.status).toBe(401)
    expect(res.message).toContain('Invalid API key')
  })

  test('a well-formed key that was never issued → 401', async ({ playwright }) => {
    // Same shape as a real one — `sk_` + 64 hex — so nothing about the FORMAT
    // is doing the rejecting. Only the absence of a matching digest is.
    const res = await statusWithKey(playwright, `sk_${'a1b2c3d4'.repeat(8)}`)
    expect(res.status).toBe(401)
    expect(res.message).toContain('Invalid API key')
  })

  test('an empty x-api-key header → 401, from the other middleware', async ({ playwright }) => {
    const res = await statusWithKey(playwright, '')
    expect(res.status).toBe(401)
    // Not "Invalid API key": an empty header means no credential was presented
    // at all, so requireAuthByApiKey passes it through unauthenticated and
    // requireCompanyAccess is what refuses. If this ever says "Invalid API
    // key", the empty string is being hashed and looked up — which is one
    // colliding row away from an authentication bypass.
    expect(res.message).toContain('Authentication required')
  })

  test('an expiresAt in the past → 401, while an unexpired sibling still works', async ({
    request,
    playwright,
  }) => {
    const expired = await issueKey(request, account, {
      name: 'SA-API-7 expired',
      expiresAt: '2020-01-01T00:00:00.000Z',
    })
    // The control is issued on the SAME account, so the only difference between
    // the two credentials is `expires_at`. A future date, not null, so the
    // expiry comparison is exercised in both directions rather than skipped.
    const live = await issueKey(request, account, {
      name: 'SA-API-7 live',
      expiresAt: '2099-01-01T00:00:00.000Z',
    })

    expect(
      sqlValue(`SELECT revoked FROM api_keys WHERE id = '${expired.key.id}'`),
      'the expired key is NOT revoked — expiry alone is what stops it',
    ).toBe('f')

    const refused = await statusWithKey(playwright, expired.secret)
    expect(refused.status, 'a past expiry refuses').toBe(401)
    expect(refused.message).toContain('API key expired')

    expect(
      (await statusWithKey(playwright, live.secret)).status,
      'a future expiry authenticates',
    ).toBe(200)

    // Second pass, and an honest note about which branch each one reaches.
    //
    // The expired key never gets cached — the DB branch returns 401 before the
    // `setEx`, so both calls take the same path and this is a repeat rather
    // than a second branch. Reaching the CACHED expiry check would need a key
    // that authenticated successfully and expired afterwards, which no test can
    // arrange without waiting out a real clock, so it stays uncovered and is
    // recorded here as such.
    //
    // The live key's second call IS the cached path: the first success wrote
    // the principal to Redis under `apikey:<sha256>`, so this read compares
    // `apiKeyData.apiKeyExpiresAt` — the qualified field named in the header —
    // rather than the row. It covers that branch in the not-expired direction.
    expect((await statusWithKey(playwright, expired.secret)).status, 'still refused').toBe(401)
    expect(
      (await statusWithKey(playwright, live.secret)).status,
      'the live key survives the cached expiry check',
    ).toBe(200)
  })
})
