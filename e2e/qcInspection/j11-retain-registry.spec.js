// PW-J11 — Retain registry happy path (docs/modules/qc-inspection/14-playwright-journeys.md;
// journey J-12, requirements R24/R26).
//
// The retain-samples surface shipped 2026-07-29 with ZERO automated coverage
// (security-review finding #15). This is the first test of it.
//
// Covers: create a retain sample from a lot's card → RS number, RETAINED
// status, SEALED seal state, denormalized lot number on the record, and a
// CREATED custody event → then move it (storage position) and assert the MOVED
// custody event.
//
// Deliberately NOT covered here: WITHDRAWN / EXAMINED events. Phase 1 mints
// only CREATED / MOVED / SEAL_BROKEN / DISPOSED — the other two are declared
// vocabulary with no code path, so asserting them would be asserting a feature
// that does not exist.
import { test, expect } from '@playwright/test'
import { AUTH, QC } from '../fixtures/cast.js'
import {
  createLotViaRest,
  createRetainSample,
  findRetainSample,
  retainEventTypes,
} from '../fixtures/qcInspection.js'
import { waitForSqlValue } from '../fixtures/db.js'

// The QC inspector holds retain_samples create/update through the module's own
// grants — NOT the retain custodian, who cannot reach the lot page at all
// (finding #18, probed in j13-permission-gates.spec.js).
test.use({ storageState: AUTH.qcInspector })

test.describe('PW-J11 — retain registry', () => {
  test('create a retain sample from a lot, then move it', async ({ page }) => {
    const lot = await createLotViaRest(page, {})

    // ── Create ──────────────────────────────────────────────────────────────
    const sample = await createRetainSample(page, lot.id, { quantity: '6', position: 'Shelf B, Box 12' })

    expect(sample.rsNumber, 'RS number minted from the RS counter').toMatch(/^RS-\d{6}$/)
    expect(sample.statusId, 'new samples are RETAINED').toBe('RETAINED')
    expect(sample.sealState, 'new samples are SEALED').toBe('SEALED')
    expect(sample.inspectionLotId, 'linked to the source lot').toBe(lot.id)
    expect(sample.storageLocationId).toBe(QC.storageLocation.id)
    expect(sample.position).toBe('Shelf B, Box 12')
    // Denormalized at create so the label/register stand alone even if the lot
    // is later edited (migration 20260725000100).
    expect(sample.lotNumber, 'lot number denormalized onto the retain record').toBe(lot.lotNumber)
    // retain_until is computed app-side (expiry + 12mo when known, else
    // retained + 24mo) — assert it exists rather than pinning a date.
    expect(sample.retainUntil, 'a destroy-by date is computed at create').toBeTruthy()

    expect(retainEventTypes(sample.id), 'CREATED custody event').toContain('CREATED')

    // ── The record is visible on its own detail page ────────────────────────
    await page.goto(`/qc-inspection/retain-samples/${sample.id}`)
    await expect(page.getByText(sample.rsNumber).first()).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText('Retained').first()).toBeVisible({ timeout: 20_000 })

    // ── And on the registry list ───────────────────────────────────────────
    await page.goto('/qc-inspection?tab=retain-samples')
    await expect(page.getByText(sample.rsNumber).first()).toBeVisible({ timeout: 20_000 })

    // ── Move it — inline autosave on the detail page ────────────────────────
    // The detail page's Position field carries a label but NO placeholder
    // (RetainSampleDetail.vue:239-240), unlike the create dialog's — so anchor
    // on the BaseField label and take the input it wires via htmlFor.
    await page.goto(`/qc-inspection/retain-samples/${sample.id}`)
    const positionField = page.getByLabel('Position', { exact: true })
    await expect(positionField).toBeVisible({ timeout: 20_000 })
    await positionField.fill('Shelf C, Box 03')
    // Inline edits autosave on debounce; blur to flush without racing it.
    await positionField.blur()

    await waitForSqlValue(
      `SELECT position = 'Shelf C, Box 03' FROM retain_samples WHERE id = '${sample.id}'`,
      { timeoutMs: 30_000, label: 'retain sample moved' },
    )
    const moved = findRetainSample(sample.id)
    expect(moved.position).toBe('Shelf C, Box 03')
    expect(moved.statusId, 'moving does not change status').toBe('RETAINED')

    // The service mints MOVED when the location/position changes. If this
    // assertion fails while `position` did change, the custody trail is
    // incomplete — that is a real defect, not a flaky test.
    expect(retainEventTypes(sample.id), 'MOVED custody event').toContain('MOVED')
  })
})
