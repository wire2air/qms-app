// PW-J7 · Permission denials (TC-16 f/g/h) — multi-role.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH, ALT_BASE_URL } from '../fixtures/cast.js'
import { createCapa, uniqueTitle } from '../fixtures/capas.js'
import { findCapaByTitle } from '../fixtures/db.js'

test.describe('PW-J7 · permission denials + cross-tenant isolation', () => {
  // ~~a reviewer (capa:read only)~~ — the REVIEWER is no longer a read-only
  // persona. Since 2026-08-19 an ACTION-step assignee needs `<module>:update`
  // to complete their own step (backend/api/utils/workflowStepAccess.js), so
  // the seed grants the reviewer `capa:update` (e2e-seed §32) and this probe
  // would have gone green for the wrong reason on that persona — proving only
  // that the CAPA was not theirs, never that the verb was missing.
  //
  // The auditor is the honest stand-in: `capa:read` and nothing else, and no
  // step assignment anywhere in the CAPA workflow. Same trap, same fix as
  // NC PW-J6. See capa/22 §3.
  test('an auditor (capa:read only) cannot submit-for-review a CAPA they do not own -> 403', async ({
    browser,
  }) => {
    test.setTimeout(60_000)
    const ownerCtx = await browser.newContext({ storageState: AUTH.author })
    const ownerPage = await ownerCtx.newPage()
    const title = uniqueTitle('J7-403')
    await createCapa(ownerPage, title)
    const capa = findCapaByTitle(title)
    await ownerCtx.close()

    const auditorCtx = await browser.newContext({ storageState: AUTH.auditor })
    const res = await auditorCtx.request.post(
      `/api/v1/services/capas/${capa.id}/submitForReview`,
      { data: {} },
    )
    expect(res.status()).toBe(403)
    await auditorCtx.close()
  })

  test('a user with no capa permission is redirected to /no-access', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: AUTH.noAccess })
    const page = await ctx.newPage()
    await page.goto('/capas')
    await expect(page).toHaveURL(/\/no-access/, { timeout: 20_000 })
    await ctx.close()
  })

  test('an unauthenticated API request is rejected with 401', async ({ playwright }) => {
    const request = await playwright.request.newContext()
    const res = await request.post('/api/v1/services/capas', { data: {} })
    expect(res.status()).toBe(401)
    await request.dispose()
  })

  test('an unauthenticated page visit is bounced to sign-in', async ({ browser }) => {
    const ctx = await browser.newContext() // no session
    const page = await ctx.newPage()
    await page.goto('/capas')
    await expect(page).toHaveURL(/\/signin/, { timeout: 20_000 })
    await ctx.close()
  })

  test('cross-tenant: an E2EALT user cannot act on an E2ELAB CAPA -> 404', async ({ browser }) => {
    test.setTimeout(60_000)
    const ownerCtx = await browser.newContext({ storageState: AUTH.author })
    const ownerPage = await ownerCtx.newPage()
    const title = uniqueTitle('J7-crosstenant')
    await createCapa(ownerPage, title)
    const capa = findCapaByTitle(title)
    await ownerCtx.close()

    const altCtx = await browser.newContext({ storageState: AUTH.altOwner, baseURL: ALT_BASE_URL })
    const res = await altCtx.request.post(
      `${ALT_BASE_URL}/api/v1/services/capas/${capa.id}/submitForReview`,
      { data: {} },
    )
    expect(res.status(), 'a different tenant company_id must 404, not leak the row').toBe(404)
    await altCtx.close()

    // The CAPA is untouched (still DRAFT, still owned by E2ELAB's author).
    const stillDraft = findCapaByTitle(title)
    expect(stillDraft.statusId).toBe('DRAFT')
    expect(stillDraft.id).toBe(capa.id)
  })
})
