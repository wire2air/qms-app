// PW-J2 — List, paginate and export.
//
// The Sites page is a plain DataTable over a full client-side `db.Site.where()`
// scan: no server pagination, no server search, no server-side export. That is
// entirely reasonable at the scale a tenant has sites, and this journey pins
// the consequences of that choice rather than treating them as defects — the
// page size, the export contents, and one absence.
//
// The absence matters most. Site deletion is a SOFT delete (PW-J1 proves the
// row survives with deleted_at set), and there is no "show deleted" toggle
// anywhere on this page — so a deleted site is unreachable and unrestorable
// through the UI, despite still existing. Asserting that today is what makes it
// visible the day someone builds restore and forgets the toggle, or ships the
// toggle without restore.
import { test, expect } from '@playwright/test'
import { AUTH, SITES, COMPANY_ID } from '../fixtures/cast.js'
import { gotoSites, liveSiteCount } from '../fixtures/sites.js'
import { sqlValue } from '../fixtures/db.js'

test.describe('PW-J2 · the sites list, its page size and its export', () => {
  test.use({ storageState: AUTH.siteAdmin })

  test('every live site in the tenant is listed', async ({ page }) => {
    await gotoSites(page)
    // Client-side scan with no pagination cut-off at this size: what is in the
    // table should be exactly what is in the tenant.
    await expect(page.getByRole('cell', { name: SITES.primary.name, exact: true })).toBeVisible({
      timeout: 20_000,
    })
    await expect(page.getByRole('cell', { name: SITES.secondary.name, exact: true })).toBeVisible()

    const rows = await page.getByRole('row').count()
    // rows includes the header row.
    expect(rows - 1, 'row count matches the live sites in the database').toBe(liveSiteCount(COMPANY_ID))
  })

  test('the visible columns are the ones the module considers meaningful', async ({ page }) => {
    await gotoSites(page)
    for (const header of ['SITE NAME', 'CODE', 'ADDRESS', 'TIMEZONE', 'CREATED']) {
      await expect(page.getByRole('columnheader', { name: header })).toBeVisible({ timeout: 20_000 })
    }
  })

  test('search narrows the list without a round trip', async ({ page }) => {
    await gotoSites(page)
    await expect(page.getByRole('cell', { name: SITES.secondary.name, exact: true })).toBeVisible({
      timeout: 20_000,
    })

    // No REST/GraphQL traffic should be needed — the whole table is already in
    // IndexedDB. Recording it makes an accidental move to server-side search
    // visible rather than silent.
    const calls = []
    page.on('request', (req) => {
      if (/\/api\/(graphql|v1\/services\/sites)/.test(req.url())) calls.push(req.url())
    })

    // The table's own search box, by its aria-label. A bare
    // getByPlaceholder(/search/i) also matches the app-shell search that
    // PageHeader teleports into the top bar; filling that one leaves the table
    // untouched, so the assertion fails for a reason unrelated to the table.
    await page.getByLabel('Search table').fill(SITES.primary.name)
    await expect(page.getByRole('cell', { name: SITES.secondary.name, exact: true })).toHaveCount(0, {
      timeout: 10_000,
    })
    await expect(page.getByRole('cell', { name: SITES.primary.name, exact: true })).toBeVisible()
    expect(calls, 'search is client-side').toEqual([])
  })

  test('export offers the visible columns as CSV', async ({ page }) => {
    await gotoSites(page)
    await page.getByRole('button', { name: 'Export' }).click()

    // The export manager dialog lets the operator choose columns and format.
    // Field labels come straight from the column definitions, so they carry the
    // table's own casing (SitesTable.vue:30-34) rather than a prettified copy.
    await expect(page.getByText('Choose columns and format')).toBeVisible({ timeout: 10_000 })
    for (const field of ['SITE NAME', 'CODE', 'ADDRESS', 'TIMEZONE']) {
      await expect(
        page.getByText(field, { exact: true }).first(),
        `${field} is exportable`,
      ).toBeVisible()
    }

    const download = page.waitForEvent('download', { timeout: 30_000 })
    await page.getByRole('button', { name: 'Export', exact: true }).last().click()
    const file = await download

    expect(file.suggestedFilename(), 'exports as the configured CSV filename').toMatch(/\.csv$/)
  })

  test('there is no way to see or restore a deleted site', async ({ page }) => {
    // Pinning an absence, deliberately. `sites.deleted_at` is real and populated
    // (see PW-J1), the RLS SELECT policy does not filter on it, and the model is
    // paranoid — so the data for a restore feature is all present. The UI simply
    // has no entry point, which makes a site deletion irreversible in practice
    // while the confirm dialog's "This cannot be undone" is technically false.
    await gotoSites(page)
    await expect(page.getByRole('button', { name: /deleted|archived|trash/i })).toHaveCount(0)
    await expect(page.getByRole('checkbox', { name: /deleted|archived/i })).toHaveCount(0)

    const softDeleted = Number(
      sqlValue(`SELECT count(*) FROM sites WHERE company_id = '${COMPANY_ID}' AND deleted_at IS NOT NULL`),
    )
    // Not an assertion about the count — just recording that when this number is
    // non-zero, those rows are invisible and unrecoverable from this page.
    expect(softDeleted, 'soft-deleted sites are countable in the database').toBeGreaterThanOrEqual(0)
  })
})
