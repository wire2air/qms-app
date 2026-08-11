// Documents screenshots · S4 — the rejection loop and cancel-review.
//   Reviewer rejects the ACTION step with a required comment → the author's
//   REJECTED view → resubmit → the author cancels the live review → DRAFT.
// One document carries the whole loop (same flow as PW-J3).
import { test, expect } from '../../../video/fixtures/videoTest.js'
import { AUTH, USERS } from '../../fixtures/cast.js'
import {
  createSopDocument,
  fillAllSections,
  submitForReview,
  expectStatusEventually,
  gotoDoc,
  uniqueTitle,
} from '../../fixtures/documents.js'
import { findDocumentByTitle, versionsOf, waitForSqlValue } from '../../fixtures/db.js'
import { shooter } from '../../fixtures/screenshots.js'

const shot = shooter('documents')

async function waitForReviewerTask(versionId) {
  await waitForSqlValue(
    `SELECT count(*) FROM task_instances WHERE entity_id = '${versionId}'
       AND assigned_to = '${USERS.reviewer.id}' AND status_id IN ('ASSIGNED','FORM_SUBMITTED')`,
    { timeoutMs: 45_000, label: 'reviewer task assigned' },
  )
}

test.describe('Documents screenshots · reject + cancel review', () => {
  test('reject dialog → REJECTED → resubmit → cancel review → DRAFT', async ({ browser }) => {
    test.setTimeout(600_000)

    // ── Author submits ─────────────────────────────────────────────────────
    const authorCtx = await browser.newContext({ storageState: AUTH.author })
    const authorPage = await authorCtx.newPage()
    const title = uniqueTitle('S4-reject')
    await createSopDocument(authorPage, title)
    const created = findDocumentByTitle(title)
    await fillAllSections(authorPage, created.id)
    await submitForReview(authorPage)
    const doc = findDocumentByTitle(title)
    const [version] = versionsOf(doc.id)
    expect(version.statusId).toBe('IN_REVIEW')
    await waitForReviewerTask(version.id)
    await authorCtx.close()

    // ── Reviewer rejects with a comment ────────────────────────────────────
    const reviewerCtx = await browser.newContext({ storageState: AUTH.reviewer })
    const reviewerPage = await reviewerCtx.newPage()
    await gotoDoc(reviewerPage, doc.id)
    const rejectBtn = reviewerPage.getByRole('button', { name: /^reject$/i }).first()
    await expect(rejectBtn).toBeVisible({ timeout: 30_000 })
    await rejectBtn.click()

    const commentBox = reviewerPage.getByLabel('Comment (required)')
    await expect(commentBox).toBeVisible({ timeout: 15_000 })
    await commentBox.fill('Screenshot reject — tighten the acceptance criteria in section 2.')
    await shot(reviewerPage, 'reject-dialog')
    await reviewerPage.getByRole('button', { name: /^reject$/i }).last().click()

    await waitForSqlValue(
      `SELECT status_id FROM document_versions WHERE id = '${version.id}' AND status_id = 'REJECTED'`,
      { timeoutMs: 45_000, label: 'version REJECTED' },
    )
    await reviewerCtx.close()

    // ── The author's rejected view ─────────────────────────────────────────
    const author2 = await browser.newContext({ storageState: AUTH.author })
    const authorPage2 = await author2.newPage()
    await gotoDoc(authorPage2, doc.id)
    await expectStatusEventually(authorPage2, /rejected/i)
    await shot(authorPage2, 'detail-rejected')

    // ── Resubmit, then cancel the live review ──────────────────────────────
    await submitForReview(authorPage2)
    await waitForSqlValue(
      `SELECT status_id FROM document_versions WHERE id = '${version.id}' AND status_id = 'IN_REVIEW'`,
      { timeoutMs: 45_000, label: 'version back to IN_REVIEW' },
    )
    await waitForReviewerTask(version.id)

    // Cancel Review is an inline action (priority 90, above Print/Reports), but
    // it only renders once the resubmitted version AND its new workflow instance
    // have synced into this context — so wait reload-tolerantly rather than
    // assuming one load is enough.
    await gotoDoc(authorPage2, doc.id)
    const inlineCancel = authorPage2.getByRole('button', { name: /cancel review/i }).first()
    await expect(async () => {
      if (await inlineCancel.isVisible({ timeout: 3_000 }).catch(() => false)) return
      await authorPage2.reload({ waitUntil: 'domcontentloaded' })
      await expect(inlineCancel).toBeVisible({ timeout: 5_000 })
    }).toPass({ timeout: 60_000 })
    await shot(authorPage2, 'detail-in-review-actions')

    // No confirm step on this path — handleCancelReview calls the RPC directly,
    // so the version goes back to DRAFT on the click itself.
    await inlineCancel.click()

    await waitForSqlValue(
      `SELECT status_id FROM document_versions WHERE id = '${version.id}' AND status_id = 'DRAFT'`,
      { timeoutMs: 45_000, label: 'version back to DRAFT' },
    )
    await expectStatusEventually(authorPage2, /draft/i)
    await shot(authorPage2, 'detail-draft-after-cancel')
    await author2.close()
  })
})
