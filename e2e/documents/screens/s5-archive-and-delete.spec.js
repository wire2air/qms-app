// Documents screenshots · S5 — the destructive paths.
//   Delete draft version: the audited-reason dialog and the e-signature step
//   (captured, then abandoned — the document is still needed below).
//   Archive (obsoletion): the dialog, both reason-validation states, and the
//   list after the archived document leaves it.
// Actor is the company OWNER, which satisfies both the list gate and the
// stricter detail gate (same persona PW-J4 uses).
import { test, expect } from '../../../video/fixtures/videoTest.js'
import { AUTH } from '../../fixtures/cast.js'
import { createSopDocument, uniqueTitle } from '../../fixtures/documents.js'
import { findDocumentByTitle, waitForSqlValue } from '../../fixtures/db.js'
import { shooter } from '../../fixtures/screenshots.js'

const shot = shooter('documents')

const VALID_REASON =
  'Superseded by SOP-NEW-204 — process discontinued per ISO 13485 review.'

test.describe('Documents screenshots · delete draft version + archive', () => {
  test('delete-version dialogs, then archive with reason validation', async ({ browser }) => {
    test.setTimeout(420_000)
    const ctx = await browser.newContext({ storageState: AUTH.owner })
    const page = await ctx.newPage()
    const title = uniqueTitle('S5-archive')
    await createSopDocument(page, title)
    const doc = findDocumentByTitle(title)

    // ── Delete draft version — reason, then e-signature (abandoned after) ───
    await page.getByRole('button', { name: /more actions/i }).click()
    await page
      .getByRole('menuitem', { name: /delete version|delete draft/i })
      .or(page.getByRole('button', { name: /delete version|delete draft/i }))
      .first()
      .click()
    const reasonBox = page.getByPlaceholder(/Why is this draft being deleted/i)
    await expect(reasonBox).toBeVisible({ timeout: 15_000 })
    await shot(page, 'delete-version-dialog')

    await reasonBox.fill('Screenshot run — draft created in error.')
    await page.getByRole('button', { name: /^continue$/i }).click()
    await expect(page.getByPlaceholder('Enter your e-signature PIN')).toBeVisible({
      timeout: 15_000,
    })
    await shot(page, 'delete-version-esign')
    // Abandon the deletion — this document is archived below instead. The
    // e-sign dialog is `persistent`, so Escape is a no-op: use its Cancel.
    await page.getByRole('button', { name: /^cancel$/i }).last().click()
    await expect(page.getByPlaceholder('Enter your e-signature PIN')).toBeHidden({
      timeout: 10_000,
    })

    // ── Archive (obsoletion) from the detail overflow menu ─────────────────
    await page.getByRole('button', { name: /more actions/i }).click()
    await page
      .getByRole('menuitem', { name: /archive document/i })
      .or(page.getByRole('button', { name: /archive document/i }))
      .first()
      .click()
    const submit = page.getByRole('button', { name: 'Archive Document' })
    await expect(submit).toBeVisible({ timeout: 15_000 })
    await shot(page, 'archive-dialog')

    // Blank reason is blocked…
    await submit.click()
    await expect(page.getByText(/reason for obsoletion is required/i)).toBeVisible({
      timeout: 10_000,
    })
    await shot(page, 'archive-validation-required')

    // …and so is a too-short one.
    const reason = page.getByPlaceholder(/Superseded by SOP-NEW/i)
    await reason.fill('too short')
    await submit.click()
    await expect(page.getByText(/add a few more words/i)).toBeVisible({ timeout: 10_000 })
    await shot(page, 'archive-validation-too-short')

    // A valid reason archives (obsoletes + soft-deletes) and returns to the list.
    await reason.fill(VALID_REASON)
    await shot(page, 'archive-dialog-filled')
    await submit.click()
    await waitForSqlValue(
      `SELECT deleted_at FROM documents WHERE id = '${doc.id}' AND deleted_at IS NOT NULL`,
      { timeoutMs: 30_000, label: 'document soft-deleted' },
    )

    // The archived document leaves the active list.
    await page.goto('/documents')
    const search = page.getByPlaceholder('Search…', { exact: true })
    await expect(search).toBeVisible({ timeout: 20_000 })
    await search.fill(title)
    await expect(async () => {
      await expect(page.getByText(title, { exact: true })).toHaveCount(0)
    }).toPass({ timeout: 30_000 })
    // Captured unfiltered — the workspace as it stands once the document is gone.
    await page.goto('/documents')
    await expect(page.getByPlaceholder('Search…', { exact: true })).toBeVisible({ timeout: 20_000 })
    await shot(page, 'list-after-archive')

    await ctx.close()
  })
})
