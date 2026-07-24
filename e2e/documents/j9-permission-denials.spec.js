// PW-J9 — Permission denials & isolation (permission-matrix guardrails).
//   - a user with no document permission is redirected to /no-access;
//   - the auditor (document_control:read) is admitted read-only, with no create
//     affordance (see the H2 scope-tier note on that test);
//   - an unauthenticated API call is rejected 401;
//   - an unauthenticated page visit is bounced to /signin.
import { test, expect } from '@playwright/test'
import { AUTH } from '../fixtures/cast.js'

const API_BASE = 'http://e2elab.localhost:4000'
const AUTHED_ENDPOINT = '/v1/services/documentTemplates/checkPrefix/ZZTEST'

test.describe('PW-J9 · permission denials & isolation', () => {
  test('a user with no document permission is redirected to /no-access', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: AUTH.noAccess })
    const page = await ctx.newPage()
    await page.goto('/documents')
    await expect(page).toHaveURL(/\/no-access/, { timeout: 20_000 })
    await ctx.close()
  })

  test('the auditor is admitted read-only — route access, no create affordance', async ({ browser }) => {
    test.setTimeout(60_000)
    const ctx = await browser.newContext({ storageState: AUTH.auditor })
    const page = await ctx.newPage()
    // Having document_control:read, the guard admits the auditor to the workspace
    // (not bounced to /no-access) and the list renders.
    await page.goto('/documents')
    await expect(page).toHaveURL(/\/documents/)
    await expect(page.getByPlaceholder('Search…', { exact: true })).toBeVisible({ timeout: 20_000 })
    // …but there is no create affordance (no document_control:create).
    await expect(page.getByRole('button', { name: 'Create Document' })).toHaveCount(0)

    // NOTE: a freshly-created document sits at a DRAFT version, which the RLS read
    // gate keeps private to its author/collaborators/owner by design (drafts are
    // not visible to every reader). So we don't assert this auditor can see this
    // specific draft — published versions would be visible. Whether the REST read
    // endpoints (API-01/02) honor the permission's scope tiers (H2) is examined
    // separately in Phase C, not asserted here.
    await ctx.close()
  })

  test('an unauthenticated API request is rejected with 401', async ({ playwright }) => {
    const request = await playwright.request.newContext()
    const res = await request.get(`${API_BASE}${AUTHED_ENDPOINT}`)
    expect(res.status()).toBe(401)
    await request.dispose()
  })

  test('an unauthenticated page visit is bounced to sign-in', async ({ browser }) => {
    const ctx = await browser.newContext() // no session
    const page = await ctx.newPage()
    await page.goto('/documents')
    await expect(page).toHaveURL(/\/signin/, { timeout: 20_000 })
    await ctx.close()
  })
})
