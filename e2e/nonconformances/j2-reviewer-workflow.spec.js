// PW-J2 · Reviewer completes the workflow (TC-06/07) — multi-role.
//
// Correction vs the doc14 spec draft (verified against source, not assumed):
// "reject" on the ACTION step (step 1, reviewer) is the lightweight
// Send-Back — WorkflowStepActionsMenu.vue:145-166 — it does NOT terminate the
// workflow or change the NC's status (reviewer's task stays ASSIGNED, a
// SENT_BACK marker task is minted, the owner is notified). The transition that
// actually reverts UNDER_REVIEW -> DRAFT is /rejectStepTask on the APPROVAL
// step (step 2, approver) — nonconformanceHandler.onRejection. This spec tests
// the real behavior for both.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH, USERS } from '../fixtures/cast.js'
import { raiseNc, openNc, completeReviewerStep, uniqueTitle } from '../fixtures/nonconformances.js'
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
    await openNc(ownerPage, nc.id)
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
    expect(ncStatus, 'NC stays UNDER_REVIEW mid-workflow').toBe('UNDER_REVIEW')
  })

  test('approver rejects step 2 (APPROVAL) -> NC reverts UNDER_REVIEW to DRAFT', async ({ browser }) => {
    test.setTimeout(150_000)
    const ownerCtx = await browser.newContext({ storageState: AUTH.author })
    const ownerPage = await ownerCtx.newPage()
    const title = uniqueTitle('J2-reject')
    await raiseNc(ownerPage, title)
    const nc = findNcByTitle(title)
    await openNc(ownerPage, nc.id)
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
    await clickWhenReady(approverPage, approverPage.getByRole('button', { name: 'More actions' }))
    await approverPage.getByRole('menuitem', { name: 'Reject' }).click()
    await expect(approverPage.getByPlaceholder('Why are you rejecting?')).toBeVisible({ timeout: 10_000 })
    await approverPage.getByPlaceholder('Why are you rejecting?').fill('E2E reject — missing evidence.')
    await approverPage.getByRole('button', { name: 'Confirm' }).click()
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
    // UNDER_REVIEW rows in J1), but the handler's explicit AuditLog.create for
    // REJECT uses the module's singular entityName ('Nonconformance') instead —
    // a real (harmless) casing inconsistency between the two audit paths.
    const rejectAuditRows = sqlValue(
      `SELECT count(*) FROM audit_logs WHERE entity_type = 'Nonconformance' AND entity_id = '${nc.id}' AND action = 'REJECT' AND performed_by IS NOT NULL`,
    )
    expect(Number(rejectAuditRows), 'attributed REJECT audit row exists').toBeGreaterThan(0)
  })
})
