// PW-J4 · Effectiveness check — the DELAY-step successor (TC-12).
//
// The close-time capa_effectiveness_checks scheduler is retired (PW-J3 pins
// that closing mints no row). Effectiveness now lives IN the workflow: a DELAY
// step with captures_effectiveness parks SCHEDULED when the workflow reaches
// it, does NOT block closing the CAPA (a deferred check fires after close, by
// design), and wakes via the worker's workflow_delay_step_activate job. The
// woken step mints a task whose completion DEMANDS an effectiveness verdict —
// recorded first-class on workflow_instance_steps.effectiveness_outcome.
//
// Thirty real days is not a test strategy: the wake is advanced in SQL (step
// delay_until + the graphile job's run_at), which is exactly what the worker
// would see thirty days from now.
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
import { findCapaByTitle, sql, sqlValue, sqlRow, waitForSqlValue } from '../fixtures/db.js'

const DELAY_TEMPLATE_STEP = 'e2ef5003-0000-4000-8000-000000000002'

test.use({ storageState: AUTH.author })

test.describe('PW-J4 · effectiveness as a deferred DELAY step', () => {
  test('the check parks SCHEDULED, survives close, fires, and records the verdict', async ({
    page,
    browser,
  }) => {
    test.setTimeout(300_000)

    const title = uniqueTitle('J4')
    await createCapa(page, title, {
      workflowName: EFFECTIVENESS_CAPA_WORKFLOW_NAME,
      // Rita on both: the ACTION step now, the deferred check when it fires.
      reviewers: [USERS.reviewer.name, USERS.reviewer.name],
    })
    const capa = findCapaByTitle(title)
    await openCapa(page, capa.id)

    // Rita completes the ACTION step; the DELAY step parks SCHEDULED with the
    // template's 30-day default already applied.
    const ritaCtx = await browser.newContext({ storageState: AUTH.reviewer })
    const ritaPage = await ritaCtx.newPage()
    await ritaPage.goto(`/capas/${capa.id}`, { waitUntil: 'domcontentloaded' })
    await clickWhenReady(ritaPage, ritaPage.getByRole('button', { name: 'Mark Complete' }).first())
    await ritaCtx.close()

    await waitForSqlValue(
      `SELECT count(*) FROM workflow_instance_steps wis
        JOIN workflow_instances wi ON wi.id = wis.workflow_instance_id
        WHERE wi.resource_type = 'Capa' AND wi.resource_id = '${capa.id}'
          AND wis.step_id = '${DELAY_TEMPLATE_STEP}' AND wis.status_id = 'SCHEDULED'
          AND wis.delay_until IS NOT NULL`,
      { timeoutMs: 45_000, label: 'DELAY step parked SCHEDULED with a wake date' },
    )

    // A deferred check does NOT block closing — that is the point of deferring
    // it. The owner closes the CAPA with the check still parked.
    await page.reload({ waitUntil: 'domcontentloaded' })
    await closeCapa(page, { comments: 'E2E close — effectiveness deferred to the DELAY step.' })
    await waitForSqlValue(
      `SELECT count(*) FROM capas WHERE id = '${capa.id}' AND status_id = 'CLOSED'`,
      { timeoutMs: 30_000, label: 'CAPA CLOSED with the check still SCHEDULED' },
    )

    // Advance the clock: wake date into the past, worker job due now.
    const stepId = sqlValue(`
      SELECT wis.id FROM workflow_instance_steps wis
      JOIN workflow_instances wi ON wi.id = wis.workflow_instance_id
      WHERE wi.resource_type = 'Capa' AND wi.resource_id = '${capa.id}'
        AND wis.step_id = '${DELAY_TEMPLATE_STEP}'`)
    sql(`UPDATE workflow_instance_steps SET delay_until = NOW() - INTERVAL '1 minute' WHERE id = '${stepId}'`)
    sql(`UPDATE graphile_worker._private_jobs SET run_at = NOW()
          WHERE task_id = (SELECT id FROM graphile_worker._private_tasks WHERE identifier = 'workflow_delay_step_activate')
            AND payload::text LIKE '%${stepId}%'`)

    // The worker fires: step IN_PROGRESS, Rita's verdict task minted.
    await waitForSqlValue(
      `SELECT count(*) FROM task_instances
        WHERE source_type = 'WorkflowInstanceStep' AND source_id = '${stepId}'
          AND assigned_to = '${USERS.reviewer.id}' AND status_id = 'ASSIGNED'`,
      { timeoutMs: 60_000, label: 'verdict task minted after the wake' },
    )

    // Rita records the verdict on the CLOSED CAPA. The card demands the
    // first-class answer before Complete enables.
    const verdictCtx = await browser.newContext({ storageState: AUTH.reviewer })
    const verdictPage = await verdictCtx.newPage()
    await verdictPage.goto(`/capas/${capa.id}`, { waitUntil: 'domcontentloaded' })
    await expect(verdictPage.getByText('Was it effective?')).toBeVisible({ timeout: 30_000 })
    await verdictPage.getByRole('radio', { name: 'Effective', exact: true }).click()
    await clickWhenReady(
      verdictPage,
      verdictPage.getByRole('button', { name: 'Mark Complete' }).first(),
    )
    await verdictCtx.close()

    // The verdict is first-class on the step, and the workflow is done.
    await waitForSqlValue(
      `SELECT count(*) FROM workflow_instance_steps
        WHERE id = '${stepId}' AND status_id = 'APPROVED' AND effectiveness_outcome = 'EFFECTIVE'`,
      { timeoutMs: 45_000, label: 'EFFECTIVE recorded on the step' },
    )
    const wf = sqlRow(`
      SELECT wi.status_id FROM workflow_instances wi
      WHERE wi.resource_type = 'Capa' AND wi.resource_id = '${capa.id}'`)
    expect(wf[0], 'workflow completed after the deferred verdict').toBe('COMPLETED')

    // And the legacy table stayed empty end to end.
    const legacy = sqlValue(
      `SELECT count(*) FROM capa_effectiveness_checks WHERE capa_id = '${capa.id}'`,
    )
    expect(Number(legacy), 'no legacy effectiveness-check row anywhere in the flow').toBe(0)
  })
})
