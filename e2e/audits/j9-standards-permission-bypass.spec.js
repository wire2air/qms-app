// PW-J9 · 🔴 auditStandards permission checks are dead code (inventory finding #1).
//
// EVERY mutating route in backend/api/routes/auditStandards.js mounts
// `enforcePermission('audit_standards', verb)` AFTER the controller:
//
//   router.post(['/v1/services/auditStandards'],
//     requireAuthByApiKey, requireCompanyAccess, express.json(),
//     validate({ body: createAuditStandardSchema }),
//     createAuditStandard,                        // <- sends the response…
//     enforcePermission('audit_standards','create'))  // <- …so this never runs
//
// The controllers take (req, res) with no `next`, call sendSuccess/sendCreated
// and return — the permission middleware is never reached. Any authenticated
// company member can therefore create / update / delete / clone / BYOL-import /
// attest-license an Audit Standard with zero audit_standards grants.
//
// It is invisible to tests/routePermissions.test.js, which regex-scans for the
// textual PRESENCE of enforcePermission( in the route span, not its position.
//
// The probes go through the API, not the UI: the UI hides the buttons from this
// persona, which is exactly why the gap survived. `auditor` holds
// audit_management:read and nothing else — no audit_standards action of any
// kind — so every assertion below is "this user must be refused".
//
// EXPECTED TO FAIL until the routes are reordered. Each test is self-contained.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH, AUDIT_STANDARD, USERS } from '../fixtures/cast.js'
import { findStandardByCode } from '../fixtures/audits.js'
import { sqlValue } from '../fixtures/db.js'

test.describe('PW-J9 · standards routes enforce no permission', () => {
  test('CONTROL · the auditor persona really does hold no audit_standards grant', async () => {
    const grants = sqlValue(`
      SELECT count(*) FROM authz.role_module_permissions rmp
        JOIN roles_on_users rou ON rou.role_id = rmp.role_id
       WHERE rou.user_id = '${USERS.auditor.id}' AND rmp.module_id = 'audit_standards'`)
    expect(Number(grants), 'PW-J9 is meaningless if this persona is granted anything').toBe(0)
    expect(
      sqlValue(`SELECT is_owner FROM users WHERE id = '${USERS.auditor.id}'`),
      'and owners bypass every check, so the persona must not be one',
    ).toBe('f')
  })

  test('🔴 create: a user without audit_standards:create is not refused (FAILS TODAY)', async ({
    browser,
  }) => {
    const ctx = await browser.newContext({ storageState: AUTH.auditor })
    const code = `E2E-J9-${Date.now()}`
    const res = await ctx.request.post('/api/v1/services/auditStandards', {
      data: { code, name: 'PW-J9 unauthorised standard' },
    })
    const created = findStandardByCode(code)
    await ctx.close()

    // Report the damage first — a 403 with a row still written would be a
    // different (worse) bug than the one this documents.
    expect(created, 'no standard should exist after an unauthorised create').toBeNull()
    expect(res.status(), 'create without audit_standards:create must be 403').toBe(403)
  })

  test('🔴 update: a user without audit_standards:update is not refused (FAILS TODAY)', async ({
    browser,
  }) => {
    const ctx = await browser.newContext({ storageState: AUTH.auditor })
    const res = await ctx.request.patch(`/api/v1/services/auditStandards/${AUDIT_STANDARD.id}`, {
      data: { description: 'PW-J9 unauthorised edit' },
    })
    const description = sqlValue(
      `SELECT coalesce(description,'') FROM audit_standards WHERE id = '${AUDIT_STANDARD.id}'`,
    )
    await ctx.close()

    expect(description, 'the seeded standard must be untouched').not.toContain('unauthorised edit')
    expect(res.status(), 'update without audit_standards:update must be 403').toBe(403)
  })

  test('🔴 BYOL import: a user without audit_standards:create is not refused (FAILS TODAY)', async ({
    browser,
  }) => {
    const ctx = await browser.newContext({ storageState: AUTH.auditor })
    const code = `E2E-J9-IMP-${Date.now()}`
    const res = await ctx.request.post('/api/v1/services/auditStandards/import', {
      data: {
        code,
        name: 'PW-J9 unauthorised import',
        format: 'csv',
        content:
          'clauseNumber,parentClauseNumber,title,questions,observations,expectedEvidence,peopleToInterview,description,guidance\n"1",,"Unauthorised clause",,,,,,',
        contentLicense: 'CUSTOMER_AUTHORED',
      },
    })
    const created = findStandardByCode(code)
    await ctx.close()

    // The import path is the most damaging of the set: it writes a standard, an
    // EFFECTIVE version and a clause list in one unguarded call.
    expect(created, 'no standard should exist after an unauthorised import').toBeNull()
    expect(res.status(), 'import without audit_standards:create must be 403').toBe(403)
  })

  test('CONTROL · a route that mounts enforcePermission correctly does refuse', async ({
    browser,
  }) => {
    // audit_programs mounts the check BEFORE the controller. Same persona, same
    // shape of request — the contrast is the point: this is what J9's routes
    // should look like.
    const ctx = await browser.newContext({ storageState: AUTH.auditor })
    const res = await ctx.request.post('/api/v1/services/auditPrograms', {
      data: { name: 'PW-J9 control program', programTypeId: 'INTERNAL', frequencyId: 'ANNUAL' },
    })
    await ctx.close()
    expect(res.status(), 'auditPrograms gates correctly and must 403').toBe(403)
  })
})
