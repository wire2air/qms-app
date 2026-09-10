// SA-API-9 · The secret exists in exactly one HTTP response, and nowhere else.
//
// "Shown once" is a claim the UI makes on the server's behalf — the issue
// dialog says the key cannot be retrieved later, and an operator plans around
// that: they paste it into a secret store, they do not bookmark the page. If a
// later GET returned the secret (or its hash, which is the credential for
// anyone who can replay a digest comparison), that promise would be false and
// the whole disclosure model with it.
//
// The controller's defence is structural rather than filtered:
//
//     const KEY_ATTRS = ['id','name','label','revoked','expiresAt','lastUsedAt','createdAt']
//
// `key_hash` is not selected — not fetched and then stripped, never loaded — so
// it cannot reach a response by accident. That is exactly the kind of guarantee
// that survives until someone adds a convenient `attributes: undefined` or a
// spread of the model instance, at which point the hash starts shipping and
// nothing else in the codebase notices.
//
// So this file asserts on RAW RESPONSE TEXT, not on parsed fields. A field-name
// assertion (`expect(body.key.secret).toBeUndefined()`) passes cheerfully while
// the value is present under a different name, nested one level deeper, or
// echoed in an error string. Searching the bytes for the two things that must
// never appear — the plaintext and its digest — is the only form of this test
// that cannot be satisfied by a rename.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH } from '../fixtures/cast.js'
import { sqlValue } from '../fixtures/db.js'
import {
  GATED_READ,
  ROLE_INTEGRATION_ADMIN,
  SA_ROOT,
  accountTracker,
  createAccount,
  issueKey,
  keyContext,
  read,
  sha256,
} from './api-helpers.js'

test.use({ storageState: AUTH.intAdmin })

const owned = accountTracker()

test.describe('SA-API-9 · the secret is returned exactly once', () => {
  let account
  let keyId
  let secret
  let digest

  test.beforeAll(async ({ playwright }) => {
    const session = await playwright.request.newContext({ storageState: AUTH.intAdmin })
    account = owned.track(
      (await createAccount(session, { label: 'a9-once', roleIds: [ROLE_INTEGRATION_ADMIN] })).id,
    )
    const issued = await issueKey(session, account, { name: 'SA-API-9' })
    keyId = issued.key.id
    secret = issued.secret
    digest = sha256(secret)
    await session.dispose()
  })

  test.afterAll(async ({ playwright }) => {
    await owned.cleanup(playwright)
  })

  test('the issuance response carries the secret, and says it is the only copy', async ({
    request,
  }) => {
    // Issued fresh here rather than reusing the beforeAll credential: the claim
    // is about the SHAPE of an issuance response, and a second issuance also
    // gives the "no subsequent GET" tests below two keys to fail to leak.
    const second = await issueKey(request, account, { name: 'SA-API-9 second' })
    expect(second.secret).toMatch(/^sk_[0-9a-f]{64}$/)
    expect(second.warning, 'the response tells the caller to store it now').toMatch(
      /cannot be retrieved later/i,
    )
    // The metadata beside it must NOT include the secret or a hash.
    expect(Object.keys(second.key).sort()).toEqual([
      'createdAt',
      'expiresAt',
      'id',
      'label',
      'lastUsedAt',
      'name',
      'revoked',
    ])
  })

  test('no subsequent read returns the secret or its hash', async ({ request }) => {
    const surfaces = [
      [`${SA_ROOT}`, 'the account list'],
      [`${SA_ROOT}/${account}`, 'the account detail (which embeds key metadata)'],
      [`${SA_ROOT}/${account}/keys`, 'the key list'],
    ]

    for (const [url, what] of surfaces) {
      const { status, text } = await read(await request.get(url))
      expect(status, `${what} reads`).toBe(200)
      // Raw bytes — see the header for why this is not a field check.
      expect(text.includes(secret), `${what} must not contain the plaintext`).toBe(false)
      expect(text.includes(digest), `${what} must not contain the sha256 hash`).toBe(false)
      expect(text.includes('sk_'), `${what} must not contain anything key-shaped`).toBe(false)
      expect(/keyHash|key_hash/.test(text), `${what} must not expose the hash column`).toBe(false)
    }

    // The revoke response is a read of the key too, and it is the one written
    // last — an easy place to hand back the model instance instead of
    // presentKey().
    const revoke = await read(await request.post(`${SA_ROOT}/${account}/keys/${keyId}/revoke`))
    expect(revoke.status).toBe(200)
    expect(revoke.text.includes(secret), 'the revoke response must not echo it').toBe(false)
    expect(revoke.text.includes(digest), 'nor its hash').toBe(false)
  })

  test('DB · the digest is what is stored, and the check above was aimed at a real key', async ({
    playwright,
  }) => {
    // Two premises the leak tests depend on. Without the first, the "must not
    // contain the hash" assertions could be searching for a string that exists
    // nowhere. Without the second, they could be searching a response about a
    // key that was never valid.
    const stored = sqlValue(`SELECT key_hash FROM api_keys WHERE id = '${keyId}'`)
    expect(stored, 'api_keys stores sha256(secret)').toBe(digest)
    expect(stored, 'and never the plaintext').not.toBe(secret)

    // The remaining key (the second issuance) still authenticates, so the
    // secrets these tests searched for are live credentials rather than
    // strings that never worked.
    const remaining = sqlValue(
      `SELECT count(*) FROM api_keys WHERE user_id = '${account}' AND revoked = false`,
    )
    expect(remaining, 'one key survived the revoke above').toBe('1')

    const ctx = await keyContext(playwright, secret)
    const { status } = await read(await ctx.get(GATED_READ))
    expect(status, 'the revoked credential is dead').toBe(401)
    await ctx.dispose()
  })
})
