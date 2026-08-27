// PW-J10 · NOT_EFFECTIVE follow-up (2026-08-28).
//
// A failed effectiveness check is a decision point, not a dead end: the
// verdict itself demands a comment + e-signature, and recording NOT_EFFECTIVE
// offers the verdict-giver a follow-up — re-open the host record, or spawn a
// linked fresh record. This journey drives REOPEN end to end on a CLOSED CAPA:
// verdict (comment + PIN) → follow-up dialog → Re-open → the CAPA is OPEN
// again with closed_at cleared. The spawn path is covered at the service layer
// (unit tests) and shares every gate this journey proves.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH, USERS } from '../fixtures/cast.js'
import {
  createCapa,
  openCapa,
  closeCapa,
  uniqueTitle,
  EFFECTIVENESS_CAPA_WORKFLOW_NAME,
} from '../fixtures/capas.js'
import { clickWhenReady } from '../fixtures/documents.js'
import { findCapaByTitle, sql, sqlValue, waitForSqlValue } from '../fixtures/db.js'

const DELAY_TEMPLATE_STEP = 'e2ef5003-0000-4000-8000-000000000002'

test.use({ storageState: AUTH.author })

test.describe('PW-J10 · NOT_EFFECTIVE re-opens the host', () => {
  test('failed verdict (comment + PIN) → follow-up → CAPA re-opened', async ({
    page,
    browser,
  }) => {
    test.setTimeout(300_000)

    const title = uniqueTitle('J10')
    await createCapa(page, title, {
      workflowName: EFFECTIVENESS_CAPA_WORKFLOW_NAME,
      reviewers: [USERS.reviewer.name, USERS.reviewer.name],
    })
    const capa = findCapaByTitle(title)
    await openCapa(page, capa.id)

    const ritaCtx = await browser.newContext({ storageState: AUTH.reviewer })
    const ritaPage = await ritaCtx.newPage()
    await ritaPage.goto(`/capas/${capa.id}`, { waitUntil: 'domcontentloaded' })
    await clickWhenReady(ritaPage, ritaPage.getByRole('button', { name: 'Mark Complete' }).first())

    await waitForSqlValue(
      `SELECT count(*) FROM workflow_instance_steps wis
        JOIN workflow_instances wi ON wi.id = wis.workflow_instance_id
        WHERE wi.resource_type = 'Capa' AND wi.resource_id = '${capa.id}'
          AND wis.step_id = '${DELAY_TEMPLATE_STEP}' AND wis.status_id = 'SCHEDULED'`,
      { timeoutMs: 45_000, label: 'DELAY step parked SCHEDULED' },
    )

    await page.reload({ waitUntil: 'domcontentloaded' })
    await closeCapa(page, { comments: 'E2E close — check deferred.' })
    await waitForSqlValue(
      `SELECT count(*) FROM capas WHERE id = '${capa.id}' AND status_id = 'CLOSED'`,
      { timeoutMs: 30_000, label: 'CAPA CLOSED' },
    )

    const stepId = sqlValue(`
      SELECT wis.id FROM workflow_instance_steps wis
      JOIN workflow_instances wi ON wi.id = wis.workflow_instance_id
      WHERE wi.resource_type = 'Capa' AND wi.resource_id = '${capa.id}'
        AND wis.step_id = '${DELAY_TEMPLATE_STEP}'`)
    sql(
      `UPDATE workflow_instance_steps SET delay_until = NOW() - INTERVAL '1 minute' WHERE id = '${stepId}'`,
    )
    sql(`UPDATE graphile_worker._private_jobs SET run_at = NOW()
          WHERE task_id = (SELECT id FROM graphile_worker._private_tasks WHERE identifier = 'workflow_delay_step_activate')
            AND payload::text LIKE '%${stepId}%'`)

    await waitForSqlValue(
      `SELECT count(*) FROM task_instances
        WHERE source_type = 'WorkflowInstanceStep' AND source_id = '${stepId}'
          AND assigned_to = '${USERS.reviewer.id}' AND status_id = 'ASSIGNED'`,
      { timeoutMs: 60_000, label: 'verdict task minted' },
    )

    // Rita records NOT_EFFECTIVE — comment + PIN — then chooses Re-open.
    await ritaPage.goto(`/capas/${capa.id}`, { waitUntil: 'domcontentloaded' })
    await expect(ritaPage.getByText('Was it effective?')).toBeVisible({ timeout: 30_000 })
    await ritaPage.getByRole('radio', { name: 'Not effective', exact: true }).click()
    await ritaPage
      .getByPlaceholder(/What supports this verdict/)
      .fill('Recurrence found on line 2 — the fix did not hold.')
    await clickWhenReady(ritaPage, ritaPage.getByRole('button', { name: 'Mark Complete' }).first())
    await ritaPage.locator('input[type="password"]').first().fill('12345678')
    await ritaPage.getByRole('button', { name: /^Sign\b/i }).last().click()

    await expect(ritaPage.getByText('Check Failed — What Next?')).toBeVisible({
      timeout: 30_000,
    })
    await ritaPage.getByRole('button', { name: /Re-open this record/ }).click()

    // The verdict is on the step, and the host is OPEN again.
    await waitForSqlValue(
      `SELECT count(*) FROM workflow_instance_steps
        WHERE id = '${stepId}' AND effectiveness_outcome = 'NOT_EFFECTIVE'`,
      { timeoutMs: 30_000, label: 'NOT_EFFECTIVE recorded' },
    )
    await waitForSqlValue(
      `SELECT count(*) FROM capas
        WHERE id = '${capa.id}' AND status_id = 'OPEN' AND closed_at IS NULL`,
      { timeoutMs: 30_000, label: 'CAPA re-opened with closed_at cleared' },
    )
    await ritaCtx.close()
  })

  test('owner SKIPs a parked check — reason + PIN, signed against the STEP', async ({
    page,
    browser,
  }) => {
    test.setTimeout(300_000)

    const title = uniqueTitle('J10skip')
    await createCapa(page, title, {
      workflowName: EFFECTIVENESS_CAPA_WORKFLOW_NAME,
      reviewers: [USERS.reviewer.name, USERS.reviewer.name],
    })
    const capa = findCapaByTitle(title)
    await openCapa(page, capa.id)

    const ritaCtx = await browser.newContext({ storageState: AUTH.reviewer })
    const ritaPage = await ritaCtx.newPage()
    await ritaPage.goto(`/capas/${capa.id}`, { waitUntil: 'domcontentloaded' })
    await clickWhenReady(ritaPage, ritaPage.getByRole('button', { name: 'Mark Complete' }).first())
    await ritaCtx.close()

    await waitForSqlValue(
      `SELECT count(*) FROM workflow_instance_steps wis
        JOIN workflow_instances wi ON wi.id = wis.workflow_instance_id
        WHERE wi.resource_type = 'Capa' AND wi.resource_id = '${capa.id}'
          AND wis.step_id = '${DELAY_TEMPLATE_STEP}' AND wis.status_id = 'SCHEDULED'`,
      { timeoutMs: 45_000, label: 'DELAY step parked SCHEDULED' },
    )

    // The OWNER skips the parked check: reason is required, then PIN. The
    // signature lands against the STEP itself — pre-fire there is no task.
    await page.reload({ waitUntil: 'domcontentloaded' })
    await clickWhenReady(page, page.getByRole('button', { name: /^Skip$/ }).first())
    await expect(page.getByText('Skip Effectiveness Check')).toBeVisible({ timeout: 15_000 })
    const signSkip = page.getByRole('button', { name: 'Sign & Skip' })
    await expect(signSkip, 'submit disabled until a reason is typed').toBeDisabled()
    await page
      .getByPlaceholder('Why is this check not needed?')
      .fill('Process retired — the line this CAPA corrected was decommissioned.')
    await signSkip.click()
    await page.locator('input[type="password"]').first().fill('12345678')
    await page.getByRole('button', { name: /^Sign\b/i }).last().click()

    const stepId = sqlValue(`
      SELECT wis.id FROM workflow_instance_steps wis
      JOIN workflow_instances wi ON wi.id = wis.workflow_instance_id
      WHERE wi.resource_type = 'Capa' AND wi.resource_id = '${capa.id}'
        AND wis.step_id = '${DELAY_TEMPLATE_STEP}'`)
    await waitForSqlValue(
      `SELECT count(*) FROM workflow_instance_steps WHERE id = '${stepId}' AND status_id = 'SKIPPED'`,
      { timeoutMs: 30_000, label: 'step SKIPPED' },
    )
    // Part-11: the skip signature references the STEP subject and carries the reason.
    await waitForSqlValue(
      `SELECT count(*) FROM signatures
        WHERE workflow_instance_step_id = '${stepId}' AND meaning = 'SKIPPED'
          AND comments LIKE '%decommissioned%'`,
      { timeoutMs: 30_000, label: 'step-subject signature with the reason' },
    )
  })
})
