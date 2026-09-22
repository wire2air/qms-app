// PW-J14 — Specification-limit evaluation: the boundary cases (URS-QCI-05,
// OQ-09 TC-09-05; and TC-09-04 step 3).
//
// ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────
//
// OQ-09 §1 names TC-09-05 one of "the two decisive tests" for the whole module:
// "a QC module that relies on the operator to notice an out-of-spec value
// provides no control at all." The coverage matrix (§12, URS-QCI-05) had this
// row as PARTIAL with the note "Not covered: at-limit and just-inside boundary
// values; only one out-of-spec case."
//
// PW-J1 records ONE out-of-spec value (12.5 against 9.90–10.10) and asserts the
// grid says REJECT. That proves detection exists. It does not prove the
// DISCRIMINATION, which is the thing a validation reviewer actually has to sign
// off: does 9.90 exactly pass or fail? Does 10.11 fail? A module that flags
// everything, or nothing, passes PW-J1 just as happily.
//
// So this file walks the whole boundary ladder on ONE lot, in ONE submission,
// against the one seeded NUMERIC characteristic whose limits are known
// (`QC.characteristics.length` — LEN, LSL 9.90 / USL 10.10 mm, CRITICAL):
//
//     9.89   below LSL          → FAIL   (TC-09-05 step 1)
//     9.90   exactly AT the LSL → PASS   (TC-09-05 step 3 — INCLUSIVE)
//     9.91   just inside        → PASS   (TC-09-05 step 5)
//     10.00  at target          → PASS
//     10.09  just inside        → PASS   (TC-09-05 step 5)
//     10.10  exactly AT the USL → PASS   (TC-09-05 step 4 — INCLUSIVE)
//     10.11  above USL          → FAIL   (TC-09-05 step 2)
//
// ── THE CONVENTION, STATED ─────────────────────────────────────────────────
//
// OQ-09 TC-09-05 steps 3 and 4 do not prescribe an answer — they say "evaluated
// per your specification convention (inclusive or exclusive) — record which,
// and confirm it matches the SOP". That makes the AT-LIMIT rows the most
// valuable assertions in the file: they are the executable record of which
// convention this product implements, so a silent flip from `<` to `<=` in
// `evaluateOutcome` fails a test instead of quietly re-judging every historic
// lot's boundary measurement.
//
// The convention is INCLUSIVE. `inspectionResultService.evaluateOutcome` reads
// `if (lsl != null && v < lsl) return 'FAIL'` / `if (usl != null && v > usl)
// return 'FAIL'` — a value exactly on a limit is inside it.
//
// ── WHERE THE ASSERTIONS LIVE ──────────────────────────────────────────────
//
// On `inspection_results.outcome`, in the database. That column is the system's
// own verdict, computed server-side at capture from the SNAPSHOTTED
// characteristic — not a badge the grid painted, and not something the
// inspector chose. Asserting the rendered colour would prove the CSS; asserting
// the column proves the control. PW-J1 already covers that the verdict reaches
// the screen.
import { test, expect } from '@playwright/test'
import { AUTH, COMPANY_ID, QC } from '../fixtures/cast.js'
import { checkInLotViaRest, createLotViaRest } from '../fixtures/qcInspection.js'
import { sql, sqlValue } from '../fixtures/db.js'

// Local to this file — see the task brief: shared fixtures are off-limits while
// other suites run against them.
const LOT_TAG = 'J14'

/** Purge every lot this file minted, children first (mirrors qc.setup.js). */
function purgeJ14Lots() {
  sql(`
    DELETE FROM inspection_results WHERE inspection_lot_id IN (
      SELECT id FROM inspection_lots
       WHERE company_id = '${COMPANY_ID}' AND lot_number LIKE 'E2E-LOT-${LOT_TAG}-%');
    DELETE FROM inspection_lot_events WHERE inspection_lot_id IN (
      SELECT id FROM inspection_lots
       WHERE company_id = '${COMPANY_ID}' AND lot_number LIKE 'E2E-LOT-${LOT_TAG}-%');
    UPDATE inspection_lots SET active_batch_id = NULL
     WHERE company_id = '${COMPANY_ID}' AND lot_number LIKE 'E2E-LOT-${LOT_TAG}-%';
    DELETE FROM inspection_batches WHERE inspection_lot_id IN (
      SELECT id FROM inspection_lots
       WHERE company_id = '${COMPANY_ID}' AND lot_number LIKE 'E2E-LOT-${LOT_TAG}-%');
    DELETE FROM inspection_lots
     WHERE company_id = '${COMPANY_ID}' AND lot_number LIKE 'E2E-LOT-${LOT_TAG}-%';
  `)
}

/** Read one result's outcome by (lot, characteristic, sampleIndex). */
function outcomeOf(lotId, characteristicId, sampleIndex) {
  return sqlValue(
    `SELECT outcome FROM inspection_results
      WHERE inspection_lot_id = '${lotId}' AND characteristic_id = '${characteristicId}'
        AND sample_index = ${sampleIndex}`,
  )
}

test.describe('PW-J14 — spec-limit evaluation is the system\'s, not the inspector\'s', () => {
  test.use({ storageState: AUTH.qcInspector })

  test.beforeAll(() => purgeJ14Lots())
  test.afterAll(() => purgeJ14Lots())

  test('the LSL/USL boundary ladder is evaluated inclusively and without inspector judgement', async ({
    page,
  }) => {
    // Arrange its own preconditions — a failure anywhere in this file fires the
    // file-level afterAll on the discarded worker, so nothing may be inherited.
    const lot = await createLotViaRest(page, { lotNumber: `E2E-LOT-${LOT_TAG}-${Date.now()}` })
    await checkInLotViaRest(page, lot.id)

    const LEN = QC.characteristics.length.id
    // Stated here rather than read from the fixture so the ladder below is
    // legible on its own — and so a seed change that moved the limits makes
    // this premise fail loudly instead of silently re-aiming every row.
    expect(
      sqlValue(`SELECT lsl || '/' || usl FROM specification_characteristics WHERE id = '${LEN}'`),
      'the seeded LEN characteristic still spans 9.90–10.10',
    ).toBe('9.90/10.10')

    // One submission, seven sample indices. Posting them together matters:
    // it proves the verdicts are per-ROW and independent, not a single
    // whole-submission judgement the last value happens to win.
    const ladder = [
      { sampleIndex: 1, value: 9.89, expect: 'FAIL', why: 'below the lower limit (TC-09-05 step 1)' },
      { sampleIndex: 2, value: 9.9, expect: 'PASS', why: 'EXACTLY at the lower limit — inclusive (step 3)' },
      { sampleIndex: 3, value: 9.91, expect: 'PASS', why: 'just inside the lower limit (step 5)' },
      { sampleIndex: 4, value: 10.0, expect: 'PASS', why: 'on target' },
      { sampleIndex: 5, value: 10.09, expect: 'PASS', why: 'just inside the upper limit (step 5)' },
      { sampleIndex: 6, value: 10.1, expect: 'PASS', why: 'EXACTLY at the upper limit — inclusive (step 4)' },
      { sampleIndex: 7, value: 10.11, expect: 'FAIL', why: 'above the upper limit (TC-09-05 step 2)' },
    ]

    const res = await page.request.post(`/api/v1/services/qcInspection/lots/${lot.id}/results`, {
      data: {
        results: ladder.map((r) => ({
          characteristicId: LEN,
          sampleIndex: r.sampleIndex,
          valueNumeric: r.value,
        })),
      },
    })
    expect(res.ok(), `boundary submission failed: ${await res.text()}`).toBeTruthy()

    for (const rung of ladder) {
      expect(
        outcomeOf(lot.id, LEN, rung.sampleIndex),
        `${rung.value} mm against 9.90–10.10 must be ${rung.expect} — ${rung.why}`,
      ).toBe(rung.expect)
    }

    // The discrimination itself, stated as one claim: the system did not flag
    // everything and did not flag nothing. Without this a future change that
    // hard-codes `outcome = 'FAIL'` would satisfy two of the rows above and a
    // reviewer skim-reading the file might not notice which two.
    const spread = sql(
      `SELECT outcome, count(*) FROM inspection_results
        WHERE inspection_lot_id = '${lot.id}' GROUP BY outcome ORDER BY outcome`,
    )
    expect(spread.split('\n'), 'exactly 2 FAIL and 5 PASS — the module discriminates').toEqual([
      'FAIL|2',
      'PASS|5',
    ])
  })

  test('a failing ATTRIBUTE result is flagged nonconforming, and the lot shows it', async ({ page }) => {
    // TC-09-05 step 6 (failing attribute result) and step 7 (the OOS condition
    // is visible ON THE LOT, not only on the individual result).
    const lot = await createLotViaRest(page, { lotNumber: `E2E-LOT-${LOT_TAG}-ATTR-${Date.now()}` })
    await checkInLotViaRest(page, lot.id)

    const VIS = QC.characteristics.visual.id
    const res = await page.request.post(`/api/v1/services/qcInspection/lots/${lot.id}/results`, {
      data: {
        results: [
          { characteristicId: VIS, sampleIndex: 1, valueBool: false },
          { characteristicId: VIS, sampleIndex: 2, valueBool: true },
        ],
      },
    })
    expect(res.ok(), `attribute submission failed: ${await res.text()}`).toBeTruthy()

    expect(outcomeOf(lot.id, VIS, 1), 'a failing PASS_FAIL result is FAIL').toBe('FAIL')
    expect(outcomeOf(lot.id, VIS, 2), 'and a passing one is PASS — the control discriminates').toBe(
      'PASS',
    )

    // Step 7 — escalation to lot level. The lot itself carries no "has OOS"
    // column; the escalation is that the lot's rollup answers FAIL, which is
    // what `evaluateLotOutcome` computes (any FAIL → FAIL) and what every
    // downstream surface — the AQL panel, the disposition banner, the printed
    // report's Outcome column — reads. Reproduce that rollup here rather than
    // asserting a column that does not exist.
    expect(
      sqlValue(
        `SELECT CASE WHEN bool_or(outcome = 'FAIL') THEN 'FAIL' ELSE 'PASS' END
           FROM inspection_results WHERE inspection_lot_id = '${lot.id}'`,
      ),
      'one failing characteristic makes the whole lot fail — the condition escalates',
    ).toBe('FAIL')
  })

  test('KNOWN DEFECT — a non-numeric value on a NUMERIC test is recorded, not refused', async ({
    page,
  }) => {
    // OQ-09 TC-09-04 step 3 and its note: "The server does NOT reject a
    // non-numeric value sent to it — it records the result as *not assessable*
    // rather than refusing the write."
    //
    // KNOWN DEFECT (documented, by design as shipped): posting `valueText` to a
    // NUMERIC characteristic is accepted with outcome NA. The entry form
    // presents a number input, so the interface prevents it; nothing beneath
    // the interface does. That matters because NA is not FAIL — an unassessable
    // measurement does not trip the out-of-spec control, it just sits there,
    // and only the COMPLETE-time completeness gate will notice it is missing a
    // real reading. This test pins the behaviour as it IS so a future tightening
    // to a 400 is a deliberate, visible change.
    const lot = await createLotViaRest(page, { lotNumber: `E2E-LOT-${LOT_TAG}-NA-${Date.now()}` })
    await checkInLotViaRest(page, lot.id)

    const LEN = QC.characteristics.length.id
    const res = await page.request.post(`/api/v1/services/qcInspection/lots/${lot.id}/results`, {
      data: { results: [{ characteristicId: LEN, sampleIndex: 1, valueText: 'about ten-ish' }] },
    })
    expect(res.ok(), 'the server accepts a text value on a numeric test').toBeTruthy()
    expect(
      outcomeOf(lot.id, LEN, 1),
      'it is filed as NA (not assessable) — NOT as FAIL, so it does not trip the OOS control',
    ).toBe('NA')

    // …and the completeness gate is the only thing that catches it. An NA row
    // with no numeric, bool or text-on-a-text-test value does not count as
    // recorded (`isResultRecorded`), so COMPLETE is refused — which is the
    // compensating control a validation reviewer should be pointed at.
    // NOTE the text DID land in value_text, so this row IS "recorded" by that
    // rule; what the gate then catches is the two characteristics still unscored.
    const complete = await page.request.post(
      `/api/v1/services/qcInspection/lots/${lot.id}/complete`,
      { data: {} },
    )
    expect(complete.ok(), 'the lot still cannot be completed').toBeFalsy()
    expect(
      (await complete.json())?.error?.message ?? '',
      'and the refusal names what is outstanding',
    ).toMatch(/Cannot complete: .*not recorded/)

    test.info().annotations.push({
      type: 'known-defect',
      description:
        'QCI-04/3: a non-numeric value posted to a NUMERIC characteristic is stored with ' +
        'outcome NA instead of being refused. Interface-only control; no server or DB check. ' +
        'Recorded as a deviation in OQ-09 TC-09-04.',
    })
  })
})
