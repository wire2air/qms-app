// AR-J1 — internal create → routed to the supplier → full lifecycle to
// ACCEPTED, driven through the real UI.
//
// This is the journey missing from e2e/suppliers/j12 (SUP-J12, F-01 read
// exposure) and j13 (SUP-J13, F-03/F-08 accept + lifecycle guard) — both of
// those exercise the endpoints directly over HTTP/SQL. Nothing in the
// repository had walked SuppliersAssetRequestsTab's "New Request" dialog end
// to end before this.
//
// `owner` (isOwner bypass) is the acting persona for the internal half, same
// as SUP-J13 — nobody in the E2E cast holds `supplier_management:create` /
// `:approve` via an ordinary role grant (only the `author` role holds
// `supplier_management:read`), so isOwner is the only persona that can drive
// create → accept from the UI without adding a new role grant nobody else
// needs.
import { test, expect } from '@playwright/test'
import { AUTH, SUPPLIER_IDS, SUPPLIER_USER } from '../fixtures/cast.js'
import { sql, sqlValue } from '../fixtures/db.js'
import { openInternalTab, waitForRequestStatus } from '../fixtures/assetRequest.js'

test.describe('AR-J1 — create, route, lifecycle to ACCEPTED', () => {
  const createdIds = []

  test.afterAll(() => {
    for (const id of createdIds) {
      sql(`DELETE FROM asset_request_items WHERE asset_request_id = '${id}'`)
      sql(`DELETE FROM asset_requests_on_users WHERE asset_request_id = '${id}'`)
      sql(`DELETE FROM asset_requests WHERE id = '${id}'`)
    }
  })

  test('owner creates a bundle request via the New Request dialog', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: AUTH.owner })
    const page = await ctx.newPage()
    const title = `AR-J1 UI Bundle ${Date.now()}`

    await openInternalTab(page, SUPPLIER_IDS.withPortal)
    await page.getByRole('button', { name: 'New Request' }).click()

    // BaseDialog's OUTER role="dialog" is HeadlessUI's positioning wrapper
    // (class="tw:relative tw:z-modal") — it has no box of its own, so
    // Playwright reports it `hidden` forever even while the panel inside is
    // fully rendered (measured: 43 polls over 20s, all "hidden"). Key off the
    // accessible name instead, which resolves to the titled panel.
    const dialog = page.getByRole('dialog', { name: 'New Asset Request' })
    await expect(dialog.getByRole('heading', { name: 'New Asset Request' })).toBeVisible({
      timeout: 20_000,
    })
    await dialog.getByPlaceholder("What's this batch for?").fill(title)

    // Recipient — the seeded portal user (Sam Supplier). The dialog requires
    // at least one, and canSubmit() also requires totalItems > 0, so an
    // ad-hoc line is added rather than depending on the master-list types
    // seeded elsewhere being non-empty.
    await dialog.getByText(SUPPLIER_USER.name, { exact: false }).click()
    await dialog.getByRole('button', { name: 'Add ad-hoc item' }).click()
    await dialog.getByPlaceholder('Document name (required)').fill('AR-J1 Ad-hoc Certificate')

    // Legacy/edit uses "Save"; create uses "Send (N)" (N = totalItems) — see
    // SuppliersAssetRequestDialog.vue's submit button.
    await dialog.getByRole('button', { name: /^Send \(\d+\)$/ }).click()
    await expect(page.getByText('Asset request created', { exact: false })).toBeVisible({
      timeout: 15_000,
    })

    // Find it by title — DB is the source of truth for the id, since the
    // dialog does not hand one back to the test.
    const id = sqlValue(`SELECT id FROM asset_requests WHERE title = '${title}'`)
    expect(id, 'the request was actually written').toBeTruthy()
    createdIds.push(id)
    expect(sqlValue(`SELECT status_id FROM asset_requests WHERE id = '${id}'`)).toBe('PENDING')

    // The recipient landed on the join table — that is what the portal's
    // RLS-scoped read depends on.
    expect(
      sqlValue(
        `SELECT count(*) FROM asset_requests_on_users WHERE asset_request_id = '${id}' AND user_id = '${SUPPLIER_USER.id}'`,
      ),
    ).toBe('1')

    await ctx.close()
  })

  test('the supplier answers it and the internal reviewer accepts, both via UI', async ({
    browser,
  }) => {
    // Seed a fresh answered bundle rather than reusing test 1's row — file
    // upload through a real <input type=file> is exercised by
    // e2e/suppliers/j13 already (ATC-05/06); what's new here is that Accept
    // is driven by clicking "Review document" and the dialog, not a raw POST.
    const title = `AR-J1 Answered Bundle ${Date.now()}`
    const out = sql(`
      WITH a AS (
        INSERT INTO assets
          (company_id, filename, original_filename, mime_type, file_size, url, uploaded_by,
           storage_path, file_type, bucket, created_at, updated_at)
        SELECT company_id, 'iso.pdf', 'iso.pdf', 'application/pdf', 1024,
               'https://example.test/arj1-${Date.now()}.pdf', 'e2e10000-0000-4000-8000-000000000001',
               'e2e/arj1-${Date.now()}.pdf', 'ASSET', 'assets', now(), now()
        FROM asset_requests LIMIT 1
        RETURNING id, company_id
      ), r AS (
        INSERT INTO asset_requests (company_id, supplier_id, title, status_id, created_by, created_at, updated_at)
        SELECT company_id, '${SUPPLIER_IDS.withPortal}', '${title}', 'PENDING',
               'e2e10000-0000-4000-8000-000000000001', now(), now()
        FROM a
        RETURNING id
      ), i AS (
        INSERT INTO asset_request_items
          (company_id, asset_request_id, custom_title, status_id, asset_id, uploaded_at, uploaded_by, created_at, updated_at)
        SELECT a.company_id, r.id, 'ISO 9001 Certificate', 'RECEIVED', a.id, now(),
               'e2e10000-0000-4000-8000-000000000001', now(), now()
        FROM r, a
      )
      SELECT (SELECT id FROM r) || '|' || (SELECT id FROM a)
    `)
    const [id, assetId] = out.split('|')
    createdIds.push(id)
    sql(`UPDATE asset_requests SET status_id = 'RECEIVED' WHERE id = '${id}'`)

    const ctx = await browser.newContext({ storageState: AUTH.owner })
    const page = await ctx.newPage()
    try {
      await openInternalTab(page, SUPPLIER_IDS.withPortal)
      // The row is rendered by title; syncEngine needs to have picked up the
      // REST-side write via the broadcast before it appears. Each request is
      // a plain `<div v-for>` (not a table row — BaseClickableRow renders
      // role="button", not role="row", when it has no `to` target), with the
      // "Review document" action button as a SIBLING of that button inside
      // the same wrapper. Scope on the innermost element containing BOTH the
      // title text and a "Review document" control, rather than a bare
      // `div:has-text` (which would also match every ancestor up to the list
      // container).
      const requestRow = page
        .locator('div')
        .filter({ hasText: title })
        .filter({ has: page.getByTitle('Review document') })
        .last()
      await expect(requestRow).toBeVisible({ timeout: 30_000 })

      await requestRow.getByTitle('Review document').click()
      const dialog = page.getByRole('dialog')
      await expect(dialog).toBeVisible()
      await dialog.getByRole('button', { name: 'Accept' }).click()
      await dialog.getByRole('button', { name: 'Confirm Accept' }).click()

      await waitForRequestStatus(id, 'ACCEPTED')
      // Evidence must be filed onto the Documents tab (SupplierAsset), not
      // merely accepted with the file left dangling — the exact F-03 check
      // SUP-J13 makes over raw REST, reproduced here from a UI-driven accept.
      expect(
        sqlValue(
          `SELECT count(*) FROM supplier_assets WHERE supplier_id = '${SUPPLIER_IDS.withPortal}' AND asset_id = '${assetId}'`,
        ),
      ).toBe('1')
    } finally {
      await ctx.close()
      sql(`DELETE FROM supplier_assets WHERE asset_id = '${assetId}'`)
      sql(`DELETE FROM assets WHERE id = '${assetId}'`)
    }
  })
})
