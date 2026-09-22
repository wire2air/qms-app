// PW-J18 — The inspection report's CONTENT inventory (URS-QCI-09; OQ-09
// TC-09-09 steps 2 and 3).
//
// ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────
//
// The coverage matrix (§12, URS-QCI-09) is unusually specific about what is and
// is not proven:
//
//   "Proven: the report renders live data rather than placeholders. Not
//    covered: its content inventory — per-characteristic results, defects,
//    disposition and out-of-specification marking are not asserted, and the
//    report carries no defects section."
//
// PW-J10 asserts three strings: the lot number, the word "Length", and
// "Incoming". That establishes the report is wired to the record. It does not
// establish that the report is a COMPLETE record of the inspection, which is
// what TC-09-09 step 2 asks ("Confirm it shows lot detail, specification,
// sampling plan, per-characteristic results, defects and disposition") and what
// a reviewer attaching the PDF as objective evidence actually depends on.
//
// Step 3 — "out-of-specification results are identifiable on the report" — is
// the sharper of the two. A report that lists a 12.5 mm reading next to a
// 9.90–10.10 specification but does not SAY it failed leaves the reader to do
// the arithmetic, which is the exact failure mode OQ-09 §1 says makes a QC
// module worthless.
//
// ── HOW THE REPORT IS REACHED ──────────────────────────────────────────────
//
// `InspectionLotDetail`'s print handler opens a standalone page:
//
//     /print?module=InspectionLot&id=<lotId>
//
// (`window.open(getCompanyPath('/print?…'))` → `src/pages/print.vue` →
// `PrintShell` → `InspectionLotPrint.vue`). Navigating straight there is the
// supported entry, not a shortcut — it is the exact URL the button opens, and
// it avoids PW-J10's fight with the action-overflow menu, which is UI plumbing
// this file is not about.
//
// The print page renders from IndexedDB like every other surface, so it needs
// the syncEngine to have caught up with the REST writes that built the lot.
// `openReport` below reloads until the report's own title block appears.
//
// ── WHAT THE REPORT DOES NOT CARRY ─────────────────────────────────────────
//
// There is no Defects section. `InspectionLotPrint.vue` has Sampling,
// Production Lots (in-process only), Results, Sample Collections (in-process
// only) and Notes — logged `inspection_defects` appear in none of them. The
// last test pins that absence rather than leaving TC-09-09 step 2's "defects"
// clause silently unmet.
import { test, expect } from '@playwright/test'
import { AUTH, COMPANY_ID, ESIGN_PIN, QC, USERS } from '../fixtures/cast.js'
import {
  checkInLotViaRest,
  createLotViaRest,
  findLotByNumber,
  openLot,
} from '../fixtures/qcInspection.js'
import { sql, sqlValue } from '../fixtures/db.js'

const LOT_TAG = 'J18'

function purgeJ18Lots() {
  const lotScope = `SELECT id FROM inspection_lots
     WHERE company_id = '${COMPANY_ID}' AND lot_number LIKE 'E2E-LOT-${LOT_TAG}-%'`
  sql(`
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
}

function dispositionTypeId(code) {
  return sqlValue(
    `SELECT id FROM nc_disposition_types
      WHERE company_id = '${COMPANY_ID}' AND code = '${code}' AND deleted_at IS NULL LIMIT 1`,
  )
}

function dispositionTaskId(lotId) {
  return sqlValue(
    `SELECT id FROM task_instances
      WHERE entity_type = 'InspectionLot' AND entity_id = '${lotId}'
        AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1`,
  )
}

/**
 * Open the standalone print page for a lot and wait for it to hydrate FULLY.
 *
 * Reload-tolerant for the same reason `openLot` is: the report reads the lot,
 * its results and its lookups out of IndexedDB, which the syncEngine populates
 * asynchronously after the REST writes that built the record.
 *
 * The readiness sentinel is deliberately NOT the report's <h1>. The heading
 * renders as soon as PrintShell resolves the module component, and the
 * characteristics come from the lot's own `spec_snapshot` — so a half-synced
 * page shows the full Results TABLE with every characteristic listed and every
 * value cell reading "—", which looks exactly like a finished report whose
 * results are all missing. Waiting on the <h1> made this file assert against
 * that intermediate state.
 *
 * So `expectText` names something that only appears once the InspectionResult
 * rows themselves have landed — the measured value, or the disposition — and
 * the loop reloads until it does. A caller that passes nothing still gets the
 * heading-only wait, which is right for the defect test: it asserts an ABSENCE,
 * so it must wait on something that IS expected to arrive first.
 */
async function openReport(page, lotId, expectText = null) {
  // Prime IndexedDB from the lot's own detail page first.
  //
  // The print page is a NAKED route: it renders one component and waits for
  // whatever the syncEngine happens to have. In a browser context whose only
  // navigation has been `/print`, the bootstrap for InspectionResult may still
  // be in flight, and the report then paints its characteristics (which come
  // from the lot's spec_snapshot, already on the lot row) with empty value
  // cells — a complete-looking report with no results in it. Loading the detail
  // page first is what PW-J1/J3/J10 all do implicitly, and `openLot`'s sentinel
  // waits for the record to be readable, so by the time print opens the rows
  // are there.
  await openLot(page, lotId)
  // …and wait there until the RESULT ROWS are actually in IndexedDB.
  //
  // `openLot`'s sentinel only proves the LOT arrived. InspectionResult is a
  // separate model with its own bootstrap, and it is the one the report's value
  // cells depend on — a print page opened before it lands renders the full
  // characteristic table with every value reading "—". The grid itself is no
  // use as a signal (it puts numbers inside <input type=number>, which
  // getByText cannot see), but the AQL Acceptance panel IS derived from those
  // rows and renders as text, so its verdict appearing means the results are
  // in the store. Non-fatal: a lot with no failing result never shows it, and
  // the print loop below retries and reports either way.
  await page
    .getByText(/\b(REJECT|ACCEPT)\b \(advisory\)/)
    .first()
    .waitFor({ state: 'visible', timeout: 60_000 })
    .catch(() => {
      /* fall through to the print-page loop */
    })
  for (let attempt = 0; attempt < 8; attempt += 1) {
    await page.goto(`/print?module=InspectionLot&id=${lotId}`)
    const headingUp = await page
      .getByRole('heading', { name: 'Inspection Report' })
      .waitFor({ state: 'visible', timeout: 15_000 })
      .then(() => true)
      .catch(() => false)
    if (headingUp) {
      if (!expectText) return
      const hydrated = await page
        .getByText(expectText, { exact: false })
        .first()
        .waitFor({ state: 'visible', timeout: 8_000 })
        .then(() => true)
        .catch(() => false)
      if (hydrated) return
    }
    await page.waitForTimeout(2_000)
  }
  throw new Error(
    `openReport: the print page for lot ${lotId} never hydrated` +
      (expectText ? ` (waiting for ${JSON.stringify(expectText)})` : ''),
  )
}

/**
 * The one report section whose <h2> is `heading`.
 *
 * Scoped to `section.qc-print-section`, NOT to a bare `section` filtered by its
 * heading: PrintLayout wraps the module body in its own
 * `<section class="print-body-section">`, so a bare filter matches BOTH that
 * wrapper and the inner section, and every `toContainText` on the result is
 * then really asking "does the whole report contain this?" — which is the weak
 * assertion this file exists to replace. `.first()` pins the innermost match.
 */
function section(page, heading) {
  return page
    .locator('section.qc-print-section')
    .filter({ has: page.getByRole('heading', { name: heading, exact: true }) })
    .first()
}

test.describe('PW-J18 — the inspection report is a complete record, not a header', () => {
  test.beforeAll(() => purgeJ18Lots())
  test.afterAll(() => purgeJ18Lots())

  test('the report carries lot detail, the sampling plan, per-characteristic results and the OOS marking', async ({
    browser,
  }) => {
    // OQ-09 TC-09-09 steps 1, 2 and 3 on a lot that has something to say: one
    // CRITICAL reading out of spec, one attribute pass, one text observation.
    // A uniformly passing lot cannot demonstrate step 3 at all.
    //
    // The lot is BUILT by the inspector (only they hold `inspection_qc:execute`,
    // so only they can check in and record) and READ by the QA approver. That
    // split is not cosmetic: the approver's context is the one that reliably
    // hydrates this report — see the annotation at the end of this test, which
    // records why, and what the inspector's own context shows instead.
    const inspectorCtx = await browser.newContext({ storageState: AUTH.qcInspector })
    const inspector = await inspectorCtx.newPage()

    const lot = await createLotViaRest(inspector, {
      lotNumber: `E2E-LOT-${LOT_TAG}-CONTENT-${Date.now()}`,
    })
    await checkInLotViaRest(inspector, lot.id)
    const results = await inspector.request.post(
      `/api/v1/services/qcInspection/lots/${lot.id}/results`,
      {
        data: {
          results: [
            { characteristicId: QC.characteristics.length.id, sampleIndex: 1, valueNumeric: 12.5 },
            { characteristicId: QC.characteristics.visual.id, sampleIndex: 1, valueBool: true },
            { characteristicId: QC.characteristics.label.id, sampleIndex: 1, valueText: 'Legible' },
          ],
        },
      },
    )
    expect(results.ok(), `results failed: ${await results.text()}`).toBeTruthy()
    await inspectorCtx.close()

    const ctx = await browser.newContext({ storageState: AUTH.qcApprover })
    const page = await ctx.newPage()

    // Hydration gate: the measured value only exists once the InspectionResult
    // rows reach IndexedDB. Without it the report renders its characteristics
    // (which come from the lot's spec snapshot) with empty value cells.
    await openReport(page, lot.id, '12.5')

    // ── Step 1: the report is produced, and it is THIS lot's ────────────────
    await expect(page.getByText(lot.lotNumber).first(), 'the report identifies the lot').toBeVisible({
      timeout: 20_000,
    })

    // ── Step 2a: lot detail ─────────────────────────────────────────────────
    // The header table is the "lot detail" clause. Everything asserted here is
    // a column of the LOT ROW itself — the fields the report can render without
    // resolving anything. The reference fields (item, supplier, inspector) are
    // a separate matter and are pinned as a defect at the end of this test.
    const header = page.locator('table.qc-print-meta')
    await expect(header, 'the report opens with a lot-detail block').toBeVisible({ timeout: 20_000 })
    await expect(header, 'the inspection number').toContainText(lot.lotNumber)
    await expect(header, 'where in the process it was inspected').toContainText('Incoming')
    await expect(header, 'the quantity presented').toContainText('100')
    await expect(header, 'the derived sample size').toContainText(
      sqlValue(`SELECT sample_size FROM inspection_lots WHERE id = '${lot.id}'`),
    )
    await expect(header, 'and the batch the goods arrived under').toContainText(
      sqlValue(`SELECT batch_number FROM inspection_lots WHERE id = '${lot.id}'`),
    )

    // ── Step 2b: the sampling plan it was judged against ────────────────────
    // This is the clause PW-J10 misses entirely, and it is the one that makes
    // the report defensible: without the plan, the sample size is an unexplained
    // number and the accept/reject criteria are invisible.
    const sampling = section(page, 'Sampling')
    await expect(sampling, 'the report names the sampling plan').toContainText(QC.samplingPlan.name)
    await expect(sampling, 'the standard it derives from').toContainText('Z1.4-2008')
    await expect(sampling, 'the inspection level').toContainText('II')
    // The code letter and sample size are read off the lot rather than typed
    // here, so a seed change moves the assertion with the product.
    const codeLetter = sqlValue(
      `SELECT (sampling_snapshot->>'codeLetter') FROM inspection_lots WHERE id = '${lot.id}'`,
    )
    const sampleSize = sqlValue(`SELECT sample_size FROM inspection_lots WHERE id = '${lot.id}'`)
    await expect(sampling, 'the sample-size code letter').toContainText(codeLetter)
    await expect(sampling, 'and the derived sample size').toContainText(sampleSize)
    // Per-severity acceptance criteria — Accept ≤ / Reject ≥ per defect class.
    await expect(sampling, 'the acceptance table lists each defect class').toContainText('CRITICAL')
    await expect(sampling, 'including MAJOR').toContainText('MAJOR')
    await expect(sampling, 'and MINOR').toContainText('MINOR')

    // ── Step 2c: PER-CHARACTERISTIC results ─────────────────────────────────
    // Every characteristic on the spec, each with its limits and its measured
    // value. "Length appears somewhere" (PW-J10) is not this claim.
    const resultsSection = section(page, 'Results')
    for (const c of [QC.characteristics.length, QC.characteristics.visual, QC.characteristics.label]) {
      await expect(
        resultsSection,
        `the results table lists ${c.name} — every characteristic on the spec is accounted for`,
      ).toContainText(c.name)
    }
    await expect(
      resultsSection,
      'the specification limits are printed beside the reading, so the reader can check the judgement',
    ).toContainText('9.90')
    await expect(resultsSection, 'both limits').toContainText('10.10')
    await expect(resultsSection, 'and the measured value itself').toContainText('12.5')
    await expect(resultsSection, 'the text observation is carried too').toContainText('Legible')

    // ── Step 3: the OOS result is IDENTIFIABLE, not left to the reader ──────
    // The Outcome column is the marking. Asserting on the row scoped to Length
    // — rather than "FAIL appears on the page" — is what proves the mark is
    // attached to the failing characteristic and not to a passing one.
    const lengthRow = resultsSection.locator('tr').filter({ hasText: QC.characteristics.length.name })
    await expect(lengthRow, 'the out-of-spec characteristic is marked FAIL on its own row').toContainText(
      'FAIL',
    )
    const visualRow = resultsSection.locator('tr').filter({ hasText: QC.characteristics.visual.name })
    await expect(
      visualRow,
      'and the conforming one is marked PASS — the report discriminates, it does not just warn',
    ).toContainText('PASS')

    // The marking is also visually distinct, which is what "clearly marked"
    // means on a printed page a reviewer scans rather than reads. Asserted on
    // the class the component applies, not on a colour.
    await expect(
      resultsSection.locator('td.qc-print-bad'),
      'the failing outcome is styled as adverse, so it survives a black-and-white skim',
    ).toHaveCount(1)

    // ── OBSERVATION: the header's REFERENCE fields are not deterministic ──
    //
    // Item and Supplier are resolved out of IndexedDB
    // (`db.Product.findByPk(lot.productId)`, `db.Supplier.findByPk(...)`), and
    // the print route is a naked page with no loading state: it renders
    // whatever the syncEngine happens to hold at first paint and never
    // re-resolves. Across runs of this exact test the same lot printed "Item —
    // Supplier —" and, on a retry moments later, printed both — so the report's
    // content depends on bootstrap timing rather than on the record.
    //
    // That is NOT asserted either way here, because either direction would be
    // a coin flip dressed up as a control. What IS asserted is the invariant
    // underneath it: the data exists on the row, so any blank on the report is
    // the report's doing. The annotation below carries the finding.
    expect(
      sqlValue(`SELECT product_id FROM inspection_lots WHERE id = '${lot.id}'`),
      'the record knows the item, whatever the report prints',
    ).toBe(QC.product.id)
    expect(
      sqlValue(`SELECT supplier_id FROM inspection_lots WHERE id = '${lot.id}'`),
      'and the supplier',
    ).toBe(QC.supplier.id)

    expect(
      sqlValue(`SELECT assigned_to FROM inspection_lots WHERE id = '${lot.id}'`),
      'and who inspected it',
    ).toBe(USERS.qcInspector.id)

    // The inspector's NAME is not asserted either, and that is the finding.
    // Across runs of this test the same header printed "Inspector Ivan
    // Inspector" and "Inspector —" — so it is not that catalogue models are
    // unreliable and people are fine; EVERY reference on this header is a race
    // against the syncEngine's bootstrap. There is no subset of the reference
    // fields a test could assert without becoming a coin flip, which is
    // precisely why the finding is worth recording rather than worked around.

    await ctx.close()

    test.info().annotations.push({
      type: 'known-defect',
      description:
        'QCI-09 non-deterministic report content: InspectionLotPrint.vue resolves the item, supplier, ' +
        'inspector, creator and disposition out of IndexedDB (db.X.findByPk). The print route is ' +
        'a naked page with no loading state that renders whatever the syncEngine has at first ' +
        'paint, and each of those is a separate model with a separate bootstrap — several of ' +
        'which the viewer may not even be granted (qcInspector holds no supplier_management). ' +
        'Observed directly across repeated runs of one test: the same lot printed Item, ' +
        'Supplier and Inspector by name on some runs and an em dash for all three on others, ' +
        'with no difference but timing. Nothing on the page distinguishes "no supplier" from ' +
        '"supplier not loaded yet". The Results table shows the same failure mode in a cold ' +
        'context: every characteristic listed, every value blank. A ' +
        'printed QC record that silently omits what was inspected is not safe to attach as ' +
        'objective evidence. Fix: resolve these server-side for the report, or give the print ' +
        'page an explicit not-ready state.',
    })
  })

  test('the report shows the QA disposition and its reasoning once the lot is closed out', async ({
    browser,
  }) => {
    // The remaining clause of TC-09-09 step 2. A report produced mid-inspection
    // cannot show a disposition, so the one PW-J10 renders necessarily omits it
    // — which is why this needs its own dispositioned lot rather than an extra
    // assertion on the test above.
    const inspectorCtx = await browser.newContext({ storageState: AUTH.qcInspector })
    const inspector = await inspectorCtx.newPage()
    const qaCtx = await browser.newContext({ storageState: AUTH.qcApprover })
    const qa = await qaCtx.newPage()

    const lot = await createLotViaRest(inspector, {
      lotNumber: `E2E-LOT-${LOT_TAG}-DISPOSED-${Date.now()}`,
    })
    await checkInLotViaRest(inspector, lot.id)
    await inspector.request.post(`/api/v1/services/qcInspection/lots/${lot.id}/results`, {
      data: {
        results: [
          { characteristicId: QC.characteristics.length.id, sampleIndex: 1, valueNumeric: 12.5 },
          { characteristicId: QC.characteristics.visual.id, sampleIndex: 1, valueBool: true },
          { characteristicId: QC.characteristics.label.id, sampleIndex: 1, valueText: 'Legible' },
        ],
      },
    })
    const complete = await inspector.request.post(
      `/api/v1/services/qcInspection/lots/${lot.id}/complete`,
      { data: {} },
    )
    expect(complete.ok(), `complete failed: ${await complete.text()}`).toBeTruthy()
    const submit = await qa.request.post(`/api/v1/services/qcInspection/lots/${lot.id}/submit`, {
      data: {},
    })
    expect(submit.ok(), `submit failed: ${await submit.text()}`).toBeTruthy()
    await inspectorCtx.close()

    const REASONING = 'PW-J18 — length 12.5 mm exceeds the 10.10 mm upper limit; return for rework.'
    await qa.request.patch(`/api/v1/services/qcInspection/lots/${lot.id}`, {
      data: { dispositionTypeId: dispositionTypeId('REWORK'), dispositionNotes: REASONING },
    })
    const signed = await qa.request.post(
      `/api/v1/services/taskInstances/${dispositionTaskId(lot.id)}/action`,
      { data: { action: 'APPROVED', method: 'PIN', token: ESIGN_PIN } },
    )
    expect(signed.ok(), `signed disposition failed: ${await signed.text()}`).toBeTruthy()
    expect(findLotByNumber(lot.lotNumber).qualityState, 'the lot is rejected').toBe('REJECTED')

    // The approver prints the report — this is the artefact that gets attached
    // as objective evidence, so it must carry the decision, not just the data.
    // Hydration gate: 'Rework' is resolved from the NcDispositionType model,
    // so it is the last thing to arrive on this report.
    await openReport(qa, lot.id, 'Rework')

    const header = qa.locator('table.qc-print-meta')
    await expect(
      header,
      'the recorded disposition appears in the report header, by its display name',
    ).toContainText('Rework')
    await expect(header, 'alongside the closed status').toContainText('Closed')

    // …and the reasoning, which is what turns a disposition from a label into
    // a decision someone can review.
    const notes = section(qa, 'Notes')
    await expect(notes, 'the QA reasoning is reproduced on the report').toContainText(REASONING)

    await qaCtx.close()
  })

  test('KNOWN DEFECT — logged defects appear nowhere on the report', async ({ browser }) => {
    // OQ-09 TC-09-09 step 2 asks the report to show "per-characteristic
    // results, defects and disposition". Two of the three are covered above.
    // The third is not implemented: `InspectionLotPrint.vue` renders Sampling,
    // Production Lots, Results, Sample Collections and Notes — there is no
    // Defects section, and `inspection_defects` is not queried by the component
    // at all.
    //
    // The consequence is specific. An attributes inspection that logs defects
    // against the catalogue — the very rows the Ac/Re table on the SAME report
    // is there to be compared against — produces a report whose acceptance
    // table has criteria and no counts. The reader is shown "Reject ≥ 2" and
    // given nothing to compare it to.
    //
    // Pinned as it IS, per the coverage note's own wording ("the report carries
    // no defects section"). A reviewer executing TC-09-09 records this clause
    // as a deviation.
    const ctx = await browser.newContext({ storageState: AUTH.qcInspector })
    const page = await ctx.newPage()

    const lot = await createLotViaRest(page, {
      lotNumber: `E2E-LOT-${LOT_TAG}-DEFECTS-${Date.now()}`,
    })
    await checkInLotViaRest(page, lot.id)
    const logged = await page.request.post(`/api/v1/services/qcInspection/lots/${lot.id}/defects`, {
      data: { defects: [{ defectCatalogId: QC.defect.id, quantity: 3, notes: 'PW-J18 defect probe' }] },
    })
    expect(logged.ok(), `defect capture failed: ${await logged.text()}`).toBeTruthy()

    // The defects ARE on the record — this is not a case of nothing to render.
    expect(
      sqlValue(
        `SELECT quantity FROM inspection_defects
          WHERE inspection_lot_id = '${lot.id}' AND deleted_at IS NULL`,
      ),
      'three SCRATCH defects are logged against the lot',
    ).toBe('3')

    // Hydration gate matters MOST here: this test asserts an absence, and an
    // absence is trivially satisfied by a page that has not finished loading.
    // Wait on the acceptance table — which IS expected — before concluding the
    // defect is missing from a fully-rendered report.
    await openReport(page, lot.id, 'Reject')

    // No Defects section exists…
    await expect(
      page.getByRole('heading', { name: 'Defects', exact: true }),
      'the report has no Defects section',
    ).toHaveCount(0)
    // …and the logged defect's catalogue code appears nowhere on the page.
    await expect(
      page.getByText(QC.defect.code, { exact: false }),
      `the logged defect "${QC.defect.code}" is absent from the whole report`,
    ).toHaveCount(0)

    // The asymmetry that makes this worth recording: the acceptance CRITERIA
    // are printed, so the report shows the reader the bar without showing them
    // the measurement against it.
    await expect(
      section(page, 'Sampling'),
      'yet the Accept/Reject criteria the defects would be judged against ARE printed',
    ).toContainText('Reject')

    await ctx.close()

    test.info().annotations.push({
      type: 'known-defect',
      description:
        'QCI-09: InspectionLotPrint.vue renders no Defects section and never queries ' +
        'inspection_defects, so logged attributes-inspection defects are absent from the printed ' +
        'report — while the per-severity Accept/Reject table IS printed, leaving criteria with no ' +
        'counts to compare. OQ-09 TC-09-09 step 2 names defects as required report content; ' +
        'record as a deviation.',
    })
  })
})
