// CMP-J15 · closing a Quality Complaint — the gate, the e-signature, and what
// closure does and does NOT seal.  OQ-06 TC-06-06 / URS-CMP-06.
//
// WHY THIS FILE EXISTS.  §9 scored URS-CMP-06 *Partial*: j2 asserts that
// `markComplete` refuses to close a complaint with an open workflow step, and
// the Note says "closure is controlled; resolution content and a closure
// signature are untested".  Those two untested halves are the Part 11 half.
//
// THE CLOSURE SIGNATURE IS REAL, AND IT IS NOT ON `markComplete`.  This is the
// thing a reader gets wrong, and the route's own OpenAPI says so: "Approval is
// handled by the workflow's own APPROVAL steps — there is no e-signature on
// this call."  The signed gate is the COMPLAINT WORKFLOW's APPROVAL step,
// which `executeCancelStep` refuses to cancel (J13 pins that) and which can
// therefore only be resolved by approving it — with a credential — or
// rejecting it.  Approving that final step COMPLETES the workflow, and the
// workflow's own resource handler then closes the complaint.  So the product
// has two doors to CLOSED:
//
//   • the signed one — approve the last APPROVAL step through API-15
//     (`POST /taskInstances/:id/action`).  Demands method+token, verifies the
//     PIN, writes a `signatures` row bound to the approver's TASK, and closes
//     the complaint as a side effect.  This is the door the UI uses
//     (QaComplaintsPageId.vue's onApprovalEsign).
//   • the unsigned one — `markComplete`, reachable only once EVERY step is
//     already terminal, i.e. only after that same signed approval (or after
//     the approval step was rejected/reassigned away).  It is the owner's
//     administrative close, and it is the one that stamps
//     `closure_approved_by`.
//
// WHO SIGNS.  `startComplaintWorkflow` routes ACTION steps to the owner and
// the APPROVAL step to the owner's DEPARTMENT SUPERVISOR — you do not approve
// your own investigation.  In E2ELAB `complaintOwner` sits in Quality, whose
// supervisor is the company owner, and the company owner is one of the two
// personas in this tenant with an e-sign PIN set.  `complaintOwner` has NO
// PIN, which is exactly right: the approver and the closer are different
// people and only the approver signs.
//
// THE ARRANGE IS DELIBERATELY SLOW AND DELIBERATELY REAL.  Each test walks
// the complaint to its approval gate through product routes — cancel the two
// operational steps (an owner-side action the product offers and J13 proves
// is permitted), then act on the approval task.  No row is ever seeded into
// CLOSED: superuser is NOT a trigger bypass — it clears only the "cannot
// change status directly" arm, and the edge rules still apply — and every
// test arranges its own complaint because Playwright discards the worker after
// a failure and runs the pending afterAll.
import { test, expect } from '@playwright/test'
import { AUTH, ESIGN_PIN, USERS } from '../fixtures/cast.js'
import { sql, sqlRow, sqlValue, sqlAsAppUser } from '../fixtures/db.js'
import {
  createPersonaPool,
  errorMessage,
  findComplaint,
  restPost,
  workflowInstanceForComplaint,
  workflowStepsForInstance,
} from '../fixtures/complaints.js'
import { clearEsignPinLockout, signaturesForTask } from '../fixtures/workflowGuards.js'

const pool = createPersonaPool()
test.afterAll(() => pool.close())

const PREFIX = 'E2E J15'
const COMPANY_ID = 'e2e00001-0000-4000-8000-000000000001'
const q = (s) => `'${String(s).replace(/'/g, "''")}'`

function purgeJ15() {
  const mine = `SELECT id FROM complaints WHERE subject LIKE ${q(`${PREFIX}%`)}`
  sql(`DELETE FROM record_links WHERE from_id IN (${mine}) OR to_id IN (${mine})`)
  sql(`DELETE FROM complaint_records WHERE complaint_id IN (${mine})`)
  sql(`DELETE FROM workflow_instances WHERE resource_type = 'Complaint' AND resource_id IN (${mine})`)
  sql(`DELETE FROM complaints WHERE subject LIKE ${q(`${PREFIX}%`)}`)
  // `signatures` and `audit_logs` are NOT purged. audit_logs is immutable
  // (trigger audit_logs_immutable) and signatures are the Part 11 ledger —
  // deleting either would be the opposite of the control this file asserts.
  // Both are keyed on task/complaint ids that vanish with the rows above, so
  // nothing is left that a later spec can trip over.
}

async function mint(page, subject, body = {}) {
  const res = await restPost(page, '/complaints', {
    subject,
    description: 'CMP-J15 closure arm.',
    ...body,
  })
  expect(res.status(), `arrange failed: ${await errorMessage(res)}`).toBe(201)
  return (await res.json()).complaint.id
}

/**
 * Walk a fresh complaint to its APPROVAL gate and return the approver's task.
 *
 * Cancels the two operational ACTION steps through `cancelStep` — a real
 * owner-side product route, not a DB poke — which is the cheapest honest way
 * to reach the gate: the ACTION steps carry required rich-text form schemas
 * whose completion adds nothing this file is asserting.
 */
async function reachApprovalGate(page, subject) {
  const complaintId = await mint(page, subject)
  const instance = workflowInstanceForComplaint(complaintId)
  expect(instance, 'the QA-review workflow auto-started').not.toBeNull()
  const steps = workflowStepsForInstance(instance.id)
  const approval = steps.find((s) => s.stepType === 'APPROVAL')
  expect(approval, 'the seeded COMPLAINT template carries an APPROVAL step').toBeTruthy()

  for (const step of steps.filter((s) => s.stepType === 'ACTION')) {
    const res = await restPost(page, `/complaints/${complaintId}/cancelStep`, {
      workflowInstanceStepId: step.id,
      comment: `CMP-J15 arrange — clearing ${step.name}`,
    })
    expect(res.status(), `arrange failed on ${step.name}: ${await errorMessage(res)}`).toBe(200)
  }

  const task = sqlRow(
    `SELECT id, assigned_to FROM task_instances
      WHERE source_type = 'WorkflowInstanceStep' AND source_id = ${q(approval.id)}
        AND deleted_at IS NULL AND status_id = 'ASSIGNED'
      ORDER BY created_at DESC LIMIT 1`,
  )
  expect(
    task,
    'the approval step carries a live ASSIGNED task — without one the whole signature arm would be vacuous',
  ).not.toBeNull()
  expect(
    task[1],
    "the approver is the owner's department supervisor, not the complaint owner",
  ).toBe(USERS.owner.id)
  return { complaintId, instanceId: instance.id, approvalStepId: approval.id, taskId: task[0] }
}

/** API-15 as the approver (the only persona here with an e-sign PIN). */
async function actOnApproval(page, taskId, extra = {}) {
  return page.request.post(`/api/v1/services/taskInstances/${taskId}/action`, {
    data: { action: 'COMPLETE_AND_ADVANCE', outcomeId: 'COMPLETE_AND_ADVANCE', ...extra },
  })
}

test.describe('CMP-J15 · closure, its gate and its signature', () => {
  test.beforeAll(() => purgeJ15())
  test.afterAll(() => {
    purgeJ15()
    // A deliberately-wrong PIN below arms the 5-strikes/15-minute lockout in
    // Redis. Left set it would 429 the approver for every later spec in the
    // run, not just this file.
    clearEsignPinLockout(USERS.owner.id)
  })

  test('TC-06-06 step 1 · closure is refused while the QA review is incomplete, and the refusal is SERVER-side', async ({
    browser,
  }) => {
    test.setTimeout(120_000)
    const page = await pool.page(browser, AUTH.complaintOwner)
    const complaintId = await mint(page, `${PREFIX} gate open steps`)

    const res = await restPost(page, `/complaints/${complaintId}/markComplete`, {
      comment: 'J15 — premature close',
    })
    expect(res.status(), 'the close is refused over REST, not merely hidden in the UI').toBe(409)
    expect(await errorMessage(res)).toMatch(/workflow step.*still open/i)
    expect(findComplaint(complaintId).statusId, 'and the complaint stayed OPEN').toBe('OPEN')

    // The narrower half the protocol's §5 says TC-06-06 "gestures at but never
    // asserts": the gate counts steps that are NOT already terminal. Clear the
    // two ACTION steps and the count drops — but the APPROVAL step alone still
    // holds the door, naming exactly one remaining step.
    const instance = workflowInstanceForComplaint(complaintId)
    for (const step of workflowStepsForInstance(instance.id).filter((s) => s.stepType === 'ACTION')) {
      const cancelled = await restPost(page, `/complaints/${complaintId}/cancelStep`, {
        workflowInstanceStepId: step.id,
        comment: 'J15 — clearing an operational step',
      })
      expect(cancelled.status(), await errorMessage(cancelled)).toBe(200)
    }
    const stillRefused = await restPost(page, `/complaints/${complaintId}/markComplete`, {
      comment: 'J15 — close with only the approval outstanding',
    })
    expect(
      stillRefused.status(),
      'the unresolved APPROVAL step alone is enough to hold the close',
    ).toBe(409)
    expect(
      await errorMessage(stillRefused),
      'and the refusal counts exactly the one remaining step',
    ).toMatch(/Cannot close: 1 workflow step still open/)
  })

  test('TC-06-06 step 4 · the signed approval is refused with NO credential and with a WRONG one — and nothing moves either time', async ({
    browser,
  }) => {
    test.setTimeout(150_000)
    const owner = await pool.page(browser, AUTH.complaintOwner)
    const { complaintId, taskId } = await reachApprovalGate(owner, `${PREFIX} bad credential`)
    const approver = await pool.page(browser, AUTH.owner)

    // 4a — no credential at all. Fails CLOSED: the requirement is read off the
    // step, not off the request.
    const noCreds = await actOnApproval(approver, taskId)
    expect(noCreds.status(), 'an e-sign-required approval cannot be given without one').toBe(400)
    expect(await errorMessage(noCreds)).toMatch(/E-signature verification is required/i)

    // 4b — a wrong PIN. The signature is written inside the same transaction
    // as the approval and BEFORE any state change, so a rejected credential
    // can never leave a half-approved step behind.
    const wrongPin = await actOnApproval(approver, taskId, { method: 'PIN', token: '99999999' })
    expect(wrongPin.status(), 'an incorrect credential is refused').toBe(400)
    expect(await errorMessage(wrongPin)).toMatch(/Invalid PIN/i)

    expect(
      signaturesForTask(taskId),
      'neither refusal wrote a signature — a refused credential leaves no ledger row',
    ).toHaveLength(0)
    expect(sqlValue(`SELECT status_id FROM task_instances WHERE id = ${q(taskId)}`)).toBe('ASSIGNED')
    expect(findComplaint(complaintId).statusId, 'and the complaint is still OPEN').toBe('OPEN')

    clearEsignPinLockout(USERS.owner.id)
  })

  test('TC-06-06 steps 3+5 · the correct credential closes the complaint and writes one signature bound to the approver’s task', async ({
    browser,
  }) => {
    test.setTimeout(150_000)
    const owner = await pool.page(browser, AUTH.complaintOwner)
    const { complaintId, taskId } = await reachApprovalGate(owner, `${PREFIX} signed closure`)
    const approver = await pool.page(browser, AUTH.owner)

    const res = await actOnApproval(approver, taskId, { method: 'PIN', token: ESIGN_PIN })
    expect(res.status(), `the signed approval failed: ${await errorMessage(res)}`).toBe(200)

    // The signature. `signatures` has no step column — the subject CHECK
    // permits exactly one of several FKs and the workflow one is
    // `task_instance_id`, so anything binding a signature to a step goes
    // through the task.
    const signatures = signaturesForTask(taskId)
    expect(signatures, 'exactly one signature, not zero and not a duplicate').toHaveLength(1)
    expect(signatures[0].userId, 'signed by the approver who actually acted').toBe(USERS.owner.id)
    expect(signatures[0].meaning, 'and its meaning is APPROVED').toBe('APPROVED')
    expect(
      signatures[0].proxySessionUserId,
      'an ordinary self-signed approval carries no proxy — the approver held the task themselves',
    ).toBeNull()

    // Completing the last step finishes the workflow, whose resource handler
    // closes the complaint. This is the door the UI drives.
    const after = findComplaint(complaintId)
    expect(after.statusId, 'approving the final gate closes the complaint').toBe('CLOSED')
    const stamps = sqlRow(
      `SELECT closed_at IS NOT NULL, coalesce(closure_approved_at::text,'NULL'),
              coalesce(closure_approved_by::text,'NULL')
         FROM complaints WHERE id = ${q(complaintId)}`,
    )
    expect(stamps[0], 'the closure date is stamped').toBe('t')
    expect(stamps[1], 'and so is the closure-approval date').not.toBe('NULL')

    // KNOWN DEFECT: on the WORKFLOW-APPROVAL door, `closure_approved_by` is
    // left NULL even though `closure_approved_at` is set — so the record
    // itself does not name who approved the closure. The approver IS
    // recoverable (the `signatures` row and the audit trail both name them),
    // but a reader of the complaint row alone sees an approval date with no
    // approver. `markComplete`, the other door, does set it. Pinned rather
    // than fixed; asserting the pair together is what makes the asymmetry
    // visible rather than looking like an ordinary null.
    expect(
      stamps[2],
      'KNOWN DEFECT: closure_approved_at is set but closure_approved_by is NULL on the workflow-approval close path',
    ).toBe('NULL')

    // A closed complaint cannot be closed again — the second door is shut too.
    const again = await restPost(owner, `/complaints/${complaintId}/markComplete`, {
      comment: 'J15 — double close',
    })
    expect(again.status(), 'closing an already-closed complaint is refused').toBe(409)
    expect(await errorMessage(again)).toMatch(/already closed/i)
  })

  test('close is gated on complaints:close AND re-checked against the record — 403 from the permission layer, 409 from the workflow layer', async ({
    browser,
  }) => {
    test.setTimeout(180_000)
    const owner = await pool.page(browser, AUTH.complaintOwner)
    const { complaintId, approvalStepId } = await reachApprovalGate(
      owner,
      `${PREFIX} admin close`,
    )

    // THREE CONTROLS SIT IN FRONT OF `markComplete`, AND THEY ARE ORDERED.
    // The route carries enforcePermission('complaints','close'); the
    // CONTROLLER then re-evaluates complaints:close against THIS RECORD via
    // assertCanActOnRecord (OQ-06 §5 lists that record-level re-check as an
    // untested control); only then does it count open workflow steps.
    //
    // WHAT THIS TEST CAN AND CANNOT SEPARATE. The first two both answer 403,
    // so the probes below cannot tell them apart — and neither persona here
    // could: `complaintSiteUser` and `noAccess` both fail the ROUTE check and
    // never reach the controller. What IS separable, and is what this pins,
    // is that the permission layers run BEFORE the workflow count: an
    // ungranted caller gets 403 and learns nothing about the record's
    // workflow state, while the granted caller gets 409 on the same record.
    // A regression that moved the step count ahead of the permission check
    // would flip the first two to 409 and leak that state, and the status
    // code is the only thing that tells you it happened.
    const siteUser = await pool.page(browser, AUTH.complaintSiteUser)
    const refusedByPermission = await restPost(
      siteUser,
      `/complaints/${complaintId}/markComplete`,
      { comment: 'J15 — no close grant' },
    )
    expect(
      refusedByPermission.status(),
      'complaintSiteUser holds read+update but NOT complaints:close — the route refuses before any workflow check',
    ).toBe(403)

    const refusedByNoAccess = await restPost(
      await pool.page(browser, AUTH.noAccess),
      `/complaints/${complaintId}/markComplete`,
      { comment: 'J15 — zero grant' },
    )
    expect(refusedByNoAccess.status(), 'and a zero-grant persona likewise').toBe(403)
    expect(findComplaint(complaintId).statusId, 'neither refusal moved the complaint').toBe('OPEN')

    // The pair that makes both refusals mean something: the SAME route, the
    // SAME complaint, from the holder of complaints:close, gets past the
    // permission gate and is refused by the WORKFLOW gate instead — a 409,
    // not a 403. Two different controls, distinguishable by status code.
    const permitted = await restPost(owner, `/complaints/${complaintId}/markComplete`, {
      comment: 'J15 — permitted but gated',
    })
    expect(
      permitted.status(),
      'the close-holder clears the permission gate and meets the workflow gate instead',
    ).toBe(409)
    expect(
      sqlValue(`SELECT status_id FROM workflow_instance_steps WHERE id = ${q(approvalStepId)}`),
      'the approval step is what is still holding it',
    ).not.toMatch(/^(APPROVED|SKIPPED|CANCELLED)$/)
  })

  test('TC-06-06 step 6 · closure seals the STATUS and nothing else — the regulated fields stay writable on a closed record', async ({
    browser,
  }) => {
    test.setTimeout(180_000)
    const owner = await pool.page(browser, AUTH.complaintOwner)
    const { complaintId, taskId } = await reachApprovalGate(owner, `${PREFIX} post-close seal`)
    const approver = await pool.page(browser, AUTH.owner)
    const signed = await actOnApproval(approver, taskId, { method: 'PIN', token: ESIGN_PIN })
    expect(signed.status(), `arrange failed: ${await errorMessage(signed)}`).toBe(200)
    expect(findComplaint(complaintId).statusId, 'precondition: the complaint is CLOSED').toBe(
      'CLOSED',
    )

    // The half that IS sealed, and it is sealed at the DATABASE, which is what
    // makes the closure gate unbypassable: the untrusted (SyncEngine /
    // app_user) path may never write status_id at all, so no permitted holder
    // can reopen or re-close around the workflow.
    const statusWrite = sqlAsAppUser(
      `UPDATE complaints SET status_id = 'OPEN' WHERE id = ${q(complaintId)};`,
      { userId: USERS.complaintOwner.id, companyId: COMPANY_ID },
    )
    expect(statusWrite.ok, 'the data interface can never change a complaint status').toBeFalsy()
    expect(statusWrite.error).toMatch(/Complaint status cannot be changed directly/)
    expect(findComplaint(complaintId).statusId, 'so the record stayed CLOSED').toBe('CLOSED')

    // KNOWN DEFECT (documented as a limit in OQ-06 §5, pinned here for the
    // first time): the seal covers the STATUS COLUMN ONLY. `complaint_upd_rls`
    // carries no status condition and the guard trigger is BEFORE UPDATE OF
    // status_id — so an update that never touches status_id never fires it.
    // A closed complaint's reportability decision, investigation waiver and
    // closure approver are all freely rewritable through the data interface by
    // anyone holding complaints:update. If your risk assessment depends on a
    // closed complaint being immutable, that has to be a procedural control.
    const fieldWrite = sqlAsAppUser(
      `UPDATE complaints
          SET reportability_status = 'REPORTABLE',
              reportability_rationale = 'J15 — written AFTER closure',
              investigation_waived_reason = 'J15 — rewritten AFTER closure',
              closure_approved_by = ${q(USERS.complaintOwner.id)}
        WHERE id = ${q(complaintId)} RETURNING id;`,
      { userId: USERS.complaintOwner.id, companyId: COMPANY_ID },
    )
    expect(
      fieldWrite.ok,
      'KNOWN DEFECT: the data interface accepts edits to a CLOSED complaint (OQ-06 §5 "the seal covers the status column only")',
    ).toBeTruthy()
    expect(fieldWrite.output, 'and the write really landed on the row').toContain(complaintId)
    expect(
      sqlValue(`SELECT reportability_status FROM complaints WHERE id = ${q(complaintId)}`),
      'KNOWN DEFECT: the regulatory reportability decision changed after the record was closed and signed',
    ).toBe('REPORTABLE')
    expect(
      sqlValue(`SELECT closure_approved_by FROM complaints WHERE id = ${q(complaintId)}`),
      'KNOWN DEFECT: even the closure APPROVER field is rewritable on a closed record',
    ).toBe(USERS.complaintOwner.id)

    // The pair that stops the defect above reading as "RLS is simply open":
    // a zero-grant persona is still refused the very same statement, so what
    // is missing is a TERMINAL-STATE condition, not the policy itself.
    const strangerWrite = sqlAsAppUser(
      `UPDATE complaints SET reportability_rationale = 'J15 — by a stranger' WHERE id = ${q(complaintId)} RETURNING id;`,
      { userId: USERS.noAccess.id, companyId: COMPANY_ID },
    )
    expect(
      strangerWrite.output,
      'a zero-grant persona is still shut out — the missing control is a terminal-state condition, not the policy',
    ).not.toContain(complaintId)
  })

  test('KNOWN DEFECT · the Reopen control the UI offers on a closed complaint calls an endpoint that does not exist', async ({
    browser,
  }) => {
    test.setTimeout(180_000)
    const owner = await pool.page(browser, AUTH.complaintOwner)
    const { complaintId, taskId } = await reachApprovalGate(owner, `${PREFIX} reopen defect`)
    const approver = await pool.page(browser, AUTH.owner)
    const signed = await actOnApproval(approver, taskId, { method: 'PIN', token: ESIGN_PIN })
    expect(signed.status(), `arrange failed: ${await errorMessage(signed)}`).toBe(200)
    expect(findComplaint(complaintId).statusId).toBe('CLOSED')

    // KNOWN DEFECT (OQ-06 §5, recorded there while the protocol was written;
    // pinned here so a fix is noticed): a CLOSED complaint's action menu
    // offers "Reopen" to any complaints:update holder, and
    // QaComplaintsPageId.vue's runAction('reopen') POSTs to
    // /v1/services/complaints/:id/reopen — a route that is not registered.
    // The DATABASE permits the transition (CLOSED->OPEN is a live edge, pinned
    // by CMP-J2) and the permission model permits it; only the endpoint is
    // absent. Do not add a reopen journey until this is corrected.
    const res = await restPost(owner, `/complaints/${complaintId}/reopen`, {})
    expect(
      res.status(),
      'KNOWN DEFECT: the Reopen action the UI offers has no server route (OQ-06 §5)',
    ).toBe(404)
    expect(findComplaint(complaintId).statusId, 'so the complaint cannot be reopened at all').toBe(
      'CLOSED',
    )

    // The pair that proves this is a MISSING ROUTE and not a closed-record
    // refusal: the transition itself is legal on the trusted path, which is
    // what makes the absence a defect rather than a design.
    expect(
      sqlValue(
        `SELECT count(*) FROM pg_proc WHERE proname = 'enforce_complaint_status_transition'`,
      ),
      'the guard that would have to permit a reopen is present…',
    ).toBe('1')
  })
})
