// PW-J6 · Permission denials + cross-tenant (TC-17 f/g) — multi-role.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH, BASE_URL, ALT_BASE_URL } from '../fixtures/cast.js'
import { raiseNc, uniqueTitle } from '../fixtures/nonconformances.js'
import { findNcByTitle } from '../fixtures/db.js'

// Relative `/api/v1/...` through the configured baseURL (the Vite proxy strips
// the `/api` prefix), so E2E_BASE_URL keeps working when the stack moves — a
// hardcoded http://…:4000 origin silently ignores that override.

test.describe('PW-J6 · permission denials + cross-tenant isolation', () => {
  // Uses the AUDITOR, not the reviewer. The reviewer is no longer a read-only
  // persona: since 2026-08-19 an ACTION step assignee must hold `<module>:update`
  // (workflowStepAccess.js), so the seed now grants ncReviewer `ncr:update` — and
  // with it this probe returned 409, not 403, because the request got past the
  // permission gate and failed on state instead. That is a weaker assertion
  // wearing the same green tick.
  //
  // `auditor` holds `ncr:read` and nothing else, which is what this test has
  // always meant by "read only". Same move the CR suite made for the same reason.
  test('a read-only user (ncr:read) cannot submit-for-review an NC they do not own -> 403', async ({
    browser,
  }) => {
    test.setTimeout(60_000)
    const ownerCtx = await browser.newContext({ storageState: AUTH.author })
    const ownerPage = await ownerCtx.newPage()
    const title = uniqueTitle('J6-403')
    await raiseNc(ownerPage, title)
    const nc = findNcByTitle(title)
    await ownerCtx.close()

    const readOnlyCtx = await browser.newContext({ storageState: AUTH.auditor })
    const res = await readOnlyCtx.request.post(
      `/api/v1/services/nonconformances/${nc.id}/submitForReview`,
      { data: {} },
    )
    expect(res.status(), await res.text().catch(() => '')).toBe(403)
    await readOnlyCtx.close()
  })

  test('a user with no ncr permission is redirected to /no-access', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: AUTH.noAccess })
    const page = await ctx.newPage()
    await page.goto('/nonconformances')
    await expect(page).toHaveURL(/\/no-access/, { timeout: 20_000 })
    await ctx.close()
  })

  test('an unauthenticated API request is rejected with 401', async ({ playwright }) => {
    const request = await playwright.request.newContext({ baseURL: BASE_URL })
    const res = await request.post('/api/v1/services/nonconformances', { data: {} })
    expect(res.status()).toBe(401)
    await request.dispose()
  })

  test('an unauthenticated page visit is bounced to sign-in', async ({ browser }) => {
    const ctx = await browser.newContext() // no session
    const page = await ctx.newPage()
    await page.goto('/nonconformances')
    await expect(page).toHaveURL(/\/signin/, { timeout: 20_000 })
    await ctx.close()
  })

  test('cross-tenant: an E2EALT user cannot act on an E2ELAB NC -> 404', async ({ browser }) => {
    test.setTimeout(60_000)
    const ownerCtx = await browser.newContext({ storageState: AUTH.author })
    const ownerPage = await ownerCtx.newPage()
    const title = uniqueTitle('J6-crosstenant')
    await raiseNc(ownerPage, title)
    const nc = findNcByTitle(title)
    await ownerCtx.close()

    const altCtx = await browser.newContext({ storageState: AUTH.altOwner, baseURL: ALT_BASE_URL })
    const res = await altCtx.request.post(
      `${ALT_BASE_URL}/api/v1/services/nonconformances/${nc.id}/submitForReview`,
      { data: {} },
    )
    expect(res.status(), 'a different tenant company_id must 404, not leak the row').toBe(404)
    await altCtx.close()

    // The NC is untouched (still OPEN from its auto-open, still
    // owned by E2ELAB's author).
    const untouched = findNcByTitle(title)
    expect(untouched.statusId).toBe('OPEN')
    expect(untouched.id).toBe(nc.id)
  })
})
