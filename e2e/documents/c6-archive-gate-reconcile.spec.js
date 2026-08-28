// C6 — archive-gate reconcile (OB-01). A Document Controller who holds
// document_control:delete (tenant) but is NOT the doc's owner/author can now
// archive from the DETAIL page — matching the list view and the documents
// UPDATE/DELETE RLS, which gate on permission + scope (not owner/author).
// Previously the detail gated Archive on canDelete (delete && owner/author),
// hiding the action from a delete-permitted controller who didn't own the doc.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH, USERS } from '../fixtures/cast.js'
import { createSopDocument, openDocumentDetail, uniqueTitle } from '../fixtures/documents.js'
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

    // ── Read-visibility setup (TWO rows, not one) ───────────────────────────
    // This is setup only. The archive itself is gated by the delete permission
    // (canArchive), which Carla holds as a controller and which owes nothing to
    // either row below — she is neither owner nor author, so the pre-OB-01 gate
    // still hid the action from her. What these rows buy is the ability to SEE
    // the record at all.
    //
    // The collaborator row alone is not enough, and the comment that used to sit
    // here ("the read gate keeps drafts private to author/collaborators") is
    // stale on the document half. Measured against app-db on 2026-08-28 as
    // app_user with Carla's GUCs: with the users_on_documents row present,
    // `SELECT … FROM documents WHERE title = 'E2E C6-archive …'` returns ZERO
    // rows. `documents_sel` has no collaborator branch at all — its reachability
    // arms are is_owner / author_id / user_id / an assigned DocumentVersion task
    // / shared_with_user / (read + scope + an EFFECTIVE version exists). Only
    // `document_version_select_rls` still consults
    // `is_document_collaborator_or_owner()`, and that is what makes the two
    // tables disagree: a collaborator can read the DRAFT VERSION but not the
    // parent DOCUMENT, so the detail page renders skeletons for ever. That
    // asymmetry is a live product defect; this spec routes around it rather than
    // pretending the collaborator row works.
    //
    //   users_on_documents  → the DRAFT VERSION (document_version_select_rls)
    //   shared_with_user    → the DOCUMENT row  (documents_sel, no EFFECTIVE
    //                         requirement on that arm)
    sql(
      `INSERT INTO users_on_documents (id, document_id, user_id, company_id, created_at, updated_at)
         VALUES (gen_random_uuid(), '${doc.id}', '${USERS.controller.id}', '${E2ELAB}', NOW(), NOW())`,
    )
    sql(
      `INSERT INTO shared_with_user (id, company_id, user_id, entity_type, entity_id, granted_via, created_at, updated_at)
         VALUES (gen_random_uuid(), '${E2ELAB}', '${USERS.controller.id}', 'Document', '${doc.id}', 'MANUAL', NOW(), NOW())`,
    )

    // Controller (Carla) opens the detail and archives via the overflow menu.
    const ctx = await browser.newContext({ storageState: AUTH.controller })
    const page = await ctx.newPage()
    // A fresh context bootstraps its whole IndexedDB before the record body
    // renders — longer than the 25s default action timeout, which is what the
    // bare `goto` + `click` combination used to fail on.
    await openDocumentDetail(page, doc.id)
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
