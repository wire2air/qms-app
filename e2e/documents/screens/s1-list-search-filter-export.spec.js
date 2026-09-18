// Documents screenshots · S1 — the list workspace.
//   Stats cards + table, free-text search, the filter menu (open / status
//   options / applied), the no-results state, a row's action menu, the export
//   dialog, and the read-only (auditor) view with no create affordance.
//
// Fixtures/selectors are the ones PW-J7 and PW-J9 already use — nothing new is
// invented here. Every capture asserts the expected UI state first; `shot()`
// then adds the deliberate 3s observation pause (see fixtures/screenshots.js).
import { test, expect } from '../../../video/fixtures/videoTest.js'
import { AUTH } from '../../fixtures/cast.js'
import { createSopDocument, uniqueTitle } from '../../fixtures/documents.js'
import { shooter } from '../../fixtures/screenshots.js'

const shot = shooter('documents')

/** The table's own search box (distinct from the global command-bar search). */
function tableSearch(page) {
  return page.getByPlaceholder('Search…', { exact: true })
}

test.describe.serial('Documents screenshots · list, search, filters, export', () => {
  let tag, titleA, titleB

  test.beforeAll(async ({ browser }) => {
    tag = uniqueTitle('S1').replace(/^E2E /, '') // e.g. "S1 1699999999999"
    titleA = `${tag} A`
    titleB = `${tag} B`

    // Two drafts under one run tag: A authored by Aaron, B by the owner (so the
    // Owner column shows two different people in the captures).
    const a = await browser.newContext({ storageState: AUTH.author })
    await createSopDocument(await a.newPage(), titleA)
    await a.close()
    const b = await browser.newContext({ storageState: AUTH.owner })
    await createSopDocument(await b.newPage(), titleB)
    await b.close()
  })

  test('list, search, filter menu and no-results', async ({ browser }) => {
    test.setTimeout(300_000)
    const ctx = await browser.newContext({ storageState: AUTH.owner })
    const page = await ctx.newPage()

    // ── The workspace as it lands ──────────────────────────────────────────
    await page.goto('/documents')
    const search = tableSearch(page)
    await expect(search).toBeVisible({ timeout: 20_000 })
    await expect(page.getByRole('button', { name: 'Create Document' })).toBeVisible()
    await shot(page, 'list')

    // ── Free-text search narrowed to this run's two documents ──────────────
    await search.fill(tag)
    await expect(page.getByText(titleA).first()).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText(titleB).first()).toBeVisible()
    await shot(page, 'list-search')

    // ── Filter menu (page-level toolbar above the table) ───────────────────
    await page.getByRole('button', { name: /^filter$/i }).first().click()
    const statusItem = page.getByRole('menuitem', { name: 'Status' })
    await expect(statusItem).toBeVisible({ timeout: 10_000 })
    await shot(page, 'list-filter-menu')

    await statusItem.click()
    const draftOption = page.getByRole('menuitemcheckbox', { name: /^draft$/i })
    await expect(draftOption).toBeVisible({ timeout: 10_000 })
    await shot(page, 'list-filter-status-options')

    // ── Status = Draft applied (both fixtures are DRAFT, so both survive) ───
    await draftOption.click()
    await page.keyboard.press('Escape')
    await expect(page.getByText(titleA).first()).toBeVisible({ timeout: 15_000 })
    await shot(page, 'list-filter-applied')

    // ── No-results (search that matches nothing; filters are URL-synced, so a
    //    clean goto drops the status filter) ────────────────────────────────
    await page.goto('/documents')
    await expect(tableSearch(page)).toBeVisible({ timeout: 20_000 })
    await tableSearch(page).fill('zzzz-no-such-document-zzzz')
    await expect(page.getByText('No matching results')).toBeVisible({ timeout: 15_000 })
    await shot(page, 'list-no-results')

    await ctx.close()
  })

  test('row action menu and export dialog', async ({ browser }) => {
    test.setTimeout(240_000)
    const ctx = await browser.newContext({ storageState: AUTH.owner })
    const page = await ctx.newPage()
    await page.goto('/documents')
    const search = tableSearch(page)
    await expect(search).toBeVisible({ timeout: 20_000 })
    await search.fill(titleA)

    // The row's only action control is the 3-dot menu (icon button) — PW-J4.
    const row = page.locator('tr', { hasText: titleA })
    await expect(row).toBeVisible({ timeout: 15_000 })
    await row.getByRole('button').last().click()
    await expect(
      page
        .getByRole('menuitem', { name: /^archive$/i })
        .or(page.getByRole('button', { name: /^archive$/i }))
        .first(),
    ).toBeVisible({ timeout: 10_000 })
    await shot(page, 'list-row-menu')
    await page.keyboard.press('Escape')

    // Export (table toolbar) → column chooser, scoped to the filtered view.
    await search.fill(tag)
    await expect(page.getByText(titleA).first()).toBeVisible({ timeout: 15_000 })
    await page.getByRole('button', { name: 'Export' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByText(/choose columns/i)).toBeVisible({ timeout: 10_000 })
    await shot(page, 'list-export-dialog')

    await ctx.close()
  })

  test('read-only list for the auditor (document_control:read only)', async ({ browser }) => {
    test.setTimeout(120_000)
    const ctx = await browser.newContext({ storageState: AUTH.auditor })
    const page = await ctx.newPage()
    await page.goto('/documents')
    await expect(page).toHaveURL(/\/documents/)
    await expect(tableSearch(page)).toBeVisible({ timeout: 20_000 })
    // Admitted, but with no create affordance (PW-J9).
    await expect(page.getByRole('button', { name: 'Create Document' })).toHaveCount(0)
    await shot(page, 'list-readonly-auditor')
    await ctx.close()
  })
})
