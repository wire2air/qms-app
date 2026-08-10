// PW-J18 · 🟢 GREEN-EXPECTED — `reassignAction`'s pool and duplicate validation.
//
// MTC-22's automated twin, and — like PW-J17 — the first regression guard this
// control has ever had.
//
// Reassignment exists on TWO paths in this module and they have never behaved
// the same way:
//
//   • API-15's own `REASSIGNED` action → `reassignAction`
//     (workflowInstanceService.js:1528). Validates the target against the step's
//     eligible pool, then refuses a target who already holds an open task on the
//     step. THIS FILE.
//   • the 40 per-module `POST {module}/:id/reassignStepReviewer` endpoints →
//     `executeReassignStepReviewer`. Until F-11 was closed this validated
//     NEITHER, so any owner-side caller could route a controlled-record approval
//     step to any user in the tenant, including one the template's pool excludes.
//     PW-J8 covers that path.
//
// `reassignAction` is the reference implementation F-11's fix was measured
// against. If it drifts, the thing the per-module fix was aligned TO is gone and
// nothing would report it — F-11's own unit tests assert `executeReassign…`
// against its own expectations, not against this function.
//
// The two guards, in order (order matters — eligibility runs first, so a
// duplicate probe must use an ELIGIBLE target or it never reaches the second
// check):
//
//   1. `resolveStepReviewerUserIds(...)` → `User [id] is not eligible for this
//      workflow step`. Pool = the template step's directly-assigned users UNION
//      the members of its roles. A cross-tenant target fails here too, because a
//      foreign user is in nobody's pool.
//   2. an ASSIGNED `task_instances` row for the target on the same step →
//      `Target user already has an assigned task on this step`. Without it a
//      step accumulates two open tasks for one person, and an ALL-rule step then
//      cannot close: every task must be actioned, and the second one has no UI
//      that distinguishes it from the first.
//
// Both rejections must also be ATOMIC — API-15 stamps the caller's own task
// `REASSIGNED` (controller step 4) BEFORE `reassignAction` runs, so a guard that
// threw without the request transaction rolling back would leave the caller with
// a dead task and the step with no live assignee: an F-12 stall reached by a
// third route. Each half below asserts the rollback explicitly.
//
// ⚠️ A THIRD gate now runs AHEAD of both. F-10's fix added
// `assertOutcomeAllowedOnStep(instanceStep, 'REASSIGNED', …)` as the first
// statement of `reassignAction`: REASSIGN is modelled as a configured EXTRA, so
// a step that does not list it in `allowed_outcomes_on_steps` refuses the action
// outright. The seeded E2E CR steps configure only SEND_BACK, so with no further
// setup every probe below would be refused by the OUTCOME gate and never reach
// the pool or duplicate check — the journey would go green while pinning nothing.
// `allowReassignOutcome()` therefore configures the outcome for the duration of
// the test (and asserts the outcome gate on the way past, so that control is
// pinned too rather than merely worked around).
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH, USERS, ALT_USERS, COMPANY_ID } from '../fixtures/cast.js'
import { sql, sqlValue } from '../fixtures/db.js'
import { createLiveWorkflowInstance, stepsOf } from '../fixtures/workflow.js'
import {
  assignedTaskFor,
  assignmentsOnStep,
  eligiblePoolForInstanceStep,
  errorBody,
  postApi15,
  signatureCountForInstance,
  stepStatus,
  taskStatus,
  tasksOnStep,
} from '../fixtures/workflowGuards.js'

test.use({ storageState: AUTH.author })

// ONE live instance for the whole file.
//
// Both tests need the same thing: an IN_PROGRESS root step with exactly one
// assignee holding one ASSIGNED task. Building that costs a full UI round trip
// (create CR → pick reviewers → submit → wait for sync-back), which is by far
// the slowest and least reliable part of this suite. Sharing it is safe here
// precisely because of what the first test asserts: every probe it makes is
// REJECTED and rolled back, and it ends by asserting the step, its ledger, its
// task count and the record are byte-for-byte what they were. The second test
// re-reads the state rather than trusting that, so an earlier failure surfaces
// as its own failure instead of a confusing cascade.
let shared

test.beforeAll(async ({ browser }) => {
  test.setTimeout(240_000)
  const ctx = await browser.newContext({ storageState: AUTH.author })
  const page = await ctx.newPage()
  try {
    shared = await liveStepAndTask(page, 'J18')
  } finally {
    await ctx.close()
  }
})

/** The live root step, its single assignee, and that assignee's open task. */
async function liveStepAndTask(page, tag) {
  const { crId, instanceId } = await createLiveWorkflowInstance(page, tag)
  const step = stepsOf(instanceId).find((s) => s.statusId === 'IN_PROGRESS')
  expect(step, 'the submitted instance has an IN_PROGRESS root step').toBeTruthy()

  const ledger = assignmentsOnStep(step.id)
  const assigneeIds = Object.keys(ledger)
  expect(assigneeIds.length, 'the active step has exactly one assignee').toBe(1)
  const assigneeId = assigneeIds[0]

  const task = assignedTaskFor(step.id, assigneeId)
  expect(task, 'the assignee holds an ASSIGNED task').toBeTruthy()

  const entry = Object.entries(USERS).find(([, u]) => u.id === assigneeId)
  expect(entry, `no cast member matches assignee ${assigneeId}`).toBeTruthy()

  return { crId, instanceId, step, assigneeId, task, storageState: AUTH[entry[0]], ledger }
}

/**
 * Configure REASSIGN as an allowed outcome on the TEMPLATE step behind an
 * instance step, and hand back an undo.
 *
 * Scoped to one test and reverted in `finally`. Widening the configured outcome
 * set only ADDS a menu item in the per-module task action menus; it cannot break
 * a concurrent spec the way widening a reviewer POOL would (that changes which
 * `required` selects auto-fill).
 */
function allowReassignOutcome(instanceStepId) {
  const templateStepId = sqlValue(
    `SELECT step_id FROM workflow_instance_steps WHERE id = '${instanceStepId}'`,
  )
  expect(templateStepId, 'the instance step came from a template step').toBeTruthy()

  const preExisting = Number(
    sqlValue(
      `SELECT count(*) FROM allowed_outcomes_on_steps
        WHERE step_id = '${templateStepId}' AND outcome_id = 'REASSIGN'`,
    ),
  )
  if (preExisting === 0) {
    sql(
      `INSERT INTO allowed_outcomes_on_steps (step_id, outcome_id, company_id, created_at, updated_at)
       VALUES ('${templateStepId}', 'REASSIGN', '${COMPANY_ID}', NOW(), NOW())`,
    )
  }
  return function undo() {
    if (preExisting === 0) {
      sql(
        `DELETE FROM allowed_outcomes_on_steps
          WHERE step_id = '${templateStepId}' AND outcome_id = 'REASSIGN'`,
      )
    }
  }
}

test.describe('PW-J18 · reassignAction pool + duplicate validation', () => {
  test('rejects a reassign target outside the step’s role pool — in-tenant and cross-tenant', async ({
    browser,
  }) => {
    test.setTimeout(180_000)

    const { crId, instanceId, step, assigneeId, task, storageState, ledger } = shared

    // Resolve the pool from the DATABASE rather than trusting the seed comment.
    // If a later seed adds `auditor` to the step's role, this premise fails
    // loudly instead of the journey passing for the wrong reason.
    const pool = eligiblePoolForInstanceStep(step.id)
    expect(pool, 'the step carries a non-empty eligible pool').toContain(assigneeId)

    const outsiders = [
      ['auditor', USERS.auditor.id, 'same tenant, read-only, not in the pool'],
      ['noAccess', USERS.noAccess.id, 'same tenant, zero grants, not in the pool'],
      ['altOwner', ALT_USERS.owner.id, 'a DIFFERENT tenant’s company owner'],
    ]
    for (const [name, userId] of outsiders) {
      expect(
        pool,
        `${name} must be outside the pool for this probe to mean anything`,
      ).not.toContain(userId)
    }

    const ctx = await browser.newContext({ storageState })
    let undoOutcome = () => {}
    try {
      // The outcome gate fires FIRST and would mask everything below. Prove it
      // is there (so this journey pins it rather than silently depending on its
      // absence), then configure past it.
      const gated = await postApi15(ctx, task.id, {
        action: 'REASSIGNED',
        reassignToUserId: assigneeId,
        comment: 'PW-J18 — REASSIGN not configured on this step',
      })
      if (gated.status() === 400) {
        expect(
          (await errorBody(gated)).message,
          'the F-10 outcome gate refuses an unconfigured REASSIGN',
        ).toMatch(/not an allowed outcome/i)
        expect(taskStatus(task.id), 'and rolls the caller’s task back').toBe('ASSIGNED')
      }
      undoOutcome = allowReassignOutcome(step.id)

      for (const [name, userId, why] of outsiders) {
        const res = await postApi15(ctx, task.id, {
          action: 'REASSIGNED',
          reassignToUserId: userId,
          comment: `PW-J18 pool probe — ${name}`,
        })
        const body = await errorBody(res)
        expect(
          res.status(),
          `reassigning to ${name} (${why}) must be refused: ${body.message}`,
        ).toBe(400)
        expect(body.message, `${name} rejection names the eligibility gate`).toMatch(
          /not eligible for this workflow step/i,
        )

        // Nothing was created for the ineligible target — the check runs BEFORE
        // the TaskInstance/UserOnWorkflowInstanceStep writes, and the request
        // transaction rolls the caller's own task stamp back with it.
        expect(
          Number(
            sqlValue(
              `SELECT count(*) FROM task_instances
                WHERE source_type = 'WorkflowInstanceStep' AND source_id = '${step.id}'
                  AND assigned_to = '${userId}'`,
            ),
          ),
          `no task was minted for ${name}`,
        ).toBe(0)
        expect(
          Number(
            sqlValue(
              `SELECT count(*) FROM users_on_workflow_instance_steps
                WHERE workflow_instance_step_id = '${step.id}' AND user_id = '${userId}'`,
            ),
          ),
          `no approval-ledger row was minted for ${name}`,
        ).toBe(0)
        expect(
          taskStatus(task.id),
          `the caller's own task was rolled back after the ${name} refusal`,
        ).toBe('ASSIGNED')
      }
    } finally {
      undoOutcome()
      await ctx.close()
    }

    // The step, its ledger and the record are exactly as they were.
    expect(stepStatus(step.id)).toBe('IN_PROGRESS')
    expect(assignmentsOnStep(step.id), 'the approval ledger is untouched').toEqual(ledger)
    expect(tasksOnStep(step.id).length, 'still exactly one task on the step').toBe(1)
    expect(signatureCountForInstance(instanceId), 'reassign never signs anything').toBe(0)
    expect(sqlValue(`SELECT status_id FROM change_requests WHERE id = '${crId}'`)).toBe(
      'UNDER_REVIEW',
    )
  })

  test('rejects a target who already holds an open task on the step — and accepts an eligible one', async ({
    browser,
  }) => {
    test.setTimeout(180_000)

    const { instanceId, step, assigneeId, storageState } = shared

    // Re-read rather than reusing the first test's task handle: this test's
    // whole premise is which tasks are ASSIGNED on the step right now.
    const task = assignedTaskFor(step.id, assigneeId)
    expect(
      task,
      'the assignee still holds exactly one open task after the pool probes',
    ).toBeTruthy()
    expect(tasksOnStep(step.id).length, 'the step starts this test with one task').toBe(1)

    // Manufacturing the precondition.
    //
    // The duplicate guard needs the TARGET to already hold an ASSIGNED task on
    // this step. That state cannot be produced through the UI here: the CR
    // reviewer picker writes exactly one assignee per step, each seeded workflow
    // role has exactly one member, and API-15 stamps the caller's own task
    // REASSIGNED before `reassignAction` runs — so a plain self-reassign always
    // finds zero ASSIGNED tasks and sails past the check.
    //
    // Widening the pool instead (adding a second member to the E2E Reviewer
    // role, or a `workflow_step_users` row) was rejected deliberately: it makes
    // the step-1 picker offer two options, and every other CR/workflow spec
    // depends on that `required` select AUTO-FILLING because it has exactly one.
    // That would break concurrent suites for the duration of this test.
    //
    // So the second open task is cloned from the real one — the row the guard
    // reads, in the shape the engine writes it — and removed again before the
    // CONTROL below.
    const dupTaskId = sqlValue(
      `INSERT INTO task_instances
         (assigned_to, task_kind_id, status_id, priority_id, due_date, entity_type, entity_id,
          source_type, source_id, company_id, created_at, updated_at)
       SELECT assigned_to, task_kind_id, 'ASSIGNED', priority_id, due_date, entity_type, entity_id,
              source_type, source_id, company_id, NOW(), NOW()
         FROM task_instances WHERE id = '${task.id}'
       RETURNING id`,
    )
    expect(dupTaskId, 'the duplicate open task was seeded').toBeTruthy()

    // F-10's outcome gate runs ahead of the duplicate check — see the file
    // header. Without this the probe never reaches `reassignAction` step 4.
    const undoOutcome = allowReassignOutcome(step.id)

    try {
      expect(tasksOnStep(step.id).length, 'the step now carries two open tasks').toBe(2)

      const ctx = await browser.newContext({ storageState })
      try {
        // The target IS eligible — that is the point. Anything ineligible would
        // stop at the pool check and never exercise this branch.
        expect(eligiblePoolForInstanceStep(step.id)).toContain(assigneeId)

        const res = await postApi15(ctx, task.id, {
          action: 'REASSIGNED',
          reassignToUserId: assigneeId,
          comment: 'PW-J18 duplicate probe',
        })
        const body = await errorBody(res)
        expect(
          res.status(),
          `a target already holding an open task must be refused: ${body.message}`,
        ).toBe(400)
        expect(body.message, 'rejection names the duplicate gate').toMatch(
          /already has an assigned task on this step/i,
        )

        // Atomicity: the controller had already stamped the caller's task
        // REASSIGNED before the guard fired. It must be back.
        expect(taskStatus(task.id), 'the caller’s task rolled back to ASSIGNED').toBe('ASSIGNED')
        expect(taskStatus(dupTaskId), 'the pre-existing open task is untouched').toBe('ASSIGNED')
        expect(tasksOnStep(step.id).length, 'no THIRD task was created').toBe(2)

        // ── CONTROL ────────────────────────────────────────────────────────────
        // The guard must be about the DUPLICATE, not about reassignment. Remove
        // the collision and the identical request has to succeed — otherwise
        // this file would stay green even if `reassignAction` were replaced with
        // an unconditional throw.
        sql(`DELETE FROM task_instances WHERE id = '${dupTaskId}'`)
        expect(tasksOnStep(step.id).length, 'back to one open task').toBe(1)

        const ok = await postApi15(ctx, task.id, {
          action: 'REASSIGNED',
          reassignToUserId: assigneeId,
          comment: 'PW-J18 control — an eligible, non-duplicate target is accepted.',
        })
        expect(
          ok.status(),
          `an eligible, non-colliding reassign must succeed (body: ${JSON.stringify(
            await errorBody(ok),
          )})`,
        ).toBe(200)
      } finally {
        await ctx.close()
      }

      // The accepted path did what reassignment is supposed to do: the old task
      // is closed out, a fresh ASSIGNED one exists, and the ledger row is live.
      expect(taskStatus(task.id), 'the source task is consumed').toBe('REASSIGNED')
      const after = tasksOnStep(step.id)
      expect(after.filter((t) => t.statusId === 'ASSIGNED').length, 'exactly one live task').toBe(1)
      expect(assignmentsOnStep(step.id)[assigneeId], 'the ledger row is ASSIGNED').toBe('ASSIGNED')
      expect(stepStatus(step.id), 'the step is still live').toBe('IN_PROGRESS')
      expect(
        signatureCountForInstance(instanceId),
        'no signature is written on the reassign path',
      ).toBe(0)
    } finally {
      // Idempotent — the CONTROL already deletes it on the happy path.
      sql(`DELETE FROM task_instances WHERE id = '${dupTaskId}'`)
      undoOutcome()
    }
  })
})
