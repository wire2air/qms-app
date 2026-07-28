// PW-J4 · child implementation sub-task (P1).
//
// The seeded CR workflow's step 3 ("Implementation") is the only one with
// allow_child_steps=true, so it is the only valid parent for an owner-added
// sub-task. Sub-tasks are exercised at the API layer: the add-child-step
// dialog wires a form builder + assignee picker whose coverage belongs to a
// component test, whereas the contract worth pinning here is the controller's
// parent/terminal gating and the instance-step + assignment rows it writes.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH, USERS } from '../fixtures/cast.js'
import {
  createCr,
  assignDraftReviewers,
  submitCrForApproval,
  completeReviewerStep,
  completeApproverStep,
  stepIdByName,
  uniqueTitle,
} from '../fixtures/changeRequests.js'
import { findCrByTitle, sqlValue, waitForSqlValue } from '../fixtures/db.js'

test.use({ storageState: AUTH.author })

async function crAtImplementationStage(page, browser, tag) {
  const title = uniqueTitle(tag)
  await createCr(page, title)
  const cr = findCrByTitle(title)
  await assignDraftReviewers(page, cr.id)
  await submitCrForApproval(page, cr.id)
  await completeReviewerStep(browser, cr.id)
  await completeApproverStep(browser, cr.id)
  // Step 3 activates once the approval step clears; it stays IN_PROGRESS until
  // the owner completes it (which would finish the whole workflow).
  await waitForSqlValue(
    `SELECT count(*) FROM task_instances
      WHERE entity_type = 'ChangeRequest' AND entity_id = '${cr.id}'
        AND assigned_to = '${USERS.author.id}' AND status_id = 'ASSIGNED'`,
    { timeoutMs: 45_000, label: 'implementation task assigned' },
  )
  return cr
}

test.describe('PW-J4 · implementation child steps', () => {
  test('owner adds a sub-task under the Implementation stage → step + assignment rows', async ({
    page,
    browser,
  }) => {
    test.setTimeout(180_000)
    const cr = await crAtImplementationStage(page, browser, 'J4-add')
    const parentStepId = stepIdByName(cr.id, 'Implementation')
    expect(parentStepId, 'Implementation instance step exists').toBeTruthy()

    const res = await page.request.post(
      `/api/v1/services/changeRequests/${cr.id}/addChildStep`,
      {
        data: {
          parentInstanceStepId: parentStepId,
          name: 'E2E sub-task — update SOP-001',
          description: 'Revise the affected procedure.',
          slaDays: 5,
          assigneeUserId: USERS.author.id,
          formSchema: [],
          requireComments: false,
          requireEsignature: true,
        },
      },
    )
    expect(res.ok(), await res.text()).toBeTruthy()
    const childId = (await res.json()).instanceStep.id

    // Child hangs off the Implementation stage and inherits its active state.
    expect(
      sqlValue(`SELECT parent_instance_step_id FROM workflow_instance_steps WHERE id = '${childId}'`),
    ).toBe(parentStepId)
    expect(
      sqlValue(`SELECT status_id FROM workflow_instance_steps WHERE id = '${childId}'`),
      'child of an IN_PROGRESS parent activates immediately',
    ).toBe('IN_PROGRESS')
    expect(
      sqlValue(`SELECT require_esignature FROM workflow_instance_steps WHERE id = '${childId}'`),
    ).toBe('t')
    // Ad-hoc steps are not bound to a workflow template step (sqlValue reads a
    // NULL column back as null — psql -tA emits an empty result for it).
    expect(
      sqlValue(`SELECT step_id FROM workflow_instance_steps WHERE id = '${childId}'`),
    ).toBeNull()

    // step_number is instance-wide unique: the 3 root steps take 1-3, so the
    // first child must be 4 — a sibling-local number would collide with root
    // step 1 and 400 on uq_workflow_instance_steps_instance_number.
    expect(
      Number(sqlValue(`SELECT step_number FROM workflow_instance_steps WHERE id = '${childId}'`)),
      'child step_number continues the instance sequence',
    ).toBeGreaterThan(3)
    // step_order stays sibling-local (drives next-sibling navigation).
    expect(
      sqlValue(`SELECT step_order FROM workflow_instance_steps WHERE id = '${childId}'`),
      'first child under this parent is sibling order 1',
    ).toBe('1')

    // Assignment + a real task for the assignee.
    expect(
      Number(
        sqlValue(
          `SELECT count(*) FROM users_on_workflow_instance_steps
            WHERE workflow_instance_step_id = '${childId}' AND user_id = '${USERS.author.id}'`,
        ),
      ),
    ).toBe(1)
    await waitForSqlValue(
      `SELECT count(*) FROM task_instances
        WHERE source_id = '${childId}' AND assigned_to = '${USERS.author.id}'`,
      { timeoutMs: 30_000, label: 'child step task created' },
    )
  })

  test('negative: a step without allowChildSteps is rejected 409', async ({ page, browser }) => {
    test.setTimeout(180_000)
    const cr = await crAtImplementationStage(page, browser, 'J4-badparent')
    // "Impact Review" (step 1) has allow_child_steps=false.
    const parentStepId = stepIdByName(cr.id, 'Impact Review')
    expect(parentStepId).toBeTruthy()

    const res = await page.request.post(
      `/api/v1/services/changeRequests/${cr.id}/addChildStep`,
      {
        data: {
          parentInstanceStepId: parentStepId,
          name: 'E2E sub-task under the wrong parent',
          assigneeUserId: USERS.author.id,
          formSchema: [],
        },
      },
    )
    expect(res.status()).toBe(409)
    const body = await res.json().catch(() => null)
    expect(body?.error?.message ?? '').toMatch(/does not allow child sub-tasks/i)
  })

  test('negative: adding a sub-task to a terminal CR is rejected 409', async ({ page, browser }) => {
    test.setTimeout(180_000)
    const cr = await crAtImplementationStage(page, browser, 'J4-terminal')
    const parentStepId = stepIdByName(cr.id, 'Implementation')

    const cancelRes = await page.request.post(`/api/v1/services/changeRequests/${cr.id}/cancel`, {
      data: { reason: 'E2E setup — terminal guard', method: 'PIN', token: '12345678', provider: null },
    })
    expect(cancelRes.ok()).toBeTruthy()

    const res = await page.request.post(
      `/api/v1/services/changeRequests/${cr.id}/addChildStep`,
      {
        data: {
          parentInstanceStepId: parentStepId,
          name: 'E2E sub-task on a cancelled CR',
          assigneeUserId: USERS.author.id,
          formSchema: [],
        },
      },
    )
    expect(res.status()).toBe(409)
    const body = await res.json().catch(() => null)
    expect(body?.error?.message ?? '').toMatch(/terminal Change Request/i)
  })

  test('the Add Sub-task affordance renders on the Implementation stage', async ({
    page,
    browser,
  }) => {
    test.setTimeout(180_000)
    const cr = await crAtImplementationStage(page, browser, 'J4-ui')
    await page.goto(`/change-requests/${cr.id}`)
    // Only the allowChildSteps stage exposes it, and only to the owner.
    await expect(page.getByRole('button', { name: 'Add Sub-task' })).toBeVisible({ timeout: 20_000 })
    await expect(page.getByRole('button', { name: 'Add Sub-task' })).toHaveCount(1)
  })
})
