// PW-J14 · URS-CAP-04 — an open SUB-TASK under a COMPLETE parent still holds
// the close, and the parent cannot be completed while it is open.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY THIS FILE EXISTS.
//
// §7 scored URS-CAP-04 *Partial* against `j3-close-gates-esign.spec.js` with
// the note "open-step gate proven; an open sub-task under a complete parent is
// untested". j3 walks the ROOT steps and nothing else — it never creates a
// sub-task, so nothing it asserts would change if sub-tasks were invisible to
// the close gate entirely.
//
// That is not a theoretical worry. The gate is
// `countOpenStepsForClose` (services/workflowInstanceService.js:1243):
//
//     db.WorkflowInstanceStep.count({ where: {
//       workflowInstanceId: { [Op.in]: instanceIds },
//       statusId: { [Op.notIn]: ['APPROVED','SKIPPED','CANCELLED'] },
//       [Op.not]: DEFERRED_DELAY_WHERE } })
//
// and the coverage is EMERGENT, not explicit: there is no depth predicate, so a
// child step is counted because nobody filtered it out. Compare `resolveGroup`
// (workflowStepGroupService.js:127), which DOES add `parentInstanceStepId: null`
// when it wants roots only. One `where` clause away in either direction and
// URS-CAP-04 silently stops being met, with no other test noticing. That is
// exactly what a regression guard is for.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHAT A "SUB-TASK" ACTUALLY IS, BECAUSE THE NAME MISLEADS.
//
// It is NOT a row in `task_instances`. That table has no `parent_task_id` at
// all (verified with \d) — task instances are flat and point at their step via
// `source_type='WorkflowInstanceStep'` + `source_id`.
//
// A sub-task is a CHILD `workflow_instance_steps` row: `parent_instance_step_id`
// set to the parent step, and `step_id` NULL because it is ad-hoc (it has no
// template row behind it). The product's prose says "sub-task"; the schema says
// "child step"; both mean this. Every assertion below reads
// `workflow_instance_steps`, and the ad-hoc-ness is asserted explicitly, so a
// future reader is not left guessing which table carries the thing.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE FIXTURE, AND WHY ONE HAD TO BE SEEDED (§47b).
//
// `addCapaChildStep` refuses unless the parent step's TEMPLATE row carries
// `allow_child_steps` (controllers/capas.js:905,
// `parentInstanceStep.step?.allowChildSteps`). Measured before this work: ALL
// THREE seeded CAPA workflows (Review & Approval, Grouped Actions,
// Effectiveness Delay) have `allow_child_steps = f` on every step. So this
// requirement was not merely untested — it was unreachable, and any attempt to
// test it would have produced a 400 that reads like a product bug.
//
// §47b seeds `E2E CAPA Sub-Tasks`: step 1 ACTION with the flag on, step 2
// APPROVAL + e-sign. Deliberately a NEW workflow rather than flipping the flag
// on the shared one, for the same reason §44c and §46 minted their own — every
// other CAPA journey depends on the shared template's current shape.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE ONE THING THAT IS WORTH REPORTING AND IS NOT A BUG.
//
// The close refusal does not mention sub-tasks. An open child produces the
// generic "Cannot close: 1 workflow step still open" — correct, and counted,
// but a reader is not told the blocker is a child of a stage they believe they
// finished. Pinned in the last assertion of test 2 rather than filed as a
// defect: the CONTROL works, the wording is thin.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH, COMPANY_ID, USERS } from '../fixtures/cast.js'
import {
  createCapa,
  openCapa,
  completeReviewerStep,
  completeApproverStep,
  closeBlockedReason,
  expectCloseRejected,
  uniqueTitle,
} from '../fixtures/capas.js'
import { findCapaByTitle, sqlRow, sqlValue, waitForSqlValue } from '../fixtures/db.js'

const SUBTASK_WORKFLOW = 'E2E CAPA Sub-Tasks'
const q = (s) => `'${String(s).replace(/'/g, "''")}'`

function instanceIdFor(capaId) {
  return sqlValue(
    `SELECT id FROM workflow_instances
      WHERE resource_type = 'Capa' AND resource_id = ${q(capaId)}
      ORDER BY created_at DESC LIMIT 1`,
  )
}

/** Root steps of the instance, in order — parent_instance_step_id IS NULL. */
function rootSteps(instanceId) {
  const out = sqlValue(
    `SELECT string_agg(id || '~' || name || '~' || status_id, '|' ORDER BY step_order)
       FROM workflow_instance_steps
      WHERE workflow_instance_id = ${q(instanceId)} AND parent_instance_step_id IS NULL`,
  )
  if (!out) return []
  return out.split('|').map((r) => {
    const [id, name, statusId] = r.split('~')
    return { id, name, statusId }
  })
}

function stepStatus(stepId) {
  return sqlValue(`SELECT status_id FROM workflow_instance_steps WHERE id = ${q(stepId)}`)
}

/** How many steps the close gate would count — the backend predicate, restated. */
function openStepsForClose(instanceId) {
  return Number(
    sqlValue(
      `SELECT count(*) FROM workflow_instance_steps
        WHERE workflow_instance_id = ${q(instanceId)}
          AND status_id NOT IN ('APPROVED','SKIPPED','CANCELLED')
          AND NOT (step_type = 'DELAY'
                   AND (status_id = 'IN_PROGRESS'
                        OR (status_id = 'SCHEDULED' AND delay_until IS NOT NULL)))`,
    ),
  )
}

test.describe('PW-J14 · URS-CAP-04 — sub-tasks and the close gate', () => {
  test.use({ storageState: AUTH.author })

  test('a sub-task added under an in-progress stage is an AD-HOC CHILD STEP, and the close gate counts it', async ({
    page,
  }) => {
    test.setTimeout(240_000)

    const title = uniqueTitle('J14-subtask')
    await createCapa(page, title, { workflowName: SUBTASK_WORKFLOW })
    const capa = findCapaByTitle(title)
    expect(capa, 'the CAPA was created').toBeTruthy()
    await openCapa(page, capa.id)

    const instanceId = instanceIdFor(capa.id)
    expect(instanceId, 'the workflow instantiated').toBeTruthy()

    // ── PREMISE. The fixture is the one this test needs. Asserted rather than
    // assumed: if §47b ever loses the flag, `addChildStep` 400s and the whole
    // file fails with "Parent step does not allow child steps" — which reads as
    // a product defect when it is a seed defect. Naming it here is the
    // difference between a five-minute diagnosis and an hour of it.
    const [parent] = rootSteps(instanceId)
    expect(parent?.name, 'step 1 is the Action Plan stage').toBe('Action Plan')
    expect(
      sqlValue(
        `SELECT ws.allow_child_steps
           FROM workflow_instance_steps wis JOIN workflow_steps ws ON ws.id = wis.step_id
          WHERE wis.id = ${q(parent.id)}`,
      ),
      'the parent step TEMPLATE allows child steps — §47b, the flag addCapaChildStep reads',
    ).toBe('t')

    const beforeChild = openStepsForClose(instanceId)

    // ── ADD THE SUB-TASK. The real route, with the real permission
    // (`enforcePermission('capa','update')`), not a DB insert — a hand-written
    // child row would skip the status/ordering logic the controller applies and
    // could land in a state the product never produces.
    const res = await page.request.post(`/api/v1/services/capas/${capa.id}/addChildStep`, {
      data: {
        parentInstanceStepId: parent.id,
        name: 'E2E J14 sub-task — retrain line operators',
        description: 'PW-J14 — an ad-hoc sub-task under the Action Plan stage.',
        assigneeUserId: USERS.reviewer.id,
        slaDays: 5,
      },
    })
    expect(res.status(), `addChildStep — ${await res.text().catch(() => '')}`).toBe(200)

    // ── WHAT WAS ACTUALLY WRITTEN. The four facts that make it a sub-task, and
    // not simply another step: it is in the SAME instance (so the close gate's
    // `workflowInstanceId IN (…)` reaches it), it names the parent, it has NO
    // template row (ad-hoc), and it is not terminal.
    const child = sqlRow(
      `SELECT id, workflow_instance_id, coalesce(parent_instance_step_id::text,'NULL'),
              coalesce(step_id::text,'NULL'), status_id, step_type
         FROM workflow_instance_steps
        WHERE parent_instance_step_id = ${q(parent.id)} AND deleted_at IS NULL
        ORDER BY created_at DESC LIMIT 1`,
    )
    expect(child, 'a child step row exists').toBeTruthy()
    const [childId, childInstance, childParent, childTemplate, childStatus] = child

    expect(childInstance, 'the child lives in the SAME workflow instance as its parent').toBe(
      instanceId,
    )
    expect(childParent, 'and names the parent step').toBe(parent.id)
    expect(
      childTemplate,
      'a sub-task is AD-HOC — step_id is NULL, there is no template row behind it',
    ).toBe('NULL')
    expect(
      ['PENDING', 'IN_PROGRESS'],
      'and it starts open, not terminal',
    ).toContain(childStatus)

    // And it is NOT a task_instances row, which is the misreading this file
    // exists to prevent. Asserted structurally so the claim cannot rot.
    expect(
      sqlValue(
        `SELECT count(*) FROM information_schema.columns
          WHERE table_name = 'task_instances' AND column_name IN ('parent_task_id','parent_id')`,
      ),
      'task_instances has no parent column — sub-tasks are child STEPS, not child tasks',
    ).toBe('0')

    // ── THE GATE SEES IT. One more open step than before, for one added
    // sub-task — the depth-blind count in action.
    expect(
      openStepsForClose(instanceId),
      'the close gate counts the sub-task exactly as it counts a root step',
    ).toBe(beforeChild + 1)

    // The sub-task also spawns its own assignable task, which is what makes it
    // actionable rather than a decorative row.
    await waitForSqlValue(
      `SELECT count(*) FROM task_instances
        WHERE source_type = 'WorkflowInstanceStep' AND source_id = ${q(childId)}
          AND deleted_at IS NULL`,
      { timeoutMs: 30_000, label: 'sub-task carries a task instance' },
    )
  })

  test('an open sub-task under a COMPLETE parent refuses the close — at the server, not just the button', async ({
    page,
    browser,
  }) => {
    test.setTimeout(300_000)

    const title = uniqueTitle('J14-gate')
    await createCapa(page, title, { workflowName: SUBTASK_WORKFLOW })
    const capa = findCapaByTitle(title)
    await openCapa(page, capa.id)

    const instanceId = instanceIdFor(capa.id)
    const [parent, approval] = rootSteps(instanceId)

    const added = await page.request.post(`/api/v1/services/capas/${capa.id}/addChildStep`, {
      data: {
        parentInstanceStepId: parent.id,
        name: 'E2E J14 sub-task — verify supplier corrective action',
        assigneeUserId: USERS.reviewer.id,
        slaDays: 5,
      },
    })
    expect(added.status(), `addChildStep — ${await added.text().catch(() => '')}`).toBe(200)
    const childId = sqlValue(
      `SELECT id FROM workflow_instance_steps
        WHERE parent_instance_step_id = ${q(parent.id)} AND deleted_at IS NULL
        ORDER BY created_at DESC LIMIT 1`,
    )

    // ── THE PARENT CANNOT BE COMPLETED FIRST. This is the control that makes
    // "a complete parent with an open child" a state the product has to be
    // *forced* into, and it is worth pinning on its own:
    // `assertChildStepsApproved` (controllers/documents/workflowInstances.js:415)
    // refuses to advance a stage whose children are not terminal, with a 400.
    await completeReviewerStep(browser, capa.id)
    expect(
      stepStatus(parent.id),
      'the parent stage did NOT advance — its sub-task is still open (assertChildStepsApproved)',
    ).not.toBe('APPROVED')
    expect(
      stepStatus(childId),
      'and the child is what is holding it',
    ).not.toMatch(/^(APPROVED|SKIPPED|CANCELLED)$/)

    // ── FORCE THE STATE THE REQUIREMENT NAMES. The requirement asks about an
    // open sub-task under a COMPLETE parent, and the guard above means the
    // product will not produce that state through its own UI. So it is produced
    // on the TRUSTED path (superuser, as a controller would) — the only honest
    // way to reach it — and the close gate is then asked its question.
    //
    // This is arrange, not assertion: nothing below depends on the write being
    // permitted, and the guard that normally prevents it was just proven to
    // work one assertion ago.
    sqlValue(
      `UPDATE workflow_instance_steps SET status_id = 'APPROVED', completed_at = now()
        WHERE id = ${q(parent.id)} RETURNING id`,
    )
    expect(stepStatus(parent.id), 'arrange: the parent is now complete').toBe('APPROVED')
    expect(
      stepStatus(childId),
      'arrange: and the sub-task under it is still open — the state URS-CAP-04 describes',
    ).not.toMatch(/^(APPROVED|SKIPPED|CANCELLED)$/)

    // The approval step is cleared too, so the ONLY thing left holding the door
    // is the orphaned sub-task. Without this the 409 below would be ambiguous —
    // it would fire whether or not sub-tasks were counted at all.
    sqlValue(
      `UPDATE workflow_instance_steps SET status_id = 'SKIPPED'
        WHERE id = ${q(approval.id)} RETURNING id`,
    )
    expect(
      openStepsForClose(instanceId),
      'exactly one step is open, and it is the sub-task',
    ).toBe(1)

    // ── THE ASSERTION. The server refuses, and the count it reports is the
    // sub-task's. This is the half the tooltip cannot give you: a disabled
    // button is not a control, and `expectCloseRejected` posts the real close.
    await expectCloseRejected(page, capa.id, /1 workflow step still open/i)
    expect(
      sqlValue(`SELECT status_id FROM capas WHERE id = ${q(capa.id)}`),
      'and the CAPA stayed OPEN',
    ).toBe('OPEN')

    // The UI agrees — `countStepsBlockingClose` (delayStepClose.js) restates the
    // same predicate client-side, and a divergence between the two is its own
    // defect class (the user is told they may close, the server says no).
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect
      .poll(() => closeBlockedReason(page), { timeout: 30_000 })
      .toMatch(/workflow step.*still open/i)

    // ── THE PAIR. Resolve the sub-task and the door opens. Without this the
    // 409 above is equally consistent with a close gate that never opens at
    // all, and the test would prove nothing about sub-tasks specifically.
    sqlValue(
      `UPDATE workflow_instance_steps SET status_id = 'APPROVED', completed_at = now()
        WHERE id = ${q(childId)} RETURNING id`,
    )
    expect(
      openStepsForClose(instanceId),
      'with the sub-task resolved, nothing is open',
    ).toBe(0)

    // NOTE, not a defect: the refusal above said "1 workflow step still open"
    // with no indication that the step was a CHILD of a stage the owner
    // believes they finished. The control is correct and the count is correct;
    // the wording gives an owner no way to find the blocker. Pinned here so the
    // observation is recorded against a passing test rather than lost.
    expect(
      sqlValue(
        `SELECT count(*) FROM workflow_instance_steps
          WHERE id = ${q(childId)} AND parent_instance_step_id IS NOT NULL`,
      ),
      'the step the generic message was counting was a child all along',
    ).toBe('1')
  })

  test('the sub-task route is gated on capa:update, and the flag is what makes a stage accept one', async ({
    browser,
  }) => {
    test.setTimeout(240_000)

    const authorCtx = await browser.newContext({ storageState: AUTH.author })
    try {
      const page = await authorCtx.newPage()
      const title = uniqueTitle('J14-perm')
      await createCapa(page, title, { workflowName: SUBTASK_WORKFLOW })
      const capa = findCapaByTitle(title)
      await openCapa(page, capa.id)

      const instanceId = instanceIdFor(capa.id)
      const [parent, approval] = rootSteps(instanceId)

      // ── THE PERMISSION HALF. `auditor` holds capa:read and nothing else.
      // Refused at the route before any workflow reasoning happens.
      const readerCtx = await browser.newContext({ storageState: AUTH.auditor })
      const readerPage = await readerCtx.newPage()
      await readerPage.goto('/')
      const refused = await readerPage.request.post(
        `/api/v1/services/capas/${capa.id}/addChildStep`,
        {
          data: {
            parentInstanceStepId: parent.id,
            name: 'E2E J14 — sub-task by a read-only persona',
            assigneeUserId: USERS.reviewer.id,
          },
        },
      )
      expect(refused.status(), 'a capa:read-only persona cannot add a sub-task').toBe(403)
      expect(
        sqlValue(
          `SELECT count(*) FROM workflow_instance_steps
            WHERE parent_instance_step_id = ${q(parent.id)} AND deleted_at IS NULL`,
        ),
        'and nothing was written',
      ).toBe('0')
      await readerCtx.close()

      // ── THE TEMPLATE-FLAG HALF, and it is the pair that stops the refusal
      // above reading as "this route is simply shut". The same holder, the same
      // CAPA, a DIFFERENT parent — the APPROVAL step, whose template carries
      // allow_child_steps = false — is refused for a different reason with a
      // different status code. Two independent controls, distinguishable.
      const wrongParent = await page.request.post(
        `/api/v1/services/capas/${capa.id}/addChildStep`,
        {
          data: {
            parentInstanceStepId: approval.id,
            name: 'E2E J14 — sub-task under a stage that forbids them',
            assigneeUserId: USERS.reviewer.id,
          },
        },
      )
      expect(
        wrongParent.status(),
        'a stage without allow_child_steps refuses a sub-task — 400, not 403: this is the template gate, not the permission gate',
      ).toBe(400)
      expect(
        (await wrongParent.json().catch(() => null))?.error?.message ?? '',
        'and it names the reason',
      ).toMatch(/does not allow child steps/i)

      // …and the holder CAN add one to the stage that permits it, on the same
      // CAPA in the same run. Without this the 400 above would be equally
      // consistent with the route being broken for everyone.
      const permitted = await page.request.post(
        `/api/v1/services/capas/${capa.id}/addChildStep`,
        {
          data: {
            parentInstanceStepId: parent.id,
            name: 'E2E J14 — sub-task under the stage that permits them',
            assigneeUserId: USERS.reviewer.id,
          },
        },
      )
      expect(
        permitted.status(),
        `the capa:update holder adds one to the permitting stage — ${await permitted.text().catch(() => '')}`,
      ).toBe(200)
    } finally {
      await authorCtx.close()
    }
  })
})
