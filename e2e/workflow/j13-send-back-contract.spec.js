// PW-J13 · F-03 — SEND_BACK, the control that had never once executed.
//
// `SEND_BACK` is advertised on 57 published template steps and drawn in the
// reviewer's outcome menu. Across 2,313 workflow_instance_steps there were
// **zero** rows in `SENT_BACK`. Not rare — never. Two independent gates stood in
// front of it (docs/modules/workflows/06-workflow.md §E):
//
//   GATE 1 — configuration. `sendBackAction` validates the requested target
//     against `steps_send_back_targets`, and that table had 0 rows in every
//     company since the schema was created. Nothing in either repository had
//     ever written one, so the validation always found nothing and always threw
//     a 400.
//
//   GATE 2 — the replay. Past the validation, the recreate loop wrote
//     `stepNumber: step.stepOrder` for every step it replayed — values the
//     original run already holds on rows that are still live — so the very first
//     INSERT violated `uq_workflow_instance_steps_instance_number`.
//
// Both are closed: migration 20260807101000 materialises the targets at publish
// (with a backfill for versions already published), and the recreate loop now
// allocates `stepNumber` from max+1 within the instance, the same convention the
// ad-hoc child-step paths use.
//
// This file gates each one where it can fail independently — test 1 is the
// configuration invariant (cheap, whole-database), test 2 is the contract
// executing end to end. Test 3 covers the surface a reviewer actually clicks,
// which turns out not to be the same path at all.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH, ESIGN_PIN, USERS } from '../fixtures/cast.js'
import { sql, sqlRow, sqlValue, waitForSqlValue } from '../fixtures/db.js'
import { createLiveWorkflowInstance } from '../fixtures/workflow.js'
import {
  completeApproverStep,
  completeReviewerStep,
  stepIdByName,
} from '../fixtures/changeRequests.js'
import { clickWhenReady } from '../fixtures/documents.js'

test.use({ storageState: AUTH.author }) // the CR owner/author drives creation

const q = (s) => `'${String(s).replace(/'/g, "''")}'`

/** Instance-step rows of a workflow instance, newest first per template step. */
function instanceSteps(instanceId) {
  const out = sql(
    `SELECT id, step_number, step_order, status_id, coalesce(step_id::text,''),
            coalesce(name,''), extract(epoch from created_at)::bigint
       FROM workflow_instance_steps
      WHERE workflow_instance_id = ${q(instanceId)} AND deleted_at IS NULL
      ORDER BY step_number`,
  )
  if (!out) return []
  return out.split('\n').map((line) => {
    const [id, num, order, statusId, stepId, name, created] = line.split('|')
    return {
      id,
      stepNumber: Number(num),
      stepOrder: Number(order),
      statusId,
      stepId: stepId || null,
      name,
      createdAt: Number(created),
    }
  })
}

/** The task a user can act on for a step. */
function actionableTask(instanceStepId, userId) {
  return sqlValue(
    `SELECT id FROM task_instances
      WHERE source_type = 'WorkflowInstanceStep' AND source_id = ${q(instanceStepId)}
        AND assigned_to = ${q(userId)} AND status_id IN ('ASSIGNED','FORM_SUBMITTED')
        AND deleted_at IS NULL
      ORDER BY created_at DESC LIMIT 1`,
  )
}

test.describe('PW-J13 · F-03 send-back', () => {
  test('GATE 1: every published step that advertises SEND_BACK has a configured target', async () => {
    // The invariant the whole feature rests on, asserted against the WHOLE
    // database rather than the E2E tenant: F-03 was a fleet-wide configuration
    // hole, and the publish trigger has to hold for every company, not just the
    // one this suite happens to use.
    //
    // A step legitimately has no target when nothing precedes it at its own
    // level — you cannot send the FIRST step back to anything — so the offender
    // query requires an earlier same-level sibling to exist. That mirrors the
    // legal-target rule in the seeding function exactly; if the two ever
    // disagree, this test is the thing that says so.
    const offenders = sql(`
      SELECT w.name || ' / ' || s.name
        FROM workflow_steps s
        JOIN allowed_outcomes_on_steps ao ON ao.step_id = s.id AND ao.outcome_id = 'SEND_BACK'
        JOIN workflow_versions v ON v.id = s.workflow_version_id
        JOIN workflows w ON w.id = v.workflow_id
       WHERE s.deleted_at IS NULL
         AND v.status_id = 'PUBLISHED'
         AND v.deleted_at IS NULL
         AND EXISTS (
               SELECT 1 FROM workflow_steps t
                WHERE t.workflow_version_id = s.workflow_version_id
                  AND t.deleted_at IS NULL
                  AND t.step_order < s.step_order
                  AND t.parent_step_id IS NOT DISTINCT FROM s.parent_step_id)
         AND NOT EXISTS (
               SELECT 1 FROM steps_send_back_targets sb
                WHERE sb.step_id = s.id AND sb.deleted_at IS NULL)
       ORDER BY 1`)
    expect(
      offenders,
      'steps offering a send-back the engine would refuse (F-03 gate 1)',
    ).toBe('')

    // ...and the inverse, so an empty `allowed_outcomes_on_steps` could never
    // make the assertion above vacuously true.
    const configured = Number(
      sqlValue('SELECT count(*) FROM steps_send_back_targets WHERE deleted_at IS NULL'),
    )
    expect(configured, 'send-back targets exist at all').toBeGreaterThan(0)
  })

  test('GATE 2: the documented SENT_BACK contract returns the instance to its target step', async ({
    page,
    browser,
  }) => {
    test.setTimeout(300_000)

    // Carrier: the seeded CR workflow — Impact Review (ACTION) → Change
    // Approval (APPROVAL + e-sign) → Implementation. Change Approval is the
    // realistic origin for a send-back: the approver has read the package and
    // wants the reviewer to redo their step.
    const { crId, instanceId } = await createLiveWorkflowInstance(page, 'J13-contract')
    await completeReviewerStep(browser, crId)

    const approvalStepId = stepIdByName(crId, 'Change Approval')
    const reviewStepId = stepIdByName(crId, 'Impact Review')
    expect(approvalStepId && reviewStepId, 'both seeded steps resolved').toBeTruthy()

    await waitForSqlValue(
      `SELECT count(*) FROM task_instances
        WHERE source_type = 'WorkflowInstanceStep' AND source_id = ${q(approvalStepId)}
          AND assigned_to = ${q(USERS.approver.id)} AND status_id = 'ASSIGNED'`,
      { timeoutMs: 60_000, label: 'approver task live on Change Approval' },
    )

    const before = instanceSteps(instanceId)
    const approvalTemplateStepId = before.find((s) => s.id === approvalStepId).stepId
    const reviewTemplateStepId = before.find((s) => s.id === reviewStepId).stepId
    const maxStepNumberBefore = Math.max(...before.map((s) => s.stepNumber))

    // The target comes from the product's own configuration, not from the test.
    // Reading it here is the point: if the publish-time seeding regresses, this
    // resolves to nothing and the journey fails at its first assertion rather
    // than limping on against a hand-written row.
    const targetTemplateStepId = sqlValue(
      `SELECT target_step_id FROM steps_send_back_targets
        WHERE step_id = ${q(approvalTemplateStepId)} AND deleted_at IS NULL
        ORDER BY created_at LIMIT 1`,
    )
    expect(
      targetTemplateStepId,
      'the engine has a configured send-back target for Change Approval',
    ).toBeTruthy()
    expect(targetTemplateStepId, 'and it is the step before it').toBe(reviewTemplateStepId)

    const taskId = actionableTask(approvalStepId, USERS.approver.id)
    const ctx = await browser.newContext({ storageState: AUTH.approver })
    let res
    try {
      // Since 2026-08-19 this call needs TWO things of Adam, not one. He is the
      // step's assignee (unchanged) AND `assertCanActOnStep` now asks the matrix
      // for `change_control:approve`, of the assignee too — an assignment routes
      // work, it does not confer the verb. He holds it at tenant scope
      // (e2e-seed.sql §17), so nothing here changes; but if that grant is ever
      // pulled, this test fails with a 403 whose message is about roles rather
      // than about send-back, and the failure will look like an F-03 regression
      // when it is not. PW-J17 pins that gate directly.
      // The documented contract (schemas/workflowInstanceSchemas.js), driven as
      // the assignee. Change Approval requires an e-signature, and step 3 of
      // handleWorkflowAction gates EVERY outcome on it — a send-back from a
      // signed step is itself a signed decision, so the PIN travels with it.
      res = await ctx.request.post(`/api/v1/services/taskInstances/${taskId}/action`, {
        data: {
          action: 'SENT_BACK',
          sendBackTargetStepId: targetTemplateStepId,
          comment: 'E2E — impact assessment is incomplete, please redo the review step.',
          method: 'PIN',
          token: ESIGN_PIN,
        },
      })
    } finally {
      await ctx.close()
    }
    expect(res.status(), `SENT_BACK — ${await res.text().catch(() => '')}`).toBe(200)

    await waitForSqlValue(
      `SELECT count(*) FROM workflow_instance_steps WHERE id = ${q(approvalStepId)} AND status_id = 'SENT_BACK'`,
      { timeoutMs: 30_000, label: 'the origin step is marked SENT_BACK' },
    )

    const after = instanceSteps(instanceId)

    // ── The origin ───────────────────────────────────────────────────────────
    const origin = after.find((s) => s.id === approvalStepId)
    expect(origin.statusId, 'the step the approver acted on is SENT_BACK').toBe('SENT_BACK')

    // ── GATE 2 itself: the replay wrote rows at all ──────────────────────────
    // Pre-fix, every INSERT in this loop collided with
    // uq_workflow_instance_steps_instance_number, because the replayed rows
    // reused the step_number the original run still holds.
    const replayed = after.filter((s) => s.stepNumber > maxStepNumberBefore)
    expect(
      replayed.length,
      'the replay re-created the steps from the target through the origin',
    ).toBe(2)
    const dupes = sqlValue(
      `SELECT count(*) FROM (
         SELECT step_number FROM workflow_instance_steps
          WHERE workflow_instance_id = ${q(instanceId)} AND deleted_at IS NULL
          GROUP BY step_number HAVING count(*) > 1) d`,
    )
    expect(Number(dupes), 'and the unique index over (instance, step_number) still holds').toBe(0)

    // ── The instance came back to the target ─────────────────────────────────
    const newTarget = replayed.find((s) => s.stepId === reviewTemplateStepId)
    expect(newTarget, 'a fresh run of the target step exists').toBeTruthy()
    expect(newTarget.statusId, 'and it is live').toBe('IN_PROGRESS')
    expect(newTarget.stepOrder, 'replayed at the template position, not renumbered out of order').toBe(
      before.find((s) => s.id === reviewStepId).stepOrder,
    )

    const newOrigin = replayed.find((s) => s.stepId === approvalTemplateStepId)
    expect(newOrigin.statusId, 'the origin is queued to run again after it').toBe('PENDING')

    const instance = sqlRow(
      `SELECT status_id, current_step FROM workflow_instances WHERE id = ${q(instanceId)}`,
    )
    expect(instance[0], 'the workflow is still running — a send-back is not a rejection').toBe(
      'IN_PROGRESS',
    )
    expect(
      Number(instance[1]),
      'and its cursor points at the replayed target row, not the template stepOrder',
    ).toBe(newTarget.stepNumber)

    // ── Somebody was actually told ───────────────────────────────────────────
    // Every notification in this engine rides the task INSERT. A replay that
    // moved the status columns but minted no task would be F-12 all over again:
    // a live step nobody can see and nobody was told about.
    await waitForSqlValue(
      `SELECT count(*) FROM task_instances
        WHERE source_type = 'WorkflowInstanceStep' AND source_id = ${q(newTarget.id)}
          AND assigned_to = ${q(USERS.reviewer.id)} AND status_id = 'ASSIGNED'`,
      { timeoutMs: 30_000, label: 'the target step re-assigned its reviewer' },
    )
    expect(
      sqlValue(
        `SELECT count(*) FROM users_on_workflow_instance_steps
          WHERE workflow_instance_step_id = ${q(newTarget.id)} AND status_id = 'ASSIGNED'
            AND deleted_at IS NULL`,
      ),
      'with a live assignment row behind it',
    ).toBe('1')

    // ── The record followed ──────────────────────────────────────────────────
    // changeRequestHandler.onSendBack returns the CR to DRAFT so the owner can
    // correct and resubmit. Without the hook the CR would sit "Under Review"
    // while its workflow had rewound.
    await waitForSqlValue(
      `SELECT count(*) FROM change_requests WHERE id = ${q(crId)} AND status_id = 'DRAFT'`,
      { timeoutMs: 30_000, label: 'CR returned to DRAFT' },
    )

    // ── Part 11 ──────────────────────────────────────────────────────────────
    // The origin step requires an e-signature, and step 3 of handleWorkflowAction
    // gates every outcome on it — including this one. The signature has to exist
    // and has to be bound to the task that was acted on.
    expect(
      sqlValue(`SELECT count(*) FROM signatures WHERE task_instance_id = ${q(taskId)}`),
      'the signed send-back left exactly one signature row',
    ).toBe('1')
    // Its MEANING is asserted negatively on purpose. `signatureService`'s
    // meaningMap covers APPROVED / REJECTED / CHANGES_REQUESTED and falls back to
    // 'REVIEWED' for everything else, so a send-back currently manifests as
    // "REVIEWED" rather than as itself — arguably thin against 21 CFR 11 §11.50's
    // "meaning associated with the signature", and worth its own finding, but not
    // something to freeze a string on. What must never be true is that rewinding
    // an approval manifests as having GRANTED one.
    expect(
      sqlValue(`SELECT meaning FROM signatures WHERE task_instance_id = ${q(taskId)}`),
      'a send-back must never be manifested as an approval',
    ).not.toBe('APPROVED')
  })

  test('the reviewer-facing "Send Back" control is the LIGHTWEIGHT path, not the contract above', async ({
    page,
    browser,
  }) => {
    test.setTimeout(360_000)

    // ⚠️ READ THIS BEFORE "FIXING" THE TEST.
    //
    // The outcome dropdown offers "Send Back" on every non-APPROVAL step that
    // advertises SEND_BACK. It does NOT drive the contract test 2 just proved
    // works: WorkflowStepActionsMenu.vue:162 picks its endpoint by step type —
    //     APPROVAL step     → {module}/:id/rejectStepTask   (terminates)
    //     non-APPROVAL step → {module}/:id/sendBackStepTask (marker + notify)
    // and neither carries `sendBackTargetStepId`, so `sendBackAction` — the only
    // code that can produce a SENT_BACK step — is unreachable from any UI
    // surface in the product.
    //
    // That is deliberate for what it is (06-workflow.md §E records the marker
    // path as working, and it is what the owner-notification NTF-05 rides on),
    // and it is untested. This test pins it. What it also documents is the
    // divergence: F-03's contract is reachable only by an API client, so the
    // fleet-wide "0 SENT_BACK rows" reading will not change from UI traffic
    // alone even now that both engine gates are closed.
    //
    // If the menu is ever rewired to the documented contract, this test SHOULD
    // fail — rewrite it then as the full journey (origin SENT_BACK, instance
    // back at the target), which is exactly the shape of test 2.
    const { crId, instanceId } = await createLiveWorkflowInstance(page, 'J13-uipath')
    await completeReviewerStep(browser, crId)
    await completeApproverStep(browser, crId)

    // Implementation is the CR template's only non-APPROVAL step that both
    // advertises SEND_BACK and has an earlier sibling to send back TO, so it is
    // the one place the UI control is offered with a legal target behind it.
    await waitForSqlValue(
      `SELECT count(*) FROM task_instances ti
         JOIN workflow_instance_steps wis ON wis.id = ti.source_id
        WHERE ti.source_type = 'WorkflowInstanceStep'
          AND wis.workflow_instance_id = ${q(instanceId)}
          AND wis.name = 'Implementation'
          AND ti.assigned_to = ${q(USERS.author.id)} AND ti.status_id = 'ASSIGNED'`,
      { timeoutMs: 90_000, label: 'Implementation step live for its assignee' },
    )
    const implStepId = stepIdByName(crId, 'Implementation')
    const implTaskId = actionableTask(implStepId, USERS.author.id)
    const cursorBefore = sqlValue(
      `SELECT current_step FROM workflow_instances WHERE id = ${q(instanceId)}`,
    )

    const posts = []
    page.on('request', (req) => {
      if (req.method() === 'POST' && /StepTask|\/action$/.test(req.url())) posts.push(req.url())
    })

    await page.goto(`/change-requests/${crId}`, { waitUntil: 'domcontentloaded' })
    // The dropdown trigger is BaseMenu's default "More actions" button; the
    // inline Approve/Complete button is rendered separately and SEND_BACK is the
    // only outcome left in the menu after the always-hidden set is removed.
    await clickWhenReady(page, page.getByRole('button', { name: 'More actions' }).last())
    await page.getByRole('menuitem', { name: 'Send Back' }).click()
    await expect(page.getByRole('heading', { name: 'Send Back' })).toBeVisible({ timeout: 10_000 })
    await page
      .getByPlaceholder('Why are you sending this back to the owner?')
      .fill('E2E — implementation evidence is missing.')
    await page.getByRole('button', { name: 'Confirm', exact: true }).click()

    await waitForSqlValue(
      `SELECT count(*) FROM task_instances
        WHERE source_type = 'WorkflowInstanceStep' AND source_id = ${q(implStepId)}
          AND status_id = 'SENT_BACK'`,
      { timeoutMs: 45_000, label: 'the marker task was minted' },
    )

    expect(posts.length, 'one write went out').toBe(1)
    expect(
      posts[0],
      'and it is the lightweight marker endpoint, not the documented task action',
    ).toContain(`/changeRequests/${crId}/sendBackStepTask`)

    // The marker path deliberately leaves everything else alone: the reviewer's
    // own task stays actionable so they can finish once the owner responds, and
    // the workflow does not rewind.
    expect(
      sqlValue(`SELECT status_id FROM task_instances WHERE id = ${q(implTaskId)}`),
      "the assignee's own task is untouched",
    ).toBe('ASSIGNED')
    expect(
      instanceSteps(instanceId).filter((s) => s.statusId === 'SENT_BACK').length,
      'no step reached SENT_BACK — that status is only ever written by sendBackAction',
    ).toBe(0)
    expect(
      sqlValue(`SELECT current_step FROM workflow_instances WHERE id = ${q(instanceId)}`),
      'and the workflow cursor did not move',
    ).toBe(cursorBefore)
  })
})
