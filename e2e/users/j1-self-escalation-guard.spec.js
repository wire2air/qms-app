// USER-J1 — The `users` security field guard. GREEN — and it must stay green.
//
// This spec has the opposite polarity from the sites/departments ones. Those
// are written to fail against a defect that is still open. This one guards a
// defect that has been FIXED, and every assertion here is a live
// privilege-escalation attempt that must be refused. A red test in this file is
// not a documentation gap — it means the hole is open again.
//
// WHAT WAS WRONG. `users_upd` ends with an unrestricted self branch:
//
//     OR (id = authz.current_user_id())
//
// RLS gates the row, not the columns. app_user holds UPDATE on all 32 columns
// of `users` including is_owner, the only trigger was the audit trigger, and
// PostGraphile exposes isOwner/password/esignPinHash/companyId in UserPatch. So
// any authenticated member could escalate themselves to company owner with one
// mutation against the app's own authoritative write path — verified live
// against a user holding zero role grants before the fix landed.
//
// `authz.current_is_owner()` is the first short-circuit in every RLS policy in
// the schema, and the frontend's isAllowed() short-circuits on it too, so that
// one column is total tenant control.
//
// WHY THE POLICY WAS NOT SIMPLY TIGHTENED. The self branch is load-bearing:
// /profile persists through the syncEngine (PersonalProfile.vue `user.save()`),
// so users genuinely do update their own row over GraphQL. The fix
// (migration 20260728090000) is a field guard that splits the columns into two
// tiers instead — and the CONTROL tests below are what prove it kept the
// legitimate paths working, which is the half a security fix usually breaks.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH, USERS, SITES, ALT_COMPANY_ID } from '../fixtures/cast.js'
import { graphql } from '../fixtures/sites.js'
import { sql, sqlValue } from '../fixtures/db.js'

const API = 'http://e2elab.localhost:4000'
const PATCH_USER = `
  mutation PatchUser($input: UpdateUserInput!) {
    updateUser(input: $input) { user { id } }
  }`

/** Attempt a patch; returns true when the server refused it. */
async function refused(ctx, id, patch) {
  const { errors } = await graphql(ctx, PATCH_USER, { input: { id, patch } })
  return errors !== null && errors !== undefined
}

function ownerFlag(id) {
  return sqlValue(`SELECT is_owner FROM users WHERE id = '${id}'`)
}

test.describe('USER-J1 · a member cannot rewrite their own security columns', () => {
  const self = USERS.noAccess.id

  test.afterAll(() => {
    // Belt and braces. If a guard ever regresses mid-run, the fixture tenant
    // must not be left with an extra owner for the following suites.
    sql(`UPDATE users SET is_owner = false WHERE id = '${self}'`)
  })

  test('PRECONDITION · the actor holds nothing, and the self branch still exists', () => {
    expect(
      Number(sqlValue(`SELECT count(*) FROM roles_on_users WHERE user_id = '${self}'`)),
      'the probe actor has no roles at all',
    ).toBe(0)

    // The guard is a trigger, not a policy rewrite — the permissive self branch
    // is still in `users_upd`. Asserting that keeps the test honest about WHAT
    // is protecting the table: if someone later removes the trigger believing
    // the policy covers it, this file goes red for the right reason.
    expect(
      sqlValue(`SELECT qual FROM pg_policies WHERE tablename = 'users' AND policyname = 'users_upd'`),
      'users_upd still carries the unrestricted self branch',
    ).toContain('id = authz.current_user_id()')

    expect(
      sqlValue(`SELECT count(*) FROM pg_trigger
                 WHERE tgrelid = 'users'::regclass AND tgname = 'users_security_field_guard'`),
      'the field guard is installed',
    ).toBe('1')
  })

  test('🛡 cannot make themselves the company owner', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: AUTH.noAccess })
    expect(await refused(ctx, self, { isOwner: true }), 'isOwner must be refused').toBe(true)
    expect(ownerFlag(self), 'and the column is untouched').toBe('f')
    await ctx.close()
  })

  test('🛡 cannot rewrite their own credentials or e-sign PIN hash', async ({ browser }) => {
    // esign_pin_hash is the Part-11 signature verifier. Being able to set it
    // means being able to produce signatures the system accepts as yours —
    // or, given the shared-hash seed, as anyone else's.
    // Every value here must DIFFER from what the row already holds. The guard
    // compares with IS DISTINCT FROM, so a patch that sets a column to the value
    // it already has is a no-op and is correctly allowed through — asserting
    // against one proves nothing about the guard. (Both of these were written
    // as no-ops first and passed straight through.)
    const ctx = await browser.newContext({ storageState: AUTH.noAccess })
    expect(await refused(ctx, self, { password: 'x' }), 'password').toBe(true)
    expect(await refused(ctx, self, { esignPinHash: 'x' }), 'esignPinHash').toBe(true)
    expect(await refused(ctx, self, { mustChangePassword: true }), 'mustChangePassword').toBe(true)
    expect(await refused(ctx, self, { lockedUntil: '2030-01-01T00:00:00Z' }), 'lockedUntil').toBe(true)
    await ctx.close()
  })

  test('🛡 cannot move themselves into another tenant', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: AUTH.noAccess })
    expect(await refused(ctx, self, { companyId: ALT_COMPANY_ID }), 'companyId').toBe(true)
    expect(await refused(ctx, self, { kind: 'EXTERNAL_SUPPLIER' }), 'kind').toBe(true)
    await ctx.close()
  })

  test('🛡 cannot self-assign placement or status (admin-only tier)', async ({ browser }) => {
    // Not a credential, but still an authorization input: site and department
    // are what site/department-scoped grants are evaluated against, so
    // self-service placement is self-service scope.
    const ctx = await browser.newContext({ storageState: AUTH.noAccess })
    expect(await refused(ctx, self, { siteId: SITES.secondary.id }), 'siteId').toBe(true)
    // INACTIVE, not ACTIVE — the row is already ACTIVE, so patching it to
    // ACTIVE is a no-op the guard rightly ignores (see the credentials test).
    expect(await refused(ctx, self, { userStatusId: 'INACTIVE' }), 'userStatusId').toBe(true)
    await ctx.close()
  })

  test('CONTROL · /profile still works — the guard did not lock users out', async ({ browser }) => {
    // The half a fix like this usually breaks. PersonalProfile.vue edits these
    // through the same mutation the attacks above used.
    const ctx = await browser.newContext({ storageState: AUTH.noAccess })
    expect(await refused(ctx, self, { firstName: 'Noah' }), 'firstName').toBe(false)
    expect(await refused(ctx, self, { color: '#123456' }), 'color').toBe(false)
    expect(await refused(ctx, self, { timeZone: 'America/New_York' }), 'timeZone').toBe(false)
    expect(await refused(ctx, self, { jobTitle: 'No Access' }), 'jobTitle').toBe(false)
    await ctx.close()
  })

  test('CONTROL · an administrator can still place and status a user', async ({ browser }) => {
    const target = USERS.siteRoamer.id
    const ctx = await browser.newContext({ storageState: AUTH.owner })
    try {
      expect(await refused(ctx, target, { siteId: SITES.secondary.id }), 'siteId').toBe(false)
      expect(await refused(ctx, target, { userStatusId: 'ACTIVE' }), 'userStatusId').toBe(false)
      expect(sqlValue(`SELECT site_id FROM users WHERE id = '${target}'`)).toBe(SITES.secondary.id)
    } finally {
      await ctx.close()
      sql(`UPDATE users SET site_id = '${SITES.primary.id}',
             department_id = 'e2e7d000-0000-4000-8000-000000000001' WHERE id = '${target}'`)
    }
  })

  test('CONTROL · not even an owner can grant ownership through a mutation', async ({ browser }) => {
    // Tier A applies to everyone, deliberately. There is no UI that binds
    // is_owner, and ownership transfer should be an explicit administrative
    // action rather than a patch field on a general-purpose user mutation.
    const ctx = await browser.newContext({ storageState: AUTH.owner })
    expect(await refused(ctx, USERS.siteRoamer.id, { isOwner: true }), 'owner→isOwner').toBe(true)
    expect(ownerFlag(USERS.siteRoamer.id)).toBe('f')
    await ctx.close()
  })

  test('CONTROL · the REST path is still trusted', async ({ browser }) => {
    // The guard treats REST as trusted (it runs as the superuser, and carries
    // app.user_security_context for the REST_RLS_ENABLED=true case). If that
    // marker were wrong, permission-gated admin updates would start failing
    // here rather than at the GraphQL layer.
    const ctx = await browser.newContext({ storageState: AUTH.owner })
    const res = await ctx.request.put(`${API}/v1/services/users/${USERS.siteRoamer.id}`, {
      data: { jobTitle: 'Site-Scoped NCR User' },
    })
    expect([200, 201], `REST update should succeed, got ${res.status()}`).toContain(res.status())
    await ctx.close()
  })
})
