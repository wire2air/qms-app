// SA-API-2 · A key carries ITS OWN account's roles — never the issuer's.
//
// THE MOST IMPORTANT ASSERTION IN THIS DIRECTORY. It is the whole difference
// between a service account and an impersonation of whoever made it, and it is
// the defect the personal-API-key surface this feature replaced actually had:
// a personal key inherited whatever its owning HUMAN was granted, at any later
// time, so a key minted by a junior silently became an admin credential the day
// that person was promoted.
//
// The shape of the probe. intAdmin creates an account with NO roles at all,
// issues a key against it, and calls a read intAdmin can perform. Three
// outcomes are possible and only one is correct:
//
//   403 — the key's authority is the ACCOUNT's, which is nothing.        ✅
//   200 — the key inherited the issuer. The feature is an escalation.    ❌
//   401 — the key did not authenticate; the test proved nothing about
//         authority and would be a false pass dressed as a strict one.   ❌
//
// The last of those is why the 403 is not asserted alone. A 403 from a missing
// route, a typo'd path or a dead credential is indistinguishable from a 403
// out of the PDP, so this file pins the MECHANISM three ways:
//
//   · the body has to name the permission (`read on document_control`),
//   · the issuer has to succeed on the identical URL in the same run,
//   · a second key differing in exactly ONE thing — the account holds the
//     role — has to succeed on the identical URL.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH, COMPANY_ID, USERS } from '../fixtures/cast.js'
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

test.describe('SA-API-2 · a key is its account, not its issuer', () => {
  let powerless // no roles at all
  let powerlessSecret
  let roled // holds document_control:read via the integration-admin role
  let roledSecret

  test.beforeAll(async ({ playwright }) => {
    const session = await playwright.request.newContext({ storageState: AUTH.intAdmin })

    powerless = owned.track(
      (await createAccount(session, { label: 'a2-no-roles', roleIds: [] })).id,
    )
    powerlessSecret = (await issueKey(session, powerless, { name: 'SA-API-2 powerless' })).secret

    roled = owned.track(
      (await createAccount(session, { label: 'a2-roled', roleIds: [ROLE_INTEGRATION_ADMIN] })).id,
    )
    roledSecret = (await issueKey(session, roled, { name: 'SA-API-2 roled' })).secret

    await session.dispose()
  })

  test.afterAll(async ({ playwright }) => {
    await owned.cleanup(playwright)
  })

  test('a key on a role-less account is REFUSED the read its issuer can perform → 403', async ({
    playwright,
  }) => {
    const ctx = await keyContext(playwright, powerlessSecret)
    const { status, json } = await read(await ctx.get(GATED_READ))

    // 401 here would mean the key never authenticated, and the 403 we wanted
    // would have been proven by the wrong thing. Separate the two explicitly.
    expect(status, 'the key authenticated (not 401) and was then denied').not.toBe(401)
    expect(status, 'a key inherits its ACCOUNT’s authority, which is none').toBe(403)

    // The gate names what was missing. A 403 from a mis-mounted middleware or a
    // 404-shaped route would not.
    expect(errorMessage(json), 'the refusal names the missing permission').toContain(
      'read on document_control',
    )
    await ctx.dispose()
  })

  test('CONTROL · the ISSUER reads the identical URL → 200', async ({ request }) => {
    // Same endpoint, same tenant, same moment. The only difference is which
    // principal is asking. Without this, the 403 above could equally mean
    // "/v1/services/documents is broken today".
    const { status, json } = await read(await request.get(GATED_READ))
    expect(status, `intAdmin holds document_control:read → ${errorMessage(json)}`).toBe(200)
    expect(Array.isArray(json.documents)).toBe(true)
  })

  test('CONTROL · a key differing by exactly one thing — the role — → 200', async ({
    playwright,
  }) => {
    // Both accounts were created by intAdmin, in the same tenant, seconds apart,
    // and both keys were issued the same way. `roleIds` is the single variable.
    const ctx = await keyContext(playwright, roledSecret)
    const { status, json } = await read(await ctx.get(GATED_READ))
    expect(status, `the roled key reads → ${errorMessage(json)}`).toBe(200)
    expect(Array.isArray(json.documents)).toBe(true)
    await ctx.dispose()
  })

  test('DB · the refusal is authority, not accident — the account holds zero roles', async () => {
    // Closes the last way this could be a false pass: an account that failed to
    // receive the role it was meant to have would 403 for a reason that has
    // nothing to do with the rule under test.
    const powerlessRoles = sqlValue(
      `SELECT count(*) FROM roles_on_users WHERE user_id = '${powerless}' AND company_id = '${COMPANY_ID}'`,
    )
    expect(powerlessRoles, 'the role-less account really holds nothing').toBe('0')

    const roledRoles = sqlValue(
      `SELECT count(*) FROM roles_on_users WHERE user_id = '${roled}' AND role_id = '${ROLE_INTEGRATION_ADMIN}' AND company_id = '${COMPANY_ID}'`,
    )
    expect(roledRoles, 'the control account really holds the role').toBe('1')

    // And the issuer's own grant, so "intAdmin can read" is a fact about the
    // catalog rather than about this run.
    const issuerScopes = sqlValue(
      `SELECT authz.effective_permission_scopes('${USERS.intAdmin.id}'::uuid, '${COMPANY_ID}'::uuid)::text`,
    )
    expect(issuerScopes, 'intAdmin holds document_control:read').toContain('document_control:read')
  })
})
