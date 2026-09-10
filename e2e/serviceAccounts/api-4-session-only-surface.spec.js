// SA-API-4 · A key cannot mint keys. The management surface is session-only.
//
// This is the property that stops ONE leaked credential from becoming a
// standing foothold. If a key could reach /v1/services/service-accounts it
// could create a second account, assign it roles, issue keys against it, and
// survive the revocation of the key that started it — self-perpetuating, and
// invisible to whoever revoked the original.
//
// HOW THE PROPERTY IS IMPLEMENTED, AND WHY THAT NEEDS A TEST. It is an
// OMISSION: routes/serviceAccounts.js does not mount `requireAuthByApiKey`, so
// `req.apiKey` is never populated and `requireCompanyAccess` answers
//
//     if (!req.session?.passport?.user && !req.apiKey) → 401
//
// A missing line is the easiest thing in a codebase to add back "for
// consistency" — every neighbouring router has it, and adding it would look
// like tidying. Nothing in the file would break; a key would simply start being
// able to mint keys. This spec is the tripwire on that edit, so it enumerates
// the whole surface rather than sampling it.
//
// WHY 401 AND NOT 403. The distinction is the mechanism. 403 would mean the key
// authenticated and was then denied by the PDP — a permission decision, which
// a role change could reverse. 401 means the credential was never a candidate
// on this router at all. Asserting the specific code is what keeps a future
// "let's gate it on api_integrations instead" from passing silently.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH } from '../fixtures/cast.js'
import {
  GATED_READ,
  ROLE_INTEGRATION_ADMIN,
  SA_ROOT,
  accountTracker,
  createAccount,
  errorMessage,
  issueKey,
  keyContext,
  read,
} from './api-helpers.js'

test.use({ storageState: AUTH.intAdmin })

const owned = accountTracker()

test.describe('SA-API-4 · the management surface refuses keys', () => {
  let account
  let keyId
  let secret

  test.beforeAll(async ({ playwright }) => {
    const session = await playwright.request.newContext({ storageState: AUTH.intAdmin })
    // Deliberately the MOST powerful account intAdmin can make: it holds
    // api_integrations create/read/update/delete, which is precisely the
    // permission set these routes are gated on. So if the router were ever
    // opened to keys, this key would sail through on merit — the refusal below
    // cannot be mistaken for a missing grant.
    account = owned.track(
      (
        await createAccount(session, {
          label: 'a4-session-only',
          roleIds: [ROLE_INTEGRATION_ADMIN],
        })
      ).id,
    )
    const issued = await issueKey(session, account, { name: 'SA-API-4' })
    keyId = issued.key.id
    secret = issued.secret
    await session.dispose()
  })

  test.afterAll(async ({ playwright }) => {
    await owned.cleanup(playwright)
  })

  test('every service-account route refuses a key with 401', async ({ playwright }) => {
    const ctx = await keyContext(playwright, secret)
    // The whole router, in the order it is declared. `id` is the key's OWN
    // account throughout — this is not a cross-tenant or wrong-id probe, it is
    // the most favourable case a key could possibly have, and it still fails.
    const surface = [
      ['GET', SA_ROOT, 'list every integration in the tenant'],
      ['GET', `${SA_ROOT}/${account}`, 'read its own account + key metadata'],
      ['POST', SA_ROOT, 'create a second machine identity'],
      ['PATCH', `${SA_ROOT}/${account}`, 'widen its own roles'],
      ['POST', `${SA_ROOT}/${account}/enable`, 'flip its own kill switch'],
      ['POST', `${SA_ROOT}/${account}/disable`, 'flip its own kill switch'],
      ['DELETE', `${SA_ROOT}/${account}`, 'delete an integration'],
      ['GET', `${SA_ROOT}/${account}/keys`, 'enumerate its own keys'],
      ['POST', `${SA_ROOT}/${account}/keys`, 'MINT ANOTHER KEY'],
      ['POST', `${SA_ROOT}/${account}/keys/${keyId}/revoke`, 'revoke a key'],
    ]

    for (const [method, url, what] of surface) {
      const res = await ctx.fetch(url, {
        method,
        ...(method === 'POST' || method === 'PATCH'
          ? { data: { name: 'E2E SA API must-not-exist', roleIds: [] } }
          : {}),
      })
      const { status, json } = await read(res)
      expect(status, `${method} ${url} — a key must not ${what}`).toBe(401)
      expect(errorMessage(json), `${method} ${url} — refused before the PDP`).toContain(
        'Authentication required',
      )
    }

    await ctx.dispose()
  })

  test('CONTROL · the same key IS admitted to the operational surface → 200', async ({
    playwright,
  }) => {
    // Ten 401s in a row are equally consistent with a dead key. This is the one
    // request that separates "the credential is invalid" from "this router does
    // not accept credentials".
    const ctx = await keyContext(playwright, secret)
    const { status } = await read(await ctx.get(GATED_READ))
    expect(status, 'the key works — the management router is what refuses it').toBe(200)
    await ctx.dispose()
  })

  test('CONTROL · a session with the same permissions reaches the same routes', async ({
    request,
  }) => {
    // And the other half: the routes are not simply broken. intAdmin holds
    // exactly the grants the key's account holds, and is admitted.
    const list = await read(await request.get(SA_ROOT))
    expect(list.status, 'a human session lists integrations').toBe(200)
    expect(Array.isArray(list.json.serviceAccounts)).toBe(true)

    const detail = await read(await request.get(`${SA_ROOT}/${account}`))
    expect(detail.status, 'a human session reads one integration').toBe(200)
    expect(detail.json.serviceAccount.id).toBe(account)
  })
})
