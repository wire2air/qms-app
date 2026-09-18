// QC Inspection screenshots · S1 — the lot lifecycle and the retain registry.
//   Inspector: the QC tabs, a PENDING lot, check-in, the results grid with an
//   out-of-spec value and its advisory verdict, COMPLETED, and the retain
//   sample dialog.
//   QA approver: submit for disposition, the disposition control and its
//   e-signature.
//   Plus the tab-level permission denials.
//
// Personas and flow mirror PW-J1 / PW-J11 / PW-J12 / PW-J13. Reads and writes
// go through the qcInspection fixture's own helpers, including the
// reload-tolerant ones — the results grid depends on a REST write reaching
// IndexedDB via the sync service, so no new waiting strategy is invented here.
import { test, expect } from '../../../video/fixtures/videoTest.js'
import { AUTH, QC } from '../../fixtures/cast.js'
import {
  createLotViaRest,
  checkInLotViaRest,
  openLot,
  gotoQcTab,
  recordResults,
  completeLot,
  createRetainSample,
  submitForDisposition,
  findLotByNumber,
} from '../../fixtures/qcInspection.js'
import { waitForSqlValue } from '../../fixtures/db.js'
import { shooter } from '../../fixtures/screenshots.js'

const shot = shooter('qcInspection')

test.describe.serial('QC screenshots · lot lifecycle', () => {
  test('tabs, lot detail, results grid, retain sample, completion', async ({ browser }) => {
    test.setTimeout(700_000)
    const ctx = await browser.newContext({ storageState: AUTH.qcInspector })
    const page = await ctx.newPage()

    // ── The QC workspace tabs the inspector may read ───────────────────────
    await gotoQcTab(page, 'lots')
    await expect(page.getByText('Inspection queue')).toBeVisible({ timeout: 30_000 })
    await shot(page, 'list-lots')

    await gotoQcTab(page, 'retain-samples')
    await expect(page.getByText(/retain/i).first()).toBeVisible({
      timeout: 30_000,
    })
    await shot(page, 'list-retain-samples')

    // Specifications is permission-gated (inspection_spec:read) and the
    // inspector cast member does not hold it — the tab filters out and the
    // page falls back to Inspections. Capture it only when actually offered.
    await gotoQcTab(page, 'specifications')
    const specVisible = await page
      .getByText(QC.specification.name)
      .first()
      .isVisible({ timeout: 5_000 })
      .catch(() => false)
    if (specVisible) {
      await shot(page, 'list-specifications')
    } else {
      test.info().annotations.push({
        type: 'skipped-shot',
        description: 'list-specifications: inspector lacks inspection_spec:read; tab not offered',
      })
    }

    // ── A fresh PENDING lot ────────────────────────────────────────────────
    const lot = await createLotViaRest(page, {})
    expect(lot.phase, 'a new lot starts in the PENDING phase').toBe('PENDING')
    await openLot(page, lot.id)
    await shot(page, 'lot-pending')

    // ── Checked in → the results grid is writable ──────────────────────────
    await checkInLotViaRest(page, lot.id)
    await expect(page.getByRole('button', { name: 'Save results' })).toBeVisible({
      timeout: 30_000,
    })
    await shot(page, 'lot-checked-in-results-grid')

    // Length 12.5 mm against the seeded 9.90–10.10 spec — a CRITICAL
    // characteristic out of spec, so the grid renders the advisory rejection.
    await recordResults(page, {
      length: 12.5,
      visualPass: false,
      label: 'Legible',
      async beforeSave(p) {
        await shot(p, 'lot-results-entered')
      },
    })
    await waitForSqlValue(
      `SELECT inspection_phase = 'IN_PROGRESS' FROM inspection_lots WHERE id = '${lot.id}'`,
      { timeoutMs: 45_000, label: 'lot IN_PROGRESS on first result' },
    )
    await expect(page.getByText('REJECT (advisory)').first()).toBeVisible({ timeout: 30_000 })
    await shot(page, 'lot-results-out-of-spec')

    // ── Retain sample dialog ───────────────────────────────────────────────
    await createRetainSample(page, lot.id, {
      async onDialog(p) {
        await shot(p, 'retain-sample-dialog')
      },
    })
    await shot(page, 'lot-with-retain-sample')

    // ── Completed, and the separation of duties it exposes ─────────────────
    await completeLot(page)
    await waitForSqlValue(
      `SELECT inspection_phase = 'COMPLETED' FROM inspection_lots WHERE id = '${lot.id}'`,
      { timeoutMs: 45_000, label: 'lot COMPLETED' },
    )
    await openLot(page, lot.id)
    // The inspector holds execute, not dispose — no submit control for them.
    await expect(page.getByRole('button', { name: 'Submit for QA Disposition' })).toHaveCount(0)
    await shot(page, 'lot-completed-inspector-view')
    await ctx.close()

    // ── QA approver: the submit control the inspector never sees ───────────
    const qaCtx = await browser.newContext({ storageState: AUTH.qcApprover })
    const qa = await qaCtx.newPage()
    await openLot(qa, lot.id)
    await expect(qa.getByRole('button', { name: 'Submit for QA Disposition' })).toBeVisible({
      timeout: 30_000,
    })
    await shot(qa, 'lot-completed-approver-view')

    await submitForDisposition(qa, lot.id, {
      async onDialog(p) {
        await shot(p, 'submit-for-disposition-dialog')
      },
    })
    expect(findLotByNumber(lot.lotNumber).phase, 'lot is UNDER_REVIEW').toBe('UNDER_REVIEW')
    await openLot(qa, lot.id)
    await shot(qa, 'lot-under-review')

    await qaCtx.close()
  })

  test('denial states — no permission and unauthenticated', async ({ browser }) => {
    test.setTimeout(120_000)
    const denied = await browser.newContext({ storageState: AUTH.noAccess })
    const deniedPage = await denied.newPage()
    await deniedPage.goto('/qc-inspection?tab=lots', { waitUntil: 'domcontentloaded' })
    await expect(deniedPage).toHaveURL(/\/no-access/, { timeout: 30_000 })
    await shot(deniedPage, 'no-access')
    await denied.close()

    const anon = await browser.newContext() // no session
    const anonPage = await anon.newPage()
    await anonPage.goto('/qc-inspection?tab=lots', { waitUntil: 'domcontentloaded' })
    await expect(anonPage).toHaveURL(/\/signin/, { timeout: 30_000 })
    await shot(anonPage, 'signin-redirect')
    await anon.close()
  })
})
