// ROLE-J2 — 🛡 Escalation PATH A: "can onboard people" must not mean "can
// promote myself". GREEN, and it must stay green.
//
// This spec has the same polarity as USER-J1: it guards a defect that has been
// FIXED, and every assertion is a live privilege-escalation attempt that must be
// refused. A red test here is not a documentation gap — it means the hole is
// open again.
//
// WHAT WAS WRONG, verified live against app-db before 2026-07-28:
//
//     persona: user_management:create ("may onboard people")
//     has_permission('sites','delete')                     → false
//     INSERT INTO roles_on_users (self, <the admin role>)   → INSERT 0 1
//     has_permission('sites','delete')                     → true
//
// One statement, no role_permission_management grant of any kind, and the
// reconnaissance was free because GET /v1/services/roles is ungated — every role
// id, including the powerful one, was one request away.
//
// WHY THIS EXISTS WHEN THE INTEGRATION SUITE ALREADY COVERS IT.
// backend/api/tests/integration/authz/role-assignment-escalation.test.js pins
// the same invariant against a synthetic tenant it builds itself. It is the
// better test of the POLICY. It is not a test of the PRODUCT, and the two differ
// in ways that have mattered here before:
//
//   • it INSERTs with a hand-written statement; the SPA writes through
//     PostGraphile, as `app_user`, with the session GUCs the API sets from a
//     real cookie. A guard that depends on how the session is established would
//     pass there and fail here.
//   • it never asks whether the attacker can obtain the role ID. Here they do it
//     the way an attacker would — from the app, with their own session.
//   • it cannot see that the write path the SPA uses is GraphQL and NOT the
//     REST endpoint. That mismatch is the reason the escalation existed: the
//     correctly-gated REST route has zero frontend callers, so gating it
//     protected nothing.
//
// The attack is issued against the REAL mutation the syncEngine emits
// (`createRolesOnUser`), from a REAL authenticated browser context.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH, USERS, ROLES, COMPANY_ID, PRIZE_CAPABILITY } from '../fixtures/cast.js'
import { graphql, expectMutationExists } from '../fixtures/sites.js'
import { sqlValue } from '../fixtures/db.js'
// The API's own origin, overridable via E2E_API_ORIGIN. It must be the TENANT
// host and not `localhost:4000` — a browser context matches cookies by URL host,
// so a storageState cookie scoped to `e2elab.localhost` is simply not sent to
// `localhost` and the request arrives unauthenticated. See the note on the
// export itself.
import { API_ORIGIN } from '../fixtures/authentication.js'
import {
  assignmentCount,
  hasCapabilityInDb,
  canAssignRoleInDb,
  restoreRolesFixtures,
} from '../fixtures/roles.js'

const CREATE_ROLE_ON_USER = `
  mutation Assign($input: CreateRolesOnUserInput!) {
    createRolesOnUser(input: $input) { rolesOnUser { id userId roleId } }
  }`

function assignInput(userId, roleId) {
  const now = new Date().toISOString()
  return {
    input: { rolesOnUser: { userId, roleId, companyId: COMPANY_ID, createdAt: now, updatedAt: now } },
  }
}

/** Attempt the assignment through the app's own write path. True = refused. */
async function refused(ctx, userId, roleId) {
  const { errors } = await graphql(ctx, CREATE_ROLE_ON_USER, assignInput(userId, roleId))
  return errors !== null && errors !== undefined
}

test.describe('ROLE-J2 · user_management alone cannot grant a role', () => {
  // Restored BEFORE each test as well as after the file, which is what makes
  // this spec independent of run order. Every assertion below rests on "the
  // prize is held by nobody at rest", and the two CONTROL tests deliberately
  // break that state to prove the positive half. They put it back in their own
  // `finally`, but a crash between the grant and the cleanup would otherwise
  // arm the next test — or the next FILE — with a premise that is quietly
  // false, and a self-assignment probe against an already-held role passes for
  // the wrong reason. (Same shape as ROLE-J3 and ROLE-J5.)
  test.beforeEach(() => restoreRolesFixtures())
  test.afterAll(() => restoreRolesFixtures())

  test('PRECONDITION · the actor holds the escalation permission and nothing more', async ({
    browser,
  }) => {
    // The premise is an ABSENCE, so assert the absence rather than trusting the
    // seed comment. If a later pass "helpfully" adds an rpm grant to this
    // persona, every assertion below would pass while testing nothing.
    for (const key of ['umCreator', 'umUpdater']) {
      const perms = sqlValue(
        `SELECT array_to_string(authz.effective_permission_strings('${USERS[key].id}', '${COMPANY_ID}'), ' ')`,
      )
      expect(perms, `${key} holds a user_management grant`).toContain('user_management:')
      expect(perms, `${key} holds NO role_permission_management grant — the whole premise`).not.toContain(
        'role_permission_management',
      )
      expect(
        sqlValue(`SELECT is_owner FROM users WHERE id = '${USERS[key].id}'`),
        `${key} is not an owner`,
      ).toBe('f')
    }

    // The prize is worth stealing and is held by nobody at rest.
    expect(
      Number(
        sqlValue(`SELECT count(*) FROM authz.role_module_permissions
                   WHERE role_id = '${ROLES.prize.id}'
                     AND module_id = '${PRIZE_CAPABILITY.module}'
                     AND action_id = '${PRIZE_CAPABILITY.action}'`),
      ),
      'the prize role really carries the capability',
    ).toBe(1)
    expect(assignmentCount(USERS.umCreator.id, ROLES.prize.id)).toBe(0)

    // A denial probe against a mutation that does not exist passes for free.
    const ctx = await browser.newContext({ storageState: AUTH.umCreator })
    await expectMutationExists(ctx, 'createRolesOnUser')
    await ctx.close()
  })

  test('🛡 reconnaissance is no longer free — the role catalog is gated', async ({ browser }) => {
    // Not the vulnerability itself, but what made it trivially exploitable:
    // `GET /v1/services/roles` was ungated, so every role id — including the
    // powerful one — was one request away for any authenticated session. Doc 20
    // called this out as item 1, "the authorization model is readable by any
    // session", and it has since been closed.
    //
    // Asserted in BOTH directions. A gate that returns 403 to everybody would
    // satisfy the denial half while breaking the Roles page itself, so the
    // control is not optional here — it is the half that proves the endpoint
    // still works for the person who is supposed to use it.
    for (const [key, expected] of [
      ['umCreator', 403],
      ['noAccess', 403],
      ['roleAdmin', 200],
    ]) {
      const ctx = await browser.newContext({ storageState: AUTH[key] })
      try {
        const res = await ctx.request.get(`${API_ORIGIN}/v1/services/roles`, {
          failOnStatusCode: false,
        })
        expect(res.status(), `${key} → GET /v1/services/roles`).toBe(expected)

        const text = await res.text()
        expect(
          text.includes(ROLES.prize.id),
          expected === 200
            ? 'the role administrator can still enumerate the catalog'
            : `${key} must not be handed the id of a role they cannot be granted`,
        ).toBe(expected === 200)
      } finally {
        await ctx.close()
      }
    }
  })

  test('🛡 user_management:create cannot self-assign a role', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: AUTH.umCreator })
    try {
      expect(
        await refused(ctx, USERS.umCreator.id, ROLES.prize.id),
        'self-assignment through the app\'s own write path must be refused',
      ).toBe(true)
      expect(assignmentCount(USERS.umCreator.id, ROLES.prize.id), 'no row was written').toBe(0)
    } finally {
      await ctx.close()
    }
  })

  test('🛡 nor assign it to somebody else', async ({ browser }) => {
    // Self-assignment is the sharpest framing but not the only one that matters.
    // Granting the prize to a confederate is the same escalation with one extra
    // step, and a guard that only compared `userId` to the caller would miss it.
    const ctx = await browser.newContext({ storageState: AUTH.umCreator })
    try {
      expect(await refused(ctx, USERS.noAccess.id, ROLES.prize.id), 'third-party grant').toBe(true)
      expect(assignmentCount(USERS.noAccess.id, ROLES.prize.id)).toBe(0)
    } finally {
      await ctx.close()
    }
  })

  test('🛡 user_management:update cannot either — the second wrong answer', async ({ browser }) => {
    // `update` was the user-detail page's gate for two cycles. If the policy is
    // ever loosened to match a UI gate rather than the other way round, this is
    // the assertion that catches it.
    const ctx = await browser.newContext({ storageState: AUTH.umUpdater })
    try {
      expect(await refused(ctx, USERS.umUpdater.id, ROLES.prize.id), 'self').toBe(true)
      expect(assignmentCount(USERS.umUpdater.id, ROLES.prize.id)).toBe(0)
    } finally {
      await ctx.close()
    }
  })

  test('🛡 END-TO-END · the capability is genuinely not inherited', async ({ browser }) => {
    // The assertion the whole file exists for. A rejected INSERT only proves the
    // INSERT failed; this proves the attacker's effective authority never moved,
    // which is the thing that was actually broken.
    const attacker = { id: USERS.umCreator.id, companyId: COMPANY_ID }
    expect(
      hasCapabilityInDb(attacker, PRIZE_CAPABILITY.module, PRIZE_CAPABILITY.action),
      'before: the attacker does not hold the prize capability',
    ).toBe(false)

    const ctx = await browser.newContext({ storageState: AUTH.umCreator })
    expect(await refused(ctx, USERS.umCreator.id, ROLES.prize.id)).toBe(true)
    await ctx.close()

    expect(
      hasCapabilityInDb(attacker, PRIZE_CAPABILITY.module, PRIZE_CAPABILITY.action),
      'after: still does not hold it',
    ).toBe(false)
  })

  test('CONTROL · the role administrator CAN assign the same role', async ({ browser }) => {
    // Without this the file is satisfied by a database that refuses everybody,
    // which is a broken product rather than a secure one. Same mutation, same
    // target, same role — only the grant differs.
    const ctx = await browser.newContext({ storageState: AUTH.roleAdmin })
    try {
      expect(
        await refused(ctx, USERS.noAccess.id, ROLES.prize.id),
        'roleAdmin holds rpm:update and must succeed',
      ).toBe(false)
      expect(assignmentCount(USERS.noAccess.id, ROLES.prize.id), 'the row is really there').toBe(1)

      // And the grant is live, not merely stored — the assignment moved real
      // authority, which is what makes the refusals above meaningful.
      expect(
        hasCapabilityInDb(
          { id: USERS.noAccess.id, companyId: COMPANY_ID },
          PRIZE_CAPABILITY.module,
          PRIZE_CAPABILITY.action,
        ),
        'the assigned role actually confers its capability',
      ).toBe(true)
    } finally {
      await ctx.close()
      restoreRolesFixtures()
    }
  })

  test('CONTROL · revoking is gated by the same permission, in both directions', async ({
    browser,
  }) => {
    // The half a fix like this usually breaks. Revocation is a soft delete — an
    // UPDATE — and the policy pair must agree: if granting needs rpm:update then
    // so does ungranting, or an onboarder could strip an administrator's roles.
    const ctx = await browser.newContext({ storageState: AUTH.roleAdmin })
    let assignmentId
    try {
      const { body } = await graphql(
        ctx,
        CREATE_ROLE_ON_USER,
        assignInput(USERS.noAccess.id, ROLES.prize.id),
      )
      assignmentId = body?.data?.createRolesOnUser?.rolesOnUser?.id
      expect(assignmentId, 'the control assignment was created').toBeTruthy()

      // umCreator cannot revoke it. The UPDATE policy matches no rows for them,
      // so this is a rowCount check, not a thrown error.
      const attacker = { id: USERS.umCreator.id, companyId: COMPANY_ID }
      expect(
        canAssignRoleInDb(attacker, { targetUserId: USERS.noAccess.id }),
        'umCreator still cannot write this pivot at all',
      ).toBe(false)

      // roleAdmin can — through the same path the UI uses (soft delete).
      const REVOKE = `
        mutation Revoke($input: UpdateRolesOnUserInput!) {
          updateRolesOnUser(input: $input) { rolesOnUser { id deletedAt } }
        }`
      const { errors } = await graphql(ctx, REVOKE, {
        input: { id: assignmentId, patch: { deletedAt: new Date().toISOString() } },
      })
      expect(errors, 'roleAdmin can revoke').toBeFalsy()
      expect(assignmentCount(USERS.noAccess.id, ROLES.prize.id), 'the grant is gone').toBe(0)
      expect(
        hasCapabilityInDb(
          { id: USERS.noAccess.id, companyId: COMPANY_ID },
          PRIZE_CAPABILITY.module,
          PRIZE_CAPABILITY.action,
        ),
        'and the capability went with it',
      ).toBe(false)
    } finally {
      await ctx.close()
      restoreRolesFixtures()
    }
  })
})
