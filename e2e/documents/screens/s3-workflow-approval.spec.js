// Documents screenshots · S3 — the approval workflow, end to end.
//   Author: training reminder → workflow preview dialog (reviewers picked) →
//   IN_REVIEW detail → the workflow instance page.
//   Reviewer: the assigned ACTION step + its comment dialog.
//   Approver: the e-signature PIN dialog → EFFECTIVE version (with the audit
//   snapshot in the rail).
//   Author again: Create New Revision dialog → the v2.0 draft → Change Control
//   tab (revision-only, so it does not exist before this point).
//
// Same chain PW-J2 / PW-J5 drive, with the mid-flow dialogs captured through the
// fixture's inert-by-default hooks.
import { test, expect } from '../../../video/fixtures/videoTest.js'
import { AUTH, ESIGN_PIN, USERS } from '../../fixtures/cast.js'
import {
  createSopDocument,
  fillAllSections,
  submitForReview,
  expectStatusEventually,
  clickWhenReady,
  gotoDoc,
  uniqueTitle,
} from '../../fixtures/documents.js'
import { findDocumentByTitle, versionsOf, waitForSqlValue } from '../../fixtures/db.js'
import { shooter } from '../../fixtures/screenshots.js'

const shot = shooter('documents')

test.describe('Documents screenshots · workflow, approval, revision', () => {
  test('submit → review → e-sign → effective → new revision', async ({ browser }) => {
    test.setTimeout(900_000) // two contexts + a worker-gated EFFECTIVE transition

    // ── Author: complete draft, then submit ────────────────────────────────
    const authorCtx = await browser.newContext({ storageState: AUTH.author })
    const authorPage = await authorCtx.newPage()
    const title = uniqueTitle('S3-workflow')
    await createSopDocument(authorPage, title)
    const created = findDocumentByTitle(title)
    await fillAllSections(authorPage, created.id)
    await expect(authorPage.locator('section .section-content').first()).toBeVisible()
    await shot(authorPage, 'detail-draft-sections-filled')

    await submitForReview(authorPage, {
      async onTrainingGate(p) {
        // Training is enabled on the version but has no audience yet.
        await expect(p.getByText('Finish training setup')).toBeVisible({ timeout: 10_000 })
        await shot(p, 'detail-submit-training-reminder')
      },
      async onWorkflowDialog(p, dialog) {
        // Reviewers already picked per step; Submit is enabled.
        await expect(dialog.getByRole('button', { name: 'Submit for Review' })).toBeEnabled()
        await shot(p, 'detail-submit-workflow-preview')
      },
    })

    const doc = findDocumentByTitle(title)
    const [version] = versionsOf(doc.id)
    expect(version.statusId).toBe('IN_REVIEW')
    await expectStatusEventually(authorPage, /in review/i)
    await shot(authorPage, 'detail-in-review')

    // ── The workflow instance behind the review ────────────────────────────
    await authorPage.getByRole('button', { name: /more actions/i }).click()
    const showWorkflow = authorPage.getByRole('menuitem', { name: /show workflow/i })
    if (await showWorkflow.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await showWorkflow.click()
    } else {
      await authorPage.keyboard.press('Escape')
      await authorPage.getByRole('button', { name: /show workflow/i }).first().click()
    }
    await expect(authorPage).toHaveURL(/\/workflow-instances\/[0-9a-f-]{36}/, { timeout: 20_000 })
    await expect(authorPage.getByText(/step/i).first()).toBeVisible({ timeout: 20_000 })
    await shot(authorPage, 'workflow-instance')
    await authorCtx.close()

    // ── Reviewer (step 1, ACTION + required comment) ───────────────────────
    await waitForSqlValue(
      `SELECT count(*) FROM task_instances WHERE entity_id = '${version.id}'
         AND assigned_to = '${USERS.reviewer.id}' AND status_id IN ('ASSIGNED','FORM_SUBMITTED')`,
      { timeoutMs: 45_000, label: 'reviewer task assigned' },
    )
    const reviewerCtx = await browser.newContext({ storageState: AUTH.reviewer })
    const reviewerPage = await reviewerCtx.newPage()
    await gotoDoc(reviewerPage, doc.id)
    await expect(reviewerPage.getByRole('button', { name: /^approve$/i }).first()).toBeVisible({
      timeout: 30_000,
    })
    await shot(reviewerPage, 'detail-reviewer-task')

    await clickWhenReady(reviewerPage, reviewerPage.getByRole('button', { name: /^approve$/i }))
    const reviewDialog = reviewerPage.getByRole('dialog').last()
    if (await reviewDialog.isVisible({ timeout: 5_000 }).catch(() => false)) {
      const box = reviewDialog.locator('textarea, [contenteditable="true"]').first()
      if (await box.isVisible().catch(() => false)) {
        await box.click()
        await reviewerPage.keyboard.type('Reviewed for the screenshot run — technically accurate.')
      }
      await shot(reviewerPage, 'reviewer-approve-dialog')
      await reviewDialog
        .getByRole('button', { name: /approve|complete|submit|confirm|advance/i })
        .last()
        .click()
    }
    await waitForSqlValue(
      `SELECT count(*) FROM task_instances ti WHERE ti.entity_id = '${version.id}'
         AND ti.assigned_to = '${USERS.approver.id}' AND ti.deleted_at IS NULL
         AND ti.status_id NOT IN ('CANCELLED')`,
      { timeoutMs: 45_000, label: 'approver task created' },
    )
    await reviewerCtx.close()

    // ── Approver (step 2, APPROVAL + e-signature) ──────────────────────────
    const approverCtx = await browser.newContext({ storageState: AUTH.approver })
    const approverPage = await approverCtx.newPage()
    await gotoDoc(approverPage, doc.id)
    await clickWhenReady(approverPage, approverPage.getByRole('button', { name: /^approve$/i }))
    const pin = approverPage.getByPlaceholder('Enter your e-signature PIN')
    await expect(pin).toBeVisible({ timeout: 15_000 })
    await shot(approverPage, 'approver-esign-dialog')
    await pin.fill(ESIGN_PIN)
    await approverPage.getByRole('button', { name: 'Sign' }).click()

    // APPROVED → EFFECTIVE is worker-driven; give it room under load.
    await waitForSqlValue(
      `SELECT status_id FROM document_versions WHERE id = '${version.id}' AND status_id = 'EFFECTIVE'`,
      { timeoutMs: 180_000, label: 'version EFFECTIVE' },
    )
    await expectStatusEventually(approverPage, /effective/i)
    await shot(approverPage, 'detail-effective')

    // The worker's hash-anchored snapshot surfaces in the rail.
    await waitForSqlValue(
      `SELECT snapshot_sha256 FROM document_versions WHERE id = '${version.id}'`,
      { timeoutMs: 180_000, label: 'snapshot sha256 stamped' },
    )
    await approverPage.reload()
    await expect(approverPage.getByText(/audit snapshot/i).first()).toBeVisible({ timeout: 30_000 })
    await shot(approverPage, 'detail-audit-snapshot')
    await approverCtx.close()

    // ── Author: new revision off the EFFECTIVE version ─────────────────────
    const author2 = await browser.newContext({ storageState: AUTH.author })
    const authorPage2 = await author2.newPage()
    await gotoDoc(authorPage2, doc.id)
    await expectStatusEventually(authorPage2, /effective|approved/i)

    const inline = authorPage2.getByRole('button', { name: /create new draft/i })
    if (!(await inline.first().isVisible({ timeout: 3_000 }).catch(() => false))) {
      await authorPage2.getByRole('button', { name: /more actions/i }).click()
    }
    await authorPage2
      .getByRole('menuitem', { name: /create new draft/i })
      .or(authorPage2.getByRole('button', { name: /create new draft/i }))
      .first()
      .click()
    await expect(authorPage2.getByText('Create New Revision')).toBeVisible({ timeout: 15_000 })
    await authorPage2.getByPlaceholder(/New calibration interval/i).fill(
      'Screenshot revision — updated per SOP-014 rev 4.',
    )
    await authorPage2.getByRole('button', { name: /^Minor\b/i }).click()
    await shot(authorPage2, 'detail-new-revision-dialog')
    await authorPage2.getByRole('button', { name: 'Create Revision' }).click()
    await expect(authorPage2.getByText('Create New Revision')).toBeHidden({ timeout: 20_000 })

    // A revision always bumps the MAJOR (v2.0) — the change type only records
    // the nature of the change (see nextVersionLabel in DocumentsPageId).
    await waitForSqlValue(
      `SELECT count(*) FROM document_versions
         WHERE document_id = '${doc.id}' AND deleted_at IS NULL AND version_major = 2`,
      { timeoutMs: 30_000, label: 'v2.0 draft created' },
    )
    await expect(authorPage2.getByRole('button', { name: /^Version: 2\.0/ })).toBeVisible({
      timeout: 30_000,
    })
    await shot(authorPage2, 'detail-revision-draft')

    // Change Control is a revision-only tab — it exists only from v1.1 onward.
    await authorPage2.getByRole('tab', { name: 'Change Control' }).click()
    await expect(authorPage2.getByRole('tab', { name: 'Change Control' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await shot(authorPage2, 'detail-change-control-tab')
    await author2.close()
  })
})
