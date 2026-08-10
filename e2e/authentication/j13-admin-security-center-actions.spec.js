// PW-J13a · Admin Security Center — the six per-user actions do what they claim.
//
// R20 in the traceability matrix, TC-16 in the manual QA guide, and the single
// largest UNSPECIFIED gap in this module: the Security Center's 8 endpoints
// (API-48…55) were absent from doc 14's twelve journeys entirely, not merely
// unbuilt. This file and its sibling `-isolation` spec are that journey.
//
// WHAT MAKES THIS SURFACE DIFFERENT from the rest of the module: 47 of the
// module's 58 endpoints are self-service over the caller's own credentials, so
// their authorisation story is identity scoping. These 8 are the opposite — one
// person acting on ANOTHER person's credential state — and they are the only
// block in the module governed by a real permission string (`security:manage`).
//
// EVERY ACTION IS ASSERTED AT THE DATABASE, never on the 200 alone. An admin
// action that answers `{ suspended: true }` and writes nothing is precisely the
// defect class this programme keeps finding, and a status code cannot tell the
// difference.
//
// The actor is `j13admin@e2e.test`, a NON-OWNER holding `security:manage` and
// nothing else. That is deliberate: owners short-circuit the check at
// securityCenter.js:21 and never reach the permission lookup, so running these as
// `owner@e2e.test` would assert nothing whatsoever about the grant.
import { test, expect, request } from '@playwright/test'
import { AUTH, COMPANY_ID } from '../fixtures/cast.js'
import {
  J13,
  API_ORIGIN,
  ACTIONS,
  actionUrl,
  seedSecurityCenterCast,
  resetSecurityState,
  armUser,
  adminContext,
  securityState,
  liveSessionCount,
  trustedDeviceCount,
  activeTotpCount,
  recoveryCodeCount,
  snapshot,
  waitForSecurityEvent,
  securityEventCount,
} from '../fixtures/authAdmin.js'

/** POST one Security Center action as the admin. Returns `{ status, body }`. */
async function act(ctx, userId, action, data = {}) {
  const res = await ctx.post(actionUrl(userId, action), { data, failOnStatusCode: false })
  let body = null
  try {
    body = await res.json()
  } catch {
    /* a 403 from the permission layer may not be JSON */
  }
  return { status: res.status(), body }
}

/**
 * Assert the audit row every action is contractually required to write
 * (08-api-mapping: "every action here writes a TBL-04 login_events row with
 * actorEmail = the admin and email = the target").
 *
 * Polled, because recordSecurityEvent is fire-and-forget and can land after the
 * HTTP response.
 */
async function expectAuditRow(eventType, target) {
  const row = await waitForSecurityEvent(target.email, eventType)
  expect(row.companyId, `${eventType} audit row is filed under the acting tenant`).toBe(COMPANY_ID)
  expect(row.actorUserId, `${eventType} audit row names the admin as actor`).toBe(J13.admin.id)
  expect(row.userId, `${eventType} audit row names the target as subject`).toBe(target.id)
  expect(row.outcome).toBe('INFO')
  return row
}

let admin

test.beforeAll(async () => {
  seedSecurityCenterCast()
  admin = await adminContext()
})
test.afterAll(async () => {
  await admin?.dispose()
  resetSecurityState()
})
test.beforeEach(() => resetSecurityState())

test.describe('PW-J13a · the six admin actions land in the database', () => {
  // ── The CONTROL that protects every GATE below ────────────────────────────
  //
  // Without this, a typo in the URL would give 404 on every action and the
  // "cross-tenant target is refused" assertions in the sibling spec would pass
  // for entirely the wrong reason.
  test('CONTROL · the read views answer for a same-tenant user (the routes are live)', async () => {
    const overview = await admin.get(
      `${API_ORIGIN}/v1/admin/security/users/${J13.target.id}/overview`,
      { failOnStatusCode: false },
    )
    expect(overview.status(), 'GET overview (API-49)').toBe(200)
    const body = await overview.json()
    expect(body.user.id, 'overview resolves the requested user').toBe(J13.target.id)
    expect(body.user.email).toBe(J13.target.email)
    expect(body.security, 'overview carries the security block').toBeTruthy()

    const events = await admin.get(`${API_ORIGIN}/v1/admin/security/events?limit=5`, {
      failOnStatusCode: false,
    })
    expect(events.status(), 'GET events (API-48)').toBe(200)
    expect((await events.json()).pagination, 'events feed is paginated').toBeTruthy()
  })

  test('GATE · unlock (API-50) clears the lock mirror and audits ACCOUNT_UNLOCKED', async () => {
    armUser(J13.target)
    expect(securityState(J13.target).locked, 'baseline: target is locked').toBe(true)

    const { status, body } = await act(admin, J13.target.id, 'unlock')
    expect(status).toBe(200)
    expect(body.unlocked).toBe(true)

    // The DB columns are a mirror of the Redis authority (loginLockout.js:6-9),
    // but they are what the Security Center's own overview reads back, so a stale
    // mirror is a user-visible defect in its own right.
    const after = securityState(J13.target)
    expect(after.locked, 'locked_until cleared').toBe(false)
    expect(after.failedCount, 'failed_login_count reset').toBe(0)

    await expectAuditRow('ACCOUNT_UNLOCKED', J13.target)
  })

  test('GATE · reset-mfa (API-51) destroys factors, recovery codes AND device trust', async () => {
    armUser(J13.target)
    expect(activeTotpCount(J13.target), 'baseline: an active factor exists').toBe(1)
    expect(recoveryCodeCount(J13.target), 'baseline: a recovery code exists').toBe(1)
    expect(trustedDeviceCount(J13.target), 'baseline: a trusted device exists').toBe(1)

    const { status, body } = await act(admin, J13.target.id, 'reset-mfa')
    expect(status).toBe(200)
    expect(body.mfaReset).toBe(true)

    expect(activeTotpCount(J13.target), 'TOTP factor gone').toBe(0)
    expect(recoveryCodeCount(J13.target), 'recovery codes purged').toBe(0)
    // Device trust is the leg most likely to be dropped by a refactor: it lives in
    // the controller (securityCenter.js:75-78), not in disableAllMfa, so nothing
    // else in the codebase would notice its removal.
    expect(trustedDeviceCount(J13.target), 'device trust revoked so re-enrolment starts clean').toBe(0)

    await expectAuditRow('MFA_RESET_BY_ADMIN', J13.target)
  })

  test('GATE · force-password-reset (API-52) sets mustChangePassword', async () => {
    expect(securityState(J13.target).mustChangePassword, 'baseline: flag is clear').toBe(false)

    const { status, body } = await act(admin, J13.target.id, 'force-password-reset', {})
    expect(status).toBe(200)
    expect(body.forced).toBe(true)

    expect(
      securityState(J13.target).mustChangePassword,
      'must_change_password set — this is what routes the next login to ForcePasswordChangeForm',
    ).toBe(true)

    await expectAuditRow('FORCED_PASSWORD_RESET', J13.target)
  })

  test('GATE · force-logout (API-53) revokes every live session', async () => {
    armUser(J13.target)
    expect(liveSessionCount(J13.target), 'baseline: one live session').toBe(1)

    const { status, body } = await act(admin, J13.target.id, 'force-logout')
    expect(status).toBe(200)
    expect(body.revoked, 'the response reports how many sessions it revoked').toBeGreaterThanOrEqual(1)

    expect(liveSessionCount(J13.target), 'no live session survives').toBe(0)

    await expectAuditRow('FORCED_LOGOUT', J13.target)
  })

  test('GATE · suspend (API-54) flips the user INACTIVE and kills their sessions', async () => {
    armUser(J13.target)
    expect(securityState(J13.target).status, 'baseline: ACTIVE').toBe('ACTIVE')
    expect(liveSessionCount(J13.target)).toBe(1)

    const { status, body } = await act(admin, J13.target.id, 'suspend', { reason: 'j13 probe' })
    expect(status).toBe(200)
    expect(body.suspended).toBe(true)

    expect(securityState(J13.target).status, 'user_status_id = INACTIVE').toBe('INACTIVE')
    // suspendUser() calls revokeUserSessions + destroyUserSessions explicitly
    // BECAUSE the status flip alone does not end a live session — that gap is the
    // root of the Users-pack finding USER-J6 (07-state-machine.md:77). If this
    // assertion ever goes red, suspension has silently become cosmetic.
    expect(liveSessionCount(J13.target), 'suspension takes effect immediately').toBe(0)

    const row = await expectAuditRow('USER_SUSPENDED', J13.target)
    expect(row.reason, 'the caller-supplied reason is recorded').toBe('j13 probe')
  })

  test('GATE · activate (API-55) restores ACTIVE', async () => {
    await act(admin, J13.target.id, 'suspend', {})
    expect(securityState(J13.target).status, 'precondition: suspended').toBe('INACTIVE')

    const { status, body } = await act(admin, J13.target.id, 'activate')
    expect(status).toBe(200)
    expect(body.activated).toBe(true)

    expect(securityState(J13.target).status, 'user_status_id = ACTIVE').toBe('ACTIVE')
    await expectAuditRow('USER_ACTIVATED', J13.target)
  })
})

test.describe('PW-J13a · the security:manage gate', () => {
  // `reviewer@e2e.test` is a deliberate choice: it is a fully provisioned persona
  // with a role, so a 403 here means "this grant is missing", not "this user has
  // no roles at all". NB `author@e2e.test` would be WRONG for this probe — the
  // e2e seed grants security:manage to role e2e30000-…0001, which is the E2E
  // Author role despite the seed comment calling it the Owner role.
  test('GATE · a user without security:manage is refused on all 8 endpoints and writes nothing', async () => {
    armUser(J13.target)
    const before = snapshot(J13.target)

    const ctx = await request.newContext({ baseURL: API_ORIGIN, storageState: AUTH.reviewer })
    try {
      const overview = await ctx.get(
        `${API_ORIGIN}/v1/admin/security/users/${J13.target.id}/overview`,
        { failOnStatusCode: false },
      )
      expect(overview.status(), 'GET overview without the grant').toBe(403)

      const events = await ctx.get(`${API_ORIGIN}/v1/admin/security/events`, {
        failOnStatusCode: false,
      })
      expect(events.status(), 'GET events without the grant').toBe(403)

      for (const { action, eventType, api } of ACTIONS) {
        const res = await ctx.post(actionUrl(J13.target.id, action), {
          data: {},
          failOnStatusCode: false,
        })
        expect(res.status(), `POST ${action} (${api}) without the grant`).toBe(403)
        expect(
          securityEventCount(J13.target.email, eventType, COMPANY_ID),
          `a refused ${action} must not write an audit row`,
        ).toBe(0)
      }
    } finally {
      await ctx.dispose()
    }

    // The point of the whole test: a 403 that still mutated would be far worse
    // than a 200 that did.
    expect(snapshot(J13.target), 'nothing about the target moved').toEqual(before)
  })
})

test.describe('PW-J13a · self-targeting', () => {
  test('GATE · force-logout and suspend refuse a self-target, and the admin is untouched', async () => {
    const before = snapshot(J13.admin)

    const logout = await act(admin, J13.admin.id, 'force-logout')
    expect(logout.status, 'force-logout on self (securityCenter.js:119-121)').toBe(400)

    const suspend = await act(admin, J13.admin.id, 'suspend', {})
    expect(suspend.status, 'suspend on self (securityCenter.js:141-143)').toBe(400)

    expect(snapshot(J13.admin), 'the admin locked neither themselves out nor away').toEqual(before)
    expect(securityEventCount(J13.admin.email, 'FORCED_LOGOUT', COMPANY_ID)).toBe(0)
    expect(securityEventCount(J13.admin.email, 'USER_SUSPENDED', COMPANY_ID)).toBe(0)
  })

  // ── DIVERGENCE, pinned deliberately ───────────────────────────────────────
  //
  // 04-user-journeys (J-16) and 12-manual-qa-guide (TC-16) both state that
  // self-targeting is "blocked on all but reactivate". The SOURCE blocks it on
  // exactly two actions — forceLogout and suspendUser. unlock, reset-mfa and
  // force-password-reset carry no isSelf() check at all.
  //
  // This test asserts the behaviour the code actually has, so the suite stays
  // honest, and names the divergence so nobody reads green as agreement with the
  // docs. The reset-mfa leg is the one with security weight: `mfa/disable`
  // requires re-authentication (PW-J8), but a `security:manage` holder can strip
  // their OWN factor here with no re-auth at all.
  test('DIVERGENCE · unlock / reset-mfa / force-password-reset do NOT block self-targeting', async () => {
    for (const action of ['unlock', 'reset-mfa', 'force-password-reset']) {
      const { status } = await act(admin, J13.admin.id, action, {})
      expect(
        status,
        `${action} on self is ACCEPTED — docs 04/12 claim it is blocked; securityCenter.js has no isSelf() guard on it`,
      ).toBe(200)
    }

    // Not a no-op: the self-targeted write really lands.
    expect(
      securityState(J13.admin).mustChangePassword,
      'the admin really did force a password change on themselves',
    ).toBe(true)

    // Leave the actor usable for any later spec in the file.
    resetSecurityState()
  })
})
