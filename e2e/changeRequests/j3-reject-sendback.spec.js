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
  test('approver rejects the APPROVAL step → CR reverts OPEN to DRAFT', async ({
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
    // Anchor the menu to the STEP CARD, never to a bare role+name lookup.
    // BaseMenu hard-codes aria-label="More actions" on EVERY trigger it renders
    // (resource/js/shared/components/BaseMenu.vue), and this page can show more
    // than one: DetailActionBar mints one whenever the record's own actions
    // overflow `maxVisible`, and each workflow step card mints its own
    // (WorkflowStepActionsMenu, which is where Reject / Send Back live). Role +
    // name therefore cannot separate them, and clickWhenReady resolves its
    // locator with `.first()` — pure DOM order, so it opened the header menu,
    // which carries neither item, and the run died on the menuitem lookup.
    //
    // Worse, whether it fails at all depends on the SIGNED-IN USER: the approver
    // holds no change_control:update/close, so their record bar has only
    // Print + Audit Log and never overflows — one "More actions" on the page,
    // green run. The reviewer DOES hold update, so their bar gains Cancel and
    // the ordering flips. A locator that passes or fails on the persona's
    // permission set is not a locator.
    //
    // WorkflowStep.vue renders the step's inline Approve / Mark Complete and its
    // WorkflowStepActionsMenu in the SAME header row, button first — so the next
    // More-actions trigger in document order after the step's own action button
    // is always that step's menu. Same fault and same fix as CAPA PW-J2.
    // `.first()` on the anchor is deliberate: the card renders a SECOND
    // Approve/Mark Complete below the form (added 2026-08-16), and the header
    // one is the one the menu follows.
    const stepMenu = approverPage
      .getByRole('button', { name: 'Approve', exact: true })
      .first()
      .locator('xpath=following::button[@aria-label="More actions"][1]')
    // Menus open downward without flipping, so a low trigger can land its panel
    // off-screen; centre it first.
    await stepMenu.evaluate((el) => el.scrollIntoView({ block: 'center' }))
    await clickWhenReady(approverPage, stepMenu)
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
    // Anchor the menu to the STEP CARD, never to a bare role+name lookup.
    // BaseMenu hard-codes aria-label="More actions" on EVERY trigger it renders
    // (resource/js/shared/components/BaseMenu.vue), and this page can show more
    // than one: DetailActionBar mints one whenever the record's own actions
    // overflow `maxVisible`, and each workflow step card mints its own
    // (WorkflowStepActionsMenu, which is where Reject / Send Back live). Role +
    // name therefore cannot separate them, and clickWhenReady resolves its
    // locator with `.first()` — pure DOM order, so it opened the header menu,
    // which carries neither item, and the run died on the menuitem lookup.
    //
    // Worse, whether it fails at all depends on the SIGNED-IN USER: the approver
    // holds no change_control:update/close, so their record bar has only
    // Print + Audit Log and never overflows — one "More actions" on the page,
    // green run. The reviewer DOES hold update, so their bar gains Cancel and
    // the ordering flips. A locator that passes or fails on the persona's
    // permission set is not a locator.
    //
    // WorkflowStep.vue renders the step's inline Approve / Mark Complete and its
    // WorkflowStepActionsMenu in the SAME header row, button first — so the next
    // More-actions trigger in document order after the step's own action button
    // is always that step's menu. Same fault and same fix as CAPA PW-J2.
    // `.first()` on the anchor is deliberate: the card renders a SECOND
    // Approve/Mark Complete below the form (added 2026-08-16), and the header
    // one is the one the menu follows.
    const stepMenu = approverPage
      .getByRole('button', { name: 'Approve', exact: true })
      .first()
      .locator('xpath=following::button[@aria-label="More actions"][1]')
    // Menus open downward without flipping, so a low trigger can land its panel
    // off-screen; centre it first.
    await stepMenu.evaluate((el) => el.scrollIntoView({ block: 'center' }))
    await clickWhenReady(approverPage, stepMenu)
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
      'OPEN',
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
    // Same anchor-to-the-step-card fix as the two reject tests above, with the
    // one difference that matters: step 1 is an ACTION step, so
    // WorkflowStep.vue's completeActionLabel is 'Mark Complete', not 'Approve'
    // — the anchor is per step TYPE. (And the reviewer holds change_control:update
    // since seed §33, so their record action bar carries Cancel as well and DOES
    // overflow: this is the persona where a bare `getByRole('button', { name:
    // 'More actions' })` picks the wrong menu.)
    const stepMenu = reviewerPage
      .getByRole('button', { name: 'Mark Complete', exact: true })
      .first()
      .locator('xpath=following::button[@aria-label="More actions"][1]')
    await stepMenu.evaluate((el) => el.scrollIntoView({ block: 'center' }))
    await clickWhenReady(reviewerPage, stepMenu)
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
      'OPEN',
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
