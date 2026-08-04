// MS-J5…J9, J14 — the security surface this feature creates.
//
// `users_security_field_guard` (migration 20260728090000) classifies
// users.site_id as TIER B — "admins yes, self-only callers no" — because moving
// your own site placement widens your own site-scoped reach. Putting ADDITIONAL
// sites in a new table moves them out from behind that guard unless the RLS on
// user_sites reproduces the rule.
//
// If it doesn't, any authenticated member can run createUserSite for themselves
// against every site in the tenant. That is the same shape of escalation as the
// is_owner hole that guard exists to close, and it is created BY this feature —
// which is why these are the journeys to write first.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH, USERS, SITES, COMPANY_ID, ALT_COMPANY_ID } from '../fixtures/cast.js'
import { graphql, expectMutationExists } from '../fixtures/sites.js'
import { sql, sqlValue, waitForSqlValue } from '../fixtures/db.js'
import { ROAMER, assignSite, unassignSite, clearSites, additionalSiteIds } from './fixtures.js'

const CREATE_USER_SITE = `
  mutation ($userId: UUID!, $siteId: UUID!, $companyId: UUID!) {
    createUserSite(input: { userSite: { userId: $userId, siteId: $siteId, companyId: $companyId } }) {
      userSite { id }
    }
  }`

function liveAssignmentCount(userId, siteId) {
  return Number(
    sqlValue(
      `SELECT count(*) FROM user_sites WHERE user_id='${userId}' AND site_id='${siteId}' AND deleted_at IS NULL`,
    ),
  )
}

test.describe('MS · site assignment is an authority grant, not a preference', () => {
  test.beforeAll(() => clearSites(ROAMER))
  test.afterAll(() => clearSites(ROAMER))

  test('MS-J5 · 🔴 a member CANNOT grant themselves a site', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: AUTH.siteRoamer })
    await expectMutationExists(ctx, 'createUserSite')

    const { errors } = await graphql(ctx, CREATE_USER_SITE, {
      userId: ROAMER,
      siteId: SITES.secondary.id,
      companyId: COMPANY_ID,
    })
    await ctx.close()

    expect(errors, 'self-assignment must be rejected by RLS, not silently allowed').not.toBeNull()
    expect(
      liveAssignmentCount(ROAMER, SITES.secondary.id),
      'SELF-ESCALATION: the row must not exist. A member who can assign themselves a site can ' +
        'widen their own site-scoped reach across the whole tenant.',
    ).toBe(0)
  })

  test('MS-J5b · 🔴 a member cannot grant a site to SOMEONE ELSE either', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: AUTH.siteRoamer })
    const { errors } = await graphql(ctx, CREATE_USER_SITE, {
      userId: USERS.auditor.id,
      siteId: SITES.secondary.id,
      companyId: COMPANY_ID,
    })
    await ctx.close()

    expect(errors, 'assigning others requires user_management:update').not.toBeNull()
    expect(liveAssignmentCount(USERS.auditor.id, SITES.secondary.id)).toBe(0)
  })

  test('MS-J6 · 🔴 a cross-tenant site cannot be assigned', async () => {
    const foreignSite = sqlValue(
      `SELECT id FROM sites WHERE company_id='${ALT_COMPANY_ID}' AND deleted_at IS NULL LIMIT 1`,
    )
    test.skip(!foreignSite, 'no site seeded in the alternate tenant to probe with')

    // Attempted as the SUPERUSER — RLS is out of the picture entirely. This
    // proves the composite FKs on user_sites make the row unrepresentable at the
    // storage layer, so the guarantee survives a bug in any policy above it.
    let rejected = false
    try {
      sql(`INSERT INTO user_sites (company_id, user_id, site_id, created_at, updated_at)
           VALUES ('${COMPANY_ID}', '${ROAMER}', '${foreignSite}', now(), now())`)
    } catch (err) {
      rejected = /foreign key|violates/i.test(String(err.stderr || err.message))
    }
    expect(rejected, 'the composite FK must refuse a site from another tenant').toBe(true)
    expect(liveAssignmentCount(ROAMER, foreignSite)).toBe(0)
  })

  test('MS-J7 · remove then re-add the same site works (partial unique index)', () => {
    clearSites(ROAMER)
    assignSite(ROAMER, SITES.secondary.id)
    expect(additionalSiteIds(ROAMER)).toEqual([SITES.secondary.id])

    unassignSite(ROAMER, SITES.secondary.id)
    expect(additionalSiteIds(ROAMER)).toEqual([])

    // A PLAIN unique index would collide with the tombstone here — and grafserv
    // masks the constraint violation into "Something went wrong, please try
    // again" over HTTP 200, which is unrecognisable in the UI. Precedent:
    // 20260715120200-suppliers-on-sites-partial-unique.js.
    let readdFailed = null
    try {
      assignSite(ROAMER, SITES.secondary.id)
    } catch (err) {
      readdFailed = String(err.stderr || err.message)
    }
    expect(readdFailed, 'the unique index must be PARTIAL on deleted_at IS NULL').toBeNull()
    expect(additionalSiteIds(ROAMER)).toEqual([SITES.secondary.id])
  })

  test('MS-J9 · a soft-deleted site contributes no access', () => {
    clearSites(ROAMER)
    // A throwaway site so no shared fixture is disturbed.
    const siteId = sqlValue(`
      INSERT INTO sites (company_id, name, code, timezone, created_at, updated_at)
      VALUES ('${COMPANY_ID}', 'E2E MS Doomed Site', 'MSDOOM', 'UTC', now(), now())
      RETURNING id`)
    try {
      assignSite(ROAMER, siteId)
      expect(
        sqlValue(
          `SELECT '${siteId}' = ANY(authz.effective_site_ids('${ROAMER}'::uuid, '${COMPANY_ID}'::uuid))`,
        ),
        'assigned + live → effective',
      ).toBe('t')

      sql(`UPDATE sites SET deleted_at = now() WHERE id = '${siteId}'`)
      expect(
        sqlValue(
          `SELECT '${siteId}' = ANY(authz.effective_site_ids('${ROAMER}'::uuid, '${COMPANY_ID}'::uuid))`,
        ),
        'a soft-deleted site must drop out of the effective set',
      ).toBe('f')
    } finally {
      sql(`DELETE FROM user_sites WHERE site_id = '${siteId}'`)
      sql(`DELETE FROM sites WHERE id = '${siteId}'`)
    }
  })

  // D3: "inactive" gates NEW assignment. It must NOT retroactively revoke — a
  // site being wound down still needs its open records closed out.
  test('MS-J8 · an INACTIVE site keeps the assignments it already has', () => {
    clearSites(ROAMER)
    const siteId = sqlValue(`
      INSERT INTO sites (company_id, name, code, timezone, created_at, updated_at)
      VALUES ('${COMPANY_ID}', 'E2E MS Winding Down', 'MSWIND', 'UTC', now(), now())
      RETURNING id`)
    try {
      assignSite(ROAMER, siteId)
      sql(`UPDATE sites SET is_active = false WHERE id = '${siteId}'`)
      expect(
        sqlValue(
          `SELECT '${siteId}' = ANY(authz.effective_site_ids('${ROAMER}'::uuid, '${COMPANY_ID}'::uuid))`,
        ),
        'deactivating a site must not silently revoke access to records still open there',
      ).toBe('t')
    } finally {
      sql(`DELETE FROM user_sites WHERE site_id = '${siteId}'`)
      sql(`DELETE FROM sites WHERE id = '${siteId}'`)
    }
  })

  // Site assignment is an authority grant, so it belongs in the same review
  // surface as role assignment — not buried in a generic row diff, and certainly
  // not unrecorded. This also pins the registry entry: without `user_sites` in
  // the audit registry, getTableConfig returns undefined and the event is
  // silently DROPPED rather than logged.
  test('MS-J14 · every assignment change is audited', async () => {
    clearSites(ROAMER)
    const before = Number(
      sqlValue(`SELECT count(*) FROM audit_logs WHERE entity_type = 'UserSites'`),
    )
    assignSite(ROAMER, SITES.secondary.id)
    unassignSite(ROAMER, SITES.secondary.id)

    // The audit trigger enqueues a graphile job and the WORKER writes the row,
    // so this is asynchronous — poll rather than race it.
    const seen = await waitForSqlValue(
      `SELECT (count(*) > ${before})::int FROM audit_logs WHERE entity_type = 'UserSites'`,
      { label: 'audit_logs row for a user_sites change', timeoutMs: 30_000 },
    )
    expect(seen, 'assigning/removing a site must reach the audit trail').toBe('1')
  })
})
