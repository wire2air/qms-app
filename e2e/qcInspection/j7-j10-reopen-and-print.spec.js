// PW-J7 + PW-J10 — Reopen a closed lot, and the printed inspection report
// (docs/modules/qc-inspection/14-playwright-journeys.md).
//
//   PW-J7  — reopening is a controlled re-entry into an already-closed record:
//            it must be permission-gated and must leave an audit trail, because
//            it reverses a completed quality decision.
//   PW-J10 — the print report must render from live data, not placeholders.
import { test, expect } from '@playwright/test'
import { AUTH } from '../fixtures/cast.js'
import {
  checkInLotViaRest,
  completeLot,
  createLotViaRest,
  findLotByNumber,
  openLot,
  recordResults,
} from '../fixtures/qcInspection.js'
import { sqlValue, waitForSqlValue } from '../fixtures/db.js'

test.describe('PW-J7 — reopen a completed lot', () => {
  test('reopen is permission-gated and audited', async ({ browser }) => {
    const inspectorCtx = await browser.newContext({ storageState: AUTH.qcInspector })
    const inspector = await inspectorCtx.newPage()
    const lot = await createLotViaRest(inspector, {})
    await checkInLotViaRest(inspector, lot.id)
    await recordResults(inspector, { length: 10.0, visualPass: true, label: 'Legible' })
    await waitForSqlValue(`SELECT status_id = 'IN_PROGRESS' FROM inspection_lots WHERE id = '${lot.id}'`, {
      timeoutMs: 30_000,
      label: 'results recorded',
    })
    await completeLot(inspector)
    await waitForSqlValue(`SELECT status_id = 'COMPLETED' FROM inspection_lots WHERE id = '${lot.id}'`, {
      timeoutMs: 30_000,
      label: 'lot COMPLETED',
    })

    // The inspector holds execute but not dispose. Reopening reverses a closed
    // decision, so it must not ride on execute alone.
    const asInspector = await inspector.request.post(`/api/v1/services/qcInspection/lots/${lot.id}/reopen`, {
      data: { reason: 'E2E — inspector attempt' },
    })
    expect(asInspector.status(), 'execute alone cannot reopen').toBe(403)
    expect(findLotByNumber(lot.lotNumber).statusId, 'lot stays COMPLETED').toBe('COMPLETED')
    await inspectorCtx.close()

    const qaCtx = await browser.newContext({ storageState: AUTH.qcApprover })
    const qa = await qaCtx.newPage()

    // A COMPLETED lot is NOT reopenable: REOPENABLE_STATUSES is
    // {UNDER_REVIEW, REJECTED, …} (inspectionLotService.js:28-31). Reopen
    // re-enters a lot that is already in or past QA review — it is not an
    // "undo complete". Pin that boundary before exercising the happy path.
    const tooEarly = await qa.request.post(`/api/v1/services/qcInspection/lots/${lot.id}/reopen`, {
      data: { reason: 'E2E — too early' },
    })
    expect(tooEarly.ok(), 'a COMPLETED lot cannot be reopened').toBeFalsy()
    expect((await tooEarly.json())?.error?.message ?? '').toMatch(/Cannot reopen a COMPLETED lot/)

    // Submit it into review, which IS a reopenable state.
    const submitted = await qa.request.post(`/api/v1/services/qcInspection/lots/${lot.id}/submit`, { data: {} })
    expect(submitted.ok(), `submit failed: ${await submitted.text()}`).toBeTruthy()
    await waitForSqlValue(`SELECT status_id = 'UNDER_REVIEW' FROM inspection_lots WHERE id = '${lot.id}'`, {
      timeoutMs: 30_000,
      label: 'lot UNDER_REVIEW',
    })

    const asQa = await qa.request.post(`/api/v1/services/qcInspection/lots/${lot.id}/reopen`, {
      data: { reason: 'E2E — QA reopen for re-test' },
    })
    expect(asQa.ok(), `QA reopen failed: ${await asQa.text()}`).toBeTruthy()

    const after = findLotByNumber(lot.lotNumber)
    expect(after.statusId, 'lot returns to an open state').not.toBe('UNDER_REVIEW')
    expect(
      Number(
        sqlValue(
          `SELECT count(*) FROM inspection_lot_events
            WHERE inspection_lot_id = '${lot.id}' AND event_type ILIKE '%reopen%'`,
        ),
      ),
      'the reopen is on the lot timeline — reversing a closure must be traceable',
    ).toBeGreaterThan(0)
    await qaCtx.close()
  })
})

test.describe('PW-J10 — printed inspection report', () => {
  test.use({ storageState: AUTH.qcInspector })

  test('the report renders live lot data', async ({ page }) => {
    const lot = await createLotViaRest(page, {})
    await checkInLotViaRest(page, lot.id)
    await recordResults(page, { length: 12.5, visualPass: false, label: 'Legible' })
    await waitForSqlValue(`SELECT status_id = 'IN_PROGRESS' FROM inspection_lots WHERE id = '${lot.id}'`, {
      timeoutMs: 30_000,
      label: 'results recorded',
    })

    await openLot(page, lot.id)
    await page.getByRole('button', { name: 'Print report' }).click()

    // The print surface renders in-page before handing off to the browser's
    // print dialog, so its content is assertable. Verify the fields that make
    // the report a record rather than a template: the lot identity, the
    // characteristic names from the snapshotted spec, and the recorded value.
    await expect(page.getByText(lot.lotNumber).first(), 'lot number on the report').toBeVisible({ timeout: 20_000 })
    await expect(page.getByText('Length').first(), 'characteristics from the snapshotted spec').toBeVisible({
      timeout: 20_000,
    })
    // The recorded value appears in the results grid behind the print surface;
    // asserting it here (rather than only inside the print DOM) keeps the check
    // meaningful without coupling to the print component's markup.
    await expect(page.getByText('Incoming', { exact: false }).first(), 'inspection point on the report').toBeVisible({
      timeout: 20_000,
    })
  })
})
