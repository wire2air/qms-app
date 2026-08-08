// PW-J6 · J-06 — multi-approver ALL vs ANY.
//
// The rule that decides when a step with more than one assignee is finished.
// `checkStepApprovalSatisfied` (workflowInstanceService.js:188) counts the
// step's non-terminal TASKS and compares:
//
//     ANY -> approvedCount >= 1
//     ALL -> approvedCount >= filteredCount
//
// Two things make this worth a release gate rather than a smoke test.
//
// 1. It is the difference between "two people signed this batch release" and
//    "one did". Nothing else in the engine re-checks it: once the step is
//    APPROVED the instance advances and the record's own handler fires.
//
// 2. Since F-05's fix (migration 20260805130000) the rule is SNAPSHOTTED onto
//    `workflow_instance_steps.approval_rule` at instantiation, and the engine
//    prefers that copy over the live template
//    (`instanceStep.approvalRule ?? approvedDef?.approvalRule ?? 'ALL'`,
//    workflowInstanceService.js:1055). The ANY journey below is written so that
//    the TEMPLATE still says ALL the whole time — the engine can only produce
//    ANY behaviour by genuinely reading the instance copy. That makes this spec
//    a second, behavioural guard on F-05 alongside PW-J5's data-level one.
//
// The second assignee is built on the instance rather than through the reviewer
// picker; fixtures/workflowMultiApprover.js explains at length why the seeded
// pools make that the only option that does not corrupt a shared template. The
// approvals themselves are driven through the real API-15 action endpoint, as
// the assignee, and every assertion reads the database afterwards.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH, USERS, COMPANY_ID } from '../fixtures/cast.js'
import { sqlValue } from '../fixtures/db.js'
import { createLiveWorkflowInstance, stepsOf } from '../fixtures/workflow.js'
import {
  CR_CREATE_STORES,
  addStepAssignee,
  approveTaskAs,
  assignmentStatus,
  errorMessage,
  openInboxTaskIds,
  setInstanceApprovalRule,
  stepStatus,
  taskIdFor,
  taskStatus,
  templateApprovalRule,
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


// Each Playwright context bootstraps the syncEngine from zero; barrier on the
// create form's lookup data rather than letting an empty listbox read as a UI
// defect. See warmUpSyncEngine.
test.beforeEach(async ({ page }) => {
  await warmUpSyncEngine(page, CR_CREATE_STORES)
})

/** Step 1 of the seeded CR chain: "Impact Review", ACTION, no e-signature. */
function firstStepOf(instanceId) {
  const steps = stepsOf(instanceId)
  expect(steps.length, 'the seeded CR template instantiates three steps').toBe(3)
  const [step1] = steps
  expect(step1.statusId, 'submit activates the first root step').toBe('IN_PROGRESS')
  expect(step1.stepType, 'step 1 is an ACTION step — no e-signature to satisfy').toBe('ACTION')
  return { steps, step1 }
}

test.describe('PW-J6 · multi-approver ALL vs ANY', () => {
  test('ALL: the step stays IN_PROGRESS until EVERY assignee has approved', async ({
    page,
    browser,
  }) => {
    test.setTimeout(240_000)

    const { crId, instanceId } = await createLiveWorkflowInstance(page, 'J6-all')
    const { steps, step1 } = firstStepOf(instanceId)

    // Read the rule off the INSTANCE copy, not the template — that is the value
    // the engine actually evaluates.
    expect(step1.approvalRule, 'the instance froze the template ALL rule').toBe('ALL')

    const reviewerTask = taskIdFor(step1.id, USERS.reviewer.id)
    expect(reviewerTask, 'the engine minted a task for the pool member').toBeTruthy()
    expect(taskStatus(reviewerTask)).toBe('ASSIGNED')

    const approverTask = addStepAssignee(step1.id, {
      userId: USERS.approver.id,
      companyId: COMPANY_ID,
      entityType: 'ChangeRequest',
      entityId: crId,
    })

    // ── First of two approvals ───────────────────────────────────────────────
    const first = await approveTaskAs(browser, AUTH.reviewer, reviewerTask, {
      comment: 'E2E J6 — first ALL approval',
    })
    expect(first.status, `first approval accepted: ${errorMessage(first.body)}`).toBe(200)

    // Barrier on the one value that MUST change, because the value under test
    // ('the step is still IN_PROGRESS') is also its pre-state and so cannot
    // distinguish "correctly unmoved" from "not committed yet".
    await expect
      .poll(() => taskStatus(reviewerTask), { message: 'the first approval committed', timeout: 30_000 })
      .toBe('APPROVED')

    // THE assertion. One of two approvals on an ALL step must move nothing.
    expect(stepStatus(step1.id), 'ALL rule: one approval does NOT close the step').toBe(
      'IN_PROGRESS',
    )
    expect(
      taskStatus(approverTask),
      'the sibling task survives — an ALL step must NOT supersede the outstanding approver',
    ).toBe('ASSIGNED')
    expect(stepStatus(steps[1].id), 'the next step has not been activated early').toBe('PENDING')

    // ── Second approval closes it ────────────────────────────────────────────
    const second = await approveTaskAs(browser, AUTH.approver, approverTask, {
      comment: 'E2E J6 — second ALL approval',
    })
    expect(second.status, `second approval accepted: ${errorMessage(second.body)}`).toBe(200)

    await expect
      .poll(() => stepStatus(step1.id), {
        message: 'the final outstanding approval closes the step',
        timeout: 30_000,
      })
      .toBe('APPROVED')
    expect(taskStatus(approverTask)).toBe('APPROVED')
    expect(stepStatus(steps[1].id), 'the workflow advanced to the APPROVAL step').toBe(
      'IN_PROGRESS',
    )
    // Both ledger rows earned their APPROVED — both users really did approve.
    expect(assignmentStatus(step1.id, USERS.reviewer.id)).toBe('APPROVED')
    expect(assignmentStatus(step1.id, USERS.approver.id)).toBe('APPROVED')
  })

  test('ANY: one approval closes the step and supersedes the sibling task', async ({
    page,
    browser,
  }) => {
    test.setTimeout(240_000)

    const { crId, instanceId } = await createLiveWorkflowInstance(page, 'J6-any')
    const { steps, step1 } = firstStepOf(instanceId)

    setInstanceApprovalRule(step1.id, 'ANY')

    // The premise that makes this an F-05 guard: the published template is
    // untouched and still says ALL. Any ANY-shaped outcome below is proof the
    // engine read the instance's own frozen copy.
    expect(templateApprovalRule(step1.id), 'the PUBLISHED template still says ALL').toBe('ALL')

    const reviewerTask = taskIdFor(step1.id, USERS.reviewer.id)
    const approverTask = addStepAssignee(step1.id, {
      userId: USERS.approver.id,
      companyId: COMPANY_ID,
      entityType: 'ChangeRequest',
      entityId: crId,
    })

    // The sibling's inbox, read off the SERVER (not IndexedDB), before and after.
    const inboxBefore = await openInboxTaskIds(browser, AUTH.approver)
    expect(inboxBefore, 'the sibling starts with the task in their open inbox').toContain(
      approverTask,
    )

    const res = await approveTaskAs(browser, AUTH.reviewer, reviewerTask, {
      comment: 'E2E J6 — sole ANY approval',
    })
    expect(res.status, `ANY approval accepted: ${errorMessage(res.body)}`).toBe(200)

    // THE assertion. One approval is enough, and the other approver's work
    // instantly stops being work.
    await expect
      .poll(() => stepStatus(step1.id), {
        message: 'ANY rule: the first approval closes the step',
        timeout: 30_000,
      })
      .toBe('APPROVED')
    expect(taskStatus(approverTask), "the sibling's task is superseded, not left open").toBe(
      'SUPERSEDED',
    )

    const inboxAfter = await openInboxTaskIds(browser, AUTH.approver)
    expect(inboxAfter, 'and it has disappeared from their inbox').not.toContain(approverTask)

    expect(stepStatus(steps[1].id), 'the workflow advanced past the ANY step').toBe('IN_PROGRESS')
    expect(assignmentStatus(step1.id, USERS.reviewer.id), 'the real approver signed').toBe(
      'APPROVED',
    )
  })

  test('DEFECT PIN — ANY stamps APPROVED on the ledger row of a user who never approved', async ({
    page,
    browser,
  }) => {
    test.setTimeout(240_000)

    // ⚠️ THIS TEST ASSERTS BEHAVIOUR THAT IS WRONG. It is a tripwire, not a
    // guarantee. Invert it (to 'ASSIGNED', or a new SUPERSEDED/'NOT_REQUIRED'
    // state) the day the defect below is fixed — do not delete it.
    //
    // `approveTaskInstance` closes a satisfied step with an UNCONDITIONAL bulk
    // update (workflowInstanceService.js:1064):
    //
    //     UserOnWorkflowInstanceStep.update({ statusId: 'APPROVED' },
    //       { where: { workflowInstanceStepId: instanceStep.id } })
    //
    // — no filter on who actually acted. Under ALL that is harmless: every row
    // approved. Under ANY it writes APPROVED onto the ledger row of an approver
    // who did nothing, and `users_on_workflow_instance_steps` is precisely the
    // table PW-J12 calls "the row that records WHO APPROVED WHAT".
    //
    // The TASK ledger stays truthful (SUPERSEDED — asserted above), so the two
    // ledgers now disagree about the same event. For a Part-11 approval record
    // that is the wrong one to have lying: an audit reading the assignment table
    // sees two signatories on a step that only one person signed.
    //
    // Same statement also overwrites REASSIGNED / REJECTED / CANCELLED rows on
    // the step, so an assignee who explicitly declined is recorded as approving.
    const { crId, instanceId } = await createLiveWorkflowInstance(page, 'J6-anyledger')
    const { step1 } = firstStepOf(instanceId)

    setInstanceApprovalRule(step1.id, 'ANY')
    const reviewerTask = taskIdFor(step1.id, USERS.reviewer.id)
    addStepAssignee(step1.id, {
      userId: USERS.approver.id,
      companyId: COMPANY_ID,
      entityType: 'ChangeRequest',
      entityId: crId,
    })

    const res = await approveTaskAs(browser, AUTH.reviewer, reviewerTask, {
      comment: 'E2E J6 — ANY ledger probe',
    })
    expect(res.status, errorMessage(res.body)).toBe(200)

    await expect
      .poll(() => assignmentStatus(step1.id, USERS.approver.id), {
        message: 'DEFECT: the non-approving assignee is recorded as having APPROVED',
        timeout: 30_000,
      })
      .toBe('APPROVED')

    // No signature was manufactured for them, which bounds the blast radius:
    // the falsification is in the assignment ledger, not the Part-11 signature
    // table. Worth pinning — it is the reason this is a data-integrity defect
    // rather than a forged signature.
    const sigs = sqlValue(
      `SELECT count(*) FROM signatures s
         JOIN task_instances ti ON ti.id = s.task_instance_id
        WHERE ti.source_type = 'WorkflowInstanceStep' AND ti.source_id = '${step1.id}'
          AND s.user_id = '${USERS.approver.id}'`,
    )
    expect(Number(sigs), 'no signature row exists for the non-approver').toBe(0)
  })
})
