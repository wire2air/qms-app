// PW-J3 — Rejection loop + cancel review (TC-06/07).
//   (a) Author submits → reviewer REJECTS with a comment → version REJECTED,
//       sections editable again → author RESUBMITS → back to IN_REVIEW.
//   (b) A fresh doc: author CANCELS review while the ACTION step is active →
//       version back to DRAFT.
// Authoritative facts are asserted against the DB; the UI status chip is checked
// reload-tolerantly (status flips arrive via sync-back).
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH, USERS } from '../fixtures/cast.js'
import {
  createSopDocument,
  fillAllSections,
  submitForReview,
  rejectCurrentTask,
  cancelReview,
  expectStatusEventually,
  uniqueTitle,
} from '../fixtures/documents.js'
import { findDocumentByTitle, versionsOf, waitForSqlValue } from '../fixtures/db.js'

async function authorSubmits(browser, tag) {
  const ctx = await browser.newContext({ storageState: AUTH.author })
  const page = await ctx.newPage()
  const title = uniqueTitle(tag)
  await createSopDocument(page, title)
  const created = findDocumentByTitle(title)
  await fillAllSections(page, created.id)
  await submitForReview(page)
  const doc = findDocumentByTitle(title)
  const [version] = versionsOf(doc.id)
  expect(version.statusId).toBe('IN_REVIEW')
  return { ctx, page, doc, version }
}

async function waitForReviewerTask(versionId) {
  await waitForSqlValue(
    `SELECT count(*) FROM task_instances WHERE entity_id = '${versionId}'
       AND assigned_to = '${USERS.reviewer.id}' AND status_id IN ('ASSIGNED','FORM_SUBMITTED')`,
    { timeoutMs: 30_000, label: 'reviewer task assigned' },
  )
}

test.describe('PW-J3 · rejection loop + cancel review', () => {
  test('reviewer rejects → REJECTED → author resubmits → IN_REVIEW', async ({ browser }) => {
    test.setTimeout(180_000)
    const { ctx: authorCtx, page: authorPage, doc, version } = await authorSubmits(browser, 'J3-reject')
    await waitForReviewerTask(version.id)
    await authorCtx.close()

    // Reviewer rejects with a comment.
    const reviewerCtx = await browser.newContext({ storageState: AUTH.reviewer })
    const reviewerPage = await reviewerCtx.newPage()
    await rejectCurrentTask(reviewerPage, doc.id, 'E2E reject — tighten the acceptance criteria.')
    const rejected = await waitForSqlValue(
      `SELECT status_id FROM document_versions WHERE id = '${version.id}' AND status_id = 'REJECTED'`,
      { timeoutMs: 30_000, label: 'version REJECTED' },
    )
    expect(rejected).toBe('REJECTED')
    await reviewerCtx.close()

    // Author sees the rejected state and the version is editable again; resubmit.
    const author2 = await browser.newContext({ storageState: AUTH.author })
    const authorPage2 = await author2.newPage()
    await authorPage2.goto(`/documents/${doc.id}`)
    await expectStatusEventually(authorPage2, /rejected/i)
    // A REJECTED version exposes Submit For Review again — resubmit through it.
    await submitForReview(authorPage2)
    const back = await waitForSqlValue(
      `SELECT status_id FROM document_versions WHERE id = '${version.id}' AND status_id = 'IN_REVIEW'`,
      { timeoutMs: 30_000, label: 'version back to IN_REVIEW' },
    )
    expect(back).toBe('IN_REVIEW')
    await author2.close()
  })

  test('author cancels review while the ACTION step is active → DRAFT', async ({ browser }) => {
    test.setTimeout(180_000)
    const { ctx: authorCtx, page: authorPage, doc, version } = await authorSubmits(browser, 'J3-cancel')
    await waitForReviewerTask(version.id)

    await cancelReview(authorPage, doc.id)
    const draft = await waitForSqlValue(
      `SELECT status_id FROM document_versions WHERE id = '${version.id}' AND status_id = 'DRAFT'`,
      { timeoutMs: 30_000, label: 'version back to DRAFT' },
    )
    expect(draft).toBe('DRAFT')
    // The active workflow tasks are cancelled — no live reviewer task remains.
    const liveTasks = await waitForSqlValue(
      `SELECT CASE WHEN count(*) = 0 THEN 'none' END FROM task_instances
         WHERE entity_id = '${version.id}' AND status_id IN ('ASSIGNED','FORM_SUBMITTED')`,
      { timeoutMs: 20_000, label: 'reviewer tasks cleared' },
    )
    expect(liveTasks).toBe('none')
    await authorCtx.close()
  })
})
