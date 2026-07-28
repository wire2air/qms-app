// PW-J6 · List, filters, KPIs (TC-15).
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH, USERS, COMPANY_ID } from '../fixtures/cast.js'
import { createCapa, uniqueTitle } from '../fixtures/capas.js'
import { sqlValue } from '../fixtures/db.js'

test.use({ storageState: AUTH.author })

test.describe('PW-J6 · CAPAs list — KPIs, quick pills, filters', () => {
  test('KPI strip, quick-filter pills, and the Priority filter (positive + empty-state)', async ({ page }) => {
    test.setTimeout(60_000)

    // Raise one CRITICAL CAPA so the positive filter branch below has a real
    // row to match — without this the whole tenant may have zero CRITICAL
    // CAPAs and the assertion would only ever exercise the empty-state path
    // (the mistake found in the NCR suite's equivalent journey).
    const criticalTitle = uniqueTitle('J6-critical')
    await createCapa(page, criticalTitle, { priority: 'Critical' })

    await page.goto('/capas')

    // KPI strip. "Overdue" also matches the quick-filter pill further down the
    // page — the KPI label renders first in DOM order, so .first() is the KPI.
    for (const label of ['Open CAPAs', 'Overdue', 'Critical open', 'Closed this month']) {
      await expect(page.getByText(label, { exact: true }).first()).toBeVisible({ timeout: 15_000 })
    }

    // Quick-filter pills — "All open" is the default active pill.
    const pillGroup = page.getByRole('group', { name: 'Quick views' })
    for (const label of ['All open', 'My CAPAs', 'Critical', 'High', 'Overdue', 'Closed', 'Cancelled']) {
      await expect(pillGroup.getByRole('button', { name: label, exact: true })).toBeVisible()
    }
    await expect(pillGroup.getByRole('button', { name: 'All open', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    // "My CAPAs" — row count matches the owner's own open CAPAs, DB-cross-checked.
    await pillGroup.getByRole('button', { name: 'My CAPAs', exact: true }).click()
    await expect(pillGroup.getByRole('button', { name: 'My CAPAs', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    const mineExpected = Number(
      sqlValue(
        `SELECT count(*) FROM capas
          WHERE company_id = '${COMPANY_ID}' AND owner_id = '${USERS.author.id}'
            AND status_id IN ('DRAFT','PENDING') AND deleted_at IS NULL`,
      ),
    )
    // DataTable paginates at 50 rows/page (this dev DB accumulates CAPA rows
    // across every E2E run, so the true count can exceed a page).
    await expect(page.locator('table tbody tr')).toHaveCount(Math.min(mineExpected, 50), {
      timeout: 15_000,
    })

    // Back to "All open", then filter by Priority = Critical (Linear-style
    // cascading filter menu: Filter -> Priority -> Critical checkbox).
    await pillGroup.getByRole('button', { name: 'All open', exact: true }).click()
    await expect(pillGroup.getByRole('button', { name: 'All open', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    // Scope by aria-haspopup — "Filter" (substring) also matches a separate
    // table-toolbar icon button unrelated to the dimension filter menu.
    await page.locator('button[aria-haspopup="menu"]').filter({ hasText: 'Filter' }).click()
    await page.getByRole('menuitem', { name: 'Priority' }).click()
    await page.getByRole('menuitemcheckbox', { name: 'Critical', exact: true }).click()
    await page.keyboard.press('Escape')

    const criticalExpected = Number(
      sqlValue(
        `SELECT count(*) FROM capas
          WHERE company_id = '${COMPANY_ID}' AND priority_id = 'CRITICAL'
            AND status_id IN ('DRAFT','PENDING') AND deleted_at IS NULL`,
      ),
    )
    expect(criticalExpected, 'the CRITICAL CAPA raised above must be counted').toBeGreaterThan(0)
    await expect(page.locator('table tbody tr')).toHaveCount(Math.min(criticalExpected, 50), {
      timeout: 15_000,
    })
    await expect(page.getByText(criticalTitle).first()).toBeVisible()

    // Empty-state variant — a priority with (almost certainly) zero open rows
    // in this dev tenant. Cross-checked against the DB rather than assumed.
    // "Clear all" resets via the active-filter chip bar first — reusing the
    // dimension-filter popup for an uncheck+check round trip is flaky (the
    // dropdown doesn't reliably reopen right after an Escape-close).
    await page.getByRole('button', { name: 'Clear all' }).click()
    await page.locator('button[aria-haspopup="menu"]').filter({ hasText: 'Filter' }).click()
    await page.getByRole('menuitem', { name: 'Priority' }).click()
    await page.getByRole('menuitemcheckbox', { name: 'Low', exact: true }).click()
    await page.keyboard.press('Escape')

    const lowExpected = Number(
      sqlValue(
        `SELECT count(*) FROM capas
          WHERE company_id = '${COMPANY_ID}' AND priority_id = 'LOW'
            AND status_id IN ('DRAFT','PENDING') AND deleted_at IS NULL`,
      ),
    )
    if (lowExpected === 0) {
      await expect(page.getByText('No CAPAs match your filters')).toBeVisible({ timeout: 15_000 })
    } else {
      await expect(page.locator('table tbody tr')).toHaveCount(Math.min(lowExpected, 50), {
        timeout: 15_000,
      })
    }
  })
})
