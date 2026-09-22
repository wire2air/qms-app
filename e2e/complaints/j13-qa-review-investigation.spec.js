// CMP-J13 · QA review, the investigation decision and its justification —
// OQ-06 TC-06-03 / URS-CMP-03.
//
// WHY THIS FILE EXISTS.  §9 scored URS-CMP-03 "Not automated — the QA review
// decision and its mandatory justification have no test".  Of the eight
// complaint requirements this is the one with the sharpest regulatory edge:
// 21 CFR 820.198(b) makes the decision NOT to investigate a complaint a
// regulated decision in its own right, and requires the reason recorded.
// TC-06-03 step 2 asks for a refusal when investigation is declined with no
// justification.
//
// WHAT THIS FILE FOUND, AND WHY IT STILL PASSES.  There is no such refusal —
// at any layer.  `investigationRequired: false` is accepted by the create
// route with `investigationWaivedReason` absent, there is no CHECK constraint
// pairing the two columns, and no screen in the application offers either
// control at all.  Both are asserted below as pinned CURRENT behaviour with a
// KNOWN DEFECT marker, not as a passing control.  Read those two tests as
// "the gap is where we last measured it", never as evidence the requirement
// is met.
//
// WHAT IS GENUINELY CONTROLLED, AND IS ASSERTED AS SUCH: the QA-review
// WORKFLOW.  Every complaint auto-starts the tenant's default COMPLAINT
// workflow (Investigation → Review Summary → Approval/e-sign, seeded at
// e2e-seed.sql §45e), its steps are assigned by the engine rather than chosen
// by the caller, and the APPROVAL step is a mandatory gate that no owner-side
// administration action can cancel out of the chain.  That chain — not a
// field-level required-ness rule — is what actually makes a complaint's QA
// review happen in this product, so it is what this file evidences.
//
// PERSONAS. `complaintOwner` holds complaints:create/read/update/close/delete
// at TENANT scope and is the owner every ACTION step is assigned to.
// `complaintSiteUser` holds complaints:read/update at SITE scope and nothing
// else — the "user without QA permission" of TC-06-03 step 6.  `noAccess`
// holds nothing anywhere.
import { test, expect } from '@playwright/test'
import { AUTH, USERS } from '../fixtures/cast.js'
import { sql, sqlRow, sqlValue, sqlAsAppUser } from '../fixtures/db.js'
import {
  createPersonaPool,
  errorMessage,
  findComplaint,
  restPost,
  workflowInstanceForComplaint,
  workflowStepsForInstance,
} from '../fixtures/complaints.js'

const pool = createPersonaPool()
test.afterAll(() => pool.close())

const PREFIX = 'E2E J13'
const COMPANY_ID = 'e2e00001-0000-4000-8000-000000000001'
const q = (s) => `'${String(s).replace(/'/g, "''")}'`

/** Only this file's rows. Never the shared `E2E J%` sweep — it would delete a
 *  concurrently-running J1/J2/J12's fixtures out from under them. */
function purgeJ13() {
  sql(
    `DELETE FROM complaint_records WHERE complaint_id IN (SELECT id FROM complaints WHERE subject LIKE ${q(`${PREFIX}%`)})`,
  )
  sql(
    `DELETE FROM workflow_instances WHERE resource_type = 'Complaint'
       AND resource_id IN (SELECT id FROM complaints WHERE subject LIKE ${q(`${PREFIX}%`)})`,
  )
  sql(`DELETE FROM complaints WHERE subject LIKE ${q(`${PREFIX}%`)}`)
}

async function mint(page, subject, body = {}) {
  const res = await restPost(page, '/complaints', { subject, ...body })
  expect(res.status(), `arrange failed: ${await errorMessage(res)}`).toBe(201)
  return (await res.json()).complaint.id
}

test.describe('CMP-J13 · QA review and the investigation decision', () => {
  test.beforeAll(() => purgeJ13())
  test.afterAll(() => purgeJ13())

  test('the QA-review chain auto-starts on create: Investigation → Review Summary → Approval, and the engine picks the assignees', async ({
    browser,
  }) => {
    test.setTimeout(90_000)
    const page = await pool.page(browser, AUTH.complaintOwner)
    const id = await mint(page, `${PREFIX} review chain`)

    // The instance is written inside createComplaint's own transaction, so it
    // exists by the time the 201 returns — no barrier needed here. The TASKS
    // are written in the same transaction too, but assert on the steps first
    // so a task-side regression reads as a task failure.
    const instance = workflowInstanceForComplaint(id)
    expect(instance, 'creating a complaint auto-starts a QA-review workflow instance').not.toBeNull()
    expect(instance.statusId, 'and it is live, not queued').toBe('IN_PROGRESS')

    const steps = workflowStepsForInstance(instance.id)
    expect(
      steps.map((s) => `${s.name}/${s.stepType}`),
      'the seeded COMPLAINT template is Investigation → Review Summary → Approval, in that order',
    ).toEqual(['Investigation/ACTION', 'Review Summary/ACTION', 'Approval/APPROVAL'])
    expect(steps[0].statusId, 'step 1 is live immediately — the review has started').toBe(
      'IN_PROGRESS',
    )
    expect(
      steps.slice(1).map((s) => s.statusId),
      'the later steps wait their turn',
    ).toEqual(['PENDING', 'PENDING'])

    // TC-06-03 step 1 — the review is PRESENTED to a reviewer, not merely
    // recorded as a template. startComplaintWorkflow routes ACTION steps to
    // the owner and the APPROVAL step to the owner's DEPARTMENT SUPERVISOR
    // ("you don't approve your own investigation"), which in E2ELAB resolves
    // to the company owner via departments.supervisor_user_id.
    const actionAssignee = sqlValue(
      `SELECT assigned_to FROM task_instances
        WHERE source_type = 'WorkflowInstanceStep' AND source_id = ${q(steps[0].id)}
          AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1`,
    )
    expect(actionAssignee, 'the investigation lands on the complaint owner').toBe(
      USERS.complaintOwner.id,
    )

    const supervisor = sqlValue(
      `SELECT d.supervisor_user_id FROM users u JOIN departments d ON d.id = u.department_id
        WHERE u.id = ${q(USERS.complaintOwner.id)}`,
    )
    expect(
      supervisor,
      "the owner's department has a supervisor — without one the approval step is left UNASSIGNED and this separation-of-duties assertion would be vacuous",
    ).toBeTruthy()
    expect(
      supervisor,
      'and the approver is somebody OTHER than the owner — an investigation is not self-approved',
    ).not.toBe(USERS.complaintOwner.id)
  })

  test('investigation findings and the review conclusion are recorded and retrievable (TC-06-03 step 5)', async ({
    browser,
  }) => {
    test.setTimeout(90_000)
    const page = await pool.page(browser, AUTH.complaintOwner)
    const id = await mint(page, `${PREFIX} findings`, {
      investigationRequired: true,
      investigation: 'J13 findings: unit returned, teardown shows a cracked seal on the inlet port.',
      reviewSummary: 'J13 conclusion: single-unit moulding defect, no lot-wide exposure.',
      disposition: 'Scrap and replace',
    })

    // `investigation` and `review_summary` are TEXT and hold rich-text HTML
    // with newlines in real use — a multi-line value breaks the
    // `out.split('\n')[0]` row parsing every pipe-delimited read here uses, so
    // each is fetched on its own.
    expect(
      sqlValue(`SELECT investigation FROM complaints WHERE id = ${q(id)}`),
      'the investigation findings are stored on the record, retrievable verbatim',
    ).toContain('cracked seal on the inlet port')
    expect(
      sqlValue(`SELECT review_summary FROM complaints WHERE id = ${q(id)}`),
      'and so is the review conclusion',
    ).toContain('no lot-wide exposure')
    expect(
      sqlValue(`SELECT investigation_required FROM complaints WHERE id = ${q(id)}`),
      'the decision that an investigation WAS required is recorded as a real value, not left null',
    ).toBe('t')
  })

  test('KNOWN DEFECT · declining an investigation with NO justification is accepted, at every layer', async ({
    browser,
  }) => {
    test.setTimeout(90_000)
    const page = await pool.page(browser, AUTH.complaintOwner)

    // KNOWN DEFECT: OQ-06 TC-06-03 step 2 requires a justification before an
    // investigation can be declined (21 CFR 820.198(b) makes the decision not
    // to investigate a recorded, reasoned decision). Nothing enforces it:
    //   • createComplaintSchema declares investigationRequired and
    //     investigationWaivedReason as two independent `.optional().nullable()`
    //     fields with no cross-field refinement;
    //   • no CHECK constraint on `complaints` pairs them;
    //   • and no screen offers either control, so there is not even a UI-level
    //     refusal to record as an interface control (contrast TC-06-01 steps
    //     3-5, which ARE enforced by the entry form).
    // This test pins the current behaviour so that ADDING the rule turns it
    // red and the protocol note gets revised — it is not evidence of a control.
    const id = await mint(page, `${PREFIX} waiver with no reason`, {
      investigationRequired: false,
    })

    const row = sqlRow(
      `SELECT investigation_required, coalesce(investigation_waived_reason, 'NULL')
         FROM complaints WHERE id = ${q(id)}`,
    )
    expect(
      row[0],
      'KNOWN DEFECT: the decision to decline an investigation is stored…',
    ).toBe('f')
    expect(
      row[1],
      '…with no justification alongside it, and the server raised no objection (OQ-06 TC-06-03 step 2)',
    ).toBe('NULL')

    // The other half of the defect, at the database: nothing pairs the two
    // columns, so the gap is not merely an un-validated API but an
    // unconstrained record.
    expect(
      sqlValue(
        `SELECT count(*) FROM pg_constraint
          WHERE conrelid = 'public.complaints'::regclass AND contype = 'c'
            AND pg_get_constraintdef(oid) ILIKE '%investigation_waived_reason%'`,
      ),
      'KNOWN DEFECT: no CHECK constraint requires a reason when investigation_required is false',
    ).toBe('0')
  })

  test('KNOWN DEFECT · the investigation decision has no input surface in the application at all', async () => {
    // The mirror image of TC-06-04's documented reportability gap, and
    // undocumented until now: the underlying record is complete
    // (investigation_required / investigation_waived_reason are real columns,
    // the API accepts both, the printed complaint renders "Investigation
    // required: Yes/No"), but nothing in the app SETS them. A QA reviewer
    // working only through the interface cannot record the decision at all.
    //
    // Asserted against the source rather than by driving the page, because
    // the claim is an ABSENCE and the only honest way to check an absence is
    // to look for the binding. `ComplaintPrint.vue` is the one expected hit:
    // it READS the field for display, which is exactly the point.
    //
    // Pinned to HEAD, not the working tree. A bare `git grep` searches
    // whatever is checked out, so a concurrent branch touching src/ — or a
    // half-finished edit of this very feature — would flip this test without
    // anything having shipped.
    const { execFileSync } = await import('node:child_process')
    const hits = execFileSync(
      'git',
      [
        'grep',
        '-l',
        '-E',
        'investigationRequired|investigationWaivedReason',
        'HEAD',
        '--',
        'src/',
      ],
      { cwd: process.cwd(), encoding: 'utf8' },
    )
      .trim()
      .split('\n')
      .filter(Boolean)
      // `git grep <rev>` prefixes every path with "HEAD:".
      .map((line) => line.replace(/^HEAD:/, ''))

    // KNOWN DEFECT: display- and print-only. When an input control is added,
    // this list grows and the test goes red — which is the signal to re-score
    // URS-CMP-03 and revise OQ-06 TC-06-03.
    expect(
      hits,
      'KNOWN DEFECT (OQ-06 TC-06-03): the investigation decision is rendered on the printed complaint and nowhere else — no screen sets it',
    ).toEqual(['src/components/print/modules/ComplaintPrint.vue'])
  })

  test('TC-06-03 step 6 · a user without the QA grant cannot record a review decision', async ({
    browser,
  }) => {
    test.setTimeout(120_000)
    const owner = await pool.page(browser, AUTH.complaintOwner)
    const id = await mint(owner, `${PREFIX} denial target`, { investigationRequired: true })

    // There is no "complete the QA review" endpoint — the review decision is
    // written to the complaint's own columns, so the gate that matters is the
    // one on WRITING the record. Probe it on the path a reviewer would
    // actually use: the SyncEngine (app_user), where `complaint_update_rls`
    // is the only thing standing between a reader and the decision fields.
    const write = (userId) =>
      sqlAsAppUser(
        `UPDATE complaints SET investigation_required = false,
                investigation_waived_reason = 'written by an ungranted persona'
           WHERE id = ${q(id)} RETURNING id;`,
        { userId, companyId: COMPANY_ID },
      )

    // A refused POLICY does not throw — it succeeds against zero rows. So the
    // assertion is on rows affected, and the read-back is what makes it real.
    const denied = write(USERS.noAccess.id)
    expect(
      denied.output,
      'a zero-grant persona matches no row under complaint_update_rls — nothing is written, and nothing throws',
    ).not.toContain(id)
    expect(
      sqlValue(`SELECT coalesce(investigation_waived_reason,'NULL') FROM complaints WHERE id = ${q(id)}`),
      'and the decision on the record is untouched',
    ).toBe('NULL')

    // The pair that makes the refusal mean something: complaintOwner holds
    // complaints:update at TENANT scope and the identical statement lands.
    // Without this, a policy that had stopped matching anything at all would
    // refuse everyone and read as a perfect guard.
    const allowed = write(USERS.complaintOwner.id)
    expect(allowed.ok, `the permitted holder's identical write must land: ${allowed.error}`).toBeTruthy()
    expect(allowed.output, 'and it really did touch the row').toContain(id)
  })

  test('the APPROVAL step is a mandatory gate — owner-side administration cannot cancel it out of the review chain', async ({
    browser,
  }) => {
    test.setTimeout(120_000)
    const page = await pool.page(browser, AUTH.complaintOwner)
    const id = await mint(page, `${PREFIX} mandatory gate`)
    const instance = workflowInstanceForComplaint(id)
    const steps = workflowStepsForInstance(instance.id)
    const approval = steps.find((s) => s.stepType === 'APPROVAL')
    const action = steps.find((s) => s.stepType === 'ACTION')

    // The control: an owner may administer OPERATIONAL steps but may not
    // quietly remove the sign-off. `executeCancelStep` refuses APPROVAL
    // outright — the owner's options are Reject (which terminates the
    // workflow) or Reassign (which keeps the gate).
    const refused = await restPost(page, `/complaints/${id}/cancelStep`, {
      workflowInstanceStepId: approval.id,
      comment: 'J13 — attempt to cancel the approval gate',
    })
    expect(refused.status(), 'cancelling an APPROVAL step is refused').toBe(409)
    expect(await errorMessage(refused)).toMatch(/APPROVAL steps are mandatory gates/)
    expect(
      sqlValue(`SELECT status_id FROM workflow_instance_steps WHERE id = ${q(approval.id)}`),
      'and the gate is still standing',
    ).not.toBe('CANCELLED')

    // The pair: the SAME caller, the SAME route, on an ACTION step, succeeds.
    // Without it the refusal above could be an ownership failure rather than
    // the mandatory-gate rule.
    const allowed = await restPost(page, `/complaints/${id}/cancelStep`, {
      workflowInstanceStepId: action.id,
      comment: 'J13 — operational step, cancellable',
    })
    expect(
      allowed.status(),
      `the same owner CAN cancel an operational step: ${await errorMessage(allowed)}`,
    ).toBe(200)
    expect(
      sqlValue(`SELECT status_id FROM workflow_instance_steps WHERE id = ${q(action.id)}`),
    ).toBe('CANCELLED')
    expect(findComplaint(id).statusId, 'and none of this moved the complaint').toBe('OPEN')
  })
})
