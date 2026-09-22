// PW-J16 — The e-signed disposition, the post-approval result lock, raising a
// nonconformance from a rejected lot, and the field-level audit trail
// (URS-QCI-07, -08 and -10; OQ-09 TC-09-07, TC-09-08 and TC-09-10 step 2).
//
// ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────
//
// Three PARTIAL rows in the coverage matrix (§12) converge on the back half of
// the lifecycle — everything that happens AFTER the inspector has finished:
//
//   URS-QCI-07  "Not covered: raising a nonconformance from a rejected lot."
//   URS-QCI-08  "Not covered: the e-signed approval, and the result lock after
//                approval."
//   URS-QCI-10  "Not covered: a lot audit history showing old and new result
//                values."
//
// PW-J1 stops at UNDER_REVIEW. Nothing in the suite had ever driven a lot all
// the way to a DISPOSED terminal state, so the module's Part 11 moment — the
// one signature that says a human authorised the release or rejection of
// material — was entirely unexercised, as was every consequence that hangs off
// it.
//
// ── HOW THE DISPOSITION ACTUALLY WORKS ─────────────────────────────────────
//
// It is not a single endpoint, and that matters for what can be probed. The
// decision is recorded in two moves (InspectionLotDispositionAction.vue):
//
//   1. PATCH the lot with `dispositionTypeId` + `dispositionNotes`. This is
//      just persistence — `updateLot`'s UNDER_REVIEW branch. It does NOT
//      dispose anything, and crucially it is NOT signed.
//   2. POST the workflow task's `/action` with `APPROVED` + the PIN. The
//      seeded `E2E QC Disposition` workflow has ONE APPROVAL step with
//      `require_esignature = true`, so this is where the signature is minted
//      and where `inspectionLotHandler.onComplete` fires and writes the
//      terminal state.
//
// So the e-signature gate lives on step 2, and the assertion with teeth is
// that step 2 is refused without credentials while step 1 has already
// succeeded — i.e. that a QA approver who picks a disposition and then walks
// away has NOT dispositioned the lot.
//
// ── THE NC LINK IS NOT GATED ON QC AT ALL ──────────────────────────────────
//
// `POST /lots/:id/create-nc` checks `ncr:create` and nothing else — no
// `inspection_qc:read`. See the last test; it is pinned, not fixed.
import { test, expect } from '@playwright/test'
import { AUTH, COMPANY_ID, ESIGN_PIN, QC, USERS } from '../fixtures/cast.js'
import { checkInLotViaRest, createLotViaRest, findLotByNumber } from '../fixtures/qcInspection.js'
import { sql, sqlValue } from '../fixtures/db.js'

const LOT_TAG = 'J16'

function purgeJ16Lots() {
  // Order matters and is not the same as qc.setup.js's: these lots reach a
  // DISPOSED state, so they acquire a workflow instance, an APPROVAL task and a
  // Part 11 signature hanging off that task — and `signatures` is IMMUTABLE for
  // audit purposes but not FK-pinned to the lot, so it is dropped by task id
  // before the tasks are. A raised NC is detached (lot.nc_id nulled, the
  // record_link dropped) and then removed by its own id.
  const lotScope = `SELECT id FROM inspection_lots
     WHERE company_id = '${COMPANY_ID}' AND lot_number LIKE 'E2E-LOT-${LOT_TAG}-%'`
  sql(`
    DELETE FROM record_links WHERE from_id IN (${lotScope}) OR to_id IN (${lotScope});
    DELETE FROM nonconformances WHERE id IN (
      SELECT nc_id FROM inspection_lots
       WHERE company_id = '${COMPANY_ID}' AND lot_number LIKE 'E2E-LOT-${LOT_TAG}-%'
         AND nc_id IS NOT NULL);
    UPDATE inspection_lots SET nc_id = NULL, active_batch_id = NULL
     WHERE company_id = '${COMPANY_ID}' AND lot_number LIKE 'E2E-LOT-${LOT_TAG}-%';
    DELETE FROM signatures WHERE task_instance_id IN (
      SELECT id FROM task_instances WHERE entity_type = 'InspectionLot' AND entity_id IN (${lotScope}));
    DELETE FROM task_instances WHERE entity_type = 'InspectionLot' AND entity_id IN (${lotScope});
    DELETE FROM inspection_results WHERE inspection_lot_id IN (${lotScope});
    DELETE FROM inspection_defects WHERE inspection_lot_id IN (${lotScope});
    DELETE FROM inspection_lot_events WHERE inspection_lot_id IN (${lotScope});
    DELETE FROM inspection_batches WHERE inspection_lot_id IN (${lotScope});
    DELETE FROM inspection_lots
     WHERE company_id = '${COMPANY_ID}' AND lot_number LIKE 'E2E-LOT-${LOT_TAG}-%';
  `)
  // audit_logs is deliberately NOT touched. It is append-only evidence; a test
  // that tidied it away would be deleting the very thing URS-QCI-10 asks the
  // system to keep.
}

/**
 * A MULTI-LINE text column, read whole.
 *
 * `sqlValue` hands back `out.split('\n')[0]` — the first line only — because
 * psql separates ROWS by newline and it has no way to tell a second row from a
 * second line of the same value. The NC description this file asserts on is
 * deliberately multi-paragraph (lot summary, item, sample, notes, then the
 * failed-characteristic block), so reading it with `sqlValue` silently returns
 * the first sentence and every assertion about the evidence passes or fails on
 * the wrong string. Collapsing the newlines inside SQL keeps the whole value on
 * one line, which is what the helper is for.
 */
function sqlText(query) {
  return sqlValue(`SELECT replace((${query}), chr(10), ' // ')`)
}

/** The seeded disposition types, by code. REWORK is adverse; USE_AS_IS is not. */
function dispositionTypeId(code) {
  return sqlValue(
    `SELECT id FROM nc_disposition_types
      WHERE company_id = '${COMPANY_ID}' AND code = '${code}' AND deleted_at IS NULL LIMIT 1`,
  )
}

/** The QA approver's actionable APPROVAL task for a lot under review. */
function dispositionTaskId(lotId) {
  return sqlValue(
    `SELECT id FROM task_instances
      WHERE entity_type = 'InspectionLot' AND entity_id = '${lotId}'
        AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1`,
  )
}

/**
 * Drive a fresh lot to UNDER_REVIEW with one CRITICAL out-of-spec reading, and
 * hand back its id + lot number. Every test calls this for itself: a failure
 * anywhere in this file discards the worker and fires the file-level purge, so
 * nothing may be shared across tests.
 */
async function lotUnderReview(inspector, qa, suffix) {
  const lot = await createLotViaRest(inspector, {
    lotNumber: `E2E-LOT-${LOT_TAG}-${suffix}-${Date.now()}`,
  })
  await checkInLotViaRest(inspector, lot.id)
  const results = await inspector.request.post(
    `/api/v1/services/qcInspection/lots/${lot.id}/results`,
    {
      data: {
        results: [
          // 12.5 against 9.90–10.10 on the CRITICAL characteristic — the lot
          // has a real reason to be rejected, which is what makes the adverse
          // disposition and the NC evidence below meaningful.
          { characteristicId: QC.characteristics.length.id, sampleIndex: 1, valueNumeric: 12.5 },
          { characteristicId: QC.characteristics.visual.id, sampleIndex: 1, valueBool: true },
          { characteristicId: QC.characteristics.label.id, sampleIndex: 1, valueText: 'Legible' },
        ],
      },
    },
  )
  expect(results.ok(), `results failed: ${await results.text()}`).toBeTruthy()
  const complete = await inspector.request.post(
    `/api/v1/services/qcInspection/lots/${lot.id}/complete`,
    { data: {} },
  )
  expect(complete.ok(), `complete failed: ${await complete.text()}`).toBeTruthy()
  // Submit is `inspection_qc:dispose` — the inspector cannot do it (PW-J1/J3
  // pin that separation); the QA approver must.
  const submit = await qa.request.post(`/api/v1/services/qcInspection/lots/${lot.id}/submit`, {
    data: {},
  })
  expect(submit.ok(), `submit failed: ${await submit.text()}`).toBeTruthy()
  expect(findLotByNumber(lot.lotNumber).phase, 'lot is UNDER_REVIEW').toBe('UNDER_REVIEW')
  return lot
}

test.describe('PW-J16 — e-signed disposition, result lock, NC raise, audit trail', () => {
  test.beforeAll(() => purgeJ16Lots())
  test.afterAll(() => purgeJ16Lots())

  test('the disposition is refused without an e-signature, and accepted with one — recording name, meaning and time', async ({
    browser,
  }) => {
    // OQ-09 TC-09-08 steps 2, 3 and 5.
    const inspectorCtx = await browser.newContext({ storageState: AUTH.qcInspector })
    const inspector = await inspectorCtx.newPage()
    const qaCtx = await browser.newContext({ storageState: AUTH.qcApprover })
    const qa = await qaCtx.newPage()

    const lot = await lotUnderReview(inspector, qa, 'ESIGN')
    await inspectorCtx.close()

    // Step 1 of the two-move disposition: persist the decision. This is NOT
    // signed, and pinning that it succeeds is what gives the refusal below its
    // meaning — the approver got all the way to "decision recorded on the row"
    // without producing a credential.
    const rework = dispositionTypeId('REWORK')
    expect(rework, 'the E2E tenant seeds an adverse REWORK disposition type').toBeTruthy()
    const persist = await qa.request.patch(`/api/v1/services/qcInspection/lots/${lot.id}`, {
      data: { dispositionTypeId: rework, dispositionNotes: 'PW-J16 — length out of spec, rework.' },
    })
    expect(persist.ok(), `persisting the chosen disposition failed: ${await persist.text()}`).toBeTruthy()

    // …and yet nothing is dispositioned. This is the assertion that separates
    // "picked a disposition" from "recorded a disposition".
    const midway = findLotByNumber(lot.lotNumber)
    expect(midway.phase, 'choosing a disposition does not apply it').toBe('UNDER_REVIEW')
    expect(midway.qualityState, 'and no quality state is set yet').toBeNull()

    const task = dispositionTaskId(lot.id)
    expect(task, 'the submit raised an APPROVAL task for the QA reviewer').toBeTruthy()
    expect(
      sqlValue(`SELECT assigned_to FROM task_instances WHERE id = '${task}'`),
      'routed to the approver, not to the inspector (TC-09-08 step 2)',
    ).toBe(USERS.qcApprover.id)
    expect(
      sqlValue(
        `SELECT ws.require_esignature FROM task_instances ti
           JOIN workflow_instance_steps wis ON wis.id = ti.source_id
           JOIN workflow_steps ws ON ws.id = wis.step_id
          WHERE ti.id = '${task}'`,
      ),
      'the disposition step demands a signature — that is the premise of this test',
    ).toBe('t')

    // Step 2 WITHOUT credentials — refused.
    const unsigned = await qa.request.post(`/api/v1/services/taskInstances/${task}/action`, {
      data: { action: 'APPROVED', comment: 'PW-J16 — unsigned attempt' },
    })
    expect(unsigned.ok(), 'an unsigned approval is refused').toBeFalsy()
    expect(
      (await unsigned.json())?.error?.message ?? '',
      'and the refusal names the signature requirement',
    ).toMatch(/E-signature verification is required/i)
    expect(
      findLotByNumber(lot.lotNumber).phase,
      'the lot did not move — the signature is a gate, not a formality',
    ).toBe('UNDER_REVIEW')
    expect(
      Number(sqlValue(`SELECT count(*) FROM signatures WHERE task_instance_id = '${task}'`)),
      'and no ledger row was minted for the refused attempt',
    ).toBe(0)

    // Step 2 WITH the PIN — accepted.
    const signed = await qa.request.post(`/api/v1/services/taskInstances/${task}/action`, {
      data: {
        action: 'APPROVED',
        comment: 'PW-J16 — length out of spec, rework.',
        method: 'PIN',
        token: ESIGN_PIN,
      },
    })
    expect(signed.ok(), `signed approval failed: ${await signed.text()}`).toBeTruthy()

    // TC-09-08 step 5 — the lot's status reflects the decision. REWORK is an
    // adverse, non-quarantine disposition, so the handler closes the lot and
    // derives REJECTED as the quality state.
    const after = findLotByNumber(lot.lotNumber)
    expect(after.statusId, 'an adverse disposition closes the lot').toBe('CLOSED')
    expect(after.phase, 'and its execution phase is DISPOSED').toBe('DISPOSED')
    expect(after.qualityState, 'the material is marked REJECTED (TC-09-07 step 5)').toBe('REJECTED')
    expect(
      sqlValue(`SELECT disposition_type_id FROM inspection_lots WHERE id = '${lot.id}'`),
      'and the recorded disposition is the one the approver chose',
    ).toBe(rework)

    // TC-09-08 step 3 — "Approval recorded with name, date/time and meaning."
    // A signature you can decline to produce is not a signature; a signature
    // that leaves no ledger row is not one either. Assert the row exists and
    // carries all three facts.
    const sigId = sqlValue(`SELECT id FROM signatures WHERE task_instance_id = '${task}'`)
    expect(sigId, 'a Part 11 signature row was minted').toBeTruthy()
    expect(
      sqlValue(`SELECT user_id FROM signatures WHERE id = '${sigId}'`),
      'NAME — attributed to the approver who signed',
    ).toBe(USERS.qcApprover.id)
    expect(
      sqlValue(`SELECT meaning FROM signatures WHERE id = '${sigId}'`),
      'MEANING — the signature says what was being attested',
    ).toBe('APPROVED')
    expect(
      sqlValue(`SELECT signed_at IS NOT NULL FROM signatures WHERE id = '${sigId}'`),
      'DATE/TIME — server-recorded',
    ).toBe('t')
    expect(
      sqlValue(`SELECT payload_hash <> '' FROM signatures WHERE id = '${sigId}'`),
      'and it binds a payload hash, so what was signed is fixed',
    ).toBe('t')
    expect(
      sqlValue(`SELECT is_revoked FROM signatures WHERE id = '${sigId}'`),
      'live, not revoked',
    ).toBe('f')

    await qaCtx.close()
  })

  test('results are locked once the lot is under review, and stay locked after approval', async ({
    browser,
  }) => {
    // OQ-09 TC-09-08 step 4 — "Attempt to change a result after approval:
    // prevented." The lock actually engages EARLIER than the OQ implies, at
    // submit rather than at approval, which is stronger; both points are pinned
    // so a future relaxation at either end is caught.
    const inspectorCtx = await browser.newContext({ storageState: AUTH.qcInspector })
    const inspector = await inspectorCtx.newPage()
    const qaCtx = await browser.newContext({ storageState: AUTH.qcApprover })
    const qa = await qaCtx.newPage()

    const lot = await lotUnderReview(inspector, qa, 'LOCK')
    const LEN = QC.characteristics.length.id
    const originalValue = sqlValue(
      `SELECT value_numeric FROM inspection_results
        WHERE inspection_lot_id = '${lot.id}' AND characteristic_id = '${LEN}'`,
    )
    expect(originalValue, 'the out-of-spec reading is on the record').toBe('12.5')

    // Locked at UNDER_REVIEW — the inspector who recorded it cannot walk it
    // back while QA is deciding.
    const duringReview = await inspector.request.post(
      `/api/v1/services/qcInspection/lots/${lot.id}/results`,
      { data: { results: [{ characteristicId: LEN, sampleIndex: 1, valueNumeric: 10.0 }] } },
    )
    expect(duringReview.ok(), 'results are frozen while the lot is under review').toBeFalsy()
    expect(
      (await duringReview.json())?.error?.message ?? '',
      'and the refusal says so, naming the reopen route as the only way back in',
    ).toMatch(/Results are frozen on a OPEN\/UNDER_REVIEW inspection — reopen it to amend/)

    // Approve it, so the post-approval case is the one TC-09-08 step 4 asks for.
    const task = dispositionTaskId(lot.id)
    await qa.request.patch(`/api/v1/services/qcInspection/lots/${lot.id}`, {
      data: { dispositionTypeId: dispositionTypeId('REWORK'), dispositionNotes: 'PW-J16 lock probe' },
    })
    const signed = await qa.request.post(`/api/v1/services/taskInstances/${task}/action`, {
      data: { action: 'APPROVED', method: 'PIN', token: ESIGN_PIN },
    })
    expect(signed.ok(), `signed approval failed: ${await signed.text()}`).toBeTruthy()
    expect(findLotByNumber(lot.lotNumber).phase, 'lot is DISPOSED').toBe('DISPOSED')

    // Locked after approval too.
    const afterApproval = await inspector.request.post(
      `/api/v1/services/qcInspection/lots/${lot.id}/results`,
      { data: { results: [{ characteristicId: LEN, sampleIndex: 1, valueNumeric: 10.0 }] } },
    )
    expect(afterApproval.ok(), 'a signed-off inspection cannot have its results rewritten').toBeFalsy()
    expect((await afterApproval.json())?.error?.message ?? '', 'refused as frozen').toMatch(
      /Results are frozen on a CLOSED\/DISPOSED inspection/,
    )

    // The evidence is unchanged — the refusals above are worth nothing if the
    // value moved anyway.
    expect(
      sqlValue(
        `SELECT value_numeric FROM inspection_results
          WHERE inspection_lot_id = '${lot.id}' AND characteristic_id = '${LEN}'`,
      ),
      'the signed-off reading is exactly what it was',
    ).toBe(originalValue)

    // …and the lot itself is read-only apart from the notes the approver is
    // deliberately allowed to refine (`updateLot`'s TERMINAL_STATUSES branch).
    //
    // Probed as the INSPECTOR, not the approver. `updateLot`'s controller routes
    // a non-disposition edit through `inspection_qc:create`, which the approver
    // does not hold — so an approver probe would be answered 403 by the
    // permission layer and would never reach the service's terminal-status
    // check. That would look like a pass while proving nothing about the lock.
    const editAttempt = await inspector.request.patch(
      `/api/v1/services/qcInspection/lots/${lot.id}`,
      { data: { quantity: 7 } },
    )
    expect(editAttempt.ok(), 'a dispositioned lot cannot be edited').toBeFalsy()
    expect(
      (await editAttempt.json())?.error?.message ?? '',
      'refused by the lifecycle rule, not by the permission layer',
    ).toMatch(/Cannot edit a CLOSED lot \(only dispositionNotes\)/)

    // The one deliberate exception, pinned so the rule above is not read as
    // "nothing may change": the approver may still refine their reasoning.
    const notesEdit = await qa.request.patch(`/api/v1/services/qcInspection/lots/${lot.id}`, {
      data: { dispositionNotes: 'PW-J16 — reasoning refined after the fact.' },
    })
    expect(notesEdit.ok(), 'disposition notes stay editable on a closed lot, by design').toBeTruthy()
    expect(
      sqlValue(`SELECT disposition_notes FROM inspection_lots WHERE id = '${lot.id}'`),
      'and the refinement landed',
    ).toBe('PW-J16 — reasoning refined after the fact.')

    await inspectorCtx.close()
    await qaCtx.close()
  })

  test('a rejected lot raises a pre-linked nonconformance, visible from both sides; a released lot cannot', async ({
    browser,
  }) => {
    // OQ-09 TC-09-07 steps 3 and 4.
    const inspectorCtx = await browser.newContext({ storageState: AUTH.qcInspector })
    const inspector = await inspectorCtx.newPage()
    const qaCtx = await browser.newContext({ storageState: AUTH.qcApprover })
    const qa = await qaCtx.newPage()
    // `author` is the only persona in the cast holding `ncr:create` — see the
    // last test, which is about exactly that.
    const ncCtx = await browser.newContext({ storageState: AUTH.author })
    const ncUser = await ncCtx.newPage()

    // ── The negative first: a NON-adverse disposition is not NC-eligible ─────
    const released = await lotUnderReview(inspector, qa, 'RELEASED')
    const useAsIs = dispositionTypeId('USE_AS_IS')
    expect(
      sqlValue(`SELECT is_adverse FROM nc_disposition_types WHERE id = '${useAsIs}'`),
      'USE_AS_IS is the tenant\'s non-adverse disposition',
    ).toBe('f')
    await qa.request.patch(`/api/v1/services/qcInspection/lots/${released.id}`, {
      data: { dispositionTypeId: useAsIs, dispositionNotes: 'PW-J16 — accepted as is.' },
    })
    const releaseSigned = await qa.request.post(
      `/api/v1/services/taskInstances/${dispositionTaskId(released.id)}/action`,
      { data: { action: 'APPROVED', method: 'PIN', token: ESIGN_PIN } },
    )
    expect(releaseSigned.ok(), `release approval failed: ${await releaseSigned.text()}`).toBeTruthy()
    expect(
      findLotByNumber(released.lotNumber).qualityState,
      'a non-adverse disposition releases the material',
    ).toBe('RELEASED')

    const refusedNc = await ncUser.request.post(
      `/api/v1/services/qcInspection/lots/${released.id}/create-nc`,
      { data: {} },
    )
    expect(refusedNc.ok(), 'a released lot cannot spawn a nonconformance').toBeFalsy()
    expect((await refusedNc.json())?.error?.message ?? '').toMatch(
      /Only an adverse-disposition lot can spawn an NC/,
    )

    // ── The positive: a rejected lot does ───────────────────────────────────
    const rejected = await lotUnderReview(inspector, qa, 'REJECTED')
    await qa.request.patch(`/api/v1/services/qcInspection/lots/${rejected.id}`, {
      data: {
        dispositionTypeId: dispositionTypeId('REWORK'),
        dispositionNotes: 'PW-J16 — length 12.5 mm, out of tolerance.',
      },
    })
    const rejectSigned = await qa.request.post(
      `/api/v1/services/taskInstances/${dispositionTaskId(rejected.id)}/action`,
      { data: { action: 'APPROVED', method: 'PIN', token: ESIGN_PIN } },
    )
    expect(rejectSigned.ok(), `reject approval failed: ${await rejectSigned.text()}`).toBeTruthy()
    expect(findLotByNumber(rejected.lotNumber).qualityState, 'material is rejected').toBe('REJECTED')

    const created = await ncUser.request.post(
      `/api/v1/services/qcInspection/lots/${rejected.id}/create-nc`,
      { data: {} },
    )
    expect(created.status(), `create-nc failed: ${await created.text()}`).toBe(201)

    // PRE-LINKED (step 3): the link exists the moment the NC is created, and
    // the NC arrives already carrying the lot's context — not as an empty
    // shell someone has to fill in.
    const ncId = sqlValue(`SELECT nc_id FROM inspection_lots WHERE id = '${rejected.id}'`)
    expect(ncId, 'the lot now points at its nonconformance').toBeTruthy()
    expect(
      sqlValue(`SELECT status_id FROM nonconformances WHERE id = '${ncId}'`),
      'raised as a DRAFT — the raiser still picks workflow and reviewers',
    ).toBe('DRAFT')
    expect(
      sqlValue(`SELECT product_id FROM nonconformances WHERE id = '${ncId}'`),
      'the inspected item carried across',
    ).toBe(QC.product.id)
    expect(
      sqlValue(`SELECT supplier_id FROM nonconformances WHERE id = '${ncId}'`),
      'and the supplier the lot was received from',
    ).toBe(QC.supplier.id)
    expect(
      sqlValue(`SELECT disposition_type_id FROM nonconformances WHERE id = '${ncId}'`),
      'the QA disposition rides onto the NC — same shared lookup, no remapping',
    ).toBe(dispositionTypeId('REWORK'))

    // The inspection EVIDENCE is spelled out, so the NC reads standalone. This
    // is the half that makes the link worth having: a bare foreign key would
    // satisfy "pre-linked" and tell an investigator nothing.
    const description = sqlText(`SELECT description FROM nonconformances WHERE id = '${ncId}'`)
    expect(description, 'the NC names the lot it came from').toContain(rejected.lotNumber)
    expect(description, 'and the characteristic that failed, with its measured value and limits').toMatch(
      /Length: measured 12\.5 \(spec: min 9\.90, max 10\.10 mm\)/,
    )

    // BIDIRECTIONAL (step 4). Two independent mechanisms, and both must hold:
    // the denormalised pointer on the lot (above) and the generic lineage row
    // the record-links surface reads on both detail pages.
    expect(
      sql(
        `SELECT to_id FROM record_links
          WHERE from_type = 'InspectionLot' AND from_id = '${rejected.id}'
            AND to_type = 'Nonconformance'`,
      ),
      'a lineage link points lot → NC, which is what both detail pages render',
    ).toBe(ncId)

    // Step 3's finality half: the lot cannot spawn a second NC.
    const second = await ncUser.request.post(
      `/api/v1/services/qcInspection/lots/${rejected.id}/create-nc`,
      { data: {} },
    )
    expect(second.ok(), 'a lot raises at most one NC').toBeFalsy()
    expect((await second.json())?.error?.message ?? '').toMatch(/already has a linked NC/)

    await inspectorCtx.close()
    await qaCtx.close()
    await ncCtx.close()
  })

  test('the audit trail carries old and new values for the disposition and every status change', async ({
    browser,
  }) => {
    // OQ-09 TC-09-10 step 2 — "Open the record's audit trail and inspect the
    // disposition and status changes: old and new values shown for the tracked
    // fields" — and step 3, performer and timestamp on every entry.
    //
    // Note which surface this is. Per the OQ's own note, the lot's History
    // panel (inspection_lot_events) and the record's audit trail (audit_logs)
    // are DIFFERENT things; only the second carries before/after values, and it
    // is the one URS-QCI-10's coverage note asks for. PW-J7 already covers the
    // History panel for reopen.
    const inspectorCtx = await browser.newContext({ storageState: AUTH.qcInspector })
    const inspector = await inspectorCtx.newPage()
    const qaCtx = await browser.newContext({ storageState: AUTH.qcApprover })
    const qa = await qaCtx.newPage()

    const lot = await lotUnderReview(inspector, qa, 'AUDIT')
    const rework = dispositionTypeId('REWORK')
    await qa.request.patch(`/api/v1/services/qcInspection/lots/${lot.id}`, {
      data: { dispositionTypeId: rework, dispositionNotes: 'PW-J16 — audit trail probe.' },
    })
    const signed = await qa.request.post(
      `/api/v1/services/taskInstances/${dispositionTaskId(lot.id)}/action`,
      { data: { action: 'APPROVED', method: 'PIN', token: ESIGN_PIN } },
    )
    expect(signed.ok(), `signed approval failed: ${await signed.text()}`).toBeTruthy()

    // Audit rows are written by a graphile_worker job the DB trigger enqueues,
    // so they arrive AFTER the HTTP response. Poll rather than sleep.
    await expect
      .poll(
        () =>
          Number(
            sqlValue(
              `SELECT count(*) FROM audit_logs
                WHERE entity_id = '${lot.id}' AND action = 'UPDATE'
                  AND new_value_json ? 'qualityState'`,
            ),
          ),
        {
          timeout: 45_000,
          message: 'the terminal disposition reached the audit trail',
        },
      )
      .toBeGreaterThan(0)

    // ── The disposition itself: old AND new, both present ───────────────────
    // Parsed, never string-matched: Postgres renders jsonb with a space after
    // the colon, so a substring test on the raw text is a formatting assertion
    // wearing a semantics assertion's clothes.
    const dispositionRows = sql(
      `SELECT old_value_json::text FROM audit_logs
        WHERE entity_id = '${lot.id}' AND action = 'UPDATE'
          AND new_value_json ? 'dispositionTypeId' ORDER BY performed_at`,
    )
      .split('\n')
      .filter(Boolean)
    expect(dispositionRows.length, 'the disposition change is on the audit trail').toBeGreaterThan(0)

    const dispositionNew = JSON.parse(
      sqlValue(
        `SELECT new_value_json::text FROM audit_logs
          WHERE entity_id = '${lot.id}' AND action = 'UPDATE'
            AND new_value_json ? 'dispositionTypeId' ORDER BY performed_at LIMIT 1`,
      ),
    )
    const dispositionOld = JSON.parse(dispositionRows[0])
    expect(
      dispositionOld.dispositionTypeId,
      'BEFORE: the lot carried no disposition',
    ).toBeNull()
    expect(dispositionNew.dispositionTypeId, 'AFTER: the QA decision').toBe(rework)
    expect(dispositionOld.dispositionNotes, 'BEFORE: no reasoning recorded').toBeNull()
    expect(dispositionNew.dispositionNotes, 'AFTER: the reasoning the approver gave').toBe(
      'PW-J16 — audit trail probe.',
    )

    // ── The terminal transition: three tracked fields moving together ───────
    const terminalOld = JSON.parse(
      sqlValue(
        `SELECT old_value_json::text FROM audit_logs
          WHERE entity_id = '${lot.id}' AND action = 'UPDATE'
            AND new_value_json ? 'qualityState' ORDER BY performed_at DESC LIMIT 1`,
      ),
    )
    const terminalNew = JSON.parse(
      sqlValue(
        `SELECT new_value_json::text FROM audit_logs
          WHERE entity_id = '${lot.id}' AND action = 'UPDATE'
            AND new_value_json ? 'qualityState' ORDER BY performed_at DESC LIMIT 1`,
      ),
    )
    expect(
      { status: terminalOld.statusId, phase: terminalOld.inspectionPhase, quality: terminalOld.qualityState },
      'BEFORE: an open lot awaiting review, with no verdict on the material',
    ).toEqual({ status: 'OPEN', phase: 'UNDER_REVIEW', quality: null })
    expect(
      { status: terminalNew.statusId, phase: terminalNew.inspectionPhase, quality: terminalNew.qualityState },
      'AFTER: closed, disposed, material rejected — the decision, recoverable from the trail alone',
    ).toEqual({ status: 'CLOSED', phase: 'DISPOSED', quality: 'REJECTED' })

    // ── Step 3: performer and timestamp on every entry ──────────────────────
    expect(
      sqlValue(
        `SELECT count(*) FROM audit_logs
          WHERE entity_id = '${lot.id}' AND performed_at IS NULL`,
      ),
      'every audit entry for this lot is timestamped',
    ).toBe('0')
    // The QA approver's two writes are attributed to them, not to the system —
    // which is what makes the trail evidence of WHO decided, not just what.
    expect(
      sqlValue(
        `SELECT DISTINCT performed_by FROM audit_logs
          WHERE entity_id = '${lot.id}' AND action = 'UPDATE'
            AND new_value_json ? 'qualityState'`,
      ),
      'the terminal disposition is attributed to the approver who signed it',
    ).toBe(USERS.qcApprover.id)

    // ── The whole story, in order ───────────────────────────────────────────
    // A reviewer should be able to reconstruct the lifecycle from the trail
    // alone. Assert the phase ladder rather than a row count, so an extra
    // untracked write does not make this brittle.
    const phaseLadder = sql(
      `SELECT (new_value_json->>'inspectionPhase') FROM audit_logs
        WHERE entity_id = '${lot.id}' AND action = 'UPDATE'
          AND new_value_json ? 'inspectionPhase' ORDER BY performed_at`,
    ).split('\n')
    expect(
      phaseLadder,
      'the trail walks the full execution ladder — no step is invisible',
    ).toEqual(['IN_PROGRESS', 'COMPLETED', 'UNDER_REVIEW', 'DISPOSED'])

    await inspectorCtx.close()
    await qaCtx.close()
  })

  test('KNOWN DEFECT — raising an NC from a lot needs ncr:create and NO QC permission whatsoever', async ({
    browser,
  }) => {
    // `POST /lots/:id/create-nc` is gated by exactly one check —
    // `ensurePermission(req, 'ncr:create')` in inspectionLots.createNcFromLot.
    // The route itself adds no `enforcePermission('inspection_qc', …)`, unlike
    // every other `/lots/:id/*` action route in qcInspection.js.
    //
    // The consequence is not theoretical. `author` holds ncr:create and has
    // ZERO grants on any inspection_* module — they cannot list lots, cannot
    // open one, cannot read a result. They can nonetheless reach into a lot by
    // id and mint a nonconformance whose description quotes the lot number, the
    // item, the sample size and every failed characteristic's measured value
    // against its limits. That is a QC read, performed through a write route
    // that never asked for QC read.
    //
    // Pinned as it IS. The fix is a route-level `inspection_qc:read` (or
    // `:dispose`, matching who is meant to act on a rejected lot) — a product
    // change, not a test change.
    const inspectorCtx = await browser.newContext({ storageState: AUTH.qcInspector })
    const inspector = await inspectorCtx.newPage()
    const qaCtx = await browser.newContext({ storageState: AUTH.qcApprover })
    const qa = await qaCtx.newPage()

    const lot = await lotUnderReview(inspector, qa, 'NCGATE')
    await qa.request.patch(`/api/v1/services/qcInspection/lots/${lot.id}`, {
      data: { dispositionTypeId: dispositionTypeId('REWORK'), dispositionNotes: 'PW-J16 gate probe' },
    })
    const signed = await qa.request.post(
      `/api/v1/services/taskInstances/${dispositionTaskId(lot.id)}/action`,
      { data: { action: 'APPROVED', method: 'PIN', token: ESIGN_PIN } },
    )
    expect(signed.ok(), `signed approval failed: ${await signed.text()}`).toBeTruthy()

    // The QC personas — who own the inspection — are refused, because neither
    // holds ncr:create. Worth pinning on its own: the people best placed to
    // judge whether a rejection warrants an NC cannot raise one.
    for (const [label, actor] of [
      ['the inspector who ran it', inspector],
      ['the approver who rejected it', qa],
    ]) {
      const res = await actor.request.post(
        `/api/v1/services/qcInspection/lots/${lot.id}/create-nc`,
        { data: {} },
      )
      expect(res.status(), `${label} is refused — no ncr:create`).toBe(403)
      expect((await res.json())?.error?.message ?? '').toMatch(/Missing permission: ncr:create/)
    }
    await inspectorCtx.close()
    await qaCtx.close()

    // …while a persona with no QC grants at all succeeds.
    expect(
      Number(
        sqlValue(
          `SELECT count(*) FROM authz.role_module_permissions rmp
             JOIN roles_on_users ru ON ru.role_id = rmp.role_id
            WHERE ru.user_id = '${USERS.author.id}' AND rmp.module_id LIKE 'inspection%'`,
        ),
      ),
      'the premise: this persona holds NO grant on any inspection module',
    ).toBe(0)

    const ncCtx = await browser.newContext({ storageState: AUTH.author })
    const ncUser = await ncCtx.newPage()
    // They cannot even read the lot through the module's own read route…
    const readAttempt = await ncUser.request.get(`/api/v1/services/qcInspection/lots/${lot.id}`)
    expect(readAttempt.status(), 'and cannot read the lot through the QC read route').toBe(403)

    // …yet the create-nc route hands them its contents anyway.
    const created = await ncUser.request.post(
      `/api/v1/services/qcInspection/lots/${lot.id}/create-nc`,
      { data: {} },
    )
    expect(
      created.status(),
      'DEFECT: ncr:create alone reaches into a lot this persona cannot read',
    ).toBe(201)
    const ncId = sqlValue(`SELECT nc_id FROM inspection_lots WHERE id = '${lot.id}'`)
    expect(
      sqlText(`SELECT description FROM nonconformances WHERE id = '${ncId}'`),
      'and the QC measurements are disclosed in the NC it minted',
    ).toMatch(/Length: measured 12\.5/)

    await ncCtx.close()

    test.info().annotations.push({
      type: 'known-defect',
      description:
        'QCI-07 authz gap: POST /v1/services/qcInspection/lots/:id/create-nc enforces only ' +
        'ncr:create (controller-level). The route adds no inspection_qc permission, so a holder ' +
        'of ncr:create with zero QC grants — who is 403ed by GET /lots/:id — can mint an NC that ' +
        'discloses the lot number, item, sample size and every failed measurement against its ' +
        'limits. Fix: add inspection_qc:read (or :dispose) at the route.',
    })
  })
})
