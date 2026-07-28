// C6 — archive-gate reconcile (OB-01). A Document Controller who holds
// document_control:delete (tenant) but is NOT the doc's owner/author can now
// archive from the DETAIL page — matching the list view and the documents
// UPDATE/DELETE RLS, which gate on permission + scope (not owner/author).
// Previously the detail gated Archive on canDelete (delete && owner/author),
// hiding the action from a delete-permitted controller who didn't own the doc.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH, USERS } from '../fixtures/cast.js'
import { createSopDocument, uniqueTitle } from '../fixtures/documents.js'
import { findDocumentByTitle, sql, sqlRow, waitForSqlValue } from '../fixtures/db.js'

const E2ELAB = 'e2e00001-0000-4000-8000-000000000001'
const REASON = 'Retired by the Document Controller per C6 — process superseded, ISO 13485 review.'

test.describe('C6 · controller archives from the detail (OB-01 reconcile)', () => {
  test('a delete-permitted controller (not owner/author) archives from the detail', async ({ browser }) => {
    test.setTimeout(120_000)

    // Author creates the document (author = owner/author; NOT the controller).
    const authorCtx = await browser.newContext({ storageState: AUTH.author })
    const authorPage = await authorCtx.newPage()
    const title = uniqueTitle('C6-archive')
    await createSopDocument(authorPage, title)
    const doc = findDocumentByTitle(title)
    await authorCtx.close()

    // Make the controller a collaborator ONLY so the fresh DRAFT is visible to her
    // (the read gate keeps drafts private to author/collaborators). This is a
    // read-visibility setup — the archive is gated by the delete permission
    // (canArchive), which she holds as a controller, not by collaborator status
    // (a collaborator is neither owner nor author, so the old gate still hid it).
    sql(
      `INSERT INTO users_on_documents (id, document_id, user_id, company_id, created_at, updated_at)
         VALUES (gen_random_uuid(), '${doc.id}', '${USERS.controller.id}', '${E2ELAB}', NOW(), NOW())`,
    )

    // Controller (Carla) opens the detail and archives via the overflow menu.
    const ctx = await browser.newContext({ storageState: AUTH.controller })
    const page = await ctx.newPage()
    await page.goto(`/documents/${doc.id}`)
    await page.getByRole('button', { name: /more actions/i }).click()
    await page
      .getByRole('menuitem', { name: /archive document/i })
      .or(page.getByRole('button', { name: /archive document/i }))
      .first()
      .click()
    const submit = page.getByRole('button', { name: 'Archive Document' })
    await expect(submit).toBeVisible({ timeout: 10_000 })
    await page.getByPlaceholder(/Superseded by SOP-NEW/i).fill(REASON)
    await submit.click()

    // Obsoleted + soft-deleted, stamped by the controller — DB-asserted.
    await waitForSqlValue(
      `SELECT deleted_at FROM documents WHERE id = '${doc.id}' AND deleted_at IS NOT NULL`,
      { timeoutMs: 20_000, label: 'controller archived the doc' },
    )
    const row = sqlRow(`SELECT obsoleted_by, obsoletion_reason FROM documents WHERE id = '${doc.id}'`)
    expect(row[0], 'obsoleted_by = the controller').toBe(USERS.controller.id)
    expect(row[1]).toContain('Retired by the Document Controller')
    await ctx.close()
  })
})
