// Suppliers screenshots · S1 — the sharing surface and the external portal.
//   Admin side: the supplier list, a supplier's Shared Documents tab, the Share
//   Document dialog (blank → picked), the shared row with its "Shared with …"
//   line, and the tab once the share is revoked.
//   Portal side: what the supplier's own user sees at /supplier before and
//   after the share.
//
// Flow, seeding and the portal-login shape are SUP-J8's. Most other supplier
// journeys are RLS verdicts issued over raw GraphQL with no UI at all — those
// have nothing to screenshot and are deliberately not represented here.
import { request } from '@playwright/test'
import { test, expect } from '../../../video/fixtures/videoTest.js'
import { AUTH, BASE_URL, PASSWORD, SUPPLIER_IDS, SUPPLIER_USER } from '../../fixtures/cast.js'
import { seedDocument, cleanup } from '../../fixtures/suppliers.js'
import { shooter } from '../../fixtures/screenshots.js'

const shot = shooter('suppliers')

const SHARED_DOCS_TAB = `/suppliers/${SUPPLIER_IDS.withPortal}?tab=quality-records`

/**
 * A browser context signed in as the supplier's portal user — minted through
 * the real login endpoint and handed over as storageState, the same shape
 * auth.setup.js uses for every other persona (SUP-J8).
 */
async function portalPage(browser) {
  const api = await request.newContext({ baseURL: BASE_URL })
  const login = await api.post('/api/v1/auth/login', {
    data: { email: SUPPLIER_USER.email, password: PASSWORD },
  })
  expect(login.ok(), `portal login → ${login.status()}`).toBeTruthy()
  const storageState = await api.storageState()
  await api.dispose()

  const context = await browser.newContext({ baseURL: BASE_URL, storageState })
  return { context, page: await context.newPage() }
}

test.describe.serial('Supplier screenshots · share a document, then the portal', () => {
  const created = { documentIds: [], shareIds: [] }
  test.afterAll(() => cleanup(created))

  test('supplier list, share dialog, shared row, unshare', async ({ browser }) => {
    test.setTimeout(420_000)
    const ctx = await browser.newContext({ storageState: AUTH.owner })
    const page = await ctx.newPage()

    await page.goto('/suppliers', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: /Suppliers/i }).first()).toBeVisible({
      timeout: 30_000,
    })
    await shot(page, 'list')

    const doc = seedDocument({ title: 'E2E Screens Cleaning Validation SOP' })
    created.documentIds.push(doc.id)

    await page.goto(SHARED_DOCS_TAB, { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: 'Shared Documents' })).toBeVisible({
      timeout: 30_000,
    })
    await shot(page, 'detail-shared-documents-tab')

    // ── Share Document dialog ──────────────────────────────────────────────
    await page.getByRole('button', { name: 'Share Document' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByRole('heading', { name: 'Share Document' })).toBeVisible({
      timeout: 20_000,
    })
    await shot(page, 'share-document-dialog')

    await dialog.getByRole('combobox').first().click()
    const option = page.getByRole('option', { name: new RegExp(doc.docNumber) }).first()
    await expect(option).toBeVisible({ timeout: 20_000 })
    await shot(page, 'share-document-picker')
    await option.click()
    await shot(page, 'share-document-dialog-picked')

    await dialog.getByRole('button', { name: 'Share', exact: true }).click()
    await expect(dialog.getByRole('heading', { name: 'Share Document' })).toBeHidden({
      timeout: 30_000,
    })
    await expect(page.getByText(doc.title, { exact: false }).first()).toBeVisible({
      timeout: 30_000,
    })
    await expect(page.getByText(`Shared with ${SUPPLIER_USER.name}`).first()).toBeVisible({
      timeout: 30_000,
    })
    await shot(page, 'shared-document-row')

    await ctx.close()
  })

  test('the portal user sees the shared document', async ({ browser }) => {
    test.setTimeout(300_000)
    const { context, page } = await portalPage(browser)

    await page.goto('/supplier', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: /Shared Documents/ }).first()).toBeVisible({
      timeout: 30_000,
    })
    await shot(page, 'portal-home')

    await expect(page.getByText('E2E Screens Cleaning Validation SOP', { exact: false }).first())
      .toBeVisible({ timeout: 30_000 })
    await shot(page, 'portal-shared-documents')

    await context.close()
  })

  test('unshared: the row leaves both sides', async ({ browser }) => {
    test.setTimeout(300_000)
    const ctx = await browser.newContext({ storageState: AUTH.owner })
    const page = await ctx.newPage()

    await page.goto(SHARED_DOCS_TAB, { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('button', { name: 'Unshare' }).first()).toBeVisible({
      timeout: 30_000,
    })
    await page.getByRole('button', { name: 'Unshare' }).first().click()
    await expect(page.getByText('E2E Screens Cleaning Validation SOP', { exact: false })).toBeHidden(
      { timeout: 30_000 },
    )
    await shot(page, 'shared-documents-tab-empty')
    await ctx.close()

    const { context, page: portal } = await portalPage(browser)
    await portal.goto('/supplier', { waitUntil: 'domcontentloaded' })
    await expect(portal.getByRole('heading', { name: /Shared Documents/ }).first()).toBeVisible({
      timeout: 30_000,
    })
    await expect(
      portal.getByText('E2E Screens Cleaning Validation SOP', { exact: false }),
    ).toHaveCount(0, { timeout: 30_000 })
    await shot(portal, 'portal-after-revoke')
    await context.close()
  })
})
