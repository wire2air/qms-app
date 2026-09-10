// SA-API-6 · A key issued in E2ELAB cannot read E2EALT.
//
// TWO DIFFERENT ANSWERS, AND BOTH ARE ASSERTED AS WHAT THEY ACTUALLY ARE.
// "Cross-tenant refusal" is one phrase covering two mechanisms in
// requireCompanyAccessWithoutTransaction, and they do not behave alike:
//
//   1. THE HOST. On a tenant subdomain the host IS the tenant identifier, and
//      the principal's own company code must match it:
//
//          if (req.tenantSlug) { … if (code !== req.tenantSlug) → 403 }
//
//      Presenting an E2ELAB key to e2ealt.localhost is a genuine REFUSAL —
//      403 "Credentials do not belong to this tenant". Nothing is served.
//
//   2. THE PARAMETER. A caller-supplied `?companyId=` is NOT refused. It is
//      ignored: an api-key principal's tenant is taken from
//      `req.apiKey.activeCompanyId`, and the query/body fallback is skipped
//      entirely while `req.tenantSlug` is set. The caller gets 200 and their
//      OWN tenant's rows.
//
// The second is stated plainly in this file's test names because dressing it up
// as a refusal would be a lie about the mechanism, and a future reader deciding
// whether a 200 here is safe needs to know it is 200-with-your-own-data rather
// than 200-with-theirs. It is a correct outcome — a parameter that cannot
// change the answer is stronger than one that is rejected — but it is not the
// same outcome, and a test that blurred them would keep passing if the host
// firewall were removed.
//
// AN HONEST LIMIT ON HALF 2. E2EALT holds no documents (measured: 0, against
// E2ELAB's several hundred), so the parameter probe proves "the key returned
// its own tenant's rows", not "the key was denied E2EALT's rows" — there are
// none to deny. The DB assertion below therefore checks the returned ids
// against `documents.company_id` rather than claiming a leak was blocked. Half
// 1 is where the isolation is actually demonstrated.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { ALT_COMPANY_ID, AUTH, COMPANY_ID } from '../fixtures/cast.js'
import { sqlValue } from '../fixtures/db.js'
import {
  ALT_API,
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

test.describe('SA-API-6 · a key is pinned to the tenant that issued it', () => {
  let account
  let secret

  test.beforeAll(async ({ playwright }) => {
    const session = await playwright.request.newContext({ storageState: AUTH.intAdmin })
    account = owned.track(
      (await createAccount(session, { label: 'a6-tenant', roleIds: [ROLE_INTEGRATION_ADMIN] })).id,
    )
    secret = (await issueKey(session, account, { name: 'SA-API-6' })).secret
    await session.dispose()
  })

  test.afterAll(async ({ playwright }) => {
    await owned.cleanup(playwright)
  })

  test('REFUSED · the same key against the E2EALT host → 403, nothing served', async ({
    playwright,
  }) => {
    const ctx = await keyContext(playwright, secret)
    const { status, json } = await read(await ctx.get(`${ALT_API}/v1/services/documents`))

    expect(status, 'the host firewall refuses a foreign credential').toBe(403)
    expect(errorMessage(json), 'and says why').toContain('do not belong to this tenant')
    // 403 alone would be satisfied by an empty 200 body dressed as an error;
    // assert there is no payload at all.
    expect(json?.documents, 'no rows travel with the refusal').toBeUndefined()
    await ctx.dispose()
  })

  test('CONTROL · the identical key on its OWN host → 200', async ({ playwright }) => {
    // The one variable is the host. Without this the 403 above is equally
    // consistent with "e2ealt.localhost:4000 is not answering".
    const ctx = await keyContext(playwright, secret)
    const { status } = await read(await ctx.get(GATED_READ))
    expect(status, 'same key, same second, own tenant').toBe(200)
    await ctx.dispose()
  })

  test('IGNORED (not refused) · ?companyId=<E2EALT> returns the key’s OWN tenant’s rows', async ({
    playwright,
  }) => {
    // Naming it "ignored" is the point — see this file's header. The parameter
    // is a legacy fallback for apex-host callers and is skipped whenever the
    // request arrived on a tenant subdomain, so it cannot move a key between
    // tenants. That is the behaviour; asserting a 403 here would be asserting a
    // control that does not exist and would go red the day someone "fixed" it.
    const ctx = await keyContext(playwright, secret)
    const { status, json } = await read(await ctx.get(`${GATED_READ}?companyId=${ALT_COMPANY_ID}`))
    expect(status, 'the parameter is not an error — it is inert').toBe(200)

    const returned = (json.documents ?? []).map((d) => d.id)
    expect(
      returned.length,
      'rows came back, so the check below has something to check',
    ).toBeGreaterThan(0)

    // Every id belongs to the KEY's tenant. Sampled rather than exhaustive: the
    // list runs to hundreds of rows and one foreign id is as fatal as all of
    // them.
    const sample = returned
      .slice(0, 50)
      .map((id) => `'${id}'`)
      .join(',')
    const foreign = sqlValue(
      `SELECT count(*) FROM documents WHERE id IN (${sample}) AND company_id <> '${COMPANY_ID}'`,
    )
    expect(foreign, 'not one row belongs to another tenant').toBe('0')

    const mine = sqlValue(
      `SELECT count(*) FROM documents WHERE id IN (${sample}) AND company_id = '${COMPANY_ID}'`,
    )
    expect(Number(mine), 'the rows are E2ELAB’s own').toBe(Math.min(returned.length, 50))

    await ctx.dispose()
  })

  test('DB · the account and its key live in E2ELAB, not E2EALT', async () => {
    // Pins the premise. If the account had somehow been created in the other
    // tenant, half 1 would still be 403 — for the opposite reason — and the
    // suite would read as a pass.
    expect(sqlValue(`SELECT company_id::text FROM users WHERE id = '${account}'`)).toBe(COMPANY_ID)
    expect(
      sqlValue(
        `SELECT count(*) FROM api_keys k JOIN users u ON u.id = k.user_id WHERE k.user_id = '${account}' AND u.company_id = '${ALT_COMPANY_ID}'`,
      ),
      'no key of this account is anchored in E2EALT',
    ).toBe('0')
  })
})
