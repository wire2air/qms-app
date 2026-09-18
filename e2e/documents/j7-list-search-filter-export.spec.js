// PW-J7 — Documents list: search, status filter, CSV export (S-01 workspace).
//   Fixtures: three docs sharing a run tag —
//     A: author-owned, stays DRAFT
//     B: company-owner-owned, stays DRAFT   (for owner-NAME search)
//     C: author-owned, submitted → IN_REVIEW (for the status filter)
//   The list is viewed as the company OWNER (isOwner bypass) so all three are
//   visible regardless of read-scope. Coverage:
//     (1) free-text search narrows to the matching title;
//     (2) search matches the OWNER's *name*, not the id (DC-L-03 regression);
//     (3) the Status filter shows only the chosen lifecycle state;
//     (4) Export downloads a CSV of the current (filtered) view.
import { test, expect } from '../../video/fixtures/videoTest.js'
import fs from 'node:fs'
import { AUTH } from '../fixtures/cast.js'
import { createSopDocument, fillAllSections, submitForReview, uniqueTitle } from '../fixtures/documents.js'
import { findDocumentByTitle, waitForSqlValue } from '../fixtures/db.js'

async function createDoc(browser, storageState, title) {
  const ctx = await browser.newContext({ storageState })
  const page = await ctx.newPage()
  await createSopDocument(page, title)
  const doc = findDocumentByTitle(title)
  return { ctx, page, doc }
}

/** The table's own search box (distinct from the global command-bar search). */
function tableSearch(page) {
  return page.getByPlaceholder('Search…', { exact: true })
}

test.describe.serial('PW-J7 · list search, status filter, export', () => {
  let tag, titleA, titleB, titleC

  test.beforeAll(async ({ browser }) => {
    tag = uniqueTitle('J7').replace(/^E2E /, '') // e.g. "J7 1699999999999"
    titleA = `${tag} A`
    titleB = `${tag} B`
    titleC = `${tag} C`

    // A — author-owned draft.
    const a = await createDoc(browser, AUTH.author, titleA)
    await a.ctx.close()
    // B — company-owner-owned draft (owner column resolves to "Olivia Owner").
    const b = await createDoc(browser, AUTH.owner, titleB)
    await b.ctx.close()
    // C — author-owned, driven to IN_REVIEW.
    const c = await createDoc(browser, AUTH.author, titleC)
    await fillAllSections(c.page, c.doc.id)
    await submitForReview(c.page)
    await waitForSqlValue(
      `SELECT status_id FROM document_versions WHERE document_id = '${c.doc.id}' AND status_id = 'IN_REVIEW'`,
      { timeoutMs: 30_000, label: 'doc C IN_REVIEW' },
    )
    await c.ctx.close()
  })

  test('free-text search narrows the list to the matching title', async ({ browser }) => {
    test.setTimeout(120_000)
    const ctx = await browser.newContext({ storageState: AUTH.owner })
    const page = await ctx.newPage()
    await page.goto('/documents')
    const search = tableSearch(page)
    await expect(search).toBeVisible({ timeout: 20_000 })

    // Scope to our run, then narrow to A only.
    await search.fill(tag)
    await expect(page.getByText(titleA).first()).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText(titleC).first()).toBeVisible()

    await search.fill(titleA)
    await expect(page.getByText(titleA).first()).toBeVisible()
    await expect(page.getByText(titleC)).toHaveCount(0)
    await expect(page.getByText(titleB)).toHaveCount(0)
    await ctx.close()
  })

  test('search matches the owner name, not the id (DC-L-03)', async ({ browser }) => {
    test.setTimeout(120_000)
    const ctx = await browser.newContext({ storageState: AUTH.owner })
    const page = await ctx.newPage()
    await page.goto('/documents')
    const search = tableSearch(page)
    await expect(search).toBeVisible({ timeout: 20_000 })

    // "Olivia" appears in no title — B matches only via its owner column
    // (searchValue = the owner's *name*). A (owned by Aaron) must drop out.
    await search.fill('Olivia')
    await expect(page.getByText(titleB).first()).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText(titleA)).toHaveCount(0)
    await ctx.close()
  })

  test('status filter shows only documents in the chosen lifecycle state', async ({ browser }) => {
    test.setTimeout(120_000)
    const ctx = await browser.newContext({ storageState: AUTH.owner })
    const page = await ctx.newPage()
    await page.goto('/documents')
    const search = tableSearch(page)
    await expect(search).toBeVisible({ timeout: 20_000 })
    await search.fill(tag) // scope to A/B/C
    await expect(page.getByText(titleC).first()).toBeVisible({ timeout: 15_000 })

    // Page-level filter toolbar (rendered above the table) → Status → In Review.
    await page.getByRole('button', { name: /^filter$/i }).first().click()
    await page.getByRole('menuitem', { name: 'Status' }).click()
    await page.getByRole('menuitemcheckbox', { name: /in review/i }).click()
    await page.keyboard.press('Escape')

    // Only C (IN_REVIEW) survives; A and B (DRAFT) are filtered out.
    await expect(page.getByText(titleC).first()).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText(titleA)).toHaveCount(0)
    await expect(page.getByText(titleB)).toHaveCount(0)
    await ctx.close()
  })

  test('export downloads a CSV of the current filtered view', async ({ browser }) => {
    test.setTimeout(120_000)
    const ctx = await browser.newContext({ storageState: AUTH.owner })
    const page = await ctx.newPage()
    await page.goto('/documents')
    const search = tableSearch(page)
    await expect(search).toBeVisible({ timeout: 20_000 })
    await search.fill(tag)
    await expect(page.getByText(titleA).first()).toBeVisible({ timeout: 15_000 })

    // Open the export dialog (table toolbar) and confirm (scope defaults to the
    // current filtered view).
    await page.getByRole('button', { name: 'Export' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByText(/choose columns/i)).toBeVisible({ timeout: 10_000 })
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      dialog.getByRole('button', { name: 'Export' }).click(),
    ])
    const path = await download.path()
    const csv = fs.readFileSync(path, 'utf8')
    expect(csv).toContain(titleA)
    expect(csv).toContain(titleB)
    expect(csv).toContain(titleC)
    await ctx.close()
  })
})
