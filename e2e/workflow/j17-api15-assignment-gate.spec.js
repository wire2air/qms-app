// PW-J17 · 🟢 GREEN-EXPECTED — who may drive API-15, and what an assignment
// actually buys you.
//
// MTC-21's automated twin, and still the only regression guard this control has
// anywhere in either repository.
//
// ⚠️ THIS FILE PINNED THE OPPOSITE CONTRACT UNTIL 2026-08-28. READ THIS BEFORE
//    "RESTORING" ANY ASSERTION FROM GIT HISTORY.
//
// `POST /v1/services/taskInstances/:id/action` (API-15) is the engine's own
// action endpoint — the single route behind Approve, Reject, Send-back, Cancel,
// Reassign and Extend-delay for every module that approves through the workflow
// engine. Until 2026-08-19 it did not ask "may this user act?", it asked "is
// this user the ASSIGNEE of THIS task?", by putting `assignedTo` in the lookup:
//
//   findOrFail(db.TaskInstance,
//     { id, companyId, assignedTo: userId, sourceType: 'WorkflowInstanceStep' })
//
// so EVERY non-assignee got a bare 404 — the record's own owner and the company
// owner included. This file asserted exactly that, and called the `isOwner`
// half "the sharpest assertion in this file".
//
// ── What changed, and why the old shape had to go ──────────────────────────
// An assignment is ROUTING — "this is your work, it is in your queue, you are
// accountable" — not an exclusive lock. Under the old rule a step whose
// assignee was on leave stranded the record until somebody reassigned it, and
// the 404 made that indistinguishable from a broken link. Worse, in the other
// direction, the assignee short-circuited EVERY permission check: since anyone
// can be assigned an approval step, `<module>:approve` meant nothing — a user
// with no approve grant could approve simply by being the assignee.
//
// So `backend/api/utils/workflowStepAccess.js` now decides, for the assignee
// too, and there are exactly two ways to qualify:
//
//   1. you are the assignee, AND the matrix grants you the step's verb; or
//   2. you are not the assignee, AND the matrix grants you the step's verb —
//      a TAKEOVER: permitted, but attributed and reported.
//
// The verb is per STEP TYPE, not per endpoint: ACTION and DELAY steps need
// `<module>:update`, APPROVAL steps need `<module>:approve`. Record ownership is
// no longer a route at all — it feeds `scope_allowed`, so it supplies SCOPE and
// never the VERB (`utils/recordAccess.js`). `user.isOwner` remains the one
// unconditional bypass, mirroring every RLS policy.
//
// And the matrix is only consulted for the four resource types whose own table
// carries owner / department / site: Nonconformance, Capa, ChangeRequest,
// Complaint. DocumentVersion, InspectionLot, LogBook, Specification and the
// admin-defined module records reach their record through a parent, have no
// scope inputs, and stay ASSIGNEE-ONLY. Test 3 pins that boundary.
//
// ── The five properties this file asserts ──────────────────────────────────
//   1. the MATRIX decides, not the assignment — three personas who are not the
//      assignee are refused **403**, including one holding `approve` on a step
//      that needs `update` (test 1);
//   2. it is still COMPANY-scoped: `companyId` never left the lookup, so a
//      foreign tenant's owner still gets a bare **404**, not a 403 (test 1);
//   3. an assignment ROUTES work but does not CONFER the verb — a read-only
//      persona made the assignee is still refused (test 2). This is the direct
//      regression guard for the 2026-08-19 decision;
//   4. the scoped-resource allowlist is an allowlist — an unscoped resource type
//      refuses even a permitted non-assignee (test 3);
//   5. a permitted non-assignee may take over, and it is ATTRIBUTED and
//      REPORTED — audit actor, e-signature proxy, and a notice to the assignee
//      (tests 4 and 5). The whole safety case for allowing takeover rests on
//      this, and nothing else in either repository asserts it end to end.
//
// ── Structure ──────────────────────────────────────────────────────────────
// ONE live instance for the whole file, built in `beforeAll` (the project runs
// `workers: 1, fullyParallel: false`, and the CR create → pick reviewers →
// submit round trip is by far the slowest and least reliable thing in this
// suite). Sharing is safe because tests 1-3 make only REFUSED probes and assert
// that nothing moved; tests 4 and 5 then consume steps 1 and 2 in order.
//
// Test 4's 200 is also the CONTROL for everything above it: without it every
// refusal in tests 1-3 is equally explained by a task that was never actionable
// in the first place. If test 4 fails, treat tests 1-3 as unproven.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH, ESIGN_PIN, USERS, ALT_BASE_URL } from '../fixtures/cast.js'
import { sql, sqlValue } from '../fixtures/db.js'
import { createLiveWorkflowInstance, stepsOf } from '../fixtures/workflow.js'
import { stepIdByName } from '../fixtures/changeRequests.js'
import {
  assignedTaskFor,
  assignmentsOnStep,
  auditRowsForTask,
  errorBody,
  postApi15,
  signatureCountForInstance,
  signaturesForTask,
  stepStatus,
  taskStatus,
  tasksOnStep,
  waitForAssignedTask,
  waitForTakeoverNotice,
} from '../fixtures/workflowGuards.js'

test.use({ storageState: AUTH.author })

// The step this file rides. `createLiveWorkflowInstance` carries the seeded CR
// workflow, whose step 1 "Impact Review" is an **ACTION** step assigned to the
// E2E Reviewer role — so the verb every probe below is measured against is
// `change_control:update`, not `approve`. Step 2 "Change Approval" is APPROVAL +
// e-sign and is where the `approve` verb and the Part-11 attribution are pinned
// (test 5).
//
// Every persona that must be REFUSED on step 1, and the reason each is
// interesting. All three are refused with the SAME message, because all three
// are non-assignees the matrix does not cover — what differs is why the matrix
// does not cover them, and `approver` is the sharp one: they hold a real,
// tenant-scoped workflow verb on this very module and it is still the wrong one.
const NON_ASSIGNEE_REFUSED = 'This task is assigned to someone else, and your role does not cover acting on it.'
const REFUSED = [
  ['noAccess', AUTH.noAccess, USERS.noAccess.id, 'holds no grant of any kind, anywhere'],
  ['auditor', AUTH.auditor, USERS.auditor.id, 'holds change_control:read only'],
  [
    'approver',
    AUTH.approver,
    USERS.approver.id,
    'holds change_control:approve AND an assignment on step 2 — neither covers an ACTION step',
  ],
]

// Personas that are now ALLOWED and are therefore deliberately absent from the
// list above. Both used to be asserted as 404s here, and both are now 200s:
//   author — the CR's own owner/initiator, holding change_control:update at
//            tenant scope. Qualifies through the MATRIX (ownership only supplies
//            the scope). Test 4.
//   owner  — `users.is_owner`. Qualifies through the one unconditional bypass in
//            `canActOnRecord`, before the matrix is consulted at all. Test 5.
// Probing either of them with `{ action: 'APPROVED' }` in test 1 would COMPLETE
// the step and destroy every "nothing moved" assertion that follows it.

let shared

test.beforeAll(async ({ browser }) => {
  test.setTimeout(300_000)
  const ctx = await browser.newContext({ storageState: AUTH.author })
  const page = await ctx.newPage()
  try {
    const { crId, instanceId } = await createLiveWorkflowInstance(page, 'J17-gate')

    const activeStep = stepsOf(instanceId).find((s) => s.statusId === 'IN_PROGRESS')
    expect(activeStep, 'the submitted instance has an IN_PROGRESS root step').toBeTruthy()
    expect(
      activeStep.stepType,
      'step 1 is an ACTION step — the verb under test here is `update`, not `approve`',
    ).toBe('ACTION')

    // The assignee of THE ACTIVE STEP specifically — not `anyAssignmentOn`,
    // which returns the earliest row on the whole instance and would happily
    // hand back a PENDING step's reviewer.
    const beforeAssignments = assignmentsOnStep(activeStep.id)
    const assigneeIds = Object.keys(beforeAssignments)
    expect(assigneeIds.length, 'the active step has exactly one assignee').toBe(1)
    const assigneeId = assigneeIds[0]

    const task = assignedTaskFor(activeStep.id, assigneeId)
    expect(task, 'the assignee holds an ASSIGNED task on the active step').toBeTruthy()

    shared = { crId, instanceId, activeStep, assigneeId, task, beforeAssignments }
  } finally {
    await ctx.close()
  }
})

test.describe('PW-J17 · API-15 — the matrix decides, the assignment routes', () => {
  test('a non-assignee the matrix does not cover is refused 403 — and a foreign tenant still gets 404', async ({
    browser,
  }) => {
    test.setTimeout(180_000)
    const { crId, instanceId, activeStep, assigneeId, task, beforeAssignments } = shared

    // Premise: every persona probed below is genuinely NOT the assignee. Without
    // this, adding the assignee to the list by accident would show up as a green
    // test rather than a failing one.
    for (const [name, , userId] of REFUSED) {
      expect(
        userId,
        `${name} must not be the task's assignee for this probe to mean anything`,
      ).not.toBe(assigneeId)
    }

    // Premise: `approver` really does hold a workflow verb on this module — the
    // probe is worthless if they turn out to hold nothing, because then it says
    // no more than the `noAccess` case, and the file would have no
    // verb-specificity coverage at all. Read from the matrix, not from the seed
    // comment. Asserted as two facts rather than as the exact grant set, so an
    // unrelated future grant (say `manage_access`) does not fail a probe it has
    // no bearing on.
    const approverActions = (
      sqlValue(
        `SELECT string_agg(rmp.action_id, ',' ORDER BY rmp.action_id)
           FROM authz.role_module_permissions rmp
           JOIN roles_on_users ru ON ru.role_id = rmp.role_id AND ru.company_id = rmp.company_id
          WHERE ru.user_id = '${USERS.approver.id}' AND rmp.module_id = 'change_control'`,
      ) ?? ''
    ).split(',')
    expect(
      approverActions,
      'the approver holds a real change_control verb — otherwise this says no more than noAccess',
    ).toContain('approve')
    expect(
      approverActions,
      'and NOT `update`, which is the verb an ACTION step actually demands — the whole point of the probe',
    ).not.toContain('update')

    for (const [name, storageState, , why] of REFUSED) {
      const ctx = await browser.newContext({ storageState })
      try {
        // APPROVED is the highest-value action on the endpoint — if any of these
        // returned 200 the step would close and the record would advance.
        const res = await postApi15(ctx, task.id, { action: 'APPROVED' })
        const { message } = await errorBody(res)
        // 403, not 404. The endpoint now FINDS the task (the lookup dropped
        // `assignedTo` on 2026-08-19) and then refuses on authorization — which
        // is also why the "nothing moved" block below matters more than it used
        // to: the refusal happens after the row has been read.
        expect(
          res.status(),
          `${name} (${why}) must be refused on authorization: ${message}`,
        ).toBe(403)
        // Asserted as the EXACT string. Two refusals in this code path differ by
        // one clause — "…and your role does not cover acting on it" for a
        // non-assignee vs "…even on a task assigned to you" for the assignee —
        // and a substring match would let a refactor collapse them without
        // anyone noticing that the two cases had stopped being distinguishable.
        expect(message, `${name} gets the non-assignee refusal, verbatim`).toBe(
          NON_ASSIGNEE_REFUSED,
        )
      } finally {
        await ctx.close()
      }
    }

    // Cross-tenant. `companyId` is the half of the old where-clause that did NOT
    // change, so a second tenant's OWNER — the most privileged principal that
    // exists over there — is still refused, and still with a bare not-found
    // rather than a 403 that would confirm the task exists.
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
      expect(
        (await errorBody(res)).message,
        'and learns nothing about it — a not-found, not a permission message',
      ).toMatch(/task instance/i)
    } finally {
      await altCtx.close()
    }

    // ── Nothing moved. Four rejected attempts, zero side effects. ─────────────
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
  })

  test('an assignment ROUTES work — it does not CONFER the verb', async ({ browser }) => {
    test.setTimeout(180_000)
    const { activeStep, assigneeId, task } = shared

    // ⚠️ The direct regression guard for the 2026-08-19 decision, and the one
    // assertion in this file that nothing else in either repository covers at
    // the HTTP layer. The old code short-circuited the moment the caller was the
    // assignee, so `change_control:approve` was unenforceable in practice:
    // anyone can be ASSIGNED an approval step.
    //
    // `assertCanActOnStep` reads the assignee straight off
    // `taskInstance.assignedTo`, so the precondition is one column. Repointing
    // it is a deliberate WRITE (one of two in this file — test 3 re-labels the
    // instance's resource type), reverted in `finally` and re-asserted after, so
    // the shared instance the later tests consume is byte-identical. It cannot
    // be produced any other way: the CR reviewer picker writes exactly one
    // assignee per step and each seeded workflow role has exactly one member, so
    // there is no read-only persona the product itself would ever route this
    // task to.
    expect(
      sqlValue(
        `SELECT count(*) FROM authz.role_module_permissions rmp
           JOIN roles_on_users ru ON ru.role_id = rmp.role_id AND ru.company_id = rmp.company_id
          WHERE ru.user_id = '${USERS.auditor.id}'
            AND rmp.module_id = 'change_control' AND rmp.action_id = 'update'`,
      ),
      'the auditor genuinely lacks change_control:update — otherwise this proves nothing',
    ).toBe('0')

    sql(`UPDATE task_instances SET assigned_to = '${USERS.auditor.id}' WHERE id = '${task.id}'`)
    const ctx = await browser.newContext({ storageState: AUTH.auditor })
    try {
      expect(
        sqlValue(`SELECT assigned_to FROM task_instances WHERE id = '${task.id}'`),
        'the auditor really is the assignee for the duration of this probe',
      ).toBe(USERS.auditor.id)

      const res = await postApi15(ctx, task.id, { action: 'APPROVED' })
      const { message } = await errorBody(res)
      expect(res.status(), `the assignee is still refused without the verb: ${message}`).toBe(403)
      // The ASSIGNEE-flavoured refusal, verbatim. It has to differ from the
      // non-assignee one in test 1: telling someone the task "is assigned to
      // someone else" when it is assigned to them sends them looking for the
      // wrong fix, and collapsing the two messages is the likeliest way for this
      // distinction to be lost.
      expect(message, 'and told it is their ROLE, not the routing, that refused').toBe(
        'Your role does not grant this action, even on a task assigned to you.',
      )
    } finally {
      await ctx.close()
      sql(`UPDATE task_instances SET assigned_to = '${assigneeId}' WHERE id = '${task.id}'`)
    }

    expect(
      sqlValue(`SELECT assigned_to FROM task_instances WHERE id = '${task.id}'`),
      'the assignment was handed back to its real owner',
    ).toBe(assigneeId)
    expect(taskStatus(task.id), 'and the refused probe moved nothing').toBe('ASSIGNED')
    expect(stepStatus(activeStep.id)).toBe('IN_PROGRESS')
  })

  test('the scoped-resource allowlist is an ALLOWLIST — an unscoped type stays assignee-only', async ({
    browser,
  }) => {
    test.setTimeout(180_000)
    const { instanceId, activeStep, task } = shared

    // `SCOPED_RESOURCE_TYPES` (workflowStepAccess.js) opens the matrix route to
    // exactly four resource types — the ones whose own table carries owner /
    // department / site, so `authz.scope_allowed` has something to answer with.
    // DocumentVersion, InspectionLot, LogBook, Specification and the
    // admin-defined module records reach their record through a PARENT, so the
    // matrix cannot be asked about them and they stay assignee-only, exactly as
    // before 2026-08-19. Nothing else asserts that limit; widening it silently
    // (the shape a "let's just handle all resource types" refactor takes) would
    // hand every document approval to anyone holding `document_control:approve`.
    //
    // Probed by re-labelling THIS instance rather than by driving a whole
    // document-approval journey, which would cost a second full UI round trip.
    // The re-label is reverted in `finally` and re-asserted afterwards. What it
    // pins is the ALLOWLIST — "a resource type outside the four refuses a
    // permitted non-assignee" — not DocumentVersion's own behaviour; the branch
    // is keyed on nothing but the string, so the string is the whole mechanism.
    const realResourceType = sqlValue(
      `SELECT resource_type FROM workflow_instances WHERE id = '${instanceId}'`,
    )
    expect(realResourceType, 'the carrier really is a ChangeRequest').toBe('ChangeRequest')

    sql(`UPDATE workflow_instances SET resource_type = 'DocumentVersion' WHERE id = '${instanceId}'`)
    const ctx = await browser.newContext({ storageState: AUTH.author })
    try {
      // `author` is the persona test 4 proves CAN take this task over. The only
      // thing that changed is the resource type, so a refusal here is the
      // allowlist and nothing else.
      const res = await postApi15(ctx, task.id, { action: 'APPROVED' })
      const { message } = await errorBody(res)
      expect(res.status(), `an unscoped resource type refuses a non-assignee: ${message}`).toBe(403)
      // The THIRD message in this code path, and the one that says the matrix
      // was never consulted. Exact-matched because it is a strict prefix of the
      // test-1 message — a substring assertion would pass on either, which is
      // precisely the confusion to guard against.
      expect(message, 'refused before the matrix is consulted at all').toBe(
        'This task is assigned to someone else.',
      )
      expect(message, 'and NOT the matrix-flavoured refusal').not.toContain(
        'does not cover acting on it',
      )
    } finally {
      await ctx.close()
      sql(
        `UPDATE workflow_instances SET resource_type = '${realResourceType}' WHERE id = '${instanceId}'`,
      )
    }

    expect(
      sqlValue(`SELECT resource_type FROM workflow_instances WHERE id = '${instanceId}'`),
      'the instance was re-labelled back before anything else runs',
    ).toBe('ChangeRequest')
    expect(taskStatus(task.id), 'and the refused probe moved nothing').toBe('ASSIGNED')
    expect(stepStatus(activeStep.id)).toBe('IN_PROGRESS')
  })

  test('a permitted non-assignee takes over an ACTION step — attributed, and the assignee is told', async ({
    browser,
  }) => {
    test.setTimeout(180_000)
    const { crId, instanceId, activeStep, assigneeId, task } = shared

    // ── This is also the CONTROL for tests 1-3 ───────────────────────────────
    // Without a 200 here every refusal above is equally explained by "that task
    // was never actionable", and the file would stay green after the gate was
    // removed. If this test fails, treat tests 1-3 as unproven.
    //
    // `author` is the CR's owner AND initiator, and holds `change_control:update`
    // at tenant scope. Under the OLD contract this exact call returned 404 and
    // this file asserted that it must. Ownership is not what lets them in now —
    // it only makes `scope_allowed`'s own-tier match; the grant is what lets
    // them in, which is why §33 of the E2E seed had to exist at all.
    expect(USERS.author.id, 'the taker-over is not the assignee').not.toBe(assigneeId)
    expect(assigneeId, 'the assignee is the seeded reviewer').toBe(USERS.reviewer.id)

    const ctx = await browser.newContext({ storageState: AUTH.author })
    try {
      const res = await postApi15(ctx, task.id, {
        action: 'COMPLETE_AND_ADVANCE',
        outcomeId: 'COMPLETE_AND_ADVANCE',
        comment: 'PW-J17 — a permitted non-assignee completes the reviewer’s ACTION step.',
      })
      expect(
        res.status(),
        `the takeover must succeed (body: ${JSON.stringify((await errorBody(res)).raw)})`,
      ).toBe(200)
    } finally {
      await ctx.close()
    }

    // The task really was live and actionable — the load-bearing half of the
    // control.
    expect(
      taskStatus(task.id),
      'the reviewer’s task was completed by somebody else',
    ).not.toBe('ASSIGNED')

    // ── Attribution 1: the audit trail names the ACTOR, not the assignee ─────
    // `performed_by` comes from the `app.current_user_id` GUC that
    // requireCompanyAccess sets transaction-locally, so it is whoever made the
    // request. An audit row crediting Rita for something Aaron did would be
    // worse than no capability at all.
    const audits = auditRowsForTask(task.id)
    expect(audits.length, 'the completion left an audit trail on the task').toBeGreaterThan(0)
    expect(
      audits.some((a) => a.performedBy === USERS.author.id),
      `the actor is on the audit trail (rows: ${JSON.stringify(audits)})`,
    ).toBe(true)

    // ── Attribution 2: the assignee is TOLD ──────────────────────────────────
    // `notifyAssigneeOfTakeover` is explicitly best-effort — a notification
    // failure must never roll back a completed workflow action — which means
    // nothing in the product would report it if this silently stopped firing.
    // The capability is deliberate; the surprise is not, and this notice is the
    // entire difference between "delegation" and "finding your work already
    // done weeks later".
    await waitForTakeoverNotice(assigneeId, task.id)

    // ── No signature, and that is correct ────────────────────────────────────
    // Step 1 is an ACTION step with `require_esignature = false`, so there is
    // nothing to sign and nothing to attribute a signature to. Asserted rather
    // than assumed, so that the proxy-attribution assertion in test 5 cannot be
    // mistaken for something this step could have covered.
    expect(
      signaturesForTask(task.id),
      'an ACTION step that requires no signature never invents one, takeover or not',
    ).toEqual([])
    expect(signatureCountForInstance(instanceId), 'still nothing signed on this instance').toBe(0)

    expect(stepStatus(activeStep.id), 'and the step closed').toBe('APPROVED')
    expect(
      sqlValue(`SELECT status_id FROM change_requests WHERE id = '${crId}'`),
      'the CR is still under review — step 2 is next, not the end of the workflow',
    ).toBe('UNDER_REVIEW')
  })

  test('an APPROVAL step demands `approve`, and the company owner’s takeover carries the Part-11 proxy', async ({
    browser,
  }) => {
    test.setTimeout(240_000)
    const { crId, instanceId } = shared

    // Step 2 "Change Approval" — APPROVAL + e-signature — activated by test 4.
    // Two things can only be observed here:
    //
    //   · the verb SWITCHES with the step type. `actionForStepType` asks for
    //     `approve` on an APPROVAL step and `update` everywhere else. `author`
    //     holds update at tenant scope and NOT approve, so the very persona who
    //     just took over step 1 must be refused on step 2. Without this, an
    //     implementation that always checked `update` would pass every other
    //     assertion in this file while making `change_control:approve`
    //     unenforceable — which is the exact defect the 2026-08-19 change set
    //     out to fix.
    //   · the SIGNATURE attribution. Step 1 signs nothing, so
    //     `signatures.proxy_session_user_id` has no subject until here.
    const approvalStepId = stepIdByName(crId, 'Change Approval')
    expect(approvalStepId, 'the CR workflow has a "Change Approval" step').toBeTruthy()
    expect(
      sqlValue(`SELECT require_esignature FROM workflow_instance_steps WHERE id = '${approvalStepId}'`),
      'and it carries the frozen e-signature requirement',
    ).toBe('t')

    const approverTask = await waitForAssignedTask(approvalStepId, USERS.approver.id)
    expect(approverTask, 'the approver holds an ASSIGNED task on the APPROVAL step').toBeTruthy()

    // ── The verb switches with the step type ─────────────────────────────────
    const authorCtx = await browser.newContext({ storageState: AUTH.author })
    try {
      const res = await postApi15(authorCtx, approverTask.id, {
        action: 'APPROVED',
        outcomeId: 'COMPLETE_AND_ADVANCE',
        method: 'PIN',
        token: ESIGN_PIN,
      })
      const { message } = await errorBody(res)
      expect(
        res.status(),
        `update rights must not approve — that is what makes change_control:approve mean anything: ${message}`,
      ).toBe(403)
      expect(message, 'and it is the matrix that refused, not the routing').toBe(
        NON_ASSIGNEE_REFUSED,
      )
      expect(taskStatus(approverTask.id), 'the approver task did not move').toBe('ASSIGNED')
      expect(signatureCountForInstance(instanceId), 'and nothing was signed').toBe(0)
    } finally {
      await authorCtx.close()
    }

    // ── The company owner takes over the APPROVAL step ───────────────────────
    // `user.isOwner` is the ONE unconditional bypass in `canActOnRecord`,
    // mirroring the `current_user_is_owner` clause in every RLS policy. This
    // file used to assert that even THAT principal got a 404 here, and called it
    // "the sharpest assertion in this file"; it is now a 200, and the sharp
    // assertion is what the 200 leaves behind.
    //
    // The signature is still the OWNER's — they are the one attesting, and they
    // supply their own PIN. What `proxy_session_user_id` records is whose task
    // it was. Part 11 needs both.
    const ownerCtx = await browser.newContext({ storageState: AUTH.owner })
    try {
      const res = await postApi15(ownerCtx, approverTask.id, {
        action: 'APPROVED',
        outcomeId: 'COMPLETE_AND_ADVANCE',
        comment: 'PW-J17 — company owner signs off the approver’s step.',
        // No `provider` key at all. `workflowActionSchema` types it as
        // `z.enum(['MICROSOFT','GOOGLE']).optional()` — optional, NOT nullable —
        // so an explicit `provider: null` is a 400 from the validate middleware
        // before the controller is ever reached. (The per-module reject endpoint
        // PW-J16 drives has no `validate()` on its route, which is why the same
        // `provider: null` is harmless there and fatal here.)
        method: 'PIN',
        token: ESIGN_PIN,
      })
      expect(
        res.status(),
        `the isOwner bypass must reach the step (body: ${JSON.stringify(
          (await errorBody(res)).raw,
        )})`,
      ).toBe(200)
    } finally {
      await ownerCtx.close()
    }

    expect(taskStatus(approverTask.id), 'the approval landed').toBe('APPROVED')
    await waitForTakeoverNotice(USERS.approver.id, approverTask.id)

    const sigs = signaturesForTask(approverTask.id)
    expect(sigs.length, 'exactly one signature was written for the approval').toBe(1)
    expect(sigs[0].userId, 'signed by whoever actually attested — the company owner').toBe(
      USERS.owner.id,
    )
    expect(sigs[0].meaning, 'and it manifests as an approval').toBe('APPROVED')

    // ── 🔴 EXPECTED RED — LIVE PRODUCT DEFECT, do not soften this assertion ──
    // `handleWorkflowAction` passes `proxySessionUserId: isTakeover ?
    // assigneeUserId : null` into `verifyAndSign`
    // (controllers/documents/workflowInstances.js:491) — but `verifyAndSign`
    // (services/signatureService.js:566) does not destructure that parameter at
    // all, so it is dropped on the floor and `createSignatureRecord` is reached
    // with its `proxySessionUserId = null` default. Every takeover signature on
    // API-15 — the highest-traffic signing path in the product — is therefore
    // written with NO record of whose task it was.
    //
    // The grouped-completion path is CORRECT: `workflowStepGroupService.signStep`
    // takes and forwards the same value (:218/:230, called at :409). So the
    // repository already contains the intended behaviour; one route dropped it.
    //
    // The fix is two lines in `verifyAndSign` — accept `proxySessionUserId` and
    // pass it to `createSignatureRecord` — after which it is also bound into the
    // canonical payload hash (`generatePayloadHash` already reads it), making
    // the attribution tamper-protected like the rest of the signature.
    //
    // Leaving this assertion red is deliberate. It is the only place either
    // repository would notice, and the whole safety argument for permitting a
    // takeover at all is that the resulting record says who acted on whose
    // behalf.
    expect(
      sigs[0].proxySessionUserId,
      'the signature records WHOSE TASK it was (signatures.proxy_session_user_id) — ' +
        'see the block above: verifyAndSign currently drops the parameter, so this is a real defect',
    ).toBe(USERS.approver.id)
  })
})
