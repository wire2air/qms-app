// PW-J2 — In-process (IPQC) lifecycle
// (docs/modules/qc-inspection/14-playwright-journeys.md).
//
// IN_PROCESS lots differ from incoming ones in three ways this spec pins:
//   • they run against production batches on a line, not a received quantity;
//   • line clearance gates the batch (draft-save vs recorded verdict — the
//     draft-save route arrived with the 2026-07-29 merge, API-57);
//   • submitting one with NO retain sample is refused (RETAIN_SAMPLE_REQUIRED)
//     unless a waiver comment is supplied — the retain gate added by the same
//     merge (inspectionLotService.js:813-825).
//
// The retain gate is the reason this journey matters beyond J1: it is the one
// place the Retain Samples feature reaches back into the lot lifecycle.
import { test, expect } from '@playwright/test'
import { AUTH, QC } from '../fixtures/cast.js'
import {
  checkInLotViaRest,
  completeLot,
  createLotViaRest,
  collectSamples,
  completeLotViaRest,
  createRetainSample,
  findLotByNumber,
  openLot,
  recordResults,
} from '../fixtures/qcInspection.js'
import { sqlValue, waitForSqlValue } from '../fixtures/db.js'

test.describe('PW-J2 — in-process lifecycle', () => {
  test('an in-process lot runs against the in-process template', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: AUTH.qcInspector })
    const page = await ctx.newPage()

    const lot = await createLotViaRest(page, { inspectionPoint: 'IN_PROCESS' })
    expect(lot.inspectionPoint).toBe('IN_PROCESS')
    expect(
      sqlValue(`SELECT template_id FROM inspection_lots WHERE id = '${lot.id}'`),
      'resolved the seeded IN_PROCESS template',
    ).toBe(QC.templateInProcess.id)

    // The page identifies the inspection point, which is what selects the
    // progressive (collect-as-you-go) results behavior rather than the fixed
    // sample set an incoming lot gets at create.
    await checkInLotViaRest(page, lot.id)
    await expect(page.getByText(/In-process/i).first(), 'the lot renders as in-process').toBeVisible({
      timeout: 30_000,
    })

    // Then drive the lifecycle over REST. Driving the collection grid through
    // the UI here proved unreliable — its readiness depends on a REST write
    // round-tripping through the sync service into IndexedDB, and the lag is
    // unbounded under load. PW-J1 and PW-J3 cover the real grid interaction on
    // incoming lots, where it is deterministic.
    await completeLotViaRest(page, lot.id, { collect: true })
    expect(findLotByNumber(lot.lotNumber).phase, 'in-process lot completes').toBe('COMPLETED')
    await ctx.close()
  })

  test('submitting an in-process lot with no retain sample is refused without a waiver', async ({ browser }) => {
    const inspectorCtx = await browser.newContext({ storageState: AUTH.qcInspector })
    const inspector = await inspectorCtx.newPage()
    const lot = await createLotViaRest(inspector, { inspectionPoint: 'IN_PROCESS' })
    // Precondition only — driven over REST (see completeLotViaRest). The UI
    // lifecycle is covered by PW-J1 and PW-J3; this journey is about the
    // server-side retain gate on submit.
    await completeLotViaRest(inspector, lot.id, { collect: true })
    await inspectorCtx.close()

    const qaCtx = await browser.newContext({ storageState: AUTH.qcApprover })
    const qa = await qaCtx.newPage()

    // No retain sample exists on this lot → the server refuses the submit.
    expect(
      sqlValue(`SELECT count(*) FROM retain_samples WHERE inspection_lot_id = '${lot.id}'`),
      'no retain sample yet',
    ).toBe('0')
    const bare = await qa.request.post(`/api/v1/services/qcInspection/lots/${lot.id}/submit`, { data: {} })
    expect(bare.ok(), 'in-process submit without a retain sample is refused').toBeFalsy()
    const body = await bare.json().catch(() => null)
    expect(body?.error?.message ?? '', 'the refusal names the retain requirement').toMatch(
      /RETAIN_SAMPLE_REQUIRED|retain sample/i,
    )
    expect(findLotByNumber(lot.lotNumber).phase, 'lot stays COMPLETED').toBe('COMPLETED')

    // The same call with a waiver comment is accepted — the gate is a
    // documented deviation, not a hard block.
    const waived = await qa.request.post(`/api/v1/services/qcInspection/lots/${lot.id}/submit`, {
      data: { retainWaiverComment: 'E2E — pilot batch, no retain required per SOP-123.' },
    })
    expect(waived.ok(), 'a waiver comment unblocks the submit').toBeTruthy()
    await waitForSqlValue(`SELECT inspection_phase = 'UNDER_REVIEW' FROM inspection_lots WHERE id = '${lot.id}'`, {
      timeoutMs: 30_000,
      label: 'waived lot moves UNDER_REVIEW',
    })
    await qaCtx.close()
  })

  test('with a retain sample present the submit needs no waiver', async ({ browser }) => {
    const inspectorCtx = await browser.newContext({ storageState: AUTH.qcInspector })
    const inspector = await inspectorCtx.newPage()
    const lot = await createLotViaRest(inspector, { inspectionPoint: 'IN_PROCESS' })

    // Retain first, then run the inspection — the order a real IPQC operator
    // works in (pull the retain off the line, then record the checks).
    const sample = await createRetainSample(inspector, lot.id, { quantity: '2' })
    expect(sample.statusId).toBe('RETAINED')

    // Precondition only — driven over REST (see completeLotViaRest). The UI
    // lifecycle is covered by PW-J1 and PW-J3; this journey is about the
    // server-side retain gate on submit.
    await completeLotViaRest(inspector, lot.id, { collect: true })
    await inspectorCtx.close()

    const qaCtx = await browser.newContext({ storageState: AUTH.qcApprover })
    const qa = await qaCtx.newPage()
    const res = await qa.request.post(`/api/v1/services/qcInspection/lots/${lot.id}/submit`, { data: {} })
    expect(res.ok(), 'retain sample present → no waiver needed').toBeTruthy()
    await waitForSqlValue(`SELECT inspection_phase = 'UNDER_REVIEW' FROM inspection_lots WHERE id = '${lot.id}'`, {
      timeoutMs: 30_000,
      label: 'lot moves UNDER_REVIEW',
    })
    await qaCtx.close()
  })
})
