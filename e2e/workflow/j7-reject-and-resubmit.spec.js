// PW-J7 · J-07 — reject, then resubmit.
//
// Reject is the engine's only terminate-and-restart path, and the contract it
// implements is a 21 CFR Part 11 one: a rejected approval cycle is DEAD, and the
// corrected record is approved under a BRAND NEW cycle with brand new
// signatures. workflowStepActionsService.js states it explicitly at the top of
// the file ("Owner edits + Submit-for-Review again. submitResourceForReview
// mints a NEW workflow_instance — both steps fresh, fresh e-signatures (CFR 21
// Part 11)"), and nothing in the codebase tested it.
//
// The crux of this journey is therefore an IDENTITY assertion at the database
// layer: after resubmission the record must be carrying a different
// `workflow_instances` row whose `workflow_instance_steps` ids are disjoint from
// the rejected cycle's. A reused instance — or reused step rows — would mean the
// old cycle's approvals, assignments and signature linkage survive into the new
// one, which is precisely the thing a rejection is supposed to void. Asserting
// "the record is UNDER_REVIEW again" would pass either way and is worthless
// here; the ids are the only honest evidence.
//
// ── Note on the module's "rejected status" ─────────────────────────────────
// Doc 14 says the record "flips to its module's rejected status". For Change
// Requests that status is DRAFT, by design, not an oversight:
// changeRequestHandler.onRejection sets DRAFT and the handler's own header says
// "CR.status doesn't go to REJECTED here — that's a terminal cancel done
// explicitly via cancelChangeRequest". DRAFT is what makes the resubmission in
// the second half of this journey legal at all, so the assertion below pins
// DRAFT deliberately.
//
// ── Note on e-signature (F-16) ────────────────────────────────────────────
// The per-module reject path (`executeRejectStepTask`) takes no signature today
// — F-16 in the pack. `rejectWithSignatureFallback` below is written so that
// this journey keeps passing, and starts EXERCISING the signature, the moment
// that is fixed: it posts unsigned first and re-posts with the PIN if the server
// answers that a signature is required. The assertion that survives either way
// is the one that matters — the rejection took effect and voided the cycle.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH, USERS, ESIGN_PIN } from '../fixtures/cast.js'
import { sqlValue } from '../fixtures/db.js'
import { submitCrForApproval } from '../fixtures/changeRequests.js'
import { createLiveWorkflowInstance, stepsOf, assignmentFor } from '../fixtures/workflow.js'
import {
  CR_CREATE_STORES,
  crStatus,
  errorMessage,
  instancesFor,
  postAs,
  stepIdsOf,
  taskIdFor,
  taskStatus,
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


test.beforeEach(async ({ page }) => {
  await warmUpSyncEngine(page, CR_CREATE_STORES)
})

const rejectUrl = (crId) => `/api/v1/services/changeRequests/${crId}/rejectStepTask`

/** True when the server refused because it wanted a Part-11 signature (F-16). */
function demandsSignature(res) {
  return res.status >= 400 && /e-?signature|signature is required|token/i.test(errorMessage(res.body))
}

/**
 * Reject as the step's assignee, supplying a signature only if the server asks
 * for one. Returns `{ res, signed }` so the spec can record which contract was
 * in force on this run.
 */
async function rejectWithSignatureFallback(browser, storageState, crId, stepId, comment) {
  const unsigned = await postAs(browser, storageState, rejectUrl(crId), {
    workflowInstanceStepId: stepId,
    comment,
  })
  if (!demandsSignature(unsigned)) return { res: unsigned, signed: false }

  const signed = await postAs(browser, storageState, rejectUrl(crId), {
    workflowInstanceStepId: stepId,
    comment,
    token: ESIGN_PIN,
    method: 'PIN',
    provider: null,
  })
  return { res: signed, signed: true }
}

test.describe('PW-J7 · reject and resubmit', () => {
  test('rejecting a step terminates the whole cycle and returns the record to the owner', async ({
    page,
    browser,
  }) => {
    test.setTimeout(300_000)

    const { crId, instanceId } = await createLiveWorkflowInstance(page, 'J7-reject')
    const steps = stepsOf(instanceId)
    expect(steps.length).toBe(3)
    const [step1, step2, step3] = steps
    expect(step1.statusId).toBe('IN_PROGRESS')

    // ── Gate 1: the reason is mandatory ──────────────────────────────────────
    // Not decoration. The reason is the only thing the owner receives telling
    // them what to fix, and it is stamped onto the task + both audit rows.
    const noComment = await postAs(browser, AUTH.reviewer, rejectUrl(crId), {
      workflowInstanceStepId: step1.id,
      comment: '   ',
    })
    expect(noComment.status, 'a blank reason is refused').toBe(400)
    expect(errorMessage(noComment.body)).toMatch(/reason for rejecting is required/i)
    expect(sqlValue(`SELECT status_id FROM workflow_instances WHERE id = '${instanceId}'`)).toBe(
      'IN_PROGRESS',
    )

    // ── Gate 2: only the step's own assignee may reject it ───────────────────
    // `approver` is a legitimate participant in THIS workflow — they hold step
    // 2 — which is exactly why they are the right negative persona: the gate has
    // to be per-step, not per-instance (the same mis-scoping that was F-01).
    const wrongActor = await postAs(browser, AUTH.approver, rejectUrl(crId), {
      workflowInstanceStepId: step1.id,
      comment: 'E2E J7 — reject from an un-assigned step',
    })
    expect(wrongActor.status, 'a participant on a DIFFERENT step cannot reject this one').toBe(403)
    expect(errorMessage(wrongActor.body)).toMatch(/no ASSIGNED task on this step/i)
    expect(sqlValue(`SELECT status_id FROM workflow_instances WHERE id = '${instanceId}'`)).toBe(
      'IN_PROGRESS',
    )

    // ── The rejection ────────────────────────────────────────────────────────
    const reviewerTask = taskIdFor(step1.id, USERS.reviewer.id)
    const reason = 'E2E J7 — impact assessment is incomplete, please re-scope.'
    const { res, signed } = await rejectWithSignatureFallback(
      browser,
      AUTH.reviewer,
      crId,
      step1.id,
      reason,
    )
    expect(res.status, `reject accepted: ${errorMessage(res.body)}`).toBe(200)
    // Recorded rather than asserted: F-16 is a live finding and either contract
    // is a legitimate observation on the day this runs.
    test.info().annotations.push({
      type: 'F-16 signature on per-module reject',
      description: signed ? 'ENFORCED — a PIN was required' : 'NOT enforced — unsigned reject accepted',
    })

    await expect
      .poll(() => taskStatus(reviewerTask), { message: 'the rejection committed', timeout: 30_000 })
      .toBe('REJECTED')

    // The reviewer's own records carry the outcome and the reason.
    expect(sqlValue(`SELECT comment FROM task_instances WHERE id = '${reviewerTask}'`)).toBe(reason)
    expect(assignmentFor(step1.id, USERS.reviewer.id).statusId).toBe('REJECTED')

    // The whole cycle is dead — not just this step.
    expect(sqlValue(`SELECT status_id FROM workflow_instances WHERE id = '${instanceId}'`)).toBe(
      'REJECTED',
    )
    expect(sqlValue(`SELECT comment FROM workflow_instances WHERE id = '${instanceId}'`)).toBe(reason)
    expect(sqlValue(`SELECT status_id FROM workflow_instance_steps WHERE id = '${step1.id}'`)).toBe(
      'REJECTED',
    )
    for (const pending of [step2, step3]) {
      expect(
        sqlValue(`SELECT status_id FROM workflow_instance_steps WHERE id = '${pending.id}'`),
        `step ${pending.stepNumber} was cancelled with the cycle`,
      ).toBe('CANCELLED')
    }

    // Nothing is left on anybody's queue.
    const stillOpen = sqlValue(
      `SELECT count(*) FROM task_instances
        WHERE source_type = 'WorkflowInstanceStep'
          AND source_id IN (SELECT id FROM workflow_instance_steps WHERE workflow_instance_id = '${instanceId}')
          AND status_id IN ('ASSIGNED','IN_PROGRESS','FORM_SUBMITTED')`,
    )
    expect(Number(stillOpen), 'no task survives the rejection').toBe(0)

    // …and the record is back with its owner, editable. DRAFT is the CR
    // handler's deliberate post-rejection status (see the header note).
    expect(crStatus(crId), 'the record returns to the owner as DRAFT').toBe('DRAFT')
  })

  test('resubmission mints a NEW instance with fresh step ids — the rejected cycle is not reused', async ({
    page,
    browser,
  }) => {
    test.setTimeout(360_000)

    const { crId, instanceId: firstInstanceId } = await createLiveWorkflowInstance(page, 'J7-resub')
    const firstStepIds = stepIdsOf(firstInstanceId)
    expect(firstStepIds.length).toBe(3)
    const [firstStep1] = stepsOf(firstInstanceId)

    const { res } = await rejectWithSignatureFallback(
      browser,
      AUTH.reviewer,
      crId,
      firstStep1.id,
      'E2E J7 — rejected so the owner can resubmit.',
    )
    expect(res.status, `reject accepted: ${errorMessage(res.body)}`).toBe(200)
    await expect
      .poll(() => crStatus(crId), { message: 'the rejection returned the CR to DRAFT', timeout: 30_000 })
      .toBe('DRAFT')

    // ── DEFECT PIN — the owner cannot re-pick reviewers after a rejection ────
    //
    // ⚠️ ASSERTS BEHAVIOUR THAT IS WRONG. Invert it (expect the panel to be
    // VISIBLE) when the defect is fixed — do not delete it.
    //
    // ChangeRequestsPageId.vue gates the reviewer-picker panel on
    //     v-if="!workflowInstance && cr.statusId === 'DRAFT'"
    // and resolves `workflowInstance` as
    //     results.find(i => i.statusId === 'IN_PROGRESS') || results[0] || null
    // — so once ANY instance exists, including a terminal REJECTED one, the
    // fallback keeps returning it and the panel never comes back. The record is
    // in DRAFT and offers "Submit for Approval", but the owner has no surface on
    // which to change who reviews the corrected version. Reject-and-resubmit is
    // the module's whole correction loop, and the most likely reason to want a
    // different reviewer is that the last one rejected it.
    //
    // The condition should be "no NON-TERMINAL instance", not "no instance".
    await page.goto(`/change-requests/${crId}`)
    await expect(
      page.getByRole('button', { name: 'Submit for Approval', exact: true }).first(),
      'resubmission itself is still offered on the DRAFT record',
    ).toBeVisible({ timeout: 30_000 })
    await expect(
      page.getByText('Approval Workflow Plan'),
      'DEFECT: the reviewer-picker panel stays hidden after a rejection because a terminal instance exists',
    ).toHaveCount(0)

    // …and the picks are gone too, which compounds it. `submitChangeRequestForReview`
    // clears `pending_reviewers` to {} once it has consumed them
    // (controllers/changeRequests.js:234), so the rejected cycle leaves the CR
    // with no stored picks AND no panel to make new ones. The resubmission below
    // still succeeds only because `submitResourceForReview` silently falls back
    // to expanding each step's role — i.e. the owner's original per-step choices
    // are dropped and the second cycle is assigned by role, without being told.
    expect(
      sqlValue(
        `SELECT (SELECT count(*) FROM jsonb_object_keys(pending_reviewers)) FROM change_requests WHERE id = '${crId}'`,
      ),
      'DEFECT (compounding): the stored per-step picks were consumed by the first submit and never restored',
    ).toBe('0')

    await submitCrForApproval(page, crId)

    const instances = instancesFor('ChangeRequest', crId)
    expect(instances.length, 'resubmission did not recycle the rejected instance').toBe(2)
    expect(instances[0].id).toBe(firstInstanceId)
    expect(instances[0].statusId, 'the rejected cycle stays rejected, as the record of what happened').toBe(
      'REJECTED',
    )

    const secondInstanceId = instances[1].id
    expect(secondInstanceId).not.toBe(firstInstanceId)
    expect(instances[1].statusId).toBe('IN_PROGRESS')

    // ── THE CRUX ─────────────────────────────────────────────────────────────
    // Fresh step ROWS, not just a fresh parent. If any id were shared, the new
    // cycle would inherit the old cycle's assignments, task linkage and
    // signature references — a rejected approval quietly carried forward.
    const secondStepIds = stepIdsOf(secondInstanceId)
    expect(secondStepIds.length, 'the new cycle re-instantiates every template step').toBe(3)
    const overlap = secondStepIds.filter((id) => firstStepIds.includes(id))
    expect(overlap, 'no workflow_instance_steps row is shared between the two cycles').toEqual([])

    // And the new cycle really is fresh — not a copy carrying terminal state.
    const secondSteps = stepsOf(secondInstanceId)
    expect(secondSteps.map((s) => s.statusId)).toEqual(['IN_PROGRESS', 'PENDING', 'PENDING'])

    const newFirstStepTasks = tasksOnStep(secondSteps[0].id)
    expect(newFirstStepTasks.length, 'the new first step minted its own task').toBe(1)
    expect(newFirstStepTasks[0].assignedTo).toBe(USERS.reviewer.id)
    expect(newFirstStepTasks[0].statusId, 'a fresh ASSIGNED task, not the rejected one').toBe(
      'ASSIGNED',
    )
    expect(newFirstStepTasks[0].id).not.toBe(taskIdFor(firstStep1.id, USERS.reviewer.id))

    // No signature is inherited into the new cycle either — the Part-11 half of
    // the claim, checked rather than assumed.
    const inheritedSignatures = sqlValue(
      `SELECT count(*) FROM signatures s
         JOIN task_instances ti ON ti.id = s.task_instance_id
        WHERE ti.source_type = 'WorkflowInstanceStep'
          AND ti.source_id IN (SELECT id FROM workflow_instance_steps WHERE workflow_instance_id = '${secondInstanceId}')`,
    )
    expect(Number(inheritedSignatures), 'the new cycle starts with zero signatures').toBe(0)
  })
})
