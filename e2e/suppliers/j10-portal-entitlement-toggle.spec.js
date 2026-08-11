// SUP-J10 — The "Portal Access" entitlement toggle does not reach this portal.
//
// WHY THIS SPEC EXISTS. On 2026-08-05 the platform console's per-tenant module
// switch for "Portal Access" (authz module `portal`) stopped being decorative:
// `portalEntitlementGuard` went onto every `/v1/portal` data route and
// `portalLogin` began refusing new sessions with 402. Read the commit title
// alone and you would conclude the Supplier Portal now has a commercial kill
// switch. It does not. `/v1/portal/*` is the FLOOR portal — assignments, log
// book forms, field records, `sessionScope = 'PORTAL_ONLY'`. The Supplier Portal
// is a different surface entirely: an `EXTERNAL_SUPPLIER` user signing in
// through the ordinary `/v1/auth/login`, reading `/:code/supplier`, and gated by
// RLS on `shared_with_user`. No policy, guard or route on that path consults
// `entitlement.module_entitled`.
//
// So this is a KNOWN-GAP spec in the `ungated-reads` tradition: it pins what
// happens today so the day someone wires entitlement into the supplier surface,
// the pin goes red and says so out loud. The two CONTROLs are what make the
// gap-tests mean anything — without them, "the portal still works with the
// module off" is equally consistent with "the toggle is broken everywhere".
//
// SINGLE SESSION PER TEST, deliberately — see SUP-J8's header. Nothing here
// holds two authenticated contexts at once.
import { request } from '@playwright/test'
import { test, expect } from '../../video/fixtures/videoTest.js'
import { BASE_URL, PASSWORD, SUPPLIER_USER } from '../fixtures/cast.js'
import {
  cleanup,
  disableModule,
  moduleEntitled,
  portalSees,
  restoreModule,
  seedDocument,
  shareDocument,
} from '../fixtures/suppliers.js'

const MODULE = 'portal'
const TENANT_SLUG = 'E2ELAB' // companies.code — what portalLogin resolves on

/** A browser context signed in as the supplier's portal user (SUP-J8's shape). */
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

test.describe('SUP-J10 · the Portal Access entitlement toggle and the supplier surface', () => {
  const created = { documentIds: [], shareIds: [] }

  // Belt and braces: every test restores the module itself, and this catches a
  // crash between disable and restore. Leaving E2ELAB with `portal` switched off
  // would silently change what every later suite is running against.
  test.afterAll(() => {
    restoreModule(MODULE)
    cleanup(created)
  })

  test('CONTROL · the entitlement gate is real and the fixture moves it', () => {
    expect(moduleEntitled(MODULE), 'E2ELAB starts entitled (no subscription → fail open)').toBe(
      true,
    )
    try {
      disableModule(MODULE)
      expect(moduleEntitled(MODULE), 'a live override switches the module off').toBe(false)
    } finally {
      restoreModule(MODULE)
    }
    expect(moduleEntitled(MODULE), 'removing the override restores the plan answer').toBe(true)
  })

  test('CONTROL · the FLOOR portal does honour the toggle — 402 on login', async () => {
    // Deliberately an address no account uses. `portalLogin` checks entitlement
    // immediately after resolving the tenant and BEFORE looking the user up, so
    // the 402/401 split is visible without touching a real credential (and
    // without feeding the account-lockout counter).
    const probe = { tenantSlug: TENANT_SLUG, email: 'nobody@e2e.test', password: 'not-a-password' }
    const ctx = await request.newContext({ baseURL: BASE_URL })
    try {
      const entitled = await ctx.post('/api/v1/portal/auth/login', {
        data: probe,
        failOnStatusCode: false,
      })
      expect(entitled.status(), 'entitled: the request gets past the commercial gate').not.toBe(402)

      disableModule(MODULE)
      const disabled = await ctx.post('/api/v1/portal/auth/login', {
        data: probe,
        failOnStatusCode: false,
      })
      expect(disabled.status(), 'disabled: PORTAL_MODULE_DISABLED').toBe(402)
    } finally {
      restoreModule(MODULE)
      await ctx.dispose()
    }
  })

  test('KNOWN GAP · a supplier still signs in with Portal Access switched off', async () => {
    const ctx = await request.newContext({ baseURL: BASE_URL })
    try {
      disableModule(MODULE)
      const login = await ctx.post('/api/v1/auth/login', {
        data: { email: SUPPLIER_USER.email, password: PASSWORD },
        failOnStatusCode: false,
      })
      // The main login path never asks the entitlement plane anything. When the
      // supplier surface is brought under the toggle this becomes 402 and this
      // expectation must be INVERTED, not deleted.
      expect(
        login.status(),
        'the supplier logs in through /v1/auth/login, which is not entitlement-gated',
      ).toBe(200)
    } finally {
      restoreModule(MODULE)
      await ctx.dispose()
    }
  })

  test('KNOWN GAP · a shared document stays readable with Portal Access switched off', () => {
    const doc = seedDocument({ title: 'E2E SUP-J10 Entitlement Probe' })
    created.documentIds.push(doc.id)
    created.shareIds.push(shareDocument(doc.id))

    expect(portalSees('documents', `id = '${doc.id}'`), 'baseline: the share works').toBe(1)

    try {
      disableModule(MODULE)
      // RLS decides what a supplier reads, and no policy on `documents`,
      // `document_versions` or `shared_with_user` mentions the entitlement plane.
      expect(
        portalSees('documents', `id = '${doc.id}'`),
        'the row survives the module being switched off',
      ).toBe(1)
      expect(
        portalSees('document_versions', `document_id = '${doc.id}'`),
        'so does its EFFECTIVE revision',
      ).toBe(1)
    } finally {
      restoreModule(MODULE)
    }
  })

  test('KNOWN GAP · the supplier dashboard still renders it', async ({ browser }) => {
    test.setTimeout(120_000)

    const doc = seedDocument({ title: 'E2E SUP-J10 Dashboard Under A Disabled Module' })
    created.documentIds.push(doc.id)
    created.shareIds.push(shareDocument(doc.id))

    disableModule(MODULE)
    const portal = await portalPage(browser)
    try {
      await portal.page.goto('/supplier', { waitUntil: 'domcontentloaded' })
      await expect(portal.page.getByRole('heading', { name: /Shared Documents/ })).toBeVisible({
        timeout: 30_000,
      })
      await expect(portal.page.getByText(doc.title, { exact: false }).first()).toBeVisible({
        timeout: 30_000,
      })
    } finally {
      await portal.context.close()
      restoreModule(MODULE)
    }
  })
})
