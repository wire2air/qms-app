// PW-J1 — Create, edit and delete a site (the happy path).
//
// The one journey that exercises the module the way its users do, and the one
// that pins the two design decisions the dialog encodes: the code is
// auto-suggested from the name on create, and immutable on edit.
//
// The REST assertion is the reason this spec matters more than a typical CRUD
// smoke test. `sites` has a full six-route REST surface that the application
// never calls — every write on this page is a GraphQL mutation governed by
// `sites_ins`/`sites_upd`/`sites_del`. If a future change quietly routes the
// page through REST instead, the route-level enforcePermission would start
// gating it and the RLS policies would stop being load-bearing, silently
// changing which layer is actually protecting this table. Assert the path, not
// just the outcome.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH, SITES } from '../fixtures/cast.js'
import {
  gotoSites,
  uniqueSiteName,
  findSiteByName,
  purgeSiteByName,
  openRowAction,
  deleteSiteViaUi,
} from '../fixtures/sites.js'

test.describe('PW-J1 · site create → edit → delete', () => {
  test.use({ storageState: AUTH.siteAdmin })

  const name = uniqueSiteName('J1')
  const address = '10 Journey Lane, Testville'

  test.afterAll(() => purgeSiteByName(name))

  test('create: code auto-suggests, duplicate checks fire, write goes over GraphQL', async ({ page }) => {
    // Record every REST call the page makes while creating.
    const restCalls = []
    page.on('request', (req) => {
      if (req.url().includes('/v1/services/sites')) restCalls.push(`${req.method()} ${req.url()}`)
    })

    await gotoSites(page)
    await page.getByRole('button', { name: 'Create New Site' }).click()

    const nameInput = page.getByPlaceholder('e.g. New York Headquarters')
    const codeInput = page.getByPlaceholder('e.g. NY-HQ')
    await expect(nameInput).toBeVisible({ timeout: 10_000 })

    // ── code auto-suggestion (create mode only, fires on name blur) ──────────
    await nameInput.fill(name)
    await codeInput.click() // blur the name field
    // The suggestion is name → uppercase → non-alphanumerics to '-' → first 10
    // chars, de-duplicated with a numeric suffix if taken.
    await expect(codeInput).toHaveValue(/^E2E-SITE-J/, { timeout: 10_000 })
    const suggested = await codeInput.inputValue()
    expect(suggested.length, 'suggestion is capped at 10 chars + optional -N suffix').toBeLessThanOrEqual(13)

    // ── live duplicate-code check ───────────────────────────────────────────
    await codeInput.fill(SITES.primary.code) // 'HQ' — seeded, therefore taken
    await expect(page.getByText('Code already in use')).toBeVisible({ timeout: 10_000 })

    // ── live duplicate-name check (case-insensitive, per company) ───────────
    await nameInput.fill(SITES.primary.name.toUpperCase())
    await expect(page.getByText('A site with this name already exists')).toBeVisible({ timeout: 10_000 })

    // Back to valid values and submit.
    await nameInput.fill(name)
    await codeInput.fill(suggested)
    await page.getByPlaceholder('e.g. 123 Main St, New York, NY').fill(address)
    await page.getByRole('button', { name: 'Create Site' }).click()

    await expect(page.getByRole('cell', { name, exact: true })).toBeVisible({ timeout: 20_000 })

    const row = findSiteByName(name)
    expect(row, 'site row exists in the database').not.toBeNull()
    expect(row.code).toBe(suggested)
    expect(row.address).toBe(address)

    // ── the path assertion ──────────────────────────────────────────────────
    expect(restCalls, 'the Sites page must not write through the REST surface').toEqual([])
  })

  test('edit: the code is immutable, other fields are not', async ({ page }) => {
    await gotoSites(page)
    await openRowAction(page, name, 'Edit')

    await expect(page.getByText('Edit Site', { exact: true }).last()).toBeVisible({ timeout: 10_000 })

    // The design decision this journey pins: a site code is an identifier other
    // records were filed under, so edit mode disables it rather than validating
    // a change. Nothing else asserted this.
    const codeInput = page.getByPlaceholder('e.g. NY-HQ')
    await expect(codeInput).toBeDisabled()

    const newAddress = '11 Journey Lane, Testville'
    await page.getByPlaceholder('e.g. 123 Main St, New York, NY').fill(newAddress)
    await page.getByRole('button', { name: 'Update Site' }).click()

    await expect(page.getByRole('cell', { name: newAddress, exact: true })).toBeVisible({ timeout: 20_000 })
    expect(findSiteByName(name).address).toBe(newAddress)
  })

  test('delete: the row goes, and it is a soft delete despite what the dialog says', async ({ page }) => {
    await gotoSites(page)
    await deleteSiteViaUi(page, name)

    await expect(page.getByRole('cell', { name, exact: true })).toHaveCount(0, { timeout: 20_000 })

    // The confirm dialog says "This cannot be undone". The row is still there,
    // soft-deleted — the copy describes a hard delete the code does not perform.
    // Recorded here rather than asserted as correct; see PW-J9 for the
    // consequences of that gap.
    const row = findSiteByName(name)
    expect(row, 'the row survives as a soft delete').not.toBeNull()
    expect(row.deletedAt, 'deleted_at is set').not.toBeNull()
  })
})
