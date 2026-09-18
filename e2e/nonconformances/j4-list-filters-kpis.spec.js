// PW-J4 · List, filters, KPIs (TC-14).
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH, USERS, COMPANY_ID } from '../fixtures/cast.js'
import { sqlValue } from '../fixtures/db.js'

test.use({ storageState: AUTH.author })

test.describe('PW-J4 · Nonconformances list — KPIs, quick pills, filters', () => {
  test('KPI strip, quick-filter pills, and the Severity filter (incl. empty state)', async ({ page }) => {
    test.setTimeout(60_000)
    await page.goto('/nonconformances')

    // KPI strip. No "Overdue" tile: `94618bd9` / `e694297e` took the due date off
    // NC, CAPA and Quality Event ("stop showing a due date nobody acts on"), and
    // overdue was derived from it, so both the tile and its pill went with it.
    // NonconformancesHome.vue now has zero references to overdue or dueDate.
    for (const label of ['Open NCs', 'Critical open', 'Closed this month']) {
      await expect(page.getByText(label, { exact: true }).first()).toBeVisible({ timeout: 15_000 })
    }

    // Quick-filter pills — "All open" is the default active pill. "All" was added
    // alongside the Overdue removal: every other pill narrows to some subset of
    // open, so without it there was no way to see the whole register at once
    // (NonconformancesTable.vue:31-41).
    const pillGroup = page.getByRole('group', { name: 'Quick views' })
    for (const label of ['All', 'All open', 'My NCs', 'Critical', 'Major', 'Closed']) {
      await expect(pillGroup.getByRole('button', { name: label, exact: true })).toBeVisible()
    }
    await expect(pillGroup.getByRole('button', { name: 'All open', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    // "My NCs" — row count matches the owner's own open NCs, DB-cross-checked.
    await pillGroup.getByRole('button', { name: 'My NCs', exact: true }).click()
    await expect(pillGroup.getByRole('button', { name: 'My NCs', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    // `deleted_at IS NULL` mirrors the syncEngine's paranoid filtering — the UI
    // never shows soft-deleted rows, so omitting it here would over-count the
    // moment any E2E NC is deleted (e.g. once TC-10 delete-a-draft lands).
    const mineExpected = Number(
      sqlValue(
        `SELECT count(*) FROM nonconformances
          WHERE company_id = '${COMPANY_ID}' AND owner_id = '${USERS.author.id}'
            AND status_id IN ('DRAFT','OPEN') AND deleted_at IS NULL`,
      ),
    )
    // DataTable paginates at 50 rows/page (this dev DB accumulates NC rows
    // across every E2E run, so the true count can exceed a page).
    await expect(page.locator('table tbody tr')).toHaveCount(Math.min(mineExpected, 50), {
      timeout: 15_000,
    })

    // Back to "All open", then filter by Severity = Critical (Linear-style
    // cascading filter menu: Filter -> Severity -> Critical checkbox).
    await pillGroup.getByRole('button', { name: 'All open', exact: true }).click()
    await expect(pillGroup.getByRole('button', { name: 'All open', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    // Scope by aria-haspopup — "Filter" (substring) also matches a separate
    // table-toolbar icon button unrelated to the dimension filter menu.
    await page.locator('button[aria-haspopup="menu"]').filter({ hasText: 'Filter' }).click()
    await page.getByRole('menuitem', { name: 'Severity' }).click()
    await page.getByRole('menuitemcheckbox', { name: 'Critical', exact: true }).click()
    await page.keyboard.press('Escape')

    const criticalExpected = Number(
      sqlValue(
        `SELECT count(*) FROM nonconformances
          WHERE company_id = '${COMPANY_ID}' AND severity_id = 'CRITICAL'
            AND status_id IN ('DRAFT','OPEN') AND deleted_at IS NULL`,
      ),
    )
    if (criticalExpected === 0) {
      await expect(page.getByText('No nonconformances match your filters')).toBeVisible({ timeout: 15_000 })
    } else {
      await expect(page.locator('table tbody tr')).toHaveCount(Math.min(criticalExpected, 50), {
        timeout: 15_000,
      })
    }
  })
})
