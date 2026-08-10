// PW-J8 · J-08 — owner step management: reassign, cancel, reopen.
//
// The three controls a record owner has over a running approval, and the one
// place in the module where the answer "no" is as load-bearing as the answer
// "yes": an APPROVAL step is a MANDATORY GATE. An owner may reject-and-resubmit
// (PW-J7) or hand the step to a different reviewer, but must never be able to
// cancel an approval out of the chain or un-approve one that has been signed.
// Without that rule the owner of a record can approve it by attrition.
//
// Two behaviours here are cited as genuinely sound and had no test protecting
// them; this spec pins both.
//
//  1. DOWNSTREAM INVALIDATION. Reopening an upstream step reverts every
//     downstream APPROVAL step from APPROVED back to PENDING and supersedes its
//     tasks (workflowStepActionsService.js:830). That is the difference between
//     "the approver signed the corrected version" and "the approver's signature
//     from before the correction still counts".
//
//  2. REASSIGN ELIGIBILITY (F-11). `executeReassignStepReviewer` — the function
//     behind ~40 per-module `reassignStepReviewer` endpoints — used to validate
//     NOTHING about the target and would mint an approval task for any user id
//     it was handed. It now checks company membership and the step's configured
//     reviewer pool, with a deliberate carve-out: an EMPTY pool means the
//     template carries no membership constraint and stays unconstrained.
//     Both branches are exercised below, on the two modules that actually have
//     them (see createLiveNcInstance's note for why NC's pool is empty).
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH, USERS, ALT_USERS } from '../fixtures/cast.js'
import { sqlValue } from '../fixtures/db.js'
import { completeReviewerStep, completeApproverStep } from '../fixtures/changeRequests.js'
import { createLiveWorkflowInstance, stepsOf, assignmentFor } from '../fixtures/workflow.js'
import {
  CR_CREATE_STORES,
  assignmentStatus,
  createLiveNcInstance,
  errorMessage,
  postAs,
  reassignedToOf,
  stepRowsOf,
  stepStatus,
  taskIdFor,
  tasksOnStep,
  warmUpSyncEngine,
} from '../fixtures/workflowMultiApprover.js'

test.use({ storageState: AUTH.author })

// Describe-level, not per-test: a `test.setTimeout()` inside the body does not
// cover the beforeEach hook, and the syncEngine warm-up lives there. These
// journeys drive multi-actor UI flows against a shared dev stack, so the budget
// is deliberately generous.
test.describe.configure({ timeout: 720_000 })
// ── Reading the database straight after an action RPC ──────────────────────
// `requireCompanyAccess` opens the request transaction and COMMITS IT ON
// `res.finish` — after the response has been flushed to the client. So a
// `SELECT` issued the instant a 200 lands can legitimately still see the
// pre-action row. The first read after every mutation below therefore polls;
// once any part of that transaction is visible the rest is too, so subsequent
// reads in the same block are plain assertions.


// createLiveNcInstance runs its own (NC-specific) warm-up.
async function warmCr(page) {
  await warmUpSyncEngine(page, CR_CREATE_STORES)
}

const crAction = (crId, action) => `/api/v1/services/changeRequests/${crId}/${action}`
const ncAction = (ncId, action) => `/api/v1/services/nonconformances/${ncId}/${action}`

test.describe('PW-J8 · owner step management', () => {
  test('reassign: an unconstrained step moves to a new reviewer and the old assignment is voided', async ({
    page,
    browser,
  }) => {
    test.setTimeout(300_000)

    const { ncId, instanceId } = await createLiveNcInstance(page, 'J8-reassign')
    const [step1] = stepsOf(instanceId)
    expect(step1.statusId).toBe('IN_PROGRESS')
    expect(step1.stepType, 'step 1 of the NCR chain is a non-approval step').toBe('ACTION')

    const originalTask = taskIdFor(step1.id, USERS.reviewer.id)
    expect(originalTask, 'the step opened with a task for its resolved reviewer').toBeTruthy()

    // ── Refusals first, so a later success cannot be mistaken for "anything goes" ──
    const crossTenant = await postAs(browser, AUTH.author, ncAction(ncId, 'reassignStepReviewer'), {
      workflowInstanceStepId: step1.id,
      toUserId: ALT_USERS.owner.id,
    })
    expect(crossTenant.status, 'a user from another tenant is refused').toBe(400)
    expect(errorMessage(crossTenant.body)).toMatch(/not a member of this company/i)

    const sameUser = await postAs(browser, AUTH.author, ncAction(ncId, 'reassignStepReviewer'), {
      workflowInstanceStepId: step1.id,
      toUserId: USERS.reviewer.id,
    })
    expect(sameUser.status, 'reassigning to the current assignee is refused').toBe(409)
    expect(errorMessage(sameUser.body)).toMatch(/same user/i)

    const notOwner = await postAs(browser, AUTH.auditor, ncAction(ncId, 'reassignStepReviewer'), {
      workflowInstanceStepId: step1.id,
      toUserId: USERS.approver.id,
    })
    expect(notOwner.status, 'a read-only third party cannot re-point somebody else’s approval').toBe(
      403,
    )

    // Nothing moved during any of that.
    expect(assignmentStatus(step1.id, USERS.reviewer.id)).toBe('ASSIGNED')
    expect(tasksOnStep(step1.id).length).toBe(1)

    // ── The reassign ─────────────────────────────────────────────────────────
    const ok = await postAs(browser, AUTH.author, ncAction(ncId, 'reassignStepReviewer'), {
      workflowInstanceStepId: step1.id,
      toUserId: USERS.approver.id,
    })
    expect(ok.status, `reassign accepted: ${errorMessage(ok.body)}`).toBe(200)

    // The old holder is off the step, and the row says why — REASSIGNED, not
    // deleted, so the trail shows who held it first.
    await expect
      .poll(() => assignmentStatus(step1.id, USERS.reviewer.id), {
        message: 'the reassign committed and voided the old assignment',
        timeout: 30_000,
      })
      .toBe('REASSIGNED')
    const oldTask = reassignedToOf(originalTask)
    expect(oldTask.statusId).toBe('REASSIGNED')
    expect(oldTask.reassignedToUserId, 'the old task points at its successor').toBe(
      USERS.approver.id,
    )

    // The new holder has a real, actionable task.
    expect(assignmentStatus(step1.id, USERS.approver.id)).toBe('ASSIGNED')
    const newTask = taskIdFor(step1.id, USERS.approver.id)
    expect(newTask).toBeTruthy()
    expect(newTask).not.toBe(originalTask)
    expect(sqlValue(`SELECT status_id FROM task_instances WHERE id = '${newTask}'`)).toBe('ASSIGNED')
    expect(stepStatus(step1.id), 'the step stays live for the new reviewer').toBe('IN_PROGRESS')
  })

  test('reassign: a step WITH a configured reviewer pool refuses a target outside it (F-11)', async ({
    page,
    browser,
  }) => {
    test.setTimeout(240_000)

    // The CR template's steps each carry a role, so the pool is non-empty and
    // the validator engages. `approver` is a real, active member of this company
    // holding a step on this very workflow — the strongest possible negative
    // case, because company membership alone would have admitted them.
    await warmCr(page)
    const { crId, instanceId } = await createLiveWorkflowInstance(page, 'J8-pool')
    const [step1] = stepsOf(instanceId)

    const before = assignmentFor(step1.id, USERS.reviewer.id)
    expect(before?.statusId).toBe('ASSIGNED')

    const res = await postAs(browser, AUTH.author, crAction(crId, 'reassignStepReviewer'), {
      workflowInstanceStepId: step1.id,
      toUserId: USERS.approver.id,
    })
    expect(res.status, 'a target outside the step’s role pool is refused').toBe(400)
    expect(errorMessage(res.body)).toMatch(/reviewer pool/i)

    // Nothing was minted for the refused target — the pre-F-11 behaviour was to
    // insert the assignment and create the task regardless.
    expect(assignmentStatus(step1.id, USERS.approver.id), 'no assignment row was created').toBeNull()
    expect(taskIdFor(step1.id, USERS.approver.id), 'no approval task was minted').toBeNull()
    expect(assignmentStatus(step1.id, USERS.reviewer.id), 'the real reviewer keeps the step').toBe(
      'ASSIGNED',
    )
  })

  test('cancel: a non-approval step can be cancelled; an APPROVAL step cannot', async ({
    page,
    browser,
  }) => {
    test.setTimeout(240_000)

    await warmCr(page)
    const { crId, instanceId } = await createLiveWorkflowInstance(page, 'J8-cancel')
    const steps = stepRowsOf(instanceId)
    const approvalStep = steps.find((s) => s.stepType === 'APPROVAL')
    // Cancel the LAST step rather than the active one: cancelling the running
    // step would also be legal, but this keeps the untouched-neighbours
    // assertion meaningful in both directions.
    const targetStep = steps[2]
    expect(targetStep.stepType, 'step 3 (Implementation) is a non-approval step').toBe('ACTION')
    expect(approvalStep, 'the seeded CR chain has an APPROVAL step').toBeTruthy()

    // ── The mandatory gate ───────────────────────────────────────────────────
    const gate = await postAs(browser, AUTH.author, crAction(crId, 'cancelStep'), {
      workflowInstanceStepId: approvalStep.id,
    })
    expect(gate.status, 'an APPROVAL step cannot be cancelled out of the chain').toBe(409)
    expect(errorMessage(gate.body)).toMatch(/mandatory gates/i)
    expect(stepStatus(approvalStep.id), 'and it is genuinely untouched').toBe('PENDING')

    // ── The permitted cancel ─────────────────────────────────────────────────
    const notOwner = await postAs(browser, AUTH.auditor, crAction(crId, 'cancelStep'), {
      workflowInstanceStepId: targetStep.id,
    })
    expect(notOwner.status, 'only the owner/initiator may cancel a step').toBe(403)

    const ok = await postAs(browser, AUTH.author, crAction(crId, 'cancelStep'), {
      workflowInstanceStepId: targetStep.id,
    })
    expect(ok.status, `cancel accepted: ${errorMessage(ok.body)}`).toBe(200)

    await expect
      .poll(() => stepStatus(targetStep.id), { message: 'the cancel committed', timeout: 30_000 })
      .toBe('CANCELLED')
    expect(
      assignmentStatus(targetStep.id, USERS.author.id),
      'the step’s pending assignment is cancelled with it',
    ).toBe('CANCELLED')
    for (const t of tasksOnStep(targetStep.id)) {
      expect(t.statusId, 'no task survives on a cancelled step').toBe('CANCELLED')
    }

    // Surgical: the other steps and the instance itself are untouched.
    expect(stepStatus(steps[0].id)).toBe('IN_PROGRESS')
    expect(stepStatus(steps[1].id)).toBe('PENDING')
    expect(sqlValue(`SELECT status_id FROM workflow_instances WHERE id = '${instanceId}'`)).toBe(
      'IN_PROGRESS',
    )
  })

  test('reopen: reverts downstream APPROVAL steps to PENDING and supersedes their tasks', async ({
    page,
    browser,
  }) => {
    test.setTimeout(420_000)

    await warmCr(page)
    const { crId, instanceId } = await createLiveWorkflowInstance(page, 'J8-reopen')

    // Walk the chain to the state the invalidation logic exists for: an ACTION
    // step approved, then an APPROVAL step e-signed on top of it.
    await completeReviewerStep(browser, crId)
    await completeApproverStep(browser, crId)

    const steps = stepRowsOf(instanceId)
    const [actionStep, approvalStep, lastStep] = steps
    expect(actionStep.statusId, 'step 1 completed').toBe('APPROVED')
    expect(approvalStep.stepType).toBe('APPROVAL')
    expect(approvalStep.statusId, 'step 2 was e-signed and approved').toBe('APPROVED')
    expect(lastStep.statusId, 'the chain advanced to the implementation step').toBe('IN_PROGRESS')

    const signedTasks = tasksOnStep(approvalStep.id)
    expect(signedTasks.some((t) => t.statusId === 'APPROVED')).toBe(true)
    const signatureCount = Number(
      sqlValue(
        `SELECT count(*) FROM signatures s
           JOIN task_instances ti ON ti.id = s.task_instance_id
          WHERE ti.source_type = 'WorkflowInstanceStep' AND ti.source_id = '${approvalStep.id}'`,
      ),
    )
    expect(signatureCount, 'the approval really was signed').toBeGreaterThan(0)

    // ── The mandatory gate, again — reopen must not un-approve a signed gate ──
    const gate = await postAs(browser, AUTH.author, crAction(crId, 'reopenStep'), {
      workflowInstanceStepId: approvalStep.id,
      reason: 'E2E J8 — attempt to un-do a signed approval directly',
    })
    expect(gate.status, 'an APPROVAL step cannot be reopened by its own record owner').toBe(409)
    expect(errorMessage(gate.body)).toMatch(/mandatory gates/i)
    expect(stepStatus(approvalStep.id)).toBe('APPROVED')

    const noReason = await postAs(browser, AUTH.author, crAction(crId, 'reopenStep'), {
      workflowInstanceStepId: actionStep.id,
    })
    expect(noReason.status, 'a reason is mandatory — it becomes the assignee’s brief').toBe(400)

    // ── The reopen ───────────────────────────────────────────────────────────
    const reason = 'E2E J8 — the impact assessment missed a downstream system.'
    const ok = await postAs(browser, AUTH.author, crAction(crId, 'reopenStep'), {
      workflowInstanceStepId: actionStep.id,
      reason,
    })
    expect(ok.status, `reopen accepted: ${errorMessage(ok.body)}`).toBe(200)

    // The reopened step is live again for its original assignee, briefed.
    await expect
      .poll(() => stepStatus(actionStep.id), { message: 'the reopen committed', timeout: 30_000 })
      .toBe('IN_PROGRESS')
    expect(assignmentStatus(actionStep.id, USERS.reviewer.id)).toBe('ASSIGNED')
    const reopenedTasks = tasksOnStep(actionStep.id)
    expect(
      reopenedTasks.some((t) => t.statusId === 'ASSIGNED' && t.assignedTo === USERS.reviewer.id),
      'a fresh task is waiting for the original assignee',
    ).toBe(true)
    expect(
      sqlValue(
        `SELECT count(*) FROM task_instances
          WHERE source_type = 'WorkflowInstanceStep' AND source_id = '${actionStep.id}'
            AND status_id = 'ASSIGNED' AND comment = '${reason.replace(/'/g, "''")}'`,
      ),
      'the reason is on the new task, so the assignee reads why',
    ).toBe('1')

    // ── THE ASSERTION THIS JOURNEY EXISTS FOR ────────────────────────────────
    // The approval downstream of the reopened step is invalidated. The approver
    // signed a version that no longer exists, so their sign-off must not stand.
    expect(
      stepStatus(approvalStep.id),
      'the downstream APPROVAL step is reverted to PENDING — the signature no longer counts',
    ).toBe('PENDING')
    // Two scalar reads rather than one concatenation: `sqlValue` splits psql's
    // unaligned output on '|', so a '|'-joined expression is silently truncated
    // to its first field (this assertion read "" for exactly that reason).
    expect(
      sqlValue(
        `SELECT coalesce(started_at::text,'CLEARED') FROM workflow_instance_steps WHERE id = '${approvalStep.id}'`,
      ),
      'started_at is cleared so re-activation is a genuinely new run',
    ).toBe('CLEARED')
    expect(
      sqlValue(
        `SELECT coalesce(completed_at::text,'CLEARED') FROM workflow_instance_steps WHERE id = '${approvalStep.id}'`,
      ),
      'completed_at is cleared — the old sign-off timestamp does not survive',
    ).toBe('CLEARED')
    expect(
      assignmentStatus(approvalStep.id, USERS.approver.id),
      'the approver’s ledger row goes back to PENDING so re-activation re-arms it',
    ).toBe('PENDING')
    for (const t of tasksOnStep(approvalStep.id)) {
      expect(
        t.statusId,
        `the stale approval task ${t.id} is superseded, not left standing as APPROVED`,
      ).toBe('SUPERSEDED')
    }

    // Surgical, in both directions: the sibling ACTION step downstream is NOT
    // touched (only APPROVAL steps are invalidated), and the instance stays live.
    expect(
      stepStatus(lastStep.id),
      'a downstream non-approval step is left alone — the revert targets approvals only',
    ).toBe('IN_PROGRESS')
    expect(sqlValue(`SELECT status_id FROM workflow_instances WHERE id = '${instanceId}'`)).toBe(
      'IN_PROGRESS',
    )
  })
})
