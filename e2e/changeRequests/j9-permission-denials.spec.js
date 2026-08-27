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
  test('a read-only user (change_control:read only) cannot submit a CR they do not own → 403', async ({
    browser,
  }) => {
    test.setTimeout(120_000)
    const ownerCtx = await browser.newContext({ storageState: AUTH.author })
    const ownerPage = await ownerCtx.newPage()
    const title = uniqueTitle('J9-403')
    await createCr(ownerPage, title)
    const cr = findCrByTitle(title)
    await ownerCtx.close()

    // `auditor`, not `reviewer`: the Reviewer role holds change_control:update
    // since the 2026-08-27 seed backfill (the verb decides, for assignees
    // too), so it may legitimately submit. The auditor stays read-only.
    const auditorCtx = await browser.newContext({ storageState: AUTH.auditor })
    const res = await auditorCtx.request.post(
      `/api/v1/services/changeRequests/${cr.id}/submitForReview`,
      { data: {} },
    )
    expect(res.status(), 'read-only grant cannot drive the lifecycle').toBe(403)
    await auditorCtx.close()

    expect(sqlValue(`SELECT status_id FROM change_requests WHERE id = '${cr.id}'`)).toBe('DRAFT')
  })

  test('a non-owner with update permission cannot close another user’s CR → 403', async ({
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

    // The approver holds change_control:read+approve but is not the CR owner —
    // close/cancel are owner-gated in the controller (assertOwner), independent
    // of the route's enforcePermission.
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
