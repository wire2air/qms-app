// PW-J9 · permission denials + tenant isolation (P0).
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH, ALT_BASE_URL } from '../fixtures/cast.js'
import {
  createCr,
  assignDraftReviewers,
  submitCrForApproval,
  uniqueTitle,
} from '../fixtures/changeRequests.js'
import { findCrByTitle, sqlValue } from '../fixtures/db.js'

test.describe('PW-J9 · permission denials + cross-tenant isolation', () => {
  // ~~a reviewer (change_control:read only)~~ — the Reviewer is not read-only
  // any more. Completing step 1 (ACTION) requires `change_control:update` of
  // the assignee since 2026-08-19, so the seed grants it (§33) and this probe
  // would pass here for the wrong reason: it would prove the CR was not theirs,
  // never that the verb was missing. The auditor holds `change_control:read`
  // and nothing else, and is assigned to no step. Same move NC PW-J6 and CAPA
  // PW-J7 had to make.
  test('an auditor (change_control:read only) cannot submit a CR they do not own → 403', async ({
    browser,
  }) => {
    test.setTimeout(120_000)
    const ownerCtx = await browser.newContext({ storageState: AUTH.author })
    const ownerPage = await ownerCtx.newPage()
    const title = uniqueTitle('J9-403')
    await createCr(ownerPage, title)
    const cr = findCrByTitle(title)
    await ownerCtx.close()

    const auditorCtx = await browser.newContext({ storageState: AUTH.auditor })
    const res = await auditorCtx.request.post(
      `/api/v1/services/changeRequests/${cr.id}/submitForReview`,
      { data: {} },
    )
    expect(res.status(), 'read-only grant cannot drive the lifecycle').toBe(403)
    await auditorCtx.close()

    expect(sqlValue(`SELECT status_id FROM change_requests WHERE id = '${cr.id}'`)).toBe('DRAFT')
  })

  // ~~a non-owner WITH update permission cannot close another user's CR~~ — the
  // title was describing a gate that no longer exists, and the body never
  // exercised the one it named.
  //
  // The approver holds change_control:read + approve and NO update, so
  // `enforcePermission('change_control','update')` on the /cancel route
  // (routes/changeRequests.js) refuses at the middleware layer and the request
  // never reaches assertOwner. The old comment claimed the opposite —
  // "owner-gated in the controller, independent of the route's
  // enforcePermission" — which is exactly backwards, and made the test read as
  // proof of an ownership rule it does not touch.
  //
  // Worse, the rule it claimed is no longer true. Since 2026-08-19
  // (utils/recordAccess.js) custodianship supplies SCOPE, never a bypass, and
  // the matrix decides for everyone: a user holding change_control:update at
  // TENANT scope MAY cancel a CR they do not own — which is precisely what seed
  // §33 handed the reviewer. Pointing this probe at "someone with update" would
  // now assert a 200.
  //
  // So it splits in two, one per layer, and each names the layer it proves.
  test('the route verb gate: a non-owner without change_control:update cannot cancel → 403', async ({
    browser,
  }) => {
    test.setTimeout(150_000)
    const ownerCtx = await browser.newContext({ storageState: AUTH.author })
    const ownerPage = await ownerCtx.newPage()
    const title = uniqueTitle('J9-nonowner')
    await createCr(ownerPage, title)
    const cr = findCrByTitle(title)
    await assignDraftReviewers(ownerPage, cr.id)
    await submitCrForApproval(ownerPage, cr.id)
    await ownerCtx.close()

    // Approver = read + approve, no update. Refused by enforcePermission before
    // the controller loads the record at all — an approval grant does not
    // authorise abandoning the change.
    const approverCtx = await browser.newContext({ storageState: AUTH.approver })
    const res = await approverCtx.request.post(
      `/api/v1/services/changeRequests/${cr.id}/cancel`,
      { data: { reason: 'not my CR', method: 'PIN', token: '12345678', provider: null } },
    )
    expect(res.status()).toBe(403)
    await approverCtx.close()

    expect(sqlValue(`SELECT status_id FROM change_requests WHERE id = '${cr.id}'`)).toBe(
      'OPEN',
    )
  })

  test('the record scope gate: an OWN-scope holder cannot cancel a peer’s CR → 403', async ({
    browser,
  }) => {
    test.setTimeout(150_000)
    const ownerCtx = await browser.newContext({ storageState: AUTH.author })
    const ownerPage = await ownerCtx.newPage()
    const title = uniqueTitle('J9-ownscope')
    await createCr(ownerPage, title)
    const cr = findCrByTitle(title)
    await assignDraftReviewers(ownerPage, cr.id)
    await submitCrForApproval(ownerPage, cr.id)
    await ownerCtx.close()

    // `ownAuthor` holds change_control:create/read/update at OWN scope (seed
    // §17), so unlike the approver above they sail through the route's
    // enforcePermission — which checks the VERB only, never the record
    // (permissionService.can() skips scopeAllowed when no record is supplied).
    // The refusal has to come from the controller's assertOwner →
    // assertCanActOnRecord → authz.scope_allowed(), whose own-tier requires the
    // row's owner to BE the caller. This is the layer the old single test
    // claimed to cover and never reached, and the only one that distinguishes
    // "has the verb" from "has it over THIS record".
    const ownCtx = await browser.newContext({ storageState: AUTH.ownAuthor })
    const res = await ownCtx.request.post(`/api/v1/services/changeRequests/${cr.id}/cancel`, {
      data: { reason: 'not my CR either', method: 'PIN', token: '12345678', provider: null },
    })
    expect(res.status(), 'own-scope update does not reach a peer’s record').toBe(403)
    await ownCtx.close()

    expect(sqlValue(`SELECT status_id FROM change_requests WHERE id = '${cr.id}'`)).toBe(
      'UNDER_REVIEW',
    )
  })

  test('a user with no change_control permission is redirected to /no-access', async ({
    browser,
  }) => {
    const ctx = await browser.newContext({ storageState: AUTH.noAccess })
    const page = await ctx.newPage()
    await page.goto('/change-requests')
    await expect(page).toHaveURL(/\/no-access/, { timeout: 20_000 })
    await ctx.close()
  })

  test('an unauthenticated API request is rejected with 401', async ({ playwright }) => {
    const request = await playwright.request.newContext()
    const res = await request.post('/api/v1/services/changeRequests', { data: {} })
    expect(res.status()).toBe(401)
    await request.dispose()
  })

  test('an unauthenticated page visit is bounced to sign-in', async ({ browser }) => {
    const ctx = await browser.newContext() // no session
    const page = await ctx.newPage()
    await page.goto('/change-requests')
    await expect(page).toHaveURL(/\/signin/, { timeout: 20_000 })
    await ctx.close()
  })

  test('cross-tenant: an E2EALT user cannot act on an E2ELAB CR → 404', async ({ browser }) => {
    test.setTimeout(120_000)
    const ownerCtx = await browser.newContext({ storageState: AUTH.author })
    const ownerPage = await ownerCtx.newPage()
    const title = uniqueTitle('J9-crosstenant')
    await createCr(ownerPage, title)
    const cr = findCrByTitle(title)
    await ownerCtx.close()

    const altCtx = await browser.newContext({ storageState: AUTH.altOwner, baseURL: ALT_BASE_URL })
    const res = await altCtx.request.post(
      `${ALT_BASE_URL}/api/v1/services/changeRequests/${cr.id}/submitForReview`,
      { data: {} },
    )
    expect(res.status(), 'a different tenant company_id must 404, not leak the row').toBe(404)
    await altCtx.close()

    // Untouched.
    const still = findCrByTitle(title)
    expect(still.statusId).toBe('DRAFT')
    expect(still.id).toBe(cr.id)
  })

  test('cross-tenant: an E2EALT user cannot read an E2ELAB CR’s links → 404', async ({
    browser,
  }) => {
    test.setTimeout(120_000)
    const ownerCtx = await browser.newContext({ storageState: AUTH.author })
    const ownerPage = await ownerCtx.newPage()
    const title = uniqueTitle('J9-crosslinks')
    await createCr(ownerPage, title)
    const cr = findCrByTitle(title)
    await ownerCtx.close()

    const altCtx = await browser.newContext({ storageState: AUTH.altOwner, baseURL: ALT_BASE_URL })
    const res = await altCtx.request.get(
      `${ALT_BASE_URL}/api/v1/services/changeRequests/${cr.id}/links`,
    )
    expect(res.status()).toBe(404)
    await altCtx.close()
  })
})
