// PW-J2 · Reviewer completes the workflow (TC-06/07) — multi-role.
//
// Correction vs the doc14 spec draft (verified against source, not assumed):
// "reject" on the ACTION step (step 1, reviewer) is the lightweight
// Send-Back — WorkflowStepActionsMenu.vue:145-166 — it does NOT terminate the
// workflow or change the NC's status (reviewer's task stays ASSIGNED, a
// SENT_BACK marker task is minted, the owner is notified). The transition that
// actually reverts OPEN -> DRAFT is /rejectStepTask on the APPROVAL
// step (step 2, approver) — nonconformanceHandler.onRejection. This spec tests
// the real behavior for both.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH, USERS } from '../fixtures/cast.js'
import { signWithPin } from '../fixtures/esign.js'
import { raiseNc, completeReviewerStep, uniqueTitle } from '../fixtures/nonconformances.js'
import { clickWhenReady } from '../fixtures/documents.js'
import { findNcByTitle, sqlValue, waitForSqlValue } from '../fixtures/db.js'

test.describe('PW-J2 · reviewer completes the ACTION step; approver rejects the APPROVAL step', () => {
  test('reviewer Mark-Completes step 1 -> workflow advances, approver task created', async ({
    browser,
  }) => {
    test.setTimeout(150_000)
    const ownerCtx = await browser.newContext({ storageState: AUTH.author })
    const ownerPage = await ownerCtx.newPage()
    const title = uniqueTitle('J2-advance')
    await raiseNc(ownerPage, title)
    const nc = findNcByTitle(title)
    await ownerCtx.close()

    await completeReviewerStep(browser, nc.id)

    await waitForSqlValue(
      `SELECT count(*) FROM task_instances
        WHERE entity_type = 'Nonconformance' AND entity_id = '${nc.id}'
          AND assigned_to = '${USERS.approver.id}' AND status_id = 'ASSIGNED'`,
      { timeoutMs: 30_000, label: 'approver task created' },
    )

    const step1Status = sqlValue(`
      SELECT wis.status_id FROM workflow_instance_steps wis
      JOIN workflow_instances wi ON wi.id = wis.workflow_instance_id
      WHERE wi.resource_type = 'Nonconformance' AND wi.resource_id = '${nc.id}'
        AND wis.step_id = 'e2ef1003-0000-4000-8000-000000000001'
    `)
    expect(step1Status).toBe('APPROVED')

    const ncStatus = sqlValue(`SELECT status_id FROM nonconformances WHERE id = '${nc.id}'`)
    expect(ncStatus, 'NC stays OPEN mid-workflow').toBe('OPEN')
  })

  test('approver rejects step 2 (APPROVAL) -> NC reverts OPEN to DRAFT', async ({
    browser,
  }) => {
    test.setTimeout(150_000)
    const ownerCtx = await browser.newContext({ storageState: AUTH.author })
    const ownerPage = await ownerCtx.newPage()
    const title = uniqueTitle('J2-reject')
    await raiseNc(ownerPage, title)
    const nc = findNcByTitle(title)
    await ownerCtx.close()

    await completeReviewerStep(browser, nc.id)
    await waitForSqlValue(
      `SELECT count(*) FROM task_instances
        WHERE entity_type = 'Nonconformance' AND entity_id = '${nc.id}'
          AND assigned_to = '${USERS.approver.id}' AND status_id = 'ASSIGNED'`,
      { timeoutMs: 30_000, label: 'approver task created' },
    )

    const approverCtx = await browser.newContext({ storageState: AUTH.approver })
    const approverPage = await approverCtx.newPage()
    await approverPage.goto(`/nonconformances/${nc.id}`, { waitUntil: 'domcontentloaded' })
    // TWO buttons on this page carry the accessible name "More actions", and
    // `BaseMenu` hard-codes `aria-label="More actions"` on every trigger it
    // renders, so role+name cannot tell them apart:
    //
    //   1. the record header's overflow (`DetailActionBar` — Convert to
    //      supplier-facing / Audit Log), which is FIRST in DOM order, and
    //   2. the step card's (`WorkflowStepActionsMenu` — Approve / Reject).
    //
    // ~~`getByRole('button', { name: 'More actions' })`~~ therefore resolves to
    // two elements. The bare `.evaluate()` below it was a STRICT-MODE VIOLATION
    // that threw before anything was clicked, and `clickWhenReady` (which takes
    // `.first()` internally) would have opened the header menu — no Reject in
    // it, so the next line sat there until timeout. Whether `.first()` lands on
    // the right trigger is pure DOM order; it is not a tie-break.
    //
    // Both existed before 2026-08-19 too, but only for the ASSIGNEE. The
    // takeover rule (stepTakeover.js `pickActionableTask`) now renders the step
    // menu for anyone the matrix covers, so this page grew a second trigger for
    // more personas, not fewer.
    //
    // Anchor on the step's OWN Approve button and take the next More-actions
    // trigger after it in document order — the idiom CAPA PW-J2 settled on, and
    // the same shape as comboboxAfterLabel in fixtures/documents.js. `exact:
    // true` because "Approve" is a substring of the "AA Adam Approver User"
    // profile-menu button in the header (see completeApproverStep).
    const moreActions = approverPage
      .getByRole('button', { name: 'Approve', exact: true })
      .first()
      .locator('xpath=following::button[@aria-label="More actions"][1]')
    // Centre the trigger before opening its menu. The approval step sits at the
    // bottom of a 1280x720 viewport and the actions menu opens DOWNWARD without
    // flipping when there is no room, so the menu renders below the fold: the
    // "Reject" item resolves and reports visible+enabled+stable, then every click
    // retries with "element is outside of the viewport" until the timeout.
    // scrollIntoViewIfNeeded is not enough — it stops as soon as the trigger
    // itself is on screen, which leaves it exactly where the menu has no room.
    // (The menu not flipping is a real UI issue at this height, not a test one.)
    await moreActions.evaluate((el) => el.scrollIntoView({ block: 'center' }))
    await clickWhenReady(approverPage, moreActions)
    await approverPage.getByRole('menuitem', { name: 'Reject' }).click()
    await expect(approverPage.getByPlaceholder('Why are you rejecting?')).toBeVisible({
      timeout: 10_000,
    })
    await approverPage
      .getByPlaceholder('Why are you rejecting?')
      .fill('E2E reject — missing evidence.')
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
      `SELECT count(*) FROM nonconformances WHERE id = '${nc.id}' AND status_id = 'DRAFT'`,
      { timeoutMs: 30_000, label: 'NC reverted to DRAFT' },
    )

    // Assert the terminal value, not `!== 'IN_PROGRESS'` — sqlValue returns null
    // when no row matches, and null would satisfy a negative assertion even if
    // the workflow instance had vanished entirely.
    const wfStatus = sqlValue(`
      SELECT status_id FROM workflow_instances
      WHERE resource_type = 'Nonconformance' AND resource_id = '${nc.id}'
    `)
    expect(wfStatus, 'workflow instance terminated as REJECTED').toBe('REJECTED')

    // Explicit audit trail for the rejection. Verified live: the generic audit
    // trigger writes the table-derived plural ('Nonconformances', see CREATE/
    // OPEN rows in J1), but the handler's explicit AuditLog.create for
    // REJECT uses the module's singular entityName ('Nonconformance') instead —
    // a real (harmless) casing inconsistency between the two audit paths.
    const rejectAuditRows = sqlValue(
      `SELECT count(*) FROM audit_logs WHERE entity_type = 'Nonconformance' AND entity_id = '${nc.id}' AND action = 'REJECT' AND performed_by IS NOT NULL`,
    )
    expect(Number(rejectAuditRows), 'attributed REJECT audit row exists').toBeGreaterThan(0)
  })
})
