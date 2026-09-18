// PW-J16 · F-16 — no signature on the 40 per-module step actions.
//
// The finding: none of the 40 per-module step-action endpoints wrote a
// `signatures` row, regardless of the step's `requireEsignature`, and
// `enforceEsignature` — the helper written for exactly this — had zero callers
// repo-wide.
//
// The half that actually mattered is a BYPASS, not a missing feature. Rejecting
// an APPROVAL step has two routes to the very same `rejectTaskAction` core:
//
//   • API-15  POST /v1/services/taskInstances/:id/action  { action: 'REJECTED' }
//       → demands a signature when the step requires one, and writes the ledger row.
//   • per-module  POST /v1/services/{module}/:id/rejectStepTask
//       → did neither.
//
// Same actor (the holder of the ASSIGNED task), same step, same terminal effect
// on the record — signed on one route, unsigned on the other. And the frontend
// routes EVERY approval-step "Reject" down the second one
// (WorkflowStepActionsMenu.vue:162), so in practice every rejection of an
// e-sign-required approval in this product was unsigned.
//
// This spec asserts the fixed contract on the Change Request instance of the
// shared implementation (`executeRejectStepTask`, which all six modules call):
//
//   1. no credentials on an e-sign-required step → refused, with a
//      machine-readable `code: 'ESIGNATURE_REQUIRED'` so the frontend can open
//      its e-sign dialog and retry rather than showing a bare validation error;
//   2. WRONG credentials → refused, and — because the signature is written
//      inside the same transaction as the rejection, BEFORE any state change —
//      nothing at all moves. A rejection can never commit without its signature;
//   3. correct credentials → 200, exactly one `signatures` row, bound to the
//      REVIEWER'S TASK (`signatures` has no step column; the subject CHECK
//      permits exactly one of seven FKs and the workflow one is
//      `task_instance_id`), with `meaning = 'REJECTED'`.
//
// The gate reads the F-05 INSTANCE snapshot first and only falls back to the
// template, so a `workflows_templates:update` holder cannot flip
// `require_esignature = false` on the published step and make the signature
// requirement evaporate — step 2b of the first test pins that.
//
// ── One thing 2026-08-19 did NOT change, deliberately ───────────────────────
// The assignee-verb rule widened the COMPLETE path only. API-15 now lets any
// user the matrix permits act on a step (`assertCanActOnStep`), assignee or
// not — but REJECT and SEND-BACK on these per-module endpoints are still
// ASSIGNEE-ONLY: `executeRejectStepTask` filters `assignedTo: user.id` on the
// task lookup and answers `'You have no ASSIGNED task on this step to reject'`,
// and the route carries no `enforcePermission` at all. So every probe in this
// file is driven by the step's own assignee and none of them is measuring a
// permission — which is exactly what makes this file about SIGNATURES and
// PW-J17 about ACCESS. If that asymmetry is ever closed, the failure surfaces
// there, not here; do not "harmonise" these two files.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH, ESIGN_PIN, USERS } from '../fixtures/cast.js'
import { sql, sqlValue } from '../fixtures/db.js'
import { completeReviewerStep, stepIdByName } from '../fixtures/changeRequests.js'
import { createLiveWorkflowInstance } from '../fixtures/workflow.js'
import {
  clearEsignPinLockout,
  errorBody,
  signatureCountForInstance,
  signaturesForTask,
  stepStatus,
  taskStatus,
  waitForAssignedTask,
} from '../fixtures/workflowGuards.js'

test.use({ storageState: AUTH.author })

/**
 * Drive a CR to its APPROVAL step and hand back the approver's live task.
 *
 * Step 2 of the seeded CR workflow ("Change Approval") is the only step in the
 * E2E tenant that is both `APPROVAL` and `require_esignature = true` — i.e. the
 * only place the signed/unsigned asymmetry can be observed at all. Reaching it
 * means completing step 1 first.
 */
async function reachApprovalStep(page, browser, tag) {
  const { crId, instanceId } = await createLiveWorkflowInstance(page, tag)
  await completeReviewerStep(browser, crId)

  const stepId = stepIdByName(crId, 'Change Approval')
  expect(stepId, 'the CR workflow has a "Change Approval" step').toBeTruthy()

  // Premise: the step really does demand a signature, read off the INSTANCE
  // snapshot the engine actually consults. Without this the whole file could
  // pass against a step that never required one.
  expect(
    sqlValue(`SELECT require_esignature FROM workflow_instance_steps WHERE id = '${stepId}'`),
    'the APPROVAL step carries the frozen e-signature requirement',
  ).toBe('t')

  const task = await waitForAssignedTask(stepId, USERS.approver.id)
  expect(task, 'the approver holds an ASSIGNED task on the APPROVAL step').toBeTruthy()

  return { crId, instanceId, stepId, task }
}

/** POST the per-module reject endpoint as whoever owns `ctx`. */
function postReject(ctx, crId, data) {
  return ctx.request.post(`/api/v1/services/changeRequests/${crId}/rejectStepTask`, { data })
}

test.describe('PW-J16 · F-16 per-module reject must sign', () => {
  test('rejecting an e-sign-required step through the per-module endpoint demands a signature, then writes one', async ({
    page,
    browser,
  }) => {
    test.setTimeout(300_000)

    const { crId, instanceId, stepId, task } = await reachApprovalStep(page, browser, 'J16-sign')
    expect(signatureCountForInstance(instanceId), 'no signature exists yet').toBe(0)

    const ctx = await browser.newContext({ storageState: AUTH.approver })
    try {
      // ── 1. No credentials → refused, fail-closed, machine-readable. ─────────
      const bare = await postReject(ctx, crId, {
        workflowInstanceStepId: stepId,
        comment: 'PW-J16 — rejecting without a signature.',
      })
      const bareBody = await errorBody(bare)
      expect(
        bare.status(),
        `an unsigned reject on an e-sign step must be refused (body: ${JSON.stringify(bareBody.raw)})`,
      ).toBe(400)
      expect(bareBody.code, 'the refusal is machine-readable so the FE can open its dialog').toBe(
        'ESIGNATURE_REQUIRED',
      )
      expect(bareBody.message).toMatch(/e-signature/i)

      expect(stepStatus(stepId), 'the step did not move').toBe('IN_PROGRESS')
      expect(taskStatus(task.id), 'the approver task did not move').toBe('ASSIGNED')
      expect(sqlValue(`SELECT status_id FROM change_requests WHERE id = '${crId}'`)).toBe(
        'UNDER_REVIEW',
      )
      expect(signatureCountForInstance(instanceId), 'nothing was signed').toBe(0)

      // ── 2. Wrong credentials → refused, atomically. ─────────────────────────
      // This is the assertion that proves the signature is written INSIDE the
      // rejection's transaction rather than alongside it. If the two were
      // separate, a bad PIN would leave the record rejected and unsigned — a
      // strictly worse state than the finding described.
      const wrong = await postReject(ctx, crId, {
        workflowInstanceStepId: stepId,
        comment: 'PW-J16 — rejecting with the wrong PIN.',
        method: 'PIN',
        token: '00000000',
      })
      expect(wrong.status(), 'a bad PIN must be refused').toBe(400)
      expect((await errorBody(wrong)).message).toMatch(/invalid pin|no e-signature pin/i)
      // The failed attempt just incremented `esign:pinfail:<approver>`. Five of
      // those in a 15-minute window turn every later signature attempt into a
      // 429 ESIGN_PIN_LOCKED — including step 3 below, and including every other
      // spec that signs as this persona. Clear it immediately.
      clearEsignPinLockout(USERS.approver.id)

      expect(stepStatus(stepId), 'the step did not move on a bad PIN').toBe('IN_PROGRESS')
      expect(taskStatus(task.id), 'the task did not move on a bad PIN').toBe('ASSIGNED')
      expect(sqlValue(`SELECT status_id FROM change_requests WHERE id = '${crId}'`)).toBe(
        'UNDER_REVIEW',
      )
      expect(signatureCountForInstance(instanceId), 'a failed verification signs nothing').toBe(0)

      // ── 2b. Template tampering does NOT disarm the gate (F-05 × F-16). ──────
      // If this endpoint resolved `requireEsignature` from the TEMPLATE, a
      // `workflows_templates:update` holder could switch the brand-new
      // signature gate off on an approval already in flight — reopening F-05
      // through the door F-16's fix just built. `resolveStepRequiresEsignature`
      // reads the frozen INSTANCE snapshot first, so the edit is inert here.
      //
      // Run inline on this same instance rather than as its own test: reaching
      // an e-sign APPROVAL step costs a full CR create + reviewer completion,
      // and the state this needs is exactly the state we are already holding.
      const templateStepId = sqlValue(
        `SELECT step_id FROM workflow_instance_steps WHERE id = '${stepId}'`,
      )
      sql(`UPDATE workflow_steps SET require_esignature = false WHERE id = '${templateStepId}'`)
      try {
        const tampered = await postReject(ctx, crId, {
          workflowInstanceStepId: stepId,
          comment: 'PW-J16 — template disarmed, the instance snapshot must still bite.',
        })
        const tamperedBody = await errorBody(tampered)
        expect(
          tampered.status(),
          `the in-flight approval keeps the signature requirement it started under (body: ${JSON.stringify(tamperedBody.raw)})`,
        ).toBe(400)
        expect(tamperedBody.code).toBe('ESIGNATURE_REQUIRED')
        expect(taskStatus(task.id), 'nothing was rejected unsigned').toBe('ASSIGNED')
        expect(signatureCountForInstance(instanceId)).toBe(0)
      } finally {
        sql(`UPDATE workflow_steps SET require_esignature = true WHERE id = '${templateStepId}'`)
      }

      // ── 3. Correct credentials → 200, and the ledger row exists. ────────────
      const signed = await postReject(ctx, crId, {
        workflowInstanceStepId: stepId,
        comment: 'PW-J16 — signed rejection.',
        method: 'PIN',
        token: ESIGN_PIN,
        provider: null,
      })
      expect(
        signed.status(),
        `a correctly signed reject must succeed (body: ${JSON.stringify(
          (await errorBody(signed)).raw,
        )})`,
      ).toBe(200)
    } finally {
      await ctx.close()
    }

    // The Part-11 record. `signatures` binds to the TASK — anything that joins
    // it to a step has to go through `task_instances` where
    // `source_type = 'WorkflowInstanceStep'`.
    const sigs = signaturesForTask(task.id)
    expect(sigs.length, 'exactly one signature was written for the rejection').toBe(1)
    expect(sigs[0].userId, 'signed by the reviewer who rejected').toBe(USERS.approver.id)
    expect(sigs[0].meaning, 'the signature records what was signed').toBe('REJECTED')
    expect(sigs[0].comments, 'the rejection reason is carried onto the signature').toMatch(
      /signed rejection/i,
    )
    expect(
      signatureCountForInstance(instanceId),
      'one signature across the whole instance — no duplicate from the refused attempts',
    ).toBe(1)

    // And the rejection itself actually happened.
    expect(taskStatus(task.id)).toBe('REJECTED')
    expect(stepStatus(stepId)).toBe('REJECTED')
    expect(
      sqlValue(`SELECT status_id FROM change_requests WHERE id = '${crId}'`),
      'the CR returns to DRAFT for rework (changeRequestHandler.onRejection)',
    ).toBe('DRAFT')
  })

  test('CONTROL: a step that does NOT require a signature still rejects without one', async ({
    page,
    browser,
  }) => {
    test.setTimeout(240_000)

    // The gate must be conditional on the step, not a blanket demand — step 1
    // ("Impact Review") is an ACTION step with `require_esignature = false`, and
    // its reviewer must still be able to reject. A blanket requirement would
    // pass every assertion in the test above while breaking the module.
    const { crId, instanceId } = await createLiveWorkflowInstance(page, 'J16-control')
    const stepId = stepIdByName(crId, 'Impact Review')
    expect(
      sqlValue(`SELECT require_esignature FROM workflow_instance_steps WHERE id = '${stepId}'`),
      'the control step demands no signature',
    ).toBe('f')

    const task = await waitForAssignedTask(stepId, USERS.reviewer.id)
    const ctx = await browser.newContext({ storageState: AUTH.reviewer })
    try {
      const res = await postReject(ctx, crId, {
        workflowInstanceStepId: stepId,
        comment: 'PW-J16 control — unsigned reject on a non-e-sign step.',
      })
      expect(
        res.status(),
        `a step with no signature requirement must still be rejectable (body: ${JSON.stringify(
          (await errorBody(res)).raw,
        )})`,
      ).toBe(200)
    } finally {
      await ctx.close()
    }

    expect(taskStatus(task.id)).toBe('REJECTED')
    expect(
      signatureCountForInstance(instanceId),
      'and no signature was invented for a step that does not require one',
    ).toBe(0)
  })
})
