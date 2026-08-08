// PW-J3 · reject / send-back loop (P1).
//
// Two different backend semantics share one menu item (WorkflowStepActionsMenu):
//   APPROVAL step + "Reject"    → /rejectStepTask  → terminates the instance,
//                                 handler.onRejection reverts the CR to DRAFT.
//   ACTION step   + "Send Back" → /sendBackStepTask → lightweight; the
//                                 reviewer's task survives, no status change.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH, USERS } from '../fixtures/cast.js'
import { signWithPin } from '../fixtures/esign.js'
import {
  createCr,
  assignDraftReviewers,
  submitCrForApproval,
  completeReviewerStep,
  uniqueTitle,
} from '../fixtures/changeRequests.js'
import { findCrByTitle, sqlValue, waitForSqlValue } from '../fixtures/db.js'
import { clickWhenReady } from '../fixtures/documents.js'

test.describe('PW-J3 · reject + send-back', () => {
  test('approver rejects the APPROVAL step → CR reverts UNDER_REVIEW to DRAFT', async ({
    browser,
  }) => {
    test.setTimeout(180_000)
    const ownerCtx = await browser.newContext({ storageState: AUTH.author })
    const ownerPage = await ownerCtx.newPage()
    const title = uniqueTitle('J3-reject')
    await createCr(ownerPage, title)
    const cr = findCrByTitle(title)
    await assignDraftReviewers(ownerPage, cr.id)
    await submitCrForApproval(ownerPage, cr.id)
    await ownerCtx.close()

    await completeReviewerStep(browser, cr.id)
    await waitForSqlValue(
      `SELECT count(*) FROM task_instances
        WHERE entity_type = 'ChangeRequest' AND entity_id = '${cr.id}'
          AND assigned_to = '${USERS.approver.id}' AND status_id = 'ASSIGNED'`,
      { timeoutMs: 30_000, label: 'approver task created' },
    )

    const approverCtx = await browser.newContext({ storageState: AUTH.approver })
    const approverPage = await approverCtx.newPage()
    await approverPage.goto(`/change-requests/${cr.id}`, { waitUntil: 'domcontentloaded' })
    await clickWhenReady(approverPage, approverPage.getByRole('button', { name: 'More actions' }))
    await approverPage.getByRole('menuitem', { name: 'Reject' }).click()
    const reason = approverPage.getByPlaceholder('Why are you rejecting?')
    await expect(reason).toBeVisible({ timeout: 10_000 })
    await reason.fill('E2E reject — impact assessment incomplete.')
    await approverPage.getByRole('button', { name: 'Confirm' }).click()
    // F-16 (2026-08-08): rejecting an e-sign-required APPROVAL step now captures a
    // signature. Before this the DB held 588 signatures — 361 APPROVED and ZERO
    // REJECTED — while 92 rejections had already happened on e-sign-required steps,
    // because this path never signed while API-15's identical action did.
    //
    // The prompt is gated on the STEP TYPE, not the outcome id: SEND_BACK is
    // "Reject" here and routes to rejectStepTask (signed), while the same outcome
    // on a non-approval step routes to sendBackStepTask and stays deliberately
    // unsigned. Without this the reject 400s with ESIGNATURE_REQUIRED.
    await signWithPin(approverPage)
    await approverCtx.close()

    await waitForSqlValue(
      `SELECT count(*) FROM change_requests WHERE id = '${cr.id}' AND status_id = 'DRAFT'`,
      { timeoutMs: 30_000, label: 'CR reverted to DRAFT' },
    )

    // Assert the terminal value, not `!== 'IN_PROGRESS'` — sqlValue returns null
    // when no row matches, and null would satisfy a negative assertion even if
    // the workflow instance had vanished entirely.
    expect(
      sqlValue(
        `SELECT status_id FROM workflow_instances WHERE resource_type = 'ChangeRequest' AND resource_id = '${cr.id}'`,
      ),
      'workflow instance terminated as REJECTED',
    ).toBe('REJECTED')

    // The handler's explicit AuditLog.create uses the module's singular
    // entityName ('ChangeRequest'); the generic audit trigger writes the
    // table-derived plural ('ChangeRequests') — a real (harmless) casing
    // inconsistency between the two audit paths, same as NCR/CAPA.
    expect(
      Number(
        sqlValue(
          `SELECT count(*) FROM audit_logs
            WHERE entity_type = 'ChangeRequest' AND entity_id = '${cr.id}'
              AND action = 'REJECT' AND performed_by IS NOT NULL`,
        ),
      ),
      'attributed REJECT audit row exists',
    ).toBeGreaterThan(0)
  })

  test('owner can re-submit a rejected CR — a fresh approval cycle starts', async ({ browser }) => {
    test.setTimeout(180_000)
    const ownerCtx = await browser.newContext({ storageState: AUTH.author })
    const ownerPage = await ownerCtx.newPage()
    const title = uniqueTitle('J3-resubmit')
    await createCr(ownerPage, title)
    const cr = findCrByTitle(title)
    await assignDraftReviewers(ownerPage, cr.id)
    await submitCrForApproval(ownerPage, cr.id)
    await ownerCtx.close()

    await completeReviewerStep(browser, cr.id)
    await waitForSqlValue(
      `SELECT count(*) FROM task_instances
        WHERE entity_type = 'ChangeRequest' AND entity_id = '${cr.id}'
          AND assigned_to = '${USERS.approver.id}' AND status_id = 'ASSIGNED'`,
      { timeoutMs: 30_000, label: 'approver task created' },
    )

    const approverCtx = await browser.newContext({ storageState: AUTH.approver })
    const approverPage = await approverCtx.newPage()
    await approverPage.goto(`/change-requests/${cr.id}`, { waitUntil: 'domcontentloaded' })
    await clickWhenReady(approverPage, approverPage.getByRole('button', { name: 'More actions' }))
    await approverPage.getByRole('menuitem', { name: 'Reject' }).click()
    const reason = approverPage.getByPlaceholder('Why are you rejecting?')
    await expect(reason).toBeVisible({ timeout: 10_000 })
    await reason.fill('E2E reject — needs rework.')
    await approverPage.getByRole('button', { name: 'Confirm' }).click()
    // Same F-16 signature gate as the first test — this reject is on an APPROVAL
    // step too, so it must be signed before the CR reverts to DRAFT.
    await signWithPin(approverPage)
    await approverCtx.close()

    await waitForSqlValue(
      `SELECT count(*) FROM change_requests WHERE id = '${cr.id}' AND status_id = 'DRAFT'`,
      { timeoutMs: 30_000, label: 'CR reverted to DRAFT' },
    )

    // Back in DRAFT the owner resubmits. Note there is NO draft-preview
    // reviewer picker this time: ChangeRequestsPageId renders
    // ChangeRequestWorkflowDraftPreview only when NO workflow instance exists
    // (`v-if="!workflowInstance && statusId === 'DRAFT'"`), and the REJECTED
    // instance still satisfies its `results[0]` fallback — so a rejected CR
    // shows the dead workflow section instead. Submit still succeeds because
    // pendingReviewers is empty and submitResourceForReview falls back to role
    // expansion (each seeded step role has exactly one member). Re-picking a
    // *different* reviewer after a rejection has no UI path today.
    const ctx2 = await browser.newContext({ storageState: AUTH.author })
    const page2 = await ctx2.newPage()
    await submitCrForApproval(page2, cr.id)
    await ctx2.close()

    expect(sqlValue(`SELECT status_id FROM change_requests WHERE id = '${cr.id}'`)).toBe(
      'UNDER_REVIEW',
    )
    expect(
      Number(
        sqlValue(
          `SELECT count(*) FROM workflow_instances WHERE resource_type = 'ChangeRequest' AND resource_id = '${cr.id}'`,
        ),
      ),
      'a second workflow instance for the new cycle',
    ).toBe(2)
    expect(
      Number(
        sqlValue(
          `SELECT count(*) FROM workflow_instances
            WHERE resource_type = 'ChangeRequest' AND resource_id = '${cr.id}' AND status_id = 'IN_PROGRESS'`,
        ),
      ),
      'exactly one live instance',
    ).toBe(1)
  })

  test('reviewer sends back the ACTION step → no status change, task survives', async ({
    browser,
  }) => {
    test.setTimeout(180_000)
    const ownerCtx = await browser.newContext({ storageState: AUTH.author })
    const ownerPage = await ownerCtx.newPage()
    const title = uniqueTitle('J3-sendback')
    await createCr(ownerPage, title)
    const cr = findCrByTitle(title)
    await assignDraftReviewers(ownerPage, cr.id)
    await submitCrForApproval(ownerPage, cr.id)
    await ownerCtx.close()

    await waitForSqlValue(
      `SELECT count(*) FROM task_instances
        WHERE entity_type = 'ChangeRequest' AND entity_id = '${cr.id}'
          AND assigned_to = '${USERS.reviewer.id}' AND status_id = 'ASSIGNED'`,
      { timeoutMs: 45_000, label: 'reviewer task assigned' },
    )

    const reviewerCtx = await browser.newContext({ storageState: AUTH.reviewer })
    const reviewerPage = await reviewerCtx.newPage()
    await reviewerPage.goto(`/change-requests/${cr.id}`, { waitUntil: 'domcontentloaded' })
    await clickWhenReady(reviewerPage, reviewerPage.getByRole('button', { name: 'More actions' }))
    await reviewerPage.getByRole('menuitem', { name: 'Send Back' }).click()
    const reason = reviewerPage.getByPlaceholder('Why are you sending this back to the owner?')
    await expect(reason).toBeVisible({ timeout: 10_000 })
    await reason.fill('E2E send-back — need the business justification filled in.')
    await reviewerPage.getByRole('button', { name: 'Confirm' }).click()

    // A marker SENT_BACK task is minted carrying the comment.
    await waitForSqlValue(
      `SELECT count(*) FROM task_instances
        WHERE entity_type = 'ChangeRequest' AND entity_id = '${cr.id}' AND status_id = 'SENT_BACK'`,
      { timeoutMs: 30_000, label: 'SENT_BACK marker task' },
    )
    await reviewerCtx.close()

    // Lightweight by design: the CR status and the workflow instance are
    // untouched, and the reviewer's original task is still actionable.
    expect(sqlValue(`SELECT status_id FROM change_requests WHERE id = '${cr.id}'`)).toBe(
      'UNDER_REVIEW',
    )
    expect(
      sqlValue(
        `SELECT status_id FROM workflow_instances WHERE resource_type = 'ChangeRequest' AND resource_id = '${cr.id}'`,
      ),
    ).toBe('IN_PROGRESS')
    expect(
      Number(
        sqlValue(
          `SELECT count(*) FROM task_instances
            WHERE entity_type = 'ChangeRequest' AND entity_id = '${cr.id}'
              AND assigned_to = '${USERS.reviewer.id}' AND status_id = 'ASSIGNED'`,
        ),
      ),
      "the reviewer's own task is untouched",
    ).toBe(1)
  })
})
