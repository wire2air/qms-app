// PW-J4 — Obsoletion / archive from detail and list (TC-09).
//   Archiving a controlled document requires a >=10-char reason (DB CHECK +
//   client validation), stamps obsoleted_at/by/reason, sets ARCHIVED and
//   soft-deletes (deleted_at). Blank and too-short reasons are blocked.
// Actor: the company OWNER — satisfies both the list gate (document_control:
// delete) and the stricter detail gate (delete + owner/author via isOwner).
import { test, expect } from '@playwright/test'
import { AUTH, USERS } from '../fixtures/cast.js'
import { createSopDocument, uniqueTitle } from '../fixtures/documents.js'
import { findDocumentByTitle, sqlRow, waitForSqlValue } from '../fixtures/db.js'

const VALID_REASON = 'Superseded by SOP-NEW-204 — process discontinued per ISO 13485 review.'

function obsoletionOf(docId) {
  const row = sqlRow(
    `SELECT status_id, obsoleted_at, obsoleted_by, obsoletion_reason, deleted_at
       FROM documents WHERE id = '${docId}'`,
  )
  if (!row) return null
  return { statusId: row[0], obsoletedAt: row[1] || null, obsoletedBy: row[2] || null, reason: row[3] || null, deletedAt: row[4] || null }
}

test.describe('PW-J4 · obsoletion (archive) from detail and list', () => {
  test('detail archive: reason validation → ARCHIVED + soft-deleted + audit stamps', async ({ browser }) => {
    test.setTimeout(120_000)
    const ctx = await browser.newContext({ storageState: AUTH.owner })
    const page = await ctx.newPage()
    const title = uniqueTitle('J4-detail')
    await createSopDocument(page, title)
    const doc = findDocumentByTitle(title)

    // Open the Archive dialog from the detail overflow menu.
    await page.getByRole('button', { name: /more actions/i }).click()
    await page.getByRole('menuitem', { name: /archive document/i })
      .or(page.getByRole('button', { name: /archive document/i }))
      .first()
      .click()
    const submit = page.getByRole('button', { name: 'Archive Document' })
    await expect(submit).toBeVisible({ timeout: 10_000 })
    const reason = page.getByPlaceholder(/Superseded by SOP-NEW/i)

    // Blank reason blocked.
    await submit.click()
    await expect(page.getByText(/reason for obsoletion is required/i)).toBeVisible()
    // Too-short reason blocked.
    await reason.fill('too short')
    await submit.click()
    await expect(page.getByText(/add a few more words/i)).toBeVisible()
    expect(obsoletionOf(doc.id).deletedAt, 'not archived yet').toBeNull()

    // Valid reason → archived.
    await reason.fill(VALID_REASON)
    await submit.click()
    await waitForSqlValue(
      `SELECT deleted_at FROM documents WHERE id = '${doc.id}' AND deleted_at IS NOT NULL`,
      { timeoutMs: 20_000, label: 'document soft-deleted' },
    )
    // Note: documents.status_id is the ACTIVE/INACTIVE state flag, not the
    // lifecycle — "Archived" is a derived display state from obsoleted_at +
    // deleted_at (lifecycle lives on document_versions). Assert the real columns.
    const o = obsoletionOf(doc.id)
    expect(o.obsoletedAt, 'obsoleted_at stamped').not.toBeNull()
    expect(o.obsoletedBy).toBe(USERS.owner.id)
    expect(o.reason).toContain('Superseded by SOP-NEW-204')
    expect(o.deletedAt, 'soft-deleted').not.toBeNull()

    // It leaves the active list.
    await page.goto('/documents')
    await expect(async () => {
      await page.reload()
      await expect(page.getByText(title, { exact: true })).toHaveCount(0)
    }).toPass({ timeout: 20_000 })
    await ctx.close()
  })

  test('list archive: row menu → Archive → ARCHIVED + soft-deleted', async ({ browser }) => {
    test.setTimeout(120_000)
    const ctx = await browser.newContext({ storageState: AUTH.owner })
    const page = await ctx.newPage()
    const title = uniqueTitle('J4-list')
    await createSopDocument(page, title)
    const doc = findDocumentByTitle(title)

    await page.goto('/documents')
    const row = page.locator('tr', { hasText: title })
    await expect(row).toBeVisible({ timeout: 15_000 })
    // The row's only action control is the 3-dot menu (icon button).
    await row.getByRole('button').last().click()
    await page.getByRole('button', { name: /^archive$/i })
      .or(page.getByRole('menuitem', { name: /^archive$/i }))
      .first()
      .click()

    const reason = page.getByPlaceholder(/Superseded by SOP-NEW/i)
    await expect(reason).toBeVisible({ timeout: 10_000 })
    await reason.fill(VALID_REASON)
    await page.getByRole('button', { name: 'Archive Document' }).click()

    await waitForSqlValue(
      `SELECT deleted_at FROM documents WHERE id = '${doc.id}' AND deleted_at IS NOT NULL`,
      { timeoutMs: 20_000, label: 'document soft-deleted (list path)' },
    )
    const o = obsoletionOf(doc.id)
    expect(o.reason).toContain('Superseded by SOP-NEW-204')
    expect(o.obsoletedAt, 'obsoleted_at stamped').not.toBeNull()
    await ctx.close()
  })
})
