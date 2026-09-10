// SA-API-8 · You cannot give a service account authority you do not hold.
//
// Without this guard `api_integrations:create` is not an integrations
// permission, it is a total-takeover permission: create an account, assign it
// the role you were never given, issue a key, and act with that authority —
// through a credential, so with no session, no MFA, and an audit trail naming
// the service account rather than you.
//
// `assertNoPrivilegeEscalation` (services/serviceAccountService.js) compares
// the permissions a requested role would grant against the caller's own
// effective grants, INCLUDING the scope each is held at (own 1 < department 2 <
// site 3 < tenant 4). Company owners bypass it, having nothing to escalate to.
//
// THREE DOORS, and all three are asserted here because closing one is not
// closing the rule:
//
//   create   POST /service-accounts with roleIds
//   update   PATCH /service-accounts/:id with roleIds — the same escalation,
//            one request later, against an account that was innocuous when it
//            was made
//   issue    POST /service-accounts/:id/keys — the door with NO role change to
//            notice. A powerful account already exists (an owner made it);
//            anyone holding api_integrations:create mints a key against it and
//            now acts with its authority. This is the one a reviewer is most
//            likely to miss, so it gets an owner-created fixture that intAdmin
//            could not have built for itself.
//
// ── A FIXTURE FINDING, RECORDED RATHER THAN PAPERED OVER ────────────────────
// The brief for this work named "E2E Reviewer" as the ACCEPT case, on the
// stated premise that it grants `document_control:read` and nothing else. That
// was true when the role was written (§4: "document_control read (step-1
// reviewer)") and is no longer true: §§9, 12, 17, 23–26, 31 and 33 of
// e2e-seed.sql each append grants to the SAME role id, and it now carries 18
// permissions across nine modules — capa:update, ncr:update,
// change_control:update, reports_dashboards:manage among them. intAdmin holds
// none of those, so granting E2E Reviewer is REFUSED, exactly as the guard
// should refuse it.
//
// The ACCEPT case here is therefore §39's own role, E2E Integration Admin —
// api_integrations CRUD plus document_control:read, which is precisely
// intAdmin's grant set. It is a better accept case than the brief's: the two
// sides are identical by construction, so the test cannot drift the way the
// reviewer role did. `accepts-its-own-grants` and `refuses-the-reviewer-role`
// below pin both halves, and the second carries the diagnosis so that whoever
// eventually narrows the seed's reviewer role sees why this test exists.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH, COMPANY_ID } from '../fixtures/cast.js'
import { sqlValue } from '../fixtures/db.js'
import {
  ROLE_AUTHOR,
  ROLE_INTEGRATION_ADMIN,
  ROLE_REVIEWER,
  SA_ROOT,
  accountTracker,
  createAccount,
  errorMessage,
  read,
  saName,
} from './api-helpers.js'

test.use({ storageState: AUTH.intAdmin })

const owned = accountTracker()

test.describe('SA-API-8 · the privilege-escalation guard', () => {
  test.afterAll(async ({ playwright }) => {
    await owned.cleanup(playwright)
  })

  test('DOOR 1 · create with a role the caller does not hold → 403 naming each permission', async ({
    request,
  }) => {
    const name = saName('a8-refused-author')
    const { status, json } = await read(
      await request.post(SA_ROOT, { data: { name, roleIds: [ROLE_AUTHOR] } }),
    )

    expect(status, 'E2E Author grants far more than intAdmin holds').toBe(403)
    const message = errorMessage(json)
    expect(message).toContain('cannot be granted permissions you do not hold yourself')
    // Naming EVERY offender, not just the first, is the contract — the caller
    // fixes the role selection in one round trip instead of discovering them
    // one at a time. Three from different modules, so a message that happened
    // to mention one module would not satisfy this.
    for (const perm of ['document_control:create', 'document_control:update', 'capa:create']) {
      expect(message, `names ${perm}`).toContain(perm)
    }
    // …and does not claim intAdmin is missing the one thing it does hold.
    expect(message, 'document_control:read is held, so it is not an offender').not.toMatch(
      /document_control:read[,.]/,
    )

    expect(
      sqlValue(
        `SELECT count(*) FROM users WHERE company_id = '${COMPANY_ID}' AND first_name = '${name}'`,
      ),
      'nothing was created — the guard runs before the insert',
    ).toBe('0')
  })

  test('DOOR 1 CONTROL · create with exactly the caller’s own grants → 201', async ({
    request,
  }) => {
    // The accept half. Without it, a guard that refused everything — a broken
    // query, an empty `held` map — would look identical to a correct one.
    const account = owned.track(
      (await createAccount(request, { label: 'a8-accepted', roleIds: [ROLE_INTEGRATION_ADMIN] }))
        .id,
    )
    expect(
      sqlValue(
        `SELECT count(*) FROM roles_on_users WHERE user_id = '${account}' AND role_id = '${ROLE_INTEGRATION_ADMIN}'`,
      ),
      'the role really landed',
    ).toBe('1')
  })

  test('DOOR 1 · E2E Reviewer is REFUSED today — the role is no longer read-only', async ({
    request,
  }) => {
    // See this file's header. Asserted as it actually behaves, with the cause
    // pinned alongside, so a future narrowing of the seed's reviewer role turns
    // this red as a SIGNAL rather than leaving a quietly wrong comment behind.
    const { status, json } = await read(
      await request.post(SA_ROOT, {
        data: { name: saName('a8-refused-reviewer'), roleIds: [ROLE_REVIEWER] },
      }),
    )
    expect(status, 'E2E Reviewer now grants 18 permissions, not one').toBe(403)
    expect(errorMessage(json)).toContain('capa:update')

    // The cause, measured rather than asserted from memory: how many grants the
    // role actually carries. If this ever reads 1, the role has been narrowed
    // and the expectation above should be flipped to 201.
    const grants = Number(
      sqlValue(
        `SELECT count(*) FROM authz.role_module_permissions WHERE role_id = '${ROLE_REVIEWER}' AND company_id = '${COMPANY_ID}'`,
      ),
    )
    expect(grants, 'the reviewer role has accumulated grants across seed sections').toBeGreaterThan(
      1,
    )
  })

  test('DOOR 2 · PATCH roleIds is guarded too, and the account keeps its old roles', async ({
    request,
  }) => {
    // An account created innocuously and widened afterwards is the same
    // escalation with an extra step. Checking only at creation would leave it
    // wide open.
    const account = owned.track(
      (await createAccount(request, { label: 'a8-patch', roleIds: [ROLE_INTEGRATION_ADMIN] })).id,
    )

    const { status, json } = await read(
      await request.patch(`${SA_ROOT}/${account}`, { data: { roleIds: [ROLE_AUTHOR] } }),
    )
    expect(status, 'widening after the fact is the same escalation').toBe(403)
    expect(errorMessage(json)).toContain('cannot be granted permissions you do not hold yourself')

    // `syncRoles` REPLACES the role set, so a guard that ran after the write —
    // or inside a transaction that was not rolled back — would leave the
    // account with NEITHER role. Assert the original survived intact.
    expect(
      sqlValue(
        `SELECT string_agg(role_id::text, ',') FROM roles_on_users WHERE user_id = '${account}'`,
      ),
      'the refused PATCH changed nothing',
    ).toBe(ROLE_INTEGRATION_ADMIN)

    // And a PATCH the caller IS entitled to still works, so the 403 above is
    // about the roles rather than about PATCH being broken.
    const ok = await read(
      await request.patch(`${SA_ROOT}/${account}`, {
        data: { description: 'renamed by SA-API-8' },
      }),
    )
    expect(ok.status, 'an unprivileged field still updates').toBe(200)
  })

  test('DOOR 3 · issuing a key against an already-powerful account → 403', async ({
    playwright,
  }) => {
    // The door with no role change to notice. The fixture has to be built by
    // the OWNER, because intAdmin could not create it — which is the whole
    // premise: the powerful account already exists and was legitimate when it
    // was made.
    const ownerCtx = await playwright.request.newContext({ storageState: AUTH.owner })
    const powerful = owned.track(
      (await createAccount(ownerCtx, { label: 'a8-powerful', roleIds: [ROLE_AUTHOR] })).id,
    )

    const intAdminCtx = await playwright.request.newContext({ storageState: AUTH.intAdmin })
    const attempt = await read(
      await intAdminCtx.post(`${SA_ROOT}/${powerful}/keys`, {
        data: { name: 'SA-API-8 escalation attempt' },
      }),
    )
    expect(attempt.status, 'minting a key IS acquiring the account’s authority').toBe(403)
    expect(errorMessage(attempt.json)).toContain('cannot be granted permissions you do not hold')
    expect(errorMessage(attempt.json), 'the same offender list as the create door').toContain(
      'document_control:create',
    )

    expect(
      sqlValue(`SELECT count(*) FROM api_keys WHERE user_id = '${powerful}'`),
      'no credential was minted',
    ).toBe('0')

    // CONTROL A — the owner, who bypasses the guard, can issue against the same
    // account. Proves the refusal is the guard and not a broken route.
    const byOwner = await read(
      await ownerCtx.post(`${SA_ROOT}/${powerful}/keys`, { data: { name: 'SA-API-8 owner key' } }),
    )
    expect(byOwner.status, 'the owner has nothing to escalate to').toBe(201)

    // CONTROL B — intAdmin CAN issue against an account whose roles it holds.
    // Same caller, same route, same second; only the target account differs.
    const modest = owned.track(
      (await createAccount(intAdminCtx, { label: 'a8-modest', roleIds: [ROLE_INTEGRATION_ADMIN] }))
        .id,
    )
    const byIntAdmin = await read(
      await intAdminCtx.post(`${SA_ROOT}/${modest}/keys`, {
        data: { name: 'SA-API-8 modest key' },
      }),
    )
    expect(byIntAdmin.status, 'the guard is about the TARGET’s roles, not the caller').toBe(201)

    await intAdminCtx.dispose()
    await ownerCtx.dispose()
  })
})
