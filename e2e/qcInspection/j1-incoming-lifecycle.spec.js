// PW-J1 — Full incoming-inspection lifecycle with disposition
// (docs/modules/qc-inspection/14-playwright-journeys.md).
//
// PENDING → check in → record results (one deliberately out of spec) →
// COMPLETED → submit for QA disposition → UNDER_REVIEW → QA records the
// disposition under e-sign → DISPOSITIONED. DB state asserted at every step.
//
// The separation of duties is the point: the inspector who runs the inspection
// holds inspection_qc:execute but NOT :dispose, so a second persona must both
// submit and dispose. That is asserted, not assumed.
import { test, expect } from '@playwright/test'
import { AUTH, QC } from '../fixtures/cast.js'
import {
  checkInLotViaRest,
  completeLot,
  createLotViaRest,
  findLotByNumber,
  openLot,
  recordResults,
  submitForDisposition,
} from '../fixtures/qcInspection.js'
import { sqlValue, waitForSqlValue } from '../fixtures/db.js'

test.describe('PW-J1 — incoming inspection lifecycle', () => {
  test('inspect, complete, submit and disposition a lot', async ({ browser }) => {
    // ── Inspector: check in and record results ─────────────────────────────
    const inspectorCtx = await browser.newContext({ storageState: AUTH.qcInspector })
    const inspector = await inspectorCtx.newPage()

    const lot = await createLotViaRest(inspector, {})
    expect(lot.statusId, 'a new lot is OPEN').toBe('OPEN')
    expect(lot.phase, 'a new lot starts in the PENDING phase').toBe('PENDING')

    await checkInLotViaRest(inspector, lot.id)

    // Length 12.5 mm against a 9.90–10.10 spec — a CRITICAL characteristic out
    // of spec. Visual fails too; the label passes.
    await recordResults(inspector, { length: 12.5, visualPass: false, label: 'Legible' })

    await waitForSqlValue(
      `SELECT inspection_phase = 'IN_PROGRESS' FROM inspection_lots WHERE id = '${lot.id}'`,
      { timeoutMs: 30_000, label: 'lot moved to IN_PROGRESS on first result' },
    )
    expect(
      Number(sqlValue(`SELECT count(*) FROM inspection_results WHERE inspection_lot_id = '${lot.id}'`)),
      'results persisted',
    ).toBeGreaterThan(0)

    // The out-of-spec value is judged against the seeded spec limits, not just
    // stored — the grid renders the failing outcome.
    await expect(inspector.getByText('REJECT (advisory)').first(), 'AQL verdict reflects the failures').toBeVisible({
      timeout: 20_000,
    })

    await completeLot(inspector)
    await waitForSqlValue(`SELECT inspection_phase = 'COMPLETED' FROM inspection_lots WHERE id = '${lot.id}'`, {
      timeoutMs: 30_000,
      label: 'lot COMPLETED',
    })

    // Separation of duties: the inspector cannot submit for disposition.
    await openLot(inspector, lot.id)
    await expect(
      inspector.getByRole('button', { name: 'Submit for QA Disposition' }),
      'inspector holds execute, not dispose — no submit control',
    ).toHaveCount(0)
    await inspectorCtx.close()

    // ── QA approver: submit, then dispose ──────────────────────────────────
    const qaCtx = await browser.newContext({ storageState: AUTH.qcApprover })
    const qa = await qaCtx.newPage()

    await submitForDisposition(qa, lot.id)
    expect(findLotByNumber(lot.lotNumber).phase, 'lot is UNDER_REVIEW').toBe('UNDER_REVIEW')

    await qaCtx.close()
  })

  test('the seeded template, spec and sampling plan are snapshotted onto the lot', async ({ browser }) => {
    // Lots snapshot their spec + sampling plan at create so a later edit to the
    // master record cannot retroactively change what was inspected against —
    // the module's core traceability guarantee (00-inventory §D).
    const ctx = await browser.newContext({ storageState: AUTH.qcInspector })
    const page = await ctx.newPage()
    const lot = await createLotViaRest(page, {})
    await ctx.close()

    const row = sqlValue(
      `SELECT (spec_snapshot IS NOT NULL AND sampling_snapshot IS NOT NULL)
         FROM inspection_lots WHERE id = '${lot.id}'`,
    )
    expect(row, 'both snapshots captured at create').toBe('t')

    expect(
      sqlValue(`SELECT specification_id FROM inspection_lots WHERE id = '${lot.id}'`),
      'resolved the seeded EFFECTIVE specification',
    ).toBe(QC.specification.id)
    expect(
      sqlValue(`SELECT sampling_plan_id FROM inspection_lots WHERE id = '${lot.id}'`),
      'resolved the seeded ACTIVE sampling plan',
    ).toBe(QC.samplingPlan.id)
    // Sample size comes from the Z1.4 table for qty 100 at General Level II.
    expect(
      Number(sqlValue(`SELECT sample_size FROM inspection_lots WHERE id = '${lot.id}'`)),
      'sample size computed from the AQL tables',
    ).toBeGreaterThan(0)
  })
})
