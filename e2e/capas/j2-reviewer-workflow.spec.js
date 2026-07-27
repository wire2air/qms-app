// PW-J2 · Reviewer completes the workflow (TC-06/07/08) — multi-role.
//
// Same shared workflow-step machinery as NCR (workflowStepActionsService.js,
// WorkflowStepActionsMenu.vue) — see e2e/nonconformances/j2-reviewer-workflow.spec.js
// for the underlying "reject" split: on the ACTION step (step 1, reviewer) it's
// the lightweight Send-Back (does not terminate the workflow); the transition
// that actually reverts PENDING -> DRAFT is /rejectStepTask on the APPROVAL
// step (step 2, approver) — capaHandler.onRejection.
import { test, expect } from '@playwright/test'
import { AUTH, USERS } from '../fixtures/cast.js'
import { createCapa, openCapa, completeReviewerStep, uniqueTitle } from '../fixtures/capas.js'
import { clickWhenReady } from '../fixtures/documents.js'
import { findCapaByTitle, sqlValue, waitForSqlValue } from '../fixtures/db.js'

test.describe('PW-J2 · reviewer completes the ACTION step; approver rejects the APPROVAL step', () => {
  test('reviewer Mark-Completes step 1 -> workflow advances, approver task created', async ({
    browser,
  }) => {
    test.setTimeout(150_000)
    const ownerCtx = await browser.newContext({ storageState: AUTH.author })
    const ownerPage = await ownerCtx.newPage()
    const title = uniqueTitle('J2-advance')
    await createCapa(ownerPage, title)
    const capa = findCapaByTitle(title)
    await openCapa(ownerPage, capa.id)
    await ownerCtx.close()

    await completeReviewerStep(browser, capa.id)

    await waitForSqlValue(
      `SELECT count(*) FROM task_instances
        WHERE entity_type = 'Capa' AND entity_id = '${capa.id}'
          AND assigned_to = '${USERS.approver.id}' AND status_id = 'ASSIGNED'`,
      { timeoutMs: 30_000, label: 'approver task created' },
    )

    const step1Status = sqlValue(`
      SELECT wis.status_id FROM workflow_instance_steps wis
      JOIN workflow_instances wi ON wi.id = wis.workflow_instance_id
      WHERE wi.resource_type = 'Capa' AND wi.resource_id = '${capa.id}'
        AND wis.step_id = 'e2ef2003-0000-4000-8000-000000000001'
    `)
    expect(step1Status).toBe('APPROVED')

    const capaStatus = sqlValue(`SELECT status_id FROM capas WHERE id = '${capa.id}'`)
    expect(capaStatus, 'CAPA stays PENDING mid-workflow').toBe('PENDING')
  })

  test('approver rejects step 2 (APPROVAL) -> CAPA reverts PENDING to DRAFT', async ({ browser }) => {
    test.setTimeout(150_000)
    const ownerCtx = await browser.newContext({ storageState: AUTH.author })
    const ownerPage = await ownerCtx.newPage()
    const title = uniqueTitle('J2-reject')
    await createCapa(ownerPage, title)
    const capa = findCapaByTitle(title)
    await openCapa(ownerPage, capa.id)
    await ownerCtx.close()

    await completeReviewerStep(browser, capa.id)
    await waitForSqlValue(
      `SELECT count(*) FROM task_instances
        WHERE entity_type = 'Capa' AND entity_id = '${capa.id}'
          AND assigned_to = '${USERS.approver.id}' AND status_id = 'ASSIGNED'`,
      { timeoutMs: 30_000, label: 'approver task created' },
    )

    const approverCtx = await browser.newContext({ storageState: AUTH.approver })
    const approverPage = await approverCtx.newPage()
    await approverPage.goto(`/capas/${capa.id}`, { waitUntil: 'domcontentloaded' })
    await clickWhenReady(approverPage, approverPage.getByRole('button', { name: 'More actions' }))
    await approverPage.getByRole('menuitem', { name: 'Reject' }).click()
    await expect(approverPage.getByPlaceholder('Why are you rejecting?')).toBeVisible({ timeout: 10_000 })
    await approverPage.getByPlaceholder('Why are you rejecting?').fill('E2E reject — corrective action insufficient.')
    await approverPage.getByRole('button', { name: 'Confirm' }).click()
    await approverCtx.close()

    await waitForSqlValue(
      `SELECT count(*) FROM capas WHERE id = '${capa.id}' AND status_id = 'DRAFT'`,
      { timeoutMs: 30_000, label: 'CAPA reverted to DRAFT' },
    )

    const wfStatus = sqlValue(`
      SELECT status_id FROM workflow_instances
      WHERE resource_type = 'Capa' AND resource_id = '${capa.id}'
    `)
    expect(wfStatus, 'workflow instance terminated as REJECTED').toBe('REJECTED')

    const rejectAuditRows = sqlValue(
      `SELECT count(*) FROM audit_logs WHERE entity_type = 'Capa' AND entity_id = '${capa.id}' AND action = 'REJECT' AND performed_by IS NOT NULL`,
    )
    expect(Number(rejectAuditRows), 'attributed REJECT audit row exists').toBeGreaterThan(0)
  })
})
