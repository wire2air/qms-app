// PW-J19 · URS-WFL-08 — the MANDATORY COMMENT setting. A defect pin.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE FINDING, STATED FIRST: WF-D2 — `require_comments` IS A DEAD SETTING
//
// `workflow_steps.require_comments` and `workflow_instance_steps.require_comments`
// both exist. The step editor offers the toggle (`WorkflowStepCard.vue:350`,
// `WorkflowStepComplianceOptions.vue:30`). The AI template generator sets it and
// documents it as "true when the outcome needs a written justification"
// (`ai/tasks/workflow.generate_template.js:189`). `bootstrapCompanyDefaults.js`
// turns it ON for 22 steps of the shipped default workflows, one of them with
// the comment "the completion comment IS the evidence".
//
// Nothing reads it. Measured 2026-09-23 by grepping both repositories for
// `requireComments|require_comments` and classifying every hit:
//
//   WRITERS      models, migrations, template packs, bootstrap defaults,
//                the step editor, the AI generator, clone/copy helpers
//   DISPLAYERS   WorkflowStepCard, DocumentApprovalStepSummary,
//                WorkflowAiGenerateDialog — all render a badge
//   READERS AT
//   COMPLETION   **none, in either repo**
//
// The completion path is `POST /v1/services/taskInstances/:id/action` →
// `handleWorkflowAction` (controllers/documents/workflowInstances.js:441). It
// validates against `workflowActionSchema`
// (schemas/workflowInstanceSchemas.js), whose `.superRefine` demands a comment
// for exactly two things, both HARDCODED:
//
//   • the five rejection-type actions
//     (REJECTED / CHANGES_REQUESTED / REQUEST_INFO / SENT_BACK / SEND_BACK)
//   • EXTEND_DELAY
//
// `requireComments` appears nowhere in that schema, nowhere in the controller,
// and nowhere in `workflowStepActionsService.js`. The controller loads the step
// — it reads `capturesEffectiveness` off it and enforces a comment for an
// effectiveness verdict (line 521) — so the flag is *in hand* at the moment of
// completion and simply not consulted. The frontend does not gate on it either:
// `TaskInstanceCapaActions.vue` names it only in a comment.
//
// The coverage note this file answers already said the setting "does not gate
// completion". This file is what turns that sentence into a measurement, from
// both directions, at the layer the claim is about.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY THIS IS A NON-CONFORMANCE AND NOT A COSMETIC GAP
//
// URS-WFL-08 is a Part-11-adjacent requirement: a configurable obligation to
// record WHY an approval was given. The product presents that obligation to the
// author — a labelled toggle, saved to a column, rendered back as a badge on
// the step card — and then does not enforce it. That is worse than not offering
// it: an organisation can configure "justification required" on its approval
// steps, see it confirmed in the editor, pass its own configuration review, and
// ship a workflow where every approval may be silently blank. The audit trail
// then contains `comment = NULL` on steps whose configuration says a comment
// was mandatory, and nothing in the system ever noticed.
//
// ─────────────────────────────────────────────────────────────────────────────
// HOW THE DEFECT IS PINNED WITHOUT MANUFACTURING A PASS
//
// The honest shape for "a setting does nothing" is a CONTROLLED PAIR: the same
// action, on two steps that differ ONLY in the flag, must succeed identically.
// A single blank completion on a `require_comments = true` step proves nothing
// on its own — it is equally consistent with a step that was never flagged, a
// task that was already complete, or a request that failed for some other
// reason and was read as success.
//
// So each leg below:
//   1. asserts the flag's value on the INSTANCE row the engine actually
//      consults (the F-05 snapshot — the same row `resolveStepRequiresEsignature`
//      reads, not the template);
//   2. completes with NO comment at all;
//   3. asserts a 200 AND the resulting task status AND `comment IS NULL` in
//      Postgres. The status is what distinguishes "accepted" from "answered";
//      the NULL is what proves nothing was substituted to paper over the gap.
//
// And the file carries its own CONTROL that the probe is capable of seeing a
// refusal at all: the rejection arm of the SAME endpoint, on the SAME task,
// with no comment — which IS refused, by the hardcoded rule. Without that, all
// of the above is equally consistent with "this endpoint never refuses
// anything".
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH, USERS } from '../fixtures/cast.js'
import { sql, sqlValue } from '../fixtures/db.js'
import { createLiveWorkflowInstance, stepsOf } from '../fixtures/workflow.js'
import { errorBody, postApi15, waitForAssignedTask } from '../fixtures/workflowGuards.js'

test.use({ storageState: AUTH.author })

/** Turn the mandatory-comment setting ON for one instance step. */
function setRequireComments(instanceStepId, value) {
  sql(
    `UPDATE workflow_instance_steps SET require_comments = ${value ? 'true' : 'false'}
      WHERE id = '${instanceStepId}'`,
  )
}

/** The task's stored comment, distinguishing NULL from the empty string. */
function taskComment(taskId) {
  return sqlValue(
    `SELECT CASE WHEN comment IS NULL THEN '<NULL>' ELSE comment END
       FROM task_instances WHERE id = '${taskId}'`,
  )
}

test.describe('PW-J19 — the mandatory-comment setting', () => {
  test('🔴 WF-D2 — a step flagged require_comments completes with no comment at all', async ({
    page,
    browser,
  }) => {
    // A live CR on the seeded workflow. Step 1 ("Impact Review", ACTION, no
    // e-sign) is the completion step: an ACTION step is the cleanest place to
    // measure a COMMENT rule, because no e-signature requirement can absorb the
    // refusal and be mistaken for it.
    const { instanceId } = await createLiveWorkflowInstance(page, 'PW-J19')
    const steps = stepsOf(instanceId)
    expect(steps.length, 'the CR workflow instantiated its steps').toBeGreaterThan(0)

    const step1 = steps[0]
    expect(step1.stepType, 'step 1 is the ACTION step').toBe('ACTION')

    // Turn the setting ON — on the INSTANCE row, which is the snapshot the
    // engine consults (F-05). Writing the template instead would leave the
    // probe vulnerable to the exact snapshot indirection this codebase added on
    // purpose, and a blank completion could then be blamed on staleness rather
    // than on the flag being unread.
    setRequireComments(step1.id, true)
    expect(
      sqlValue(`SELECT require_comments FROM workflow_instance_steps WHERE id = '${step1.id}'`),
      'the step the engine will consult says a comment is mandatory',
    ).toBe('t')

    // The assignee's live task.
    const assigneeId = sqlValue(
      `SELECT user_id FROM users_on_workflow_instance_steps
        WHERE workflow_instance_step_id = '${step1.id}' AND deleted_at IS NULL
        ORDER BY created_at LIMIT 1`,
    )
    expect(assigneeId, 'step 1 has an assignee').toBeTruthy()
    const taskId = await waitForAssignedTask(step1.id, assigneeId)

    // Act AS the assignee. A login inside a test must pass an explicit empty
    // storageState: `request.newContext()` inherits the test's `use.storageState`,
    // and every login regenerates the session — destroying the cookie it
    // carried and breaking every LATER spec that loads that role's saved state.
    // Using an existing saved state instead avoids the whole problem.
    const assigneeAuth = Object.entries(USERS).find(([, u]) => u.id === assigneeId)?.[0]
    expect(assigneeAuth, `the assignee ${assigneeId} is a known cast member`).toBeTruthy()
    const ctx = await browser.newContext({ storageState: AUTH[assigneeAuth] })

    try {
      // ── The CONTROL, run FIRST and on the same task ─────────────────────
      // Reject with no comment. This IS refused, by the schema's hardcoded
      // rule. Without it, everything below is equally consistent with "this
      // endpoint accepts whatever it is sent", and the defect claim would be
      // unfalsifiable.
      const rejected = await postApi15(ctx, taskId, { action: 'REJECTED' })
      expect(
        rejected.status(),
        'CONTROL: the endpoint DOES enforce a comment — on the hardcoded rejection arm',
      ).toBe(400)

      // The refusal text is NOT on `error.message`. `workflowActionSchema`'s
      // `.superRefine` raises a ZOD issue, which `middleware/validate.js` collects
      // into `ValidationError(fieldErrors)` — and that class hardcodes its message
      // to the literal string "Validation failed" (`utils/errors.js:35`), putting
      // the substance under `error.fields.<path>` (`utils/errorHandler.js:38-44`).
      // Asserting `/comment is required/` against `.message` therefore fails
      // against a perfectly correct refusal. `fixtures/equipment.js:249` records
      // the same trap from the other side of the codebase.
      const rejectedBody = await errorBody(rejected)
      expect(rejectedBody.code, 'it is a schema refusal, not a controller one').toBe(
        'VALIDATION_ERROR',
      )
      expect(
        (rejectedBody.raw?.error?.fields?.comment ?? []).join(' | '),
        'and it names the COMMENT field, in the words the schema uses',
      ).toMatch(/comment is required/i)

      // Nothing moved. A refusal that had partially applied would make the
      // completion below a different experiment.
      expect(sqlValue(`SELECT status_id FROM task_instances WHERE id = '${taskId}'`)).toBe(
        'ASSIGNED',
      )

      // ── The defect ──────────────────────────────────────────────────────
      // Same endpoint, same task, same absent comment — completion instead of
      // rejection. `require_comments = true` on the step.
      //
      // KNOWN DEFECT WF-D2: `workflowActionSchema.superRefine` demands a
      // comment only for the five rejection-type actions and EXTEND_DELAY.
      // `requireComments` is read nowhere in the completion path, in either
      // repository. The step object is in `handleWorkflowAction`'s hand at the
      // time — it reads `capturesEffectiveness` off the very same row — so this
      // is an unread flag, not an unavailable one.
      const completed = await postApi15(ctx, taskId, { action: 'COMPLETE_AND_ADVANCE' })
      expect(
        completed.status(),
        'KNOWN DEFECT WF-D2: a step configured to REQUIRE a comment completes without one',
      ).toBe(200)

      // Accepted, not merely answered. The status is what separates a real
      // completion from a 200 that changed nothing.
      await expect
        .poll(() => sqlValue(`SELECT status_id FROM task_instances WHERE id = '${taskId}'`), {
          timeout: 20_000,
          message: 'the task really did complete',
        })
        .toBe('APPROVED')

      // …and the evidence the setting exists to guarantee is simply absent.
      // NULL rather than '' — nothing was substituted to make the column look
      // populated, which would be a different and much more alarming finding.
      expect(
        taskComment(taskId),
        'KNOWN DEFECT WF-D2: the justification the configuration made mandatory is NULL in the audit trail',
      ).toBe('<NULL>')

      // The step advanced too, so this is a completed workflow step carrying no
      // justification — not a task stuck in a half state.
      expect(
        sqlValue(`SELECT status_id FROM workflow_instance_steps WHERE id = '${step1.id}'`),
        'the step itself advanced on the uncommented completion',
      ).toBe('COMPLETED')
    } finally {
      await ctx.close()
    }
  })

  test('🔴 WF-D2 — the pair: flag ON and flag OFF behave identically', async ({
    page,
    browser,
  }) => {
    // The cleanest statement of "the setting does nothing": two steps that
    // differ ONLY in `require_comments`, given the identical uncommented
    // completion, produce the identical outcome. A setting that did ANYTHING
    // would separate these two rows.
    //
    // Self-contained rather than leaning on the previous test: Playwright
    // restarts the worker after a failed test and re-runs `beforeAll` for the
    // rest of the file, so a test that inherited a fixture from its predecessor
    // would fail with the wrong cause in exactly the runs where this file is
    // most likely to be read.
    const outcomes = []

    for (const flag of [true, false]) {
      const { instanceId } = await createLiveWorkflowInstance(page, `PW-J19-${flag ? 'ON' : 'OFF'}`)
      const step1 = stepsOf(instanceId)[0]
      setRequireComments(step1.id, flag)

      const assigneeId = sqlValue(
        `SELECT user_id FROM users_on_workflow_instance_steps
          WHERE workflow_instance_step_id = '${step1.id}' AND deleted_at IS NULL
          ORDER BY created_at LIMIT 1`,
      )
      const taskId = await waitForAssignedTask(step1.id, assigneeId)
      const assigneeAuth = Object.entries(USERS).find(([, u]) => u.id === assigneeId)?.[0]
      const ctx = await browser.newContext({ storageState: AUTH[assigneeAuth] })
      try {
        const res = await postApi15(ctx, taskId, { action: 'COMPLETE_AND_ADVANCE' })
        await expect
          .poll(() => sqlValue(`SELECT status_id FROM task_instances WHERE id = '${taskId}'`), {
            timeout: 20_000,
          })
          .toBe('APPROVED')
        outcomes.push({
          flag,
          status: res.status(),
          taskStatus: sqlValue(`SELECT status_id FROM task_instances WHERE id = '${taskId}'`),
          comment: taskComment(taskId),
          stepStatus: sqlValue(
            `SELECT status_id FROM workflow_instance_steps WHERE id = '${step1.id}'`,
          ),
        })
      } finally {
        await ctx.close()
      }
    }

    const [on, off] = outcomes
    expect(on.flag, 'the first leg had the setting ON').toBe(true)
    expect(off.flag, 'the second leg had it OFF').toBe(false)

    expect(
      { status: on.status, taskStatus: on.taskStatus, comment: on.comment, stepStatus: on.stepStatus },
      'KNOWN DEFECT WF-D2: require_comments ON is indistinguishable from OFF — the setting has no effect on completion',
    ).toEqual({
      status: off.status,
      taskStatus: off.taskStatus,
      comment: off.comment,
      stepStatus: off.stepStatus,
    })
  })

  test('the flag is stored, snapshotted and displayed — it is offered to authors, not merely absent', () => {
    // What makes WF-D2 a broken promise rather than an unbuilt feature. If the
    // column did not exist, or were never populated, "completion does not
    // consult it" would be unremarkable. It exists, it is snapshotted onto the
    // instance by the engine's own cloning path, and the shipped default
    // workflows turn it ON.
    expect(
      sqlValue(
        `SELECT count(*) FROM information_schema.columns
          WHERE table_name = 'workflow_steps' AND column_name = 'require_comments'`,
      ),
      'the template column exists',
    ).toBe('1')
    expect(
      sqlValue(
        `SELECT count(*) FROM information_schema.columns
          WHERE table_name = 'workflow_instance_steps' AND column_name = 'require_comments'`,
      ),
      'and it is snapshotted onto the instance — the engine carries it to the point of use',
    ).toBe('1')

    // Somebody's steps really are configured this way. Asserted across the
    // whole database rather than the E2E tenant, because the claim is about the
    // product's shipped defaults, not about this fixture.
    expect(
      Number(
        sqlValue(`SELECT count(*) FROM workflow_steps WHERE require_comments IS TRUE`),
      ),
      'steps in this database are configured to require a comment — the setting is used, not dormant',
    ).toBeGreaterThan(0)

    // ── CONTROL for the population query below. ──────────────────────────────
    // `>= 0` is not an assertion — count(*) satisfies it unconditionally, and
    // this repository has already shipped that exact bug once (see the
    // `isSqlReady` note in fixtures/db.js, where "0" was read as ready). So the
    // denominator is asserted FIRST: there must be completed tasks on
    // comment-mandatory steps AT ALL, otherwise the numerator below is zero for
    // the boring reason and the finding would be unfalsifiable.
    const mandatoryCompletions = Number(
      sqlValue(
        `SELECT count(*) FROM task_instances ti
           JOIN workflow_instance_steps wis ON wis.id = ti.source_id
          WHERE ti.source_type = 'WorkflowInstanceStep'
            AND wis.require_comments IS TRUE
            AND ti.status_id = 'APPROVED'`,
      ),
    )
    expect(
      mandatoryCompletions,
      'CONTROL: tasks really have been completed on comment-mandatory steps — ' +
        'without this the count below is zero for a reason that has nothing to do with WF-D2',
    ).toBeGreaterThan(0)

    // The completed-without-comment population that WF-D2 produces. Asserted as
    // a real number, not a tautology: if `require_comments` were enforced
    // anywhere in the completion path this set would be EMPTY, because a
    // completion with no comment could never have been accepted on such a step.
    // Measured at 40 on app-db, 2026-09-23.
    const unjustified = Number(
      sqlValue(
        `SELECT count(*) FROM task_instances ti
           JOIN workflow_instance_steps wis ON wis.id = ti.source_id
          WHERE ti.source_type = 'WorkflowInstanceStep'
            AND wis.require_comments IS TRUE
            AND ti.status_id = 'APPROVED'
            AND (ti.comment IS NULL OR btrim(ti.comment) = '')`,
      ),
    )
    expect(
      unjustified,
      `KNOWN DEFECT WF-D2: ${unjustified} of ${mandatoryCompletions} approvals on ` +
        'comment-mandatory steps carry NO justification at all. An enforced setting ' +
        'would make this set empty by construction — so a non-zero value IS the defect, ' +
        'measured on live data rather than manufactured by this test',
    ).toBeGreaterThan(0)
  })
})
