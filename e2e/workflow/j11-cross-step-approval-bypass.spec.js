// PW-J11 · F-01 — cross-step approval with no permission.
//
// THE headline journey of the Workflows pack. As specified (14-playwright-
// journeys.md) this was "written to fail today": a user holding an assignment on
// ONE step of a live instance could set ANY OTHER step of that instance —
// including an e-sign-required APPROVAL step they were never assigned — to
// APPROVED with a single raw GraphQL mutation. No signature row, no permission
// check, reachable against every live instance.
//
// The cause was `workflow_instance_step_update_rls`: alone among the module's
// write policies it contained no `authz.has_permission(...)` term at all, and its
// assignee predicate `is_awi_reviewer(workflow_instance_id)` was INSTANCE-scoped,
// so holding any one assignment satisfied it for every step of that instance.
//
// It is now closed by the trust boundary in migration 20260731120000: an
// `app_user` (the role PostGraphile uses for every GraphQL request) may never
// change `status_id` on this table, whichever row RLS would let it reach.
//
// ⚠️ This spec has therefore FLIPPED from a red-by-design probe to a green
// release gate. It must stay green. If it ever fails, the engine's approval
// integrity is gone and every module that approves through it — Documents, CAPA,
// NCR, Change Requests, Audits, Training — is affected simultaneously.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH, USERS, COMPANY_ID } from '../fixtures/cast.js'
import { sqlValue, sqlAsAppUser } from '../fixtures/db.js'
import { createLiveWorkflowInstance, stepsOf, anyAssignmentOn } from '../fixtures/workflow.js'

test.use({ storageState: AUTH.author })

test.describe('PW-J11 · F-01 cross-step approval bypass', () => {
  test('an assignee on one step cannot approve a DIFFERENT step of the same instance', async ({
    page,
  }) => {
    test.setTimeout(180_000)

    const { instanceId } = await createLiveWorkflowInstance(page, 'J11-crossstep')
    const steps = stepsOf(instanceId)
    expect(steps.length, 'seeded CR template instantiates multiple steps').toBeGreaterThan(1)

    // Whoever actually holds an assignment on this instance — that is the exact
    // credential F-01 required, and nothing more.
    const assignment = anyAssignmentOn(instanceId)
    expect(assignment, 'the submitted instance has at least one assignment').toBeTruthy()
    const attacker = { userId: assignment.userId, companyId: COMPANY_ID }

    // Target every step the attacker is NOT assigned to.
    const targets = steps.filter((s) => s.id !== assignment.workflowInstanceStepId)
    expect(targets.length, 'there is at least one un-assigned step to attack').toBeGreaterThan(0)

    for (const target of targets) {
      const before = sqlValue(`SELECT status_id FROM workflow_instance_steps WHERE id = '${target.id}'`)

      const res = sqlAsAppUser(
        `UPDATE workflow_instance_steps SET status_id = 'APPROVED' WHERE id = '${target.id}';`,
        attacker,
      )

      expect(res.ok, `approving un-assigned step ${target.stepNumber} must be rejected`).toBe(false)
      expect(res.error, 'rejection carries the QMSWF guard').toMatch(
        /status cannot be changed directly|QMSWF/i,
      )
      expect(
        sqlValue(`SELECT status_id FROM workflow_instance_steps WHERE id = '${target.id}'`),
        `step ${target.stepNumber} status is untouched`,
      ).toBe(before)
    }

    // No signature was manufactured along the way — the property the finding was
    // ultimately about. `signatures` binds to the TASK, not the step, so the
    // join goes through task_instances.
    const sigs = sqlValue(
      `SELECT count(*) FROM signatures s
        WHERE s.task_instance_id IN (
          SELECT ti.id FROM task_instances ti
           WHERE ti.source_type = 'WorkflowInstanceStep'
             AND ti.source_id IN (
               SELECT id FROM workflow_instance_steps WHERE workflow_instance_id = '${instanceId}'
             )
        )`,
    )
    expect(Number(sigs), 'no signature row was created by the bypass attempts').toBe(0)
  })

  test('CONTROL: a non-status edit by the same assignee still succeeds', async ({ page }) => {
    // The guard must be surgical. It blocks lifecycle writes, not the table.
    test.setTimeout(180_000)

    const { instanceId } = await createLiveWorkflowInstance(page, 'J11-control')
    const assignment = anyAssignmentOn(instanceId)
    const actor = { userId: assignment.userId, companyId: COMPANY_ID }

    const res = sqlAsAppUser(
      `UPDATE workflow_instance_steps SET description = 'e2e j11 control'
        WHERE id = '${assignment.workflowInstanceStepId}';`,
      actor,
    )
    expect(res.ok, 'a non-status write on the assignee own step is still allowed').toBe(true)
  })

  test('CONTROL: a user with no assignment at all cannot touch the steps either', async ({
    page,
  }) => {
    test.setTimeout(180_000)

    const { instanceId } = await createLiveWorkflowInstance(page, 'J11-noaccess')
    const [firstStep] = stepsOf(instanceId)

    // A zero-grant user is stopped by RLS BEFORE the trigger ever sees the row,
    // so the statement succeeds and simply matches nothing. Asserting on rowCount
    // is the honest check here — asserting a throw would be asserting the wrong
    // mechanism, and would start failing the day RLS got stricter.
    const res = sqlAsAppUser(
      `UPDATE workflow_instance_steps SET status_id = 'APPROVED' WHERE id = '${firstStep.id}';
       SELECT status_id FROM workflow_instance_steps WHERE id = '${firstStep.id}';`,
      { userId: USERS.noAccess.id, companyId: COMPANY_ID },
    )
    if (res.ok) {
      expect(res.output, 'the row was not flipped to APPROVED').not.toContain('APPROVED')
    } else {
      expect(res.error).toMatch(/status cannot be changed directly|QMSWF|permission denied/i)
    }
  })
})
