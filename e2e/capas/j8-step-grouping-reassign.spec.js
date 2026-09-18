// PW-J8 · Step grouping: complete a run as one, ungroup it, reassign out of it.
//
// The seeded 'E2E CAPA Grouped Actions' workflow (e2e-seed.sql §31d) has two
// CONSECUTIVE ACTION steps for the Reviewer role, then an APPROVAL for the
// Approver role. When both action steps resolve to the SAME person the detail
// page collapses them into one WorkflowStepGroup card with a single
// "Complete N steps" button (useWorkflowStepGrouping.js, 2026-08-18). Three
// behaviours are pinned here:
//
//   1. The grouped card completes BOTH steps in one click (one POST to
//      /taskInstances/:head/completeGroup, one transaction server-side).
//   2. Ungroup is local and non-destructive: the run falls apart into the
//      ordinary per-step cards and each one is completed individually.
//   3. Reassigning one step OUT of the run (owner → Riley, the Reviewer
//      role's second member) splits the group and the workflow still runs to
//      completion: Rita completes hers, Riley completes the reassigned one,
//      the approver's task mints — no strand, no duplicate tasks.
//
// Reviewers are picked EXPLICITLY at create (both steps → Rita): the Reviewer
// role has two members since §31b, and role expansion would plan both onto
// each step — a 2-assignee step never groups (isGroupableStep demands exactly
// one). That is also true for real tenants: grouping only forms when the plan
// resolves each step to one person.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH, USERS } from '../fixtures/cast.js'
import {
  createCapa,
  openCapa,
  uniqueTitle,
  GROUPED_CAPA_WORKFLOW_NAME,
} from '../fixtures/capas.js'
import { clickWhenReady } from '../fixtures/documents.js'
import { findCapaByTitle, sqlValue, waitForSqlValue } from '../fixtures/db.js'

/** Create + open a CAPA on the grouped workflow with both ACTION steps → Rita. */
async function createGroupedCapa(browser, tag) {
  const ownerCtx = await browser.newContext({ storageState: AUTH.author })
  const ownerPage = await ownerCtx.newPage()
  const title = uniqueTitle(tag)
  await createCapa(ownerPage, title, {
    workflowName: GROUPED_CAPA_WORKFLOW_NAME,
    // Step order: Containment Actions, Corrective Actions, Grouped Final
    // Approval. Rita on both ACTION steps is what makes the run groupable.
    reviewers: [USERS.reviewer.name, USERS.reviewer.name, USERS.approver.name],
  })
  const capa = findCapaByTitle(title)
  await openCapa(ownerPage, capa.id)
  await ownerCtx.close()

  // The first ACTION step's task must exist before a reviewer page can act.
  await waitForSqlValue(
    `SELECT count(*) FROM task_instances
      WHERE entity_type = 'Capa' AND entity_id = '${capa.id}'
        AND assigned_to = '${USERS.reviewer.id}' AND status_id = 'ASSIGNED'`,
    { timeoutMs: 45_000, label: 'head step task assigned to Rita' },
  )
  return capa
}

/** status_id of the instance step spawned from a §31d template step. */
function stepStatus(capaId, templateStepId) {
  return sqlValue(`
    SELECT wis.status_id FROM workflow_instance_steps wis
    JOIN workflow_instances wi ON wi.id = wis.workflow_instance_id
    WHERE wi.resource_type = 'Capa' AND wi.resource_id = '${capaId}'
      AND wis.step_id = '${templateStepId}'
  `)
}

const STEP1 = 'e2ef4003-0000-4000-8000-000000000001' // Containment Actions
const STEP2 = 'e2ef4003-0000-4000-8000-000000000002' // Corrective Actions
const STEP3 = 'e2ef4003-0000-4000-8000-000000000003' // Grouped Final Approval

test.describe('PW-J8 · grouped runs: one-click completion, ungroup, reassignment', () => {
  test('two same-owner ACTION steps render as ONE card and complete together', async ({
    browser,
  }) => {
    test.setTimeout(240_000)
    const capa = await createGroupedCapa(browser, 'J8-group')

    const ctx = await browser.newContext({ storageState: AUTH.reviewer })
    const page = await ctx.newPage()
    await page.goto(`/capas/${capa.id}`, { waitUntil: 'domcontentloaded' })

    // The run is one card: header names the run's owner and its span, and the
    // member steps render INSIDE it (numbered sections, not standalone cards).
    await expect(page.getByText(`2 steps assigned to ${USERS.reviewer.name}`)).toBeVisible({
      timeout: 30_000,
    })
    await expect(page.getByText(/Steps 1–2 — completing these finishes all 2/)).toBeVisible()
    await expect(page.getByText('Containment Actions').first()).toBeVisible()
    await expect(page.getByText('Corrective Actions').first()).toBeVisible()
    // No per-step Mark Complete anywhere — the group's button owns completion.
    await expect(page.getByRole('button', { name: 'Mark Complete' })).toHaveCount(0)

    await clickWhenReady(page, page.getByRole('button', { name: 'Complete 2 steps' }))

    // One click → BOTH steps APPROVED, and the approver's task mints.
    await waitForSqlValue(
      `SELECT count(*) FROM task_instances
        WHERE entity_type = 'Capa' AND entity_id = '${capa.id}'
          AND assigned_to = '${USERS.approver.id}' AND status_id = 'ASSIGNED'`,
      { timeoutMs: 45_000, label: 'approver task created after group completion' },
    )
    expect(stepStatus(capa.id, STEP1), 'step 1 approved').toBe('APPROVED')
    expect(stepStatus(capa.id, STEP2), 'step 2 approved').toBe('APPROVED')
    expect(stepStatus(capa.id, STEP3), 'approval step active').toBe('IN_PROGRESS')

    // Both of Rita's tasks are resolved — the group did not leave a live task
    // dangling on the swallowed second step.
    const openReviewerTasks = sqlValue(
      `SELECT count(*) FROM task_instances
        WHERE entity_type = 'Capa' AND entity_id = '${capa.id}'
          AND assigned_to = '${USERS.reviewer.id}' AND status_id IN ('ASSIGNED','IN_PROGRESS')`,
    )
    expect(Number(openReviewerTasks), 'no reviewer task left open').toBe(0)
    await ctx.close()
  })

  test('Ungroup falls back to per-step cards, each completed on its own', async ({ browser }) => {
    test.setTimeout(240_000)
    const capa = await createGroupedCapa(browser, 'J8-ungroup')

    const ctx = await browser.newContext({ storageState: AUTH.reviewer })
    const page = await ctx.newPage()
    await page.goto(`/capas/${capa.id}`, { waitUntil: 'domcontentloaded' })

    await expect(page.getByText(`2 steps assigned to ${USERS.reviewer.name}`)).toBeVisible({
      timeout: 30_000,
    })
    await page.getByRole('button', { name: 'Group actions' }).click()
    await page.getByRole('button', { name: 'Ungroup — complete these separately' }).click()

    // The run is gone; the steps are ordinary cards again. Only the ACTIVE
    // step offers Mark Complete — TWICE, by design: a standalone WorkflowStep
    // renders the action in the header AND below the form (user request
    // 2026-08-16), so one actionable step = two identical buttons. Step 2 has
    // not activated and contributes none.
    await expect(page.getByText(`2 steps assigned to ${USERS.reviewer.name}`)).toHaveCount(0)
    const markComplete = page.getByRole('button', { name: 'Mark Complete' })
    await expect(markComplete).toHaveCount(2, { timeout: 15_000 })

    // Complete step 1 alone — step 2 activates, step 3 does not.
    await clickWhenReady(page, markComplete.first())
    await waitForSqlValue(
      `SELECT count(*) FROM workflow_instance_steps wis
        JOIN workflow_instances wi ON wi.id = wis.workflow_instance_id
        WHERE wi.resource_type = 'Capa' AND wi.resource_id = '${capa.id}'
          AND wis.step_id = '${STEP2}' AND wis.status_id = 'IN_PROGRESS'`,
      { timeoutMs: 45_000, label: 'step 2 activated after step 1' },
    )
    expect(stepStatus(capa.id, STEP1)).toBe('APPROVED')
    expect(stepStatus(capa.id, STEP3), 'approval still pending').toBe('PENDING')

    // Complete step 2 from its own card. Ungroup is per-mount state, so after
    // the reload triggered by the data refresh the remaining single step is
    // not re-grouped (a run needs two live steps) — the plain button returns.
    await clickWhenReady(page, page.getByRole('button', { name: 'Mark Complete' }).first())
    await waitForSqlValue(
      `SELECT count(*) FROM task_instances
        WHERE entity_type = 'Capa' AND entity_id = '${capa.id}'
          AND assigned_to = '${USERS.approver.id}' AND status_id = 'ASSIGNED'`,
      { timeoutMs: 45_000, label: 'approver task after both singles' },
    )
    expect(stepStatus(capa.id, STEP2)).toBe('APPROVED')
    await ctx.close()
  })

  test('reassigning one step out of the run: the group splits and the workflow still completes', async ({
    browser,
  }) => {
    test.setTimeout(300_000)
    const capa = await createGroupedCapa(browser, 'J8-reassign')

    // The OWNER reassigns step 2 (still PENDING — the engine allows it) from
    // Rita to Riley via the grouped card's per-step reassign control.
    const ownerCtx = await browser.newContext({ storageState: AUTH.author })
    const ownerPage = await ownerCtx.newPage()
    await ownerPage.goto(`/capas/${capa.id}`, { waitUntil: 'domcontentloaded' })
    await expect(
      ownerPage.getByText(`2 steps assigned to ${USERS.reviewer.name}`),
    ).toBeVisible({ timeout: 30_000 })
    await ownerPage.getByRole('button', { name: 'Reassign Corrective Actions' }).click()
    await expect(ownerPage.getByText('Reassign Task')).toBeVisible({ timeout: 10_000 })
    // Candidates are the step's ROLE members — Riley is offered because §31b
    // put them in the Reviewer role.
    await ownerPage.getByText(USERS.reviewer2.name, { exact: true }).click()
    await ownerPage.getByRole('button', { name: 'Reassign', exact: true }).click()

    // The run's premise (one owner for consecutive steps) is gone — the
    // grouped card must dissolve for everyone.
    await expect(
      ownerPage.getByText(`2 steps assigned to ${USERS.reviewer.name}`),
    ).toHaveCount(0, { timeout: 20_000 })
    await ownerCtx.close()

    // Rita still owns step 1 — she completes it from an ordinary card.
    const ritaCtx = await browser.newContext({ storageState: AUTH.reviewer })
    const ritaPage = await ritaCtx.newPage()
    await ritaPage.goto(`/capas/${capa.id}`, { waitUntil: 'domcontentloaded' })
    await clickWhenReady(ritaPage, ritaPage.getByRole('button', { name: 'Mark Complete' }).first())
    await ritaCtx.close()

    // Step 2 activates and its task mints for RILEY — the reassignment
    // survived activation; Rita gets no second task.
    await waitForSqlValue(
      `SELECT count(*) FROM task_instances
        WHERE entity_type = 'Capa' AND entity_id = '${capa.id}'
          AND assigned_to = '${USERS.reviewer2.id}' AND status_id = 'ASSIGNED'`,
      { timeoutMs: 45_000, label: 'step 2 task assigned to Riley' },
    )
    const ritaStep2Tasks = sqlValue(`
      SELECT count(*) FROM task_instances ti
      JOIN workflow_instance_steps wis ON wis.id = ti.source_id
      WHERE ti.entity_type = 'Capa' AND ti.entity_id = '${capa.id}'
        AND wis.step_id = '${STEP2}' AND ti.assigned_to = '${USERS.reviewer.id}'
        AND ti.status_id IN ('ASSIGNED','IN_PROGRESS')`)
    expect(Number(ritaStep2Tasks), 'Rita holds no live task on the reassigned step').toBe(0)

    // Riley completes the reassigned step from their own session.
    const rileyCtx = await browser.newContext({ storageState: AUTH.reviewer2 })
    const rileyPage = await rileyCtx.newPage()
    await rileyPage.goto(`/capas/${capa.id}`, { waitUntil: 'domcontentloaded' })
    await clickWhenReady(
      rileyPage,
      rileyPage.getByRole('button', { name: 'Mark Complete' }).first(),
    )
    await rileyCtx.close()

    // The chain kept moving: approval task mints, both ACTION steps APPROVED.
    await waitForSqlValue(
      `SELECT count(*) FROM task_instances
        WHERE entity_type = 'Capa' AND entity_id = '${capa.id}'
          AND assigned_to = '${USERS.approver.id}' AND status_id = 'ASSIGNED'`,
      { timeoutMs: 45_000, label: 'approver task after reassigned run completed' },
    )
    expect(stepStatus(capa.id, STEP1)).toBe('APPROVED')
    expect(stepStatus(capa.id, STEP2)).toBe('APPROVED')

    // Approver finishes the workflow — proof the reassignment left nothing
    // stranded end-to-end.
    const approverCtx = await browser.newContext({ storageState: AUTH.approver })
    const approverPage = await approverCtx.newPage()
    await approverPage.goto(`/capas/${capa.id}`, { waitUntil: 'domcontentloaded' })
    await clickWhenReady(
      approverPage,
      approverPage.getByRole('button', { name: 'Approve', exact: true }),
    )
    await approverCtx.close()

    await waitForSqlValue(
      `SELECT count(*) FROM workflow_instances
        WHERE resource_type = 'Capa' AND resource_id = '${capa.id}' AND status_id = 'COMPLETED'`,
      { timeoutMs: 45_000, label: 'workflow completed' },
    )
  })
})
