// PW-J3 — Results-completeness + checked-in-inspector gates
// (docs/modules/qc-inspection/14-playwright-journeys.md).
//
// Two independent guards on the execute path:
//   1. Nobody may record results without being the checked-in active inspector.
//   2. Disposition authority is separate from execution authority.
//
// Each is probed at the SERVER, not just the UI — a hidden button is not a
// guarantee, and this module's headline defect (finding #1) is precisely a
// case where the UI guard exists and the DB one does not.
import { test, expect } from '@playwright/test'
import { AUTH } from '../fixtures/cast.js'
import { checkInLot, createLotViaRest, findLotByNumber, openLot, recordResults } from '../fixtures/qcInspection.js'
import { sqlValue, waitForSqlValue } from '../fixtures/db.js'

test.describe('PW-J3 — execution gates', () => {
  test('results cannot be recorded until an inspector checks in', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: AUTH.qcInspector })
    const page = await ctx.newPage()
    const lot = await createLotViaRest(page, {})

    // Before check-in the page says so explicitly and offers no save control.
    await openLot(page, lot.id)
    await expect(page.getByText(/No inspector is checked in/i), 'the page states the gate').toBeVisible({
      timeout: 20_000,
    })
    await expect(
      page.getByRole('button', { name: 'Save results' }),
      'no save control before check-in',
    ).toHaveCount(0)

    // The server enforces it too — posting a result without the active-inspector
    // claim is refused, so the gate is not merely a hidden button.
    const res = await page.request.post(`/api/v1/services/qcInspection/lots/${lot.id}/results`, {
      data: { results: [{ characteristicId: null, valueNumeric: 10 }] },
    })
    expect(res.ok(), 'server refuses results with no checked-in inspector').toBeFalsy()
    expect(findLotByNumber(lot.lotNumber).phase, 'lot stays PENDING').toBe('PENDING')

    // After check-in the same surface becomes writable.
    await checkInLot(page, lot.id)
    await expect(page.getByRole('button', { name: 'Save results' })).toBeVisible({ timeout: 20_000 })
    await ctx.close()
  })

  test('an inspector cannot submit or dispose; a QA approver cannot execute', async ({ browser }) => {
    const inspectorCtx = await browser.newContext({ storageState: AUTH.qcInspector })
    const inspector = await inspectorCtx.newPage()
    const lot = await createLotViaRest(inspector, {})
    await checkInLot(inspector, lot.id)
    await recordResults(inspector, { length: 10.0, visualPass: true, label: 'Legible' })
    await waitForSqlValue(`SELECT inspection_phase = 'IN_PROGRESS' FROM inspection_lots WHERE id = '${lot.id}'`, {
      timeoutMs: 30_000,
      label: 'results recorded',
    })

    // The inspector holds execute but not dispose — the submit REST call is
    // refused server-side (inspectionLots.js submitForReview requires
    // inspection_qc:dispose), not just hidden.
    const submitRes = await inspector.request.post(`/api/v1/services/qcInspection/lots/${lot.id}/submit`, {
      data: {},
    })
    expect(submitRes.status(), 'inspector cannot submit for disposition').toBe(403)

    // ⚠️ A PATCH carrying disposition fields is ACCEPTED for this inspector.
    // That is the controller's documented design — "disposition-only edits …
    // accept the dispose permission OR create" (inspectionLots.js updateLot) —
    // and the inspector holds `create`. It is pinned here rather than asserted
    // away, because it means `create` is a superset of `dispose` for these
    // fields, which is worth knowing when reasoning about separation of duties.
    // What must NOT happen is the lot actually reaching a terminal disposition
    // without the workflow: that is the assertion with teeth.
    const dispositionRes = await inspector.request.patch(`/api/v1/services/qcInspection/lots/${lot.id}`, {
      data: { dispositionNotes: 'E2E probe — inspector-authored note' },
    })
    expect(dispositionRes.ok(), 'disposition-note edits accept create (by design)').toBeTruthy()
    const afterPatch = findLotByNumber(lot.lotNumber)
    expect(afterPatch.statusId, 'but the lot does NOT become dispositioned').not.toBe('DISPOSITIONED')
    expect(afterPatch.qualityState, 'and no quality state is set').toBeNull()
    await inspectorCtx.close()

    // …and the QA approver, who holds dispose but not execute, gets no
    // check-in control on the same lot.
    const qaCtx = await browser.newContext({ storageState: AUTH.qcApprover })
    const qa = await qaCtx.newPage()
    await openLot(qa, lot.id)
    await expect(
      qa.getByRole('button', { name: 'Check in' }),
      'QA approver holds dispose, not execute — no check-in control',
    ).toHaveCount(0)
    await qaCtx.close()
  })

  test('completing with unscored characteristics is refused by the server', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: AUTH.qcInspector })
    const page = await ctx.newPage()
    const lot = await createLotViaRest(page, {})
    await checkInLot(page, lot.id)

    // NOTE the UI offers "Complete" immediately — the completeness rule is
    // enforced in the service, not by hiding the button
    // (inspectionLotService.js:1180-1186). So the meaningful assertion is the
    // server's, and this is the gate PW-J3 exists to pin.
    const noResults = await page.request.post(`/api/v1/services/qcInspection/lots/${lot.id}/complete`, {
      data: {},
    })
    expect(noResults.ok(), 'complete with zero results is refused').toBeFalsy()
    const body = await noResults.json().catch(() => null)
    expect(body?.error?.message ?? '', 'the refusal names the unscored count').toMatch(/Cannot complete: .*not recorded/)
    expect(findLotByNumber(lot.lotNumber).phase, 'lot is not completed').not.toBe('COMPLETED')

    // Score only ONE of the three characteristics — still incomplete.
    await recordResults(page, { length: 10.0 })
    await waitForSqlValue(`SELECT count(*) > 0 FROM inspection_results WHERE inspection_lot_id = '${lot.id}'`, {
      timeoutMs: 30_000,
      label: 'partial result saved',
    })
    const partial = await page.request.post(`/api/v1/services/qcInspection/lots/${lot.id}/complete`, { data: {} })
    expect(partial.ok(), 'complete with a partially scored sample is refused').toBeFalsy()
    expect(findLotByNumber(lot.lotNumber).phase, 'still not completed').not.toBe('COMPLETED')

    // Score the rest — now it completes.
    await recordResults(page, { visualPass: true, label: 'Legible' })
    await page.getByRole('button', { name: 'Complete', exact: true }).click()
    await page.getByRole('button', { name: 'Complete', exact: true }).last().click()
    await waitForSqlValue(`SELECT inspection_phase = 'COMPLETED' FROM inspection_lots WHERE id = '${lot.id}'`, {
      timeoutMs: 30_000,
      label: 'fully scored lot completes',
    })
    await ctx.close()
  })
})
