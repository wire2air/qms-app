// PW-J6 · Permission denials + cross-tenant (TC-17 f/g) — multi-role.
import { test, expect } from '@playwright/test'
import { AUTH, ALT_BASE_URL } from '../fixtures/cast.js'
import { raiseNc, uniqueTitle } from '../fixtures/nonconformances.js'
import { findNcByTitle } from '../fixtures/db.js'

const API_BASE = 'http://e2elab.localhost:4000'

test.describe('PW-J6 · permission denials + cross-tenant isolation', () => {
  test('a reviewer (ncr:read only) cannot submit-for-review an NC they do not own -> 403', async ({
    browser,
  }) => {
    test.setTimeout(60_000)
    const ownerCtx = await browser.newContext({ storageState: AUTH.author })
    const ownerPage = await ownerCtx.newPage()
    const title = uniqueTitle('J6-403')
    await raiseNc(ownerPage, title)
    const nc = findNcByTitle(title)
    await ownerCtx.close()

    const reviewerCtx = await browser.newContext({ storageState: AUTH.reviewer })
    const res = await reviewerCtx.request.post(
      `${API_BASE}/v1/services/nonconformances/${nc.id}/submitForReview`,
      { data: {} },
    )
    expect(res.status()).toBe(403)
    await reviewerCtx.close()
  })

  test('a user with no ncr permission is redirected to /no-access', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: AUTH.noAccess })
    const page = await ctx.newPage()
    await page.goto('/nonconformances')
    await expect(page).toHaveURL(/\/no-access/, { timeout: 20_000 })
    await ctx.close()
  })

  test('an unauthenticated API request is rejected with 401', async ({ playwright }) => {
    const request = await playwright.request.newContext()
    const res = await request.post(`${API_BASE}/v1/services/nonconformances`, { data: {} })
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

    // The NC is untouched (still DRAFT, still owned by E2ELAB's author).
    const stillDraft = findNcByTitle(title)
    expect(stillDraft.statusId).toBe('DRAFT')
    expect(stillDraft.id).toBe(nc.id)
  })
})
