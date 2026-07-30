// SUP-J8 — Watch a document travel to a supplier, through the UI.
//
// The rest of this suite asks the database what a supplier can read, which is
// the honest question for an access-control change but shows you nothing. This
// is the journey you can sit and watch.
//
//   npx playwright test --project=suppliers -g "SUP-J8" --headed
//   npx playwright test --project=suppliers -g "SUP-J8" --ui
//   npx playwright show-report      (video + trace of every run)
//
// TWO TESTS, ONE LIVE SESSION EACH — deliberately.
//
// The obvious shape is a single test holding an admin tab and a portal tab at
// once. It does not survive here: opening a second authenticated context makes
// the first tab sign itself out mid-run (the admin's Redis session key
// disappears and every later request 401s). The backend is not the cause — a
// raw login against the API removes no session keys at all — so this is the
// dev SPA reacting to a second session, and chasing it does not belong in a
// sharing test. Splitting the journey keeps both halves genuinely visible and
// removes a failure mode that has nothing to do with what is under test.
import { request } from '@playwright/test'
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH, BASE_URL, PASSWORD, SUPPLIER_IDS, SUPPLIER_USER } from '../fixtures/cast.js'
import { seedDocument, shareDocument, revokeShare, cleanup } from '../fixtures/suppliers.js'

const SHARED_DOCS_TAB = `/suppliers/${SUPPLIER_IDS.withPortal}?tab=quality-records`

/**
 * A browser context signed in as the supplier's portal user. The session is
 * minted through the real /auth/login endpoint and handed over as
 * storageState — the same shape auth.setup.js uses for every other persona.
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
  const page = await context.newPage()
  return { context, page }
}

// ── Half 1 · the admin's side, driven entirely through the UI ───────────────

test.describe('SUP-J8a · an admin shares a document from the supplier page', () => {
  test.use({ storageState: AUTH.owner })

  const created = { documentIds: [], shareIds: [] }
  test.afterAll(() => cleanup(created))

  test('share via the dialog, see it listed, unshare, see it go', async ({ page }) => {
    test.setTimeout(120_000)

    const doc = seedDocument({ title: 'E2E SUP-J8 Cleaning Validation SOP' })
    created.documentIds.push(doc.id)

    await page.goto(SHARED_DOCS_TAB, { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: 'Shared Documents' })).toBeVisible({
      timeout: 30_000,
    })

    // ── Share ────────────────────────────────────────────────────────────
    await page.getByRole('button', { name: 'Share Document' }).click()
    // role="dialog" sits on HeadlessUI's zero-size wrapper, so visibility is
    // asserted on the panel's heading; the wrapper still scopes descendants.
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByRole('heading', { name: 'Share Document' })).toBeVisible({
      timeout: 15_000,
    })

    // Recipients default to every portal user, so only the document is chosen.
    // Its options come from IndexedDB, hence the generous wait.
    await dialog.getByRole('combobox').first().click()
    const option = page.getByRole('option', { name: new RegExp(doc.docNumber) }).first()
    await expect(option).toBeVisible({ timeout: 30_000 })
    await option.click()

    await dialog.getByRole('button', { name: 'Share', exact: true }).click()
    await expect(dialog.getByRole('heading', { name: 'Share Document' })).toBeHidden({
      timeout: 15_000,
    })

    // ── It is listed, and it names who received it ───────────────────────
    await expect(page.getByText(doc.title, { exact: false }).first()).toBeVisible({
      timeout: 20_000,
    })
    await expect(page.getByText(`Shared with ${SUPPLIER_USER.name}`)).toBeVisible({
      timeout: 20_000,
    })

    // ── Unshare, and watch it leave ──────────────────────────────────────
    await page.getByTitle('Unshare document').first().click()
    await page.getByRole('button', { name: 'Unshare' }).click()
    await expect(page.getByText(doc.title, { exact: false })).toBeHidden({ timeout: 20_000 })
  })
})

// ── Half 2 · the supplier's side, in the portal ─────────────────────────────

test.describe('SUP-J8b · the supplier sees it in the portal, and loses it on revoke', () => {
  const created = { documentIds: [], shareIds: [] }
  test.afterAll(() => cleanup(created))

  test('a shared document appears on the portal dashboard until it is revoked', async ({
    browser,
  }) => {
    test.setTimeout(120_000)

    const doc = seedDocument({ title: 'E2E SUP-J8 Supplier Handbook' })
    created.documentIds.push(doc.id)
    const shareId = shareDocument(doc.id)
    created.shareIds.push(shareId)

    const portal = await portalPage(browser)
    try {
      await portal.page.goto('/supplier', { waitUntil: 'domcontentloaded' })

      await expect(
        portal.page.getByRole('heading', { name: /Shared Documents/ }),
      ).toBeVisible({ timeout: 30_000 })
      await expect(portal.page.getByText(doc.title, { exact: false }).first()).toBeVisible({
        timeout: 30_000,
      })

      // Revoke the way the admin's Unshare button does — a soft delete on the
      // grant — then prove the portal genuinely loses it.
      revokeShare(shareId)
      await portal.page.reload({ waitUntil: 'domcontentloaded' })
      await expect(portal.page.getByText(doc.title, { exact: false })).toBeHidden({
        timeout: 30_000,
      })
    } finally {
      await portal.context.close()
    }
  })
})
