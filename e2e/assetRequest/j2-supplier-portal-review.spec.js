// AR-J2 — the supplier portal user reviews and answers a request addressed
// to their own supplier, through the real /supplier UI.
//
// Every existing asset-request spec that touches the portal side
// (e2e/suppliers/j5, j9, j12, j13) drives it via `portalContext()` — a raw
// APIRequestContext, never a browser page. Nothing in the repository had
// opened SupplierAssetRequestsList.vue and clicked Upload before this.
//
// SUPPLIER_USER (Sam Supplier, kind EXTERNAL_SUPPLIER, SUPPLIER_IDS.withPortal)
// is deliberately absent from USERS/AUTH — auth.setup.js logs in every USERS
// entry, and one broken portal login would take the whole suite down with it
// (see cast.js's comment on SUPPLIER_USER). `freshContext` (fixtures/sites.js)
// already supports this: it accepts any `{ email }`, not just a cast key,
// specifically because "the supplier persona has no storageState of its own".
import { test, expect } from '@playwright/test'
import { SUPPLIER_IDS, SUPPLIER_USER } from '../fixtures/cast.js'
import { sql, sqlValue } from '../fixtures/db.js'
import { freshContext } from '../fixtures/sites.js'
import { chooseFileViaButton, openPortalHome, resetFixedRequest, FIXED_REQUEST } from '../fixtures/assetRequest.js'

test.describe('AR-J2 — supplier portal review + upload', () => {
  test.beforeAll(() => resetFixedRequest())
  test.afterAll(() => resetFixedRequest())

  test('the portal user sees their own request and uploads against it', async ({ browser }) => {
    const ctx = await freshContext(browser, SUPPLIER_USER)
    const page = await ctx.newPage()
    try {
      await openPortalHome(page)
      await expect(page.getByText(FIXED_REQUEST.title, { exact: false })).toBeVisible({
        timeout: 30_000,
      })

      // Expand the request card — SupplierAssetRequestsList toggles the item
      // list on a click of the summary button.
      await page.getByRole('button', { name: new RegExp(FIXED_REQUEST.title) }).click()
      await expect(page.getByText('ISO 9001 Certificate', { exact: false })).toBeVisible()

      const uploadButton = page.getByRole('button', { name: 'Upload' })
      await chooseFileViaButton(uploadButton, {
        name: 'iso9001.pdf',
        mimeType: 'application/pdf',
        buffer: Buffer.from('%PDF-1.4\n% AR-J2 supplier upload\n'),
      })
      await expect(page.getByText('Uploaded', { exact: false })).toBeVisible({ timeout: 15_000 })

      // DB is the source of truth for the roll-up — this is a single-item
      // request, so answering its one line closes the parent.
      const item = sqlValue(
        `SELECT status_id FROM asset_request_items WHERE id = '${FIXED_REQUEST.itemId}'`,
      )
      expect(item).toBe('RECEIVED')
      const parent = sqlValue(`SELECT status_id FROM asset_requests WHERE id = '${FIXED_REQUEST.id}'`)
      expect(parent).toBe('RECEIVED')

      const uploader = sqlValue(
        `SELECT uploaded_by FROM asset_request_items WHERE id = '${FIXED_REQUEST.itemId}'`,
      )
      expect(uploader, 'the uploader is recorded as the portal user, not spoofable from the client').toBe(
        SUPPLIER_USER.id,
      )
    } finally {
      await ctx.close()
    }
  })

  test('the same portal user cannot see the other supplier’s requests on the page', async ({
    browser,
  }) => {
    // A request for SUPPLIER_IDS.noPortal — RLS (asset_request_select_rls)
    // must withhold it from a portal user of SUPPLIER_IDS.withPortal. If the
    // UI ever rendered it, the module-level RLS gate the F-01 fix depends on
    // has stopped matching.
    const title = `AR-J2 Foreign ${Date.now()}`
    const foreignId = sqlValue(`
      INSERT INTO asset_requests (company_id, supplier_id, title, status_id, created_by, created_at, updated_at)
      SELECT company_id, '${SUPPLIER_IDS.noPortal}', '${title}', 'PENDING',
             created_by, now(), now()
      FROM asset_requests WHERE id = '${FIXED_REQUEST.id}'
      RETURNING id
    `)
    try {
      const ctx = await freshContext(browser, SUPPLIER_USER)
      const page = await ctx.newPage()
      try {
        await openPortalHome(page)
        await expect(page.getByText(FIXED_REQUEST.title, { exact: false })).toBeVisible({
          timeout: 30_000,
        })
        await expect(
          page.getByText(title, { exact: false }),
          'RLS must withhold a request addressed to a different supplier',
        ).toHaveCount(0)
      } finally {
        await ctx.close()
      }
    } finally {
      sql(`DELETE FROM asset_requests WHERE id = '${foreignId}'`)
    }
  })
})
