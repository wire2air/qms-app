// PW-J17 · 🟢 GREEN-EXPECTED — API-15's assignment gate holds.
//
// MTC-21's automated twin, and the first regression guard this control has ever
// had.
//
// `POST /v1/services/taskInstances/:id/action` (API-15) is the engine's own
// action endpoint — the single route behind Approve, Reject, Send-back, Cancel,
// Reassign and Extend-delay for every module that approves through the workflow
// engine. Doc 11 calls it "the best-behaved thing in the module", and this is
// why: it does not ask "may this user act on workflows?", it asks "is this
// user the ASSIGNEE of THIS task?", by putting `assignedTo` in the lookup
// itself:
//
//   findOrFail(db.TaskInstance,
//     { id, companyId, assignedTo: userId, sourceType: 'WorkflowInstanceStep' })
//
// A non-assignee therefore gets a plain 404 — the task is not merely
// un-actionable, it is not visible on this route at all. Three properties fall
// out of that and all three are asserted below:
//
//   1. It is COMPANY-scoped as well as assignee-scoped (`companyId` is in the
//      same where-clause), so a foreign tenant cannot reach it either.
//   2. It is NOT permission-based. Holding `change_control:approve`, owning the
//      record, or being the COMPANY OWNER buys nothing — `isOwner` bypasses
//      permission checks all over this product and is deliberately irrelevant
//      here. That is the sharpest assertion in this file.
//   3. It fails BEFORE any state is read or written, so a rejected attempt
//      leaves no partial trace — no comment, no signature, no ledger move.
//
// ⚠️ Nothing in either repository would notice if this regressed. There is no
// unit test over `handleWorkflowAction` and no other E2E case touches API-15's
// gate. Weakening the `findOrFail` where-clause to `{ id, companyId }` and
// checking the assignee later — the shape most refactors drift toward — would
// re-open the exact hole F-01 was, on a different transport. Keep this spec
// exact: the CONTROL at the end is what stops it degrading into a test that
// passes because the task id was garbage.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH, USERS, ALT_BASE_URL, COMPANY_ID } from '../fixtures/cast.js'
import { sqlValue } from '../fixtures/db.js'
import { createLiveWorkflowInstance, stepsOf } from '../fixtures/workflow.js'
import {
  assignedTaskFor,
  assignmentsOnStep,
  errorBody,
  postApi15,
  signatureCountForInstance,
  stepStatus,
  taskStatus,
  tasksOnStep,
} from '../fixtures/workflowGuards.js'

test.use({ storageState: AUTH.author })

// Every persona that must be refused, and the reason each one is interesting.
// `author` is the CR's own OWNER and `owner` is the COMPANY owner — both would
// pass any permission-shaped gate, and both must fail this one.
const UNASSIGNED = [
  ['noAccess', AUTH.noAccess, USERS.noAccess.id, 'holds no grant of any kind'],
  ['auditor', AUTH.auditor, USERS.auditor.id, 'holds read on the record module'],
  ['approver', AUTH.approver, USERS.approver.id, 'is an assignee on a DIFFERENT step'],
  ['author', AUTH.author, USERS.author.id, 'OWNS the record the workflow runs on'],
  ['owner', AUTH.owner, USERS.owner.id, 'is the COMPANY OWNER (isOwner bypass)'],
]

test.describe('PW-J17 · API-15 assignment gate', () => {
  test('only the task ASSIGNEE can drive API-15 — owner, record-owner and cross-tenant all refused', async ({
    page,
    browser,
  }) => {
    test.setTimeout(240_000)

    const { crId, instanceId } = await createLiveWorkflowInstance(page, 'J17-gate')

    // The live step and the one task on it. Everything below is aimed at THIS
    // task id, so the 404s cannot be explained by a bad id.
    const activeStep = stepsOf(instanceId).find((s) => s.statusId === 'IN_PROGRESS')
    expect(activeStep, 'the submitted instance has an IN_PROGRESS root step').toBeTruthy()

    // The assignee of THE ACTIVE STEP specifically — not `anyAssignmentOn`,
    // which returns the earliest row on the whole instance and would happily
    // hand back a PENDING step's reviewer.
    const beforeAssignments = assignmentsOnStep(activeStep.id)
    const assigneeIds = Object.keys(beforeAssignments)
    expect(assigneeIds.length, 'the active step has exactly one assignee').toBe(1)
    const assigneeId = assigneeIds[0]

    const task = assignedTaskFor(activeStep.id, assigneeId)
    expect(task, 'the assignee holds an ASSIGNED task on the active step').toBeTruthy()

    // Premise: every persona probed below is genuinely NOT the assignee. Without
    // this, adding the assignee to the list by accident would show up as a green
    // test rather than a failing one.
    for (const [name, , userId] of UNASSIGNED) {
      expect(
        userId,
        `${name} must not be the task's assignee for this probe to mean anything`,
      ).not.toBe(assigneeId)
    }

    for (const [name, storageState, , why] of UNASSIGNED) {
      const ctx = await browser.newContext({ storageState })
      try {
        // APPROVED is the highest-value action on the endpoint — if any of these
        // returned 200 the step would close and the record would advance.
        const res = await postApi15(ctx, task.id, { action: 'APPROVED' })
        expect(res.status(), `${name} (${why}) must not reach another user's task`).toBe(404)

        const { message } = await errorBody(res)
        // The gate is expressed as "no such task", not "you may not do that" —
        // asserting the shape keeps a future refactor from downgrading the 404
        // into a 403 that leaks the task's existence.
        expect(message, `${name} gets a not-found, not a permission message`).toMatch(
          /task instance/i,
        )
      } finally {
        await ctx.close()
      }
    }

    // Cross-tenant. The same where-clause carries `companyId`, so a second
    // tenant's OWNER — the most privileged principal that exists over there —
    // is refused for a second, independent reason.
    const altCtx = await browser.newContext({
      storageState: AUTH.altOwner,
      baseURL: ALT_BASE_URL,
    })
    try {
      const res = await altCtx.request.post(
        `${ALT_BASE_URL}/api/v1/services/taskInstances/${task.id}/action`,
        { data: { action: 'APPROVED' } },
      )
      expect(res.status(), "another tenant's owner must not reach an E2ELAB task").toBe(404)
    } finally {
      await altCtx.close()
    }

    // ── Nothing moved. Six rejected attempts, zero side effects. ──────────────
    expect(taskStatus(task.id), 'the task is still ASSIGNED').toBe('ASSIGNED')
    // Asserted as a count, not as a scalar: psql prints an empty column as an
    // empty line, which `sqlValue` (via `sqlRow`) hands back as `null` rather
    // than `''` — so `toBe('')` fails on a perfectly clean row.
    expect(
      Number(
        sqlValue(
          `SELECT count(*) FROM task_instances WHERE id = '${task.id}' AND comment IS NOT NULL`,
        ),
      ),
      'no rejected attempt wrote its comment onto the task',
    ).toBe(0)
    expect(stepStatus(activeStep.id), 'the step is still IN_PROGRESS').toBe('IN_PROGRESS')
    expect(assignmentsOnStep(activeStep.id), 'the approval ledger is untouched').toEqual(
      beforeAssignments,
    )
    expect(
      signatureCountForInstance(instanceId),
      'no signature was manufactured by a refused attempt',
    ).toBe(0)
    expect(
      sqlValue(`SELECT status_id FROM change_requests WHERE id = '${crId}'`),
      'the record itself never advanced',
    ).toBe('UNDER_REVIEW')
    expect(tasksOnStep(activeStep.id).length, 'no attempt minted a task for its own caller').toBe(1)

    // ── CONTROL ──────────────────────────────────────────────────────────────
    // The load-bearing half. Without it every 404 above is equally explained by
    // "that task id does not exist" — and the spec would stay green after the
    // gate was removed, as long as the id happened to be wrong.
    const assigneeCtx = await browser.newContext({ storageState: storageStateFor(assigneeId) })
    try {
      const ok = await postApi15(assigneeCtx, task.id, {
        action: 'COMPLETE_AND_ADVANCE',
        outcomeId: 'COMPLETE_AND_ADVANCE',
        comment: 'PW-J17 control — the assignee CAN act.',
      })
      expect(
        ok.status(),
        `the real assignee must be able to act on the very same task (body: ${JSON.stringify(
          await errorBody(ok),
        )})`,
      ).toBe(200)
    } finally {
      await assigneeCtx.close()
    }

    expect(
      taskStatus(task.id),
      'the assignee’s own action landed — proving the task was live and actionable all along',
    ).not.toBe('ASSIGNED')
  })
})

/**
 * Map an assignee's user id back to their storageState.
 *
 * `createLiveWorkflowInstance` rides the CR flow, whose step-1 pool has exactly
 * one member — but resolving through the cast rather than hard-coding
 * `AUTH.reviewer` means a seed change that repoints step 1 fails loudly here
 * instead of turning the CONTROL into a silent 404.
 */
function storageStateFor(userId) {
  const entry = Object.entries(USERS).find(([, u]) => u.id === userId)
  expect(entry, `no cast member matches assignee ${userId} (company ${COMPANY_ID})`).toBeTruthy()
  const state = AUTH[entry[0]]
  expect(state, `cast member ${entry[0]} has no storageState`).toBeTruthy()
  return state
}
