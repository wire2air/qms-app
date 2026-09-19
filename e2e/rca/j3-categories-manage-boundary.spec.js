// PW-J3 — Root Cause Categories: a permission-boundary journey for the
// module's single `manage` action.
//
// `routes/rootCauseCategories.js` gates all FOUR routes (create/update/
// deactivate/restore) on ONE action, `root_cause_categories:manage` — there
// is no separate create/update/delete/read action, a shape that recurs
// across this codebase (17+ modules have no distinct read action; here there
// is no distinct WRITE action either, just the one). Per
// docs/modules/rca/10-permission-matrix.md this is "consistent — and there is
// no GraphQL write surface to bypass it": `root_cause_categories` carries
// `@behavior -insert -update -delete`, so the only way to mutate it at all is
// through these four REST routes.
//
// `rcaAdmin` holds `root_cause_categories:manage`; `noAccess` holds nothing —
// both are cast reuse (rcaAdmin also drives PW-J2, noAccess is the
// standing denial persona used throughout this suite).
import { test, expect } from '@playwright/test'
import { AUTH, RCA } from '../fixtures/cast.js'
import { sqlValue } from '../fixtures/db.js'
import { quote } from '../fixtures/rca.js'

test.describe('PW-J3 · root_cause_categories manage-only boundary', () => {
  test.afterEach(() => {
    // Always leave the deactivate-target ACTIVE for the next run, regardless
    // of which assertion path executed last.
    sqlValue(
      `UPDATE root_cause_categories SET deleted_at = NULL WHERE id = '${RCA.categories.deactivateTarget.id}'`,
    )
  })

  test('holder: create, update, deactivate and restore a category through the UI', async ({
    browser,
  }) => {
    const ctx = await browser.newContext({ storageState: AUTH.rcaAdmin })
    const page = await ctx.newPage()
    try {
      await page.goto('/rca-templates?tab=categories')
      await expect(
        page.getByRole('heading', { name: 'Root Cause Categories' }),
      ).toBeVisible({ timeout: 15_000 })
      await expect(
        page.getByText("You don't have the \"Manage Root Cause Categories\" permission."),
      ).toHaveCount(0)

      // Create.
      const codeName = `E2E J3 ${Date.now()}`
      await page.getByRole('button', { name: 'Add Category' }).click()
      await page.getByRole('textbox', { name: 'Name' }).fill(codeName)
      // Code is required AND auto-derived from Name by a watcher (slugify).
      // Clicking Add before that watcher fires submits with an empty Code,
      // which required() blocks inline — no POST, no row, and no visible
      // error, which is exactly how this failed (poll saw null for 15s while
      // a hand-driven dialog with a pause created the row fine).
      await expect(page.getByPlaceholder('TRAINING_GAP')).not.toHaveValue('')
      await page.getByRole('button', { name: 'Add', exact: true }).click()
      // Assert the WRITE first: the list is a useLiveQuery over IndexedDB, so
      // the new row only renders once a sync broadcast lands. Proving the row
      // in Postgres separates "the create failed" from "the list is stale",
      // then a reload re-bootstraps IDB for the UI assertion.
      const readCreated = () =>
        sqlValue(
          `SELECT id FROM root_cause_categories WHERE name = ${quote(codeName)} AND deleted_at IS NULL`,
        )
      await expect
        .poll(readCreated, { timeout: 15_000, message: 'the category landed in Postgres' })
        .toBeTruthy()
      const created = readCreated()
      await page.reload()
      await expect(page.getByText(codeName).first()).toBeVisible({ timeout: 15_000 })

      // Update.
      const row = page.locator('tr', { has: page.getByText(codeName, { exact: true }) })
      await row.getByRole('button', { name: 'Edit' }).click()
      await page.getByRole('textbox', { name: 'Name' }).fill(`${codeName} (edited)`)
      await page.getByRole('button', { name: 'Save', exact: true }).click()
      await expect(page.getByText(`${codeName} (edited)`).first()).toBeVisible({ timeout: 15_000 })

      // Deactivate — soft delete; `code` stays taken (docs/modules/rca §10).
      const rowAfter = page.locator('tr', { has: page.getByText(`${codeName} (edited)`, { exact: true }) })
      await rowAfter.getByRole('button', { name: 'Deactivate' }).click()
      await page.getByRole('button', { name: 'Deactivate', exact: true }).click() // confirm dialog
      await expect(page.getByText(`${codeName} (edited)`)).toHaveCount(0, { timeout: 15_000 })
      expect(sqlValue(`SELECT deleted_at IS NOT NULL FROM root_cause_categories WHERE id = '${created}'`)).toBe(
        't',
      )

      // Restore — surfaced under "Deactivated (n)".
      await page.getByText(/Deactivated \(\d+\)/).click()
      const deactivatedRow = page.locator('div', {
        has: page.getByText(`${codeName} (edited)`, { exact: true }),
      })
      await deactivatedRow.getByRole('button', { name: 'Restore' }).first().click()
      await expect(page.getByText(`${codeName} (edited)`).first()).toBeVisible({ timeout: 15_000 })
      expect(sqlValue(`SELECT deleted_at IS NULL FROM root_cause_categories WHERE id = '${created}'`)).toBe('t')

      // Clean up — this is a throwaway row, unlike RCA.categories.*.
      sqlValue(`DELETE FROM root_cause_categories WHERE id = '${created}'`)
    } finally {
      await ctx.close()
    }
  })

  test('non-holder: the page is view-only, and every route refuses the write', async ({
    browser,
  }) => {
    const ctx = await browser.newContext({ storageState: AUTH.noAccess })
    const page = await ctx.newPage()
    try {
      await page.goto('/rca-templates?tab=categories')
      await expect(
        page.getByRole('heading', { name: 'Root Cause Categories' }),
      ).toBeVisible({ timeout: 15_000 })
      await expect(
        page.getByText("You don't have the \"Manage Root Cause Categories\" permission."),
      ).toBeVisible()
      await expect(page.getByRole('button', { name: 'Add Category' })).toHaveCount(0)
      // The seeded rows are still readable — `manage` covers writes only, and
      // the syncEngine model reads via SELECT-only RLS, not this action.
      await expect(page.getByText(RCA.categories.people.name)).toBeVisible()

      // All four REST routes refuse the write for a session with no grant —
      // proving the boundary is real, not merely that the button is hidden.
      const create = await page.request.post('/api/v1/services/rootCauseCategories', {
        data: { code: 'NOACCESS_PROBE', name: 'noAccess probe' },
      })
      expect(create.status()).toBe(403)

      const update = await page.request.patch(
        `/api/v1/services/rootCauseCategories/${RCA.categories.people.id}`,
        { data: { name: 'Renamed by noAccess' } },
      )
      expect(update.status()).toBe(403)

      const deactivate = await page.request.delete(
        `/api/v1/services/rootCauseCategories/${RCA.categories.people.id}`,
      )
      expect(deactivate.status()).toBe(403)

      const restore = await page.request.post(
        `/api/v1/services/rootCauseCategories/${RCA.categories.deactivateTarget.id}/restore`,
        {},
      )
      expect(restore.status()).toBe(403)

      // Nothing changed underneath the 403s.
      expect(sqlValue(`SELECT name FROM root_cause_categories WHERE id = '${RCA.categories.people.id}'`)).toBe(
        RCA.categories.people.name,
      )
      expect(
        sqlValue(`SELECT deleted_at IS NULL FROM root_cause_categories WHERE id = '${RCA.categories.people.id}'`),
      ).toBe('t')
    } finally {
      await ctx.close()
    }
  })
})
