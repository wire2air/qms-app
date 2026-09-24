// SA-API-3 · /graphql is closed to API keys.
//
// GraphQL is the SPA's own transport: the SyncEngine bootstraps every model
// through it, and RLS — not `enforcePermission` — is what gates it. Letting a
// machine credential in there would hand an integration the entire read surface
// of the product through one endpoint, governed by a different (and much
// broader) set of rules than the REST routes it is actually meant to call.
//
// WHAT MAKES THIS WORTH A TEST RATHER THAN A CODE READ. The guard is not the
// absence of middleware. `rejectApiKeyOnGraphQL` is a POSITIVE refusal mounted
// in app.js, written that way on purpose: simply omitting requireAuthByApiKey
// would fall through to a bare "Authentication required", which reads like a
// bug to whoever hit it and invites someone to "fix" it by adding the
// middleware. The specific code is the contract, so the code is asserted.
//
// The subtle failure this file is really guarding against is the opposite one:
// the guard begins `if (req.session?.passport?.user) return next()`. Widen that
// early return by accident — to `if (req.session)`, say, which is truthy on
// every request that touches session middleware — and every key walks straight
// through with nothing to show for it. A test that only asserted "a key is
// refused" from a context that also carried a session would never see it, which
// is why the key contexts here carry no cookies at all (api-helpers.js).
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH } from '../fixtures/cast.js'
import {
  GATED_READ,
  GRAPHQL,
  ROLE_INTEGRATION_ADMIN,
  accountTracker,
  createAccount,
  issueKey,
  keyContext,
  read,
} from './api-helpers.js'

test.use({ storageState: AUTH.intAdmin })

const owned = accountTracker()

// A query that needs no arguments and no permissions — if this is refused, it
// is the credential that was refused and nothing else.
const PROBE = { query: '{ __typename }' }

// ── Worker-discard guard ────────────────────────────────────────────────────
// This file arranges a service account + key ONCE in `beforeAll` and purges it
// in `afterAll`. Playwright discards a worker after a failing test and RUNS the
// file's pending `afterAll` before continuing in a fresh one — but the
// `beforeAll` of an already-entered describe does NOT re-run. Without serial
// mode the purge would therefore delete the account out from under every later
// test in the file, and each would report the 401/404 it was written to catch:
// one real failure printed as N false authentication findings.
//
// Serial mode makes Playwright SKIP the remainder instead of replaying it, so
// one failure stays one failure. See complaints/j11 for the alternative fix
// (arrange per describe), which suits files whose tests can afford their own
// fixtures; minting a real API key per test would not be cheap here.
test.describe.configure({ mode: 'serial' })

test.describe('SA-API-3 · GraphQL refuses API-key credentials', () => {
  let account
  let secret

  test.beforeAll(async ({ playwright }) => {
    const session = await playwright.request.newContext({ storageState: AUTH.intAdmin })
    account = owned.track(
      (await createAccount(session, { label: 'a3-graphql', roleIds: [ROLE_INTEGRATION_ADMIN] })).id,
    )
    secret = (await issueKey(session, account, { name: 'SA-API-3' })).secret
    await session.dispose()
  })

  test.afterAll(async ({ playwright }) => {
    await owned.cleanup(playwright)
  })

  for (const header of ['x-api-key', 'bearer']) {
    test(`POST /graphql with ${header} → 403 API_KEY_NOT_PERMITTED_ON_GRAPHQL`, async ({
      playwright,
    }) => {
      // Both forms, because the guard reads BOTH headers
      // (`req.headers['x-api-key'] || req.headers.authorization`) and closing
      // one while leaving the other open is exactly the shape of mistake a
      // single-form test would ship.
      const ctx = await keyContext(playwright, secret, { header })
      const { status, json } = await read(await ctx.post(GRAPHQL, { data: PROBE }))

      expect(status, `${header} on /graphql`).toBe(403)
      expect(json?.code, 'the refusal is specific and actionable, not a bare 401').toBe(
        'API_KEY_NOT_PERMITTED_ON_GRAPHQL',
      )
      expect(json?.message, 'it points machine clients at REST').toContain('/v1/services')
      expect(json?.data, 'no data is resolved for a refused credential').toBeUndefined()
      await ctx.dispose()
    })
  }

  test('CONTROL · the very same key IS admitted to REST → 200', async ({ playwright }) => {
    // Without this, the 403s above are consistent with "the key is dead".
    const ctx = await keyContext(playwright, secret)
    const { status } = await read(await ctx.get(GATED_READ))
    expect(status, 'the credential is live; GraphQL is what refuses it').toBe(200)
    await ctx.dispose()
  })

  test('CONTROL · a human session still reaches /graphql', async ({ request }) => {
    // The guard's early return, from the other side. If it ever stopped
    // distinguishing a session from a key, this goes red and the SPA is down —
    // which is a far louder signal than a machine client being refused.
    const { status, json } = await read(await request.post(GRAPHQL, { data: PROBE }))
    expect(status, 'sessions are untouched by the api-key guard').toBe(200)
    expect(json?.data?.__typename).toBe('Query')
  })
})
