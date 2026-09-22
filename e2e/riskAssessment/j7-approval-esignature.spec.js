// RA-J7 — TC-08-05 (URS-RSK-05): review and approval of the assessment.
//
// WHY THIS FILE EXISTS. §11 of the coverage doc scores URS-RSK-05 Partial and
// names exactly what is missing: "approval by a non-approver, and edits after
// approval". J2's third test proves the OTHER half (FINALIZED -> COMMITTED
// needs the parent task APPROVED), and J1 drives completeApproverStep as
// scaffolding without asserting anything about the approval itself. Neither
// probes the GATE.
//
// ── READ THE PROTOCOL'S OWN PREAMBLE FIRST ─────────────────────────────────
// TC-08-05's note is unambiguous: "There is no assessment lifecycle in this
// product: the assessment has no status of its own, no submit-for-review
// action and no versioning. The review and approval that exist belong to the
// WORKFLOW STEP." So every assertion here is against the step and its task,
// never against a status column on `risk_assessments` (there is none — the
// table's own audit registry module says so: "No status column on this
// table").
//
// ── STEP 2, AND WHY THE PROBE IS AT THE API ────────────────────────────────
// The refusal lives in `assertCanActOnStep` (backend/api/utils/
// workflowStepAccess.js), called from `handleWorkflowAction` before anything
// is written. Two facts shape the probe:
//
//   1. AN ASSIGNMENT IS ROUTING, NOT A LOCK (2026-08-19). The task lookup
//      dropped `assignedTo`, so "not the assignee" is NOT by itself a refusal
//      — anyone the MATRIX permits may take the step over. A UI-only probe
//      ("the button is hidden") would therefore prove nothing about the
//      server, which is the control TC-08-05 step 2 is asking about.
//   2. AN APPROVAL STEP NEEDS THE `approve` VERB, not `update`
//      (actionForStepType). That is what makes `reviewer` the right refusing
//      persona here: live grants on E2ELAB are capa read+update for reviewer,
//      capa read+update+APPROVE for approver. So reviewer is a user who can
//      edit this very CAPA and still may not approve its approval step —
//      which is precisely "a user who is not that step's assigned reviewer"
//      with the vacuity removed. A zero-grant persona would be refused by the
//      record lookup and prove nothing about the verb split.
//
// `approver` running the same request is the ADMITTING CONTROL, without which
// a gate that had stopped matching anything would make the refusal pass for
// the wrong reason (RA-J3's "vacuity lesson", §7.1 of the hardening pass).
//
// ── STEP 3: WHERE THE SIGNATURE EVIDENCE LIVES ─────────────────────────────
// The protocol says it outright: "The objective evidence is the workflow
// step's task approval and its signature record, not a signature stored on the
// assessment." `signatures` has no risk_assessment_id column at all, so the
// enclosing step's row IS the Part-11 attestation. verifyAndSign's step branch
// writes it with task_instance_id set and meaning resolved from the action
// (APPROVED -> 'APPROVED').
//
// ── STEP 5: "IN PLACE, NOT VERSIONED" — TRUE, BUT NARROWER THAN IT READS ──
// rcaRaDerivationService#deriveRiskAssessmentForField upserts on (resourceType,
// resourceId, workflowInstanceStepId, assessmentType) — `existing.update(row)`
// when a row is there — and the partial unique index carries the same four
// columns. So the in-place overwrite is real, but it is scoped to ONE
// `workflow_instance_steps` row.
//
// A SEND-BACK re-creates the steps in its range as NEW instance rows, so the
// key misses and the derivation INSERTs. The record then carries TWO live
// assessments, the pre-send-back one unmarked and unsuperseded. That is
// RA-D1, found by this file and pinned in step 5's test exactly as the
// product behaves — the protocol tells an executor not to look for a
// versioning failure here, so nothing else would have caught it. Reported,
// not fixed. The audit trail as the sole history is RA-J8's subject.
import { test, expect } from '@playwright/test'
import { AUTH, COMPANY_ID, ESIGN_PIN, RISK_ASSESSMENT, USERS } from '../fixtures/cast.js'
import { findCapaByTitle, sqlRow, sqlValue, waitForSqlValue } from '../fixtures/db.js'
import { createCapa, uniqueTitle, openCapa } from '../fixtures/capas.js'
import { clickWhenReady } from '../fixtures/documents.js'
import {
  waitForRiskAssessment,
  purgeRiskAssessment,
  LOW_CELL,
} from '../fixtures/riskAssessment.js'

const quote = (s) => `'${String(s).replace(/'/g, "''")}'`

/**
 * The cell these journeys score. High x Severe = 9, band High — the
 * highest-risk corner of the seeded 3x3 matrix (e2e-seed.sql §44b).
 *
 * Named locally rather than imported as HIGH_CELL because the shared helper
 * that consumes HIGH_CELL does not actually select it. See
 * `driveRiskReviewToApproved` below for the row-locator defect and why this
 * file drives the widget itself.
 */
const SCORED_CELL = { likelihood: 'High', severity: 'Severe', riskLevel: 'High', rpn: 9 }

/**
 * The live task instance for a named step of this CAPA's workflow run.
 *
 * Resolved by STEP NAME through workflow_instance_steps rather than by
 * assignee, because step 2's whole point here is that a non-assignee is the
 * one firing the request.
 */
function findTaskForStep(capaId, stepName) {
  const row = sqlRow(
    `SELECT ti.id, ti.assigned_to, ti.status_id, wis.id, wis.step_id
       FROM task_instances ti
       JOIN workflow_instance_steps wis ON wis.id = ti.source_id
       JOIN workflow_instances wi ON wi.id = wis.workflow_instance_id
      WHERE ti.source_type = 'WorkflowInstanceStep'
        AND wi.resource_type = 'Capa' AND wi.resource_id = ${quote(capaId)}
        AND wis.name = ${quote(stepName)}
        AND ti.deleted_at IS NULL AND ti.status_id <> 'CANCELLED'
      ORDER BY ti.created_at DESC LIMIT 1`,
  )
  if (!row) return null
  return {
    id: row[0],
    assignedTo: row[1] || null,
    statusId: row[2],
    instanceStepId: row[3],
    // The TEMPLATE step this instance step was spawned from. `steps_send_back_targets`
    // is keyed on template ids, so a send-back target must be resolved through this.
    templateStepId: row[4] || null,
  }
}

/** POST the real workflow-action endpoint as whoever `page` is signed in as. */
async function postStepAction(page, taskInstanceId, body) {
  return page.request.post(`/api/v1/services/taskInstances/${taskInstanceId}/action`, {
    data: body,
  })
}

/**
 * Drive the reviewer's Risk Review step to APPROVED, and WAIT for it.
 *
 * ── WHY NOT fixtures/riskAssessment.js#completeRiskReviewStep ─────────────
 * That helper clicks "Mark Complete" and then immediately calls
 * `ctx.close()`. Closing a browser context ABORTS whatever request is still
 * in flight, and COMPLETE_AND_ADVANCE is a slow one — it runs the derivation
 * service, the approval chain and the notification enqueue inside a single
 * transaction. Under a loaded stack (measured here with five other Playwright
 * projects running) the close consistently won that race:
 *
 *     task_instances.status_id = ASSIGNED   (never actioned)
 *     capa_records.payload…computedScore = 6   (the draft DID save)
 *
 * i.e. the cell was scored and finalized correctly, the form was persisted,
 * and the step was simply never completed — so rcaRaDerivationService never
 * ran and no risk_assessments row was ever going to appear. Waiting longer
 * for the row cannot fix that, and neither can re-driving it the same way;
 * both were tried and both timed out at 90s.
 *
 * So this version keeps the page OPEN until the task is observably APPROVED,
 * and only then closes the context. Same clicks, same product path — the
 * difference is purely that it does not hang up mid-request.
 *
 * Also uses a row-label-anchored cell selector, because the shared
 * `selectMatrixCell` matches the likelihood row by any text in the row and
 * every cell renders a band label from the same vocabulary — see RA-J6's
 * header for the full write-up. Both are reported, not patched: the fixture
 * is in concurrent use by j1-j5 and by other agents.
 */
async function driveRiskReviewToApproved(browser, capaId, cell) {
  await waitForSqlValue(
    `SELECT count(*) FROM task_instances
      WHERE entity_type = 'Capa' AND entity_id = ${quote(capaId)}
        AND assigned_to = ${quote(USERS.reviewer.id)} AND status_id IN ('ASSIGNED','FORM_SUBMITTED')`,
    { timeoutMs: 60_000, label: 'reviewer task assigned' },
  )
  const ctx = await browser.newContext({ storageState: AUTH.reviewer })
  const page = await ctx.newPage()
  try {
    await page.goto(`/capas/${capaId}`, { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {})

    // Pick the cell by its ROW LABEL cell, not by "a row containing this text".
    const table = page
      .locator('table')
      .filter({ has: page.getByText('Likelihood', { exact: false }) })
      .first()
    // RiskAssessmentField reads the template's `config` out of IndexedDB via
    // useLiveQueryWithDeps, so the widget renders its header (and even the
    // Matrix picker, already showing the template NAME) before the grid
    // exists. Under a loaded stack that bootstrap can outlast a single 30s
    // wait — measured here as a bare "element(s) not found" on the table
    // while the rest of the step card was fully drawn. A reload re-runs the
    // query against whatever has since synced, which is cheaper and far more
    // reliable than one longer wait.
    await expect(async () => {
      if (!(await table.isVisible().catch(() => false))) {
        await page.reload({ waitUntil: 'domcontentloaded' })
        await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {})
      }
      await expect(table).toBeVisible({ timeout: 30_000 })
    }).toPass({ timeout: 120_000 })
    const rows = table.locator('tbody tr')
    let rowIndex = -1
    for (let i = 0, n = await rows.count(); i < n; i += 1) {
      const label = (await rows.nth(i).locator('td').first().innerText()).trim()
      if (new RegExp(`^${cell.likelihood}\\b`).test(label)) {
        rowIndex = i
        break
      }
    }
    expect(rowIndex, `likelihood row "${cell.likelihood}" exists`).toBeGreaterThanOrEqual(0)
    const headers = table.locator('thead th')
    let colIndex = -1
    for (let i = 1, n = await headers.count(); i < n; i += 1) {
      if (new RegExp(`^${cell.severity}\\b`).test((await headers.nth(i).innerText()).trim())) {
        colIndex = i
        break
      }
    }
    expect(colIndex, `severity column "${cell.severity}" exists`).toBeGreaterThan(0)
    await rows.nth(rowIndex).locator('td').nth(colIndex).click()
    await expect(
      page.getByText(new RegExp(`${cell.likelihood}\\s*×\\s*${cell.severity}`)),
      `the widget confirms ${cell.likelihood} × ${cell.severity} is selected`,
    ).toBeVisible({ timeout: 15_000 })

    // Mark Complete saves, submits AND completes (autoApprove step).
    await clickWhenReady(page, page.getByRole('button', { name: 'Mark Complete' }))

    // THE BARRIER the shared helper is missing: stay on the page until the
    // server has actually actioned the task.
    //
    // Scoped to the NEWEST task on the step, not "any APPROVED task on it".
    // A send-back re-opens the step with a FRESH task while the previously
    // approved one stays APPROVED, so an unscoped count would be satisfied by
    // the stale row and let the re-score race ahead of its own approval.
    await waitForSqlValue(
      `SELECT (status_id = 'APPROVED')::int FROM task_instances ti
        WHERE ti.source_type = 'WorkflowInstanceStep'
          AND ti.source_id = (
            SELECT wis.id FROM workflow_instance_steps wis
              JOIN workflow_instances wi ON wi.id = wis.workflow_instance_id
             WHERE wi.resource_type = 'Capa' AND wi.resource_id = ${quote(capaId)}
               AND wis.name = ${quote(RISK_ASSESSMENT.step1Name)}
             ORDER BY wis.created_at DESC LIMIT 1)
          AND ti.deleted_at IS NULL AND ti.status_id <> 'CANCELLED'
        ORDER BY ti.created_at DESC LIMIT 1`,
      { timeoutMs: 120_000, label: 'risk review step APPROVED' },
    )
  } finally {
    await ctx.close()
  }
  return waitForRiskAssessment(capaId, { timeoutMs: 60_000 })
}

/**
 * A CAPA on the dedicated Risk Assessment workflow, scored and with the
 * reviewer's ACTION step already complete — so the APPROVAL step's task is
 * live and the risk_assessments row already exists.
 *
 * Arranged per test on purpose: Playwright discards the worker after a failing
 * test and runs its pending afterAll, so anything shared across tests turns
 * one failure into a cascade of missing-precondition failures.
 */
async function arrangeAwaitingApproval(browser, tag, cell = SCORED_CELL) {
  const ctxAuthor = await browser.newContext({ storageState: AUTH.author })
  const authorPage = await ctxAuthor.newPage()
  const title = uniqueTitle(tag)
  await createCapa(authorPage, title, { workflowName: RISK_ASSESSMENT.workflowName })
  const capa = findCapaByTitle(title)
  expect(capa, 'the CAPA landed in Postgres').not.toBeNull()
  purgeRiskAssessment(capa.id)
  await openCapa(authorPage, capa.id)
  await ctxAuthor.close()

  const ra = await driveRiskReviewToApproved(browser, capa.id, cell)
  expect(ra, 'the assessment was derived on the ACTION step').not.toBeNull()

  await waitForSqlValue(
    `SELECT count(*) FROM task_instances ti
       JOIN workflow_instance_steps wis ON wis.id = ti.source_id
       JOIN workflow_instances wi ON wi.id = wis.workflow_instance_id
      WHERE wi.resource_type = 'Capa' AND wi.resource_id = ${quote(capa.id)}
        AND wis.name = ${quote(RISK_ASSESSMENT.step2Name)}
        AND ti.status_id IN ('ASSIGNED','FORM_SUBMITTED') AND ti.deleted_at IS NULL`,
    { timeoutMs: 45_000, label: 'approval task live' },
  )
  return { capaId: capa.id, ra }
}

test.describe('RA-J7 · TC-08-05 review and approval of the step carrying the assessment', () => {
  test('step 1+2 — the approval routes to the configured reviewer, and a capa:update holder who is NOT that reviewer is REFUSED at the server', async ({
    browser,
  }) => {
    test.setTimeout(300_000)
    const { capaId } = await arrangeAwaitingApproval(browser, 'RA-J7-deny')

    // Step 1: it routed to the step's configured role (E2E Approver -> Adam).
    const task = findTaskForStep(capaId, RISK_ASSESSMENT.step2Name)
    expect(task, 'the approval step has a live task').not.toBeNull()
    expect(
      task.assignedTo,
      'the step routes to its configured reviewer via workflow_step_roles (E2E Approver)',
    ).toBe(USERS.approver.id)
    expect(task.statusId, 'and it is awaiting a response').toMatch(/ASSIGNED|FORM_SUBMITTED/)

    // Step 2: `reviewer` holds capa:read + capa:update at tenant scope — they
    // can edit this very CAPA — but NOT capa:approve, and they are not the
    // assignee. An APPROVAL step needs the approve verb (actionForStepType),
    // so the server must refuse. Sent with a VALID e-signature so the refusal
    // cannot be mistaken for a missing-credential 400.
    const ctxReviewer = await browser.newContext({ storageState: AUTH.reviewer })
    const reviewerPage = await ctxReviewer.newPage()
    const denied = await postStepAction(reviewerPage, task.id, {
      action: 'APPROVED',
      method: 'PIN',
      token: ESIGN_PIN,
      comment: 'E2E RA-J7 — non-approver attempting to approve the risk assessment step',
    })
    expect(
      denied.status(),
      'a capa:update holder without capa:approve must be refused 403 on an APPROVAL step',
    ).toBe(403)
    const body = await denied.json().catch(() => null)
    expect(
      body?.error?.message ?? '',
      'and refused by the AUTHORIZATION gate, not by a missing-assignee 404 — assignment is routing, not a lock (2026-08-19)',
    ).toMatch(/assigned to someone else|does not (grant|cover)/i)
    await ctxReviewer.close()

    // Nothing moved: not the task, and not the assessment the step carries.
    const after = findTaskForStep(capaId, RISK_ASSESSMENT.step2Name)
    expect(after.statusId, 'the refused request left the task untouched').toBe(task.statusId)
    expect(
      sqlValue(
        `SELECT count(*) FROM signatures s JOIN task_instances ti ON ti.id = s.task_instance_id
          WHERE ti.id = ${quote(task.id)}`,
      ),
      'and wrote no Part-11 signature — the refusal precedes verifyAndSign',
    ).toBe('0')
  })

  test('step 3 — the approver signs, and the Part-11 evidence is the STEP task signature (name, time and meaning)', async ({
    browser,
  }) => {
    test.setTimeout(300_000)
    const { capaId, ra } = await arrangeAwaitingApproval(browser, 'RA-J7-sign')
    const task = findTaskForStep(capaId, RISK_ASSESSMENT.step2Name)

    // CONTROL for the refusal above: the same request, from the persona who
    // holds capa:approve, must SUCCEED. Without this, a gate that had stopped
    // matching anything would make the previous test pass for the wrong reason.
    const ctxApprover = await browser.newContext({ storageState: AUTH.approver })
    const approverPage = await ctxApprover.newPage()
    const ok = await postStepAction(approverPage, task.id, {
      action: 'APPROVED',
      method: 'PIN',
      token: ESIGN_PIN,
      comment: 'E2E RA-J7 — risk assessment reviewed and approved',
    })
    expect(ok.status(), 'the capa:approve holder IS admitted — the probe is sound').toBe(200)
    await ctxApprover.close()

    await waitForSqlValue(
      `SELECT count(*) FROM task_instances WHERE id = ${quote(task.id)} AND status_id = 'APPROVED'`,
      { timeoutMs: 30_000, label: 'approval task APPROVED' },
    )

    // The evidence the protocol names: the step task's signature row. Fetched
    // column-by-column-safe (no multi-line values in this set).
    const sig = sqlRow(
      `SELECT user_id, meaning, signed_at IS NOT NULL, is_revoked, proxy_session_user_id
         FROM signatures WHERE task_instance_id = ${quote(task.id)} AND deleted_at IS NULL
        ORDER BY created_at DESC LIMIT 1`,
    )
    expect(sig, 'approving an e-signature step writes a signatures row').not.toBeNull()
    expect(sig[0], 'signed by the approver — the NAME half of "name, date/time and meaning"').toBe(
      USERS.approver.id,
    )
    expect(sig[1], 'the MEANING half — verifyAndSign maps APPROVED -> APPROVED').toBe('APPROVED')
    expect(sig[2], 'the DATE/TIME half — signed_at is stamped').toBe('t')
    expect(sig[3], 'and it is not revoked').toBe('f')
    expect(
      sig[4],
      'no proxy: the approver is the assignee, so this is not a takeover signature',
    ).toBeFalsy()

    // The protocol's own caveat, pinned rather than assumed: the signature
    // hangs off the TASK, not the assessment. `signatures` has no
    // risk_assessment_id column, so the step is the only Part-11 subject
    // covering this row (11-security-review.md §5).
    expect(
      sqlValue(
        `SELECT count(*) FROM information_schema.columns
          WHERE table_name = 'signatures' AND column_name = 'risk_assessment_id'`,
      ),
      'there is NO signatures.risk_assessment_id — the step signature is the assessment\'s only attestation',
    ).toBe('0')

    // The assessment itself survived the approval step untouched: the APPROVAL
    // step's form_schema is [], so the derivation service finds no
    // riskAssessment field and no-ops. No re-derivation, no second row.
    const still = await waitForRiskAssessment(capaId)
    expect(still.id, 'the same assessment row, not a re-derived one').toBe(ra.id)
    expect(still.computedScore).toBe(SCORED_CELL.rpn)
    expect(
      sqlValue(
        `SELECT count(*) FROM risk_assessments
          WHERE resource_type = 'Capa' AND resource_id = ${quote(capaId)} AND deleted_at IS NULL`,
      ),
      'exactly one assessment for this CAPA — approving does not version it',
    ).toBe('1')
  })

  test('step 4 — after the ACTION step is approved the assessment is READ-ONLY in the interface, and that is a workflow-state control, not a database lock', async ({
    browser,
  }) => {
    test.setTimeout(300_000)
    const { capaId } = await arrangeAwaitingApproval(browser, 'RA-J7-readonly')

    // The reviewer's ACTION step is already APPROVED (completeRiskReviewStep
    // marks it complete on an autoApprove step). WorkflowStepForm#isEditable
    // is `currentUserTask?.statusId === 'ASSIGNED'`, so the form drops to
    // FormSchemaReadonlyView and the widget renders with readonly=true — no
    // Finalize button, no Save draft, no clickable cells.
    const ctxReviewer = await browser.newContext({ storageState: AUTH.reviewer })
    const page = await ctxReviewer.newPage()
    await page.goto(`/capas/${capaId}`, { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {})

    // The scored assessment still renders (visible in context — TC-08-04
    // step 6's expectation, met here even though that case is N/A). Anchored
    // on the LIKELIHOOD × SEVERITY summary, not on the bare band label: "High"
    // alone also matches the priority chip and the matrix's own cell labels,
    // so a band-only probe would pass on a page showing no assessment at all.
    await expect(
      page
        .getByText(new RegExp(`${SCORED_CELL.likelihood}\\s*×\\s*${SCORED_CELL.severity}`))
        .first(),
      'the approved assessment is still visible on the record it belongs to',
    ).toBeVisible({ timeout: 30_000 })

    // But nothing offers to change it.
    await expect(
      page.getByRole('button', { name: 'Finalize Assessment' }),
      'no Finalize control after the step is approved',
    ).toHaveCount(0)
    await expect(
      page.getByRole('button', { name: 'Save draft' }),
      'and no Save draft either — the form is read-only',
    ).toHaveCount(0)
    await ctxReviewer.close()

    // THE BOUNDARY, stated by the protocol's own note on this step: the
    // read-only behaviour comes from the step's state, not from a
    // database-level restriction on the assessment row. So the same reviewer,
    // going round the interface, is NOT refused by the database — they hold
    // capa:update, which is all `risk_assessments_update_rls` asks for.
    //
    // KNOWN LIMITATION (TC-08-05 step 4 / TC-08-03 step 7 note): pinned as the
    // product behaves, so a future row-level seal is NOTICED rather than
    // quietly assumed to have always been there. J3 owns the complementary
    // half — that a capa:READ-only holder is refused.
    const raId = sqlValue(
      `SELECT id FROM risk_assessments WHERE resource_type = 'Capa' AND resource_id = ${quote(capaId)}`,
    )
    const { sqlAsAppUser } = await import('../fixtures/db.js')
    const res = sqlAsAppUser(
      `UPDATE public.risk_assessments SET justification = 'edited after approval, outside the interface' WHERE id = ${quote(raId)};`,
      { userId: USERS.reviewer.id, companyId: 'e2e00001-0000-4000-8000-000000000001' },
    )
    expect(res.ok, `sqlAsAppUser should not error: ${res.error}`).toBe(true)
    expect(
      sqlValue(`SELECT justification FROM risk_assessments WHERE id = ${quote(raId)}`),
      'KNOWN LIMITATION: the post-approval read-only state is a workflow control only — a capa:update holder can still rewrite the row outside the interface. The change is captured by risk_assessments_audit_trigger (RA-J8) but NOT refused.',
    ).toBe('edited after approval, outside the interface')
  })

  test('step 5 — the in-place upsert is scoped to ONE instance step: a send-back re-score leaves a SECOND live assessment (KNOWN DEFECT RA-D1)', async ({
    browser,
  }) => {
    test.setTimeout(360_000)
    // Score LOW first so the re-score is an unmistakable move in both
    // derivations at once (1 -> 9, Low -> High).
    const { capaId, ra } = await arrangeAwaitingApproval(browser, 'RA-J7-inplace', LOW_CELL)
    expect(ra.computedScore, 'arranged at the Low cell').toBe(LOW_CELL.rpn)

    const approvalTask = findTaskForStep(capaId, RISK_ASSESSMENT.step2Name)

    // `sendBackTargetStepId` is a TEMPLATE step id (workflow_steps.id), NOT
    // the instance step. sendBackAction validates the requested target
    // against `steps_send_back_targets`, whose rows are materialised from the
    // template by the publish trigger (migration 20260807101000 — Workflows
    // F-03 GATE 1; before it the table was empty in every company and the
    // outcome had literally never executed). Passing the instance-step id
    // here is refused with a bare 400, which is how this test first failed.
    const actionStepId = sqlValue(
      `SELECT sbt.target_step_id FROM steps_send_back_targets sbt
        WHERE sbt.step_id = ${quote(approvalTask.templateStepId)}
          AND sbt.company_id = ${quote(COMPANY_ID)} LIMIT 1`,
    )
    expect(
      actionStepId,
      'the approval step has a CONFIGURED send-back target — the gate validates against this table, so an unlisted target is refused',
    ).toBeTruthy()

    // The approver sends it back to the risk-review step — SEND_BACK is the
    // one extra outcome §44c configures on both steps
    // (allowed_outcomes_on_steps), so this is the product's own re-open path.
    const ctxApprover = await browser.newContext({ storageState: AUTH.approver })
    const approverPage = await ctxApprover.newPage()
    // The e-signature is REQUIRED even to send back. `handleWorkflowAction`
    // resolves `requireEsignature` from the step BEFORE it branches on the
    // outcome, and §44c's Final Approval step carries require_esignature =
    // true — so a SEND_BACK without credentials is refused with a bare 400
    // ("E-signature verification is required for this step"), not with
    // anything about the send-back itself. That is how this test first
    // failed, and it is worth pinning: declining to approve is as much a
    // Part-11 act on this step as approving.
    const sentBack = await postStepAction(approverPage, approvalTask.id, {
      action: 'SEND_BACK',
      sendBackTargetStepId: actionStepId,
      method: 'PIN',
      token: ESIGN_PIN,
      comment: 'E2E RA-J7 — re-score this risk, the likelihood was understated',
    })
    expect(
      sentBack.status(),
      `send-back accepted: ${await sentBack.text().catch(() => '')}`,
    ).toBe(200)
    await ctxApprover.close()

    // The reviewer's step is live again. Re-score to HIGH and complete it.
    await driveRiskReviewToApproved(browser, capaId, SCORED_CELL)

    // ── KNOWN DEFECT (RA-D1) — the send-back path does NOT update in place ──
    //
    // TC-08-05 step 5 states the expected result as "The stored assessment is
    // updated in place, not versioned", and tells the executor not to record a
    // versioning failure. Measured here, that holds only for a re-approval on
    // the SAME instance step. Across a SEND-BACK it does not, and the mechanism
    // is visible in the data:
    //
    //   workflow_instance_steps            risk_assessments
    //   ---------------------------------  ----------------------------
    //   #1 Risk Review     APPROVED   <--  Low x Minor = 1   (the original)
    //   #2 Final Approval  SENT_BACK
    //   #3 Risk Review     APPROVED   <--  High x Severe = 9 (the re-score)
    //   #4 Final Approval  IN_PROGRESS
    //
    // `sendBackAction` RE-CREATES every step in the send-back range as a NEW
    // `workflow_instance_steps` row (that is the documented replay, and the
    // reason Workflows F-03 GATE 2 had to renumber them). The derivation's
    // upsert key is (resourceType, resourceId, workflowInstanceStepId,
    // assessmentType), and the partial unique index
    // `risk_assessments_resource_step_type_unique` carries the same column —
    // so a re-created step is a DIFFERENT key, `findOne` misses, and
    // `deriveRiskAssessmentForField` takes its INSERT branch.
    //
    // The result is a second live assessment row on the same record. The
    // original is NOT superseded, NOT soft-deleted and carries no marker, so
    // "the current risk" is ambiguous at the table: a reader taking
    // `ORDER BY created_at DESC LIMIT 1` gets the re-score, a reader
    // aggregating gets both, and the pre-send-back score still reads as live.
    //
    // PINNED AS THE PRODUCT BEHAVES, deliberately. The protocol's own note
    // tells an executor NOT to raise a versioning failure here, so an
    // executor following it would record a pass and never look — which makes
    // an automated pin the only thing that would notice. Reported, not fixed.
    await expect
      .poll(
        () =>
          sqlValue(
            `SELECT count(*) FROM risk_assessments
              WHERE resource_type = 'Capa' AND resource_id = ${quote(capaId)}
                AND deleted_at IS NULL AND computed_score = ${SCORED_CELL.rpn}`,
          ),
        { timeout: 60_000, message: 'the re-scored assessment reached the database' },
      )
      .toBe('1')

    // The ORIGINAL row is untouched — not updated, not superseded, not deleted.
    const original = sqlRow(
      `SELECT computed_score, computed_risk_level_label, deleted_at FROM risk_assessments
        WHERE id = ${quote(ra.id)}`,
    )
    expect(original, 'the pre-send-back assessment still exists').not.toBeNull()
    expect(
      original[0],
      'KNOWN DEFECT (RA-D1): the original assessment was NOT updated in place — it still carries the pre-send-back score',
    ).toBe(String(LOW_CELL.rpn))
    expect(original[1], 'and the pre-send-back band').toBe(LOW_CELL.riskLevel)
    expect(
      original[2],
      'and it was not soft-deleted or superseded either — both rows read as live',
    ).toBeFalsy()

    // So the record carries TWO live assessments, on two different instance
    // steps of the same logical step.
    const live = sqlValue(
      `SELECT count(*) FROM risk_assessments
        WHERE resource_type = 'Capa' AND resource_id = ${quote(capaId)} AND deleted_at IS NULL`,
    )
    expect(
      live,
      'KNOWN DEFECT (RA-D1): a send-back + re-score leaves TWO live assessments on one record, not one updated in place as TC-08-05 step 5 expects',
    ).toBe('2')
    expect(
      sqlValue(
        `SELECT count(DISTINCT workflow_instance_step_id) FROM risk_assessments
          WHERE resource_type = 'Capa' AND resource_id = ${quote(capaId)} AND deleted_at IS NULL`,
      ),
      'each hangs off its own re-created instance step — which is exactly why the upsert key missed',
    ).toBe('2')

    // THE CONTRACT THAT DOES HOLD, and the one the unique index actually
    // promises: at most one assessment per (record, INSTANCE step, type). The
    // in-place update is real — it is simply scoped to a single instance step,
    // not to the logical step across a replay.
    expect(
      sqlValue(
        `SELECT count(*) FROM (
           SELECT workflow_instance_step_id FROM risk_assessments
            WHERE resource_type = 'Capa' AND resource_id = ${quote(capaId)}
              AND deleted_at IS NULL AND assessment_type = 'INITIAL'
            GROUP BY workflow_instance_step_id HAVING count(*) > 1) d`,
      ),
      'no instance step carries two assessments — the partial unique index holds',
    ).toBe('0')
  })
})
