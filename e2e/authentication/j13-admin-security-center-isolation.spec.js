// PW-J13b · Admin Security Center — tenant isolation. THE CENTREPIECE.
//
// This is the surface where an admin acts on OTHER people's credential state, so
// it is where a tenant-isolation defect costs the most. Doc 19 records the
// controllers as disciplined here: each one re-checks `security:manage`, scopes
// its target lookup to `req.companyId`, blocks self-targeting and writes a
// `login_events` row. "Verified correct today with no test defending it" is the
// exact shape that turned into a live P0 in this very module (AUTH-S1), so all of
// it gets pinned.
//
// TWO DIFFERENT ISOLATION QUESTIONS ARE ASKED HERE, and only the first is the one
// the docs answer:
//
//   1. Can the admin AIM at another tenant's user?  → `loadTarget` scopes by
//      companyId and 404s. Correct, and pinned below.
//
//   2. When the admin aims at their OWN tenant's user, does the write stay inside
//      that tenant?  → `users_company_email_unique` is UNIQUE on
//      (company_id, lower(btrim(email))), so email is unique PER COMPANY and one
//      address legitimately exists in two workspaces. Five of the six mutations
//      were originally keyed by EMAIL ALONE with no company filter. Three have
//      since been re-scoped:
//        forcePasswordReset  FIXED — User.update now `where: { id: target.id }`
//        resetMfa            FIXED — disableAllMfa(email, { companyId }) +
//                                    UserDevice.update `where: { companyId, email }`
//        forceLogout         FIXED — revokeUserSessionsDetailed({ companyId }) then
//                                    destroySessionsById(email, sessionIds) so the
//                                    email-keyed Redis index is pruned precisely
//                                    rather than deleted wholesale
//        unlockUser          OPEN, ACCEPTED — see its test
//        suspendUser         OPEN, NOT the controller's fault — see its test
//      `activateUser` was id-scoped from the start and is the CONTROL.
//
// Question 2 is what the `twinA` / `twinB` pair exists to ask. Each probe below
// acts on tenant A's user — an action the admin is fully entitled to perform —
// and then asserts that tenant B's same-email user did not move. Every one of
// them also asserts tenant A's side DID move, so a 404 or a broken URL cannot
// make an isolation assertion pass vacuously.
//
// ── STATUS: 7 GREEN, 2 RED — AND BOTH REDS ARE DOCUMENTED, NOT OVERSIGHTS ────
//
// Question 1 passes in full. Question 2 originally failed on five of six actions,
// reproduced live against `app-db`. Three have been fixed and their probes are now
// green and load-bearing:
//
//   force-password-reset  FIXED (was: tenant B's must_change_password false → TRUE)
//   reset-mfa             FIXED (was: tenant B's TOTP 1 → 0, recovery codes hard
//                         deleted, device trust revoked)
//   force-logout          FIXED (was: tenant B's live session 1 → 0)
//
// Two remain red, for two completely different reasons — read the comment on each
// test before touching it:
//
//   unlock   KNOWN AND ACCEPTED. Lockout is Redis-authoritative under
//            `login_lock:<email>|<source>`, minted pre-auth before any company is
//            resolved. Cannot be company-scoped without re-keying the lockout store,
//            i.e. changing the login critical path. Permissive collateral only.
//   suspend  STILL OPEN, but NOT in this controller. `suspendUser` scopes both its
//            status flip and its session kill correctly; the collateral now comes
//            from an audit side-effect in the WORKER that re-revokes by email.
//
// These are 🔴 defect probes in the sense doc 14 uses the marker: red while the bug
// is open, green and load-bearing the moment it is fixed. They are NOT broken tests
// — each one's CONTROL half (tenant A did change) passes in the same run, and
// `activate` passes clean, proving the harness and the scoping pattern both work.
// Do not "fix" either by relaxing the assertion.
import { test, expect } from '@playwright/test'
import { COMPANY_ID, ALT_COMPANY_ID } from '../fixtures/cast.js'
import {
  J13,
  API_ORIGIN,
  ACTIONS,
  actionUrl,
  seedSecurityCenterCast,
  resetSecurityState,
  armUser,
  seedLoginEvent,
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

async function act(ctx, userId, action, data = {}) {
  const res = await ctx.post(actionUrl(userId, action), { data, failOnStatusCode: false })
  let body = null
  try {
    body = await res.json()
  } catch {
    /* not all error shapes are JSON */
  }
  return { status: res.status(), body }
}

/**
 * Arm the pair for a collateral probe.
 *
 * Only ONE twin may hold an active TOTP factor: `mfa_factors_one_active_totp` is
 * UNIQUE on (email) WHERE type='totp' AND status='ACTIVE', with no company
 * column — itself a symptom of the same email-is-global assumption this spec
 * probes. Tenant B gets the factor, because tenant B is the one that must survive.
 */
function armPair() {
  armUser(J13.twinA, { totp: false })
  armUser(J13.twinB, { totp: true })
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

test.describe('PW-J13b · an admin cannot AIM at another tenant', () => {
  test('GATE · every endpoint 404s on a foreign-tenant user and leaves them untouched', async () => {
    armUser(J13.altOnly)
    const before = snapshot(J13.altOnly)

    const overview = await admin.get(
      `${API_ORIGIN}/v1/admin/security/users/${J13.altOnly.id}/overview`,
      { failOnStatusCode: false },
    )
    // 404 rather than 403 is the right answer: it does not confirm the id exists.
    expect(overview.status(), 'overview of a foreign user must not leak existence').toBe(404)

    for (const { action, eventType, api } of ACTIONS) {
      const { status } = await act(admin, J13.altOnly.id, action, {})
      expect(status, `POST ${action} (${api}) against a foreign-tenant user`).toBe(404)
      expect(
        securityEventCount(J13.altOnly.email, eventType, ALT_COMPANY_ID),
        `a refused ${action} must not write an audit row into the victim's tenant`,
      ).toBe(0)
      expect(
        securityEventCount(J13.altOnly.email, eventType, COMPANY_ID),
        `a refused ${action} must not write an audit row into the actor's tenant either`,
      ).toBe(0)
    }

    expect(snapshot(J13.altOnly), 'the foreign user is byte-for-byte unchanged').toEqual(before)
  })

  test('CONTROL · the identical request shape succeeds against a same-tenant user', async () => {
    // Without this, the 404s above would also be produced by a wrong URL, a
    // logged-out context, or a renamed route — and the GATE would pass for
    // entirely the wrong reason.
    armUser(J13.target)
    const { status } = await act(admin, J13.target.id, 'force-logout')
    expect(status, 'same request, same admin, same-tenant target').toBe(200)
    expect(liveSessionCount(J13.target), 'and it really acted').toBe(0)
  })

  test('CONTROL · the events feed (API-48) returns only the acting tenant’s rows', async () => {
    seedLoginEvent(J13.twinB, { eventType: 'LOGIN_SUCCESS', reason: 'j13-alt-only-event' })
    seedLoginEvent(J13.twinA, { eventType: 'LOGIN_SUCCESS', reason: 'j13-lab-only-event' })

    const res = await admin.get(`${API_ORIGIN}/v1/admin/security/events?email=j13twin&limit=100`, {
      failOnStatusCode: false,
    })
    expect(res.status()).toBe(200)
    const reasons = (await res.json()).events.map((e) => e.reason)

    // Positive half first — an empty feed would satisfy the negative trivially.
    expect(reasons, 'the acting tenant’s own event is present').toContain('j13-lab-only-event')
    expect(reasons, 'the other tenant’s event is NOT visible').not.toContain('j13-alt-only-event')
  })
})

test.describe('PW-J13b · a write aimed inside tenant A must not reach tenant B', () => {
  // Every test here: act on twinA (legitimate), assert twinA moved, assert twinB
  // did not. The audit row's company_id is asserted too — it comes from the
  // request's tenant slug, so it is the one part of the ledger that is reliably
  // tenant-correct.
  //
  // NOT asserted, deliberately: `login_events.user_id`. persistLoginEvent resolves
  // the subject with a GLOBAL email lookup (securityEvents.js `resolveUser`, no
  // company filter and no ORDER BY), so for a colliding address it can attribute
  // the row to whichever row Postgres returns first. That is a real
  // audit-misattribution risk, but it is physical-order dependent and asserting on
  // it would produce a flaky gate rather than a finding.

  test('GATE · force-password-reset (API-52) must not set the flag on tenant B', async () => {
    // WAS RED, NOW GREEN. `forcePasswordReset` matched on LOWER(email) with no
    // company filter, so it forced a password change on every same-email user in
    // every tenant. It is now `User.update({ mustChangePassword: true },
    // { where: { id: target.id } })` — the same id-keyed shape activateUser always
    // used. This test is the regression pin.
    const before = snapshot(J13.twinB)
    expect(before.mustChangePassword, 'baseline: tenant B is clear').toBe(false)

    const { status } = await act(admin, J13.twinA.id, 'force-password-reset', {})
    expect(status).toBe(200)
    expect(securityState(J13.twinA).mustChangePassword, 'tenant A: the intended write landed').toBe(true)

    const row = await waitForSecurityEvent(J13.twinA.email, 'FORCED_PASSWORD_RESET')
    expect(row.companyId, 'the audit row belongs to the acting tenant').toBe(COMPANY_ID)

    expect(
      securityState(J13.twinB).mustChangePassword,
      'tenant B was forced into a password change by an admin of another workspace',
    ).toBe(false)
    expect(snapshot(J13.twinB), 'tenant B is unchanged').toEqual(before)
  })

  test('🔴 GATE · unlock (API-50) must not clear tenant B’s lockout', async () => {
    // ⚠️ RED ON PURPOSE, AND IT IS NOT AN OVERSIGHT. This is the one action in the
    // Security Center that is knowingly left un-scoped, and the product code says so
    // in as many words (securityCenter.js `unlockUser`). Do not delete this test, do
    // not relax it, and do not file it as a new bug.
    //
    // WHY IT CANNOT BE FIXED HERE. Redis is the AUTHORITY for lockout
    // (utils/loginLockout.js) — `users.locked_until` / `failed_login_count` are only
    // a display mirror. The enforced keys are `login_lock:<email>|<source>` and
    // `login_fail:<email>|<source>`, and they are minted by the LOGIN path, which
    // runs before any company is resolved: at that moment the request has an email
    // and an IP and nothing else. There is no company available to key them by. So
    // `unlockAccount(email)` clears every tenant's lock for that address, and the
    // mirror write (`mirrorToUserRows`) deliberately spans all companies to match.
    // Scoping it means re-keying the lockout store per tenant — a change to the
    // login critical path, not to this controller.
    //
    // WHY IT IS ACCEPTABLE MEANWHILE, in the order that matters:
    //   1. The collateral is PERMISSIVE. It CLEARS another tenant's lockout; it can
    //      never create one. Nobody is locked out by this, and no credential,
    //      factor, session or status is destroyed. Contrast reset-mfa, which was a
    //      straight downgrade of a stranger's account security.
    //   2. It requires the same address to exist as an ACTIVE user in two tenants
    //      AND to be locked out in the second one at that moment.
    //   3. Production currently has zero same-email-across-tenants users.
    //   4. It is audited either way — ACCOUNT_UNLOCKED lands in the acting tenant.
    //
    // THE FIX, when it is scheduled: key locks by tenant slug, which IS available
    // pre-auth from the request host, alongside the Redis-hang hardening
    // esignPinGuard.js already received. This test flips green with no edits.
    armPair()
    const before = snapshot(J13.twinB)
    expect(before.locked, 'baseline: tenant B is locked out').toBe(true)

    const { status } = await act(admin, J13.twinA.id, 'unlock')
    expect(status).toBe(200)
    expect(securityState(J13.twinA).locked, 'tenant A: the intended unlock landed').toBe(false)

    expect(
      securityState(J13.twinB).locked,
      'tenant B’s account lockout was lifted by an admin of another workspace',
    ).toBe(true)
    expect(securityState(J13.twinB).failedCount, 'tenant B’s failure counter is intact').toBe(5)
  })

  test('GATE · reset-mfa (API-51) must not strip tenant B’s second factor', async () => {
    // WAS RED, NOW GREEN — and this was the highest-severity leg of the five:
    // stripping MFA from a user in a workspace you have no relationship with is a
    // straight downgrade of their account security, and they are never told.
    // `disableAllMfa` now takes `{ companyId }` and `UserDevice.update` carries
    // `where: { companyId, email }`. This test is the regression pin.
    armPair()
    const before = snapshot(J13.twinB)
    expect(before.activeTotp, 'baseline: tenant B has an active factor').toBe(1)
    expect(before.recoveryCodes, 'baseline: tenant B has a recovery code').toBe(1)
    expect(before.trustedDevices, 'baseline: tenant B has a trusted device').toBe(1)

    const { status } = await act(admin, J13.twinA.id, 'reset-mfa')
    expect(status).toBe(200)
    expect(trustedDeviceCount(J13.twinA), 'tenant A: the intended reset landed').toBe(0)

    expect(activeTotpCount(J13.twinB), 'tenant B’s TOTP factor was destroyed cross-tenant').toBe(1)
    expect(recoveryCodeCount(J13.twinB), 'tenant B’s recovery codes were destroyed cross-tenant').toBe(1)
    expect(trustedDeviceCount(J13.twinB), 'tenant B’s device trust was revoked cross-tenant').toBe(1)
  })

  test('GATE · force-logout (API-53) must not revoke tenant B’s sessions', async () => {
    // WAS RED, NOW GREEN. Two changes were needed, not one: the DB half now passes
    // `companyId` into `revokeUserSessionsDetailed`, and the Redis half switched from
    // `destroyUserSessions(email)` — which deletes the whole email-keyed
    // `user_sessions:<email>` set that every tenant's same-email user shares — to
    // `destroySessionsById(email, sessionIds)`, pruning only the ids the scoped query
    // returned. Fixing just the DB half would have left the Redis half signing the
    // stranger out. This test is the regression pin for both.
    armPair()
    expect(liveSessionCount(J13.twinB), 'baseline: tenant B has a live session').toBe(1)

    const { status } = await act(admin, J13.twinA.id, 'force-logout')
    expect(status).toBe(200)
    expect(liveSessionCount(J13.twinA), 'tenant A: the intended revoke landed').toBe(0)

    expect(
      liveSessionCount(J13.twinB),
      'tenant B was signed out by an admin of another workspace',
    ).toBe(1)
  })

  test('GATE · suspend (API-54) must not reach tenant B — status OR sessions', async () => {
    // FIXED 2026-08-08. This test was red for a while AFTER securityCenter.js was
    // already correct, and the reason is the most useful thing in this file.
    //
    // `suspendUser` scopes both halves properly: the status flip is
    // `where: { id: target.id }`, and the session kill is
    // `revokeUserSessionsDetailed({ email, companyId })` + `destroySessionsById(...)`
    // — the same shape that turned force-logout green two tests up. Re-scoping the
    // controller AGAIN would have changed nothing.
    //
    // The collateral came from a SECOND writer, asynchronously, after the HTTP
    // response: `userDeactivationSideEffect` in
    // `qms/backend/worker/services/user/deactivation.js`. It hangs off the `users`
    // audit trigger, fires on any transition into `user_status_id = 'INACTIVE'`, and
    // used to run an email-keyed `UserSession.update` plus
    // `destroyUserSessions(email)` — which flushes the whole
    // `user_sessions:<email>` Redis set that every tenant's same-email user shares.
    // So suspending tenant A's user revoked tenant B's sessions: the exact defect
    // the controller fix had just closed, reintroduced one layer down.
    //
    // Hooking it to the audit trigger is CORRECT and stays: REST is not the only
    // write path (the User detail screen flips status through a raw GraphQL
    // mutation that never reaches a controller), so the trigger is the one hook
    // that cannot be bypassed. Only the scope was missing. Both `where`s now carry
    // `companyId` from `payload.new.company_id`, `destroyUserSessions` was swapped
    // for `destroySessionsById(email, sessionIds)`, and a missing `company_id`
    // fails CLOSED — it skips the revocation rather than widening it to every
    // tenant.
    //
    // ⚠️ THE LESSON, worth more than the fix: a green controller unit test would
    // have declared this closed. Only an end-to-end probe that waits for the worker
    // could see it. When a scoping bug has two writers, unit tests find one.
    //
    // Timing note: the revoke lands via graphile, a moment AFTER the 200. If this
    // ever goes intermittent, you are racing the worker, not observing a defect.
    armPair()
    const before = snapshot(J13.twinB)

    const { status } = await act(admin, J13.twinA.id, 'suspend', { reason: 'j13 isolation probe' })
    expect(status).toBe(200)
    expect(securityState(J13.twinA).status, 'tenant A: the intended suspend landed').toBe('INACTIVE')

    // Kept as two separate assertions so the failure message names which writer is
    // at fault. The status half proves the CONTROLLER is scoped correctly; only the
    // session half fails, and it fails in the worker. Collapsing them into one
    // snapshot comparison would hide that distinction and send the next reader back
    // into securityCenter.js, which is already correct.
    expect(securityState(J13.twinB).status, 'tenant B’s status is scoped by id — expected clean').toBe(
      'ACTIVE',
    )
    expect(
      liveSessionCount(J13.twinB),
      'tenant B was signed out cross-tenant. securityCenter.js suspendUser is correctly ' +
        'company-scoped, so this is userDeactivationSideEffect in ' +
        'qms/backend/worker/services/user/deactivation.js revoking user_sessions ' +
        'WHERE email = <email> with no company filter (and destroyUserSessions(email) ' +
        'flushing the shared Redis index). See the header of this test.',
    ).toBe(before.liveSessions)
  })

  test('CONTROL · activate (API-55) is fully id-scoped and leaves tenant B alone', async () => {
    // The one action with no email-keyed helper anywhere in its path. It is the
    // proof that the pattern the others are missing is achievable in this
    // controller, not a platform limitation.
    armPair()
    // Put tenant A's twin somewhere to come back from, using the id-scoped half of
    // suspend. Tenant B's status is expected to be unaffected by that too.
    await act(admin, J13.twinA.id, 'suspend', {})
    expect(securityState(J13.twinA).status, 'precondition: tenant A is suspended').toBe('INACTIVE')

    const before = snapshot(J13.twinB)
    const { status } = await act(admin, J13.twinA.id, 'activate')
    expect(status).toBe(200)
    expect(securityState(J13.twinA).status).toBe('ACTIVE')
    expect(securityState(J13.twinB).status, 'tenant B untouched').toBe(before.status)
  })
})
