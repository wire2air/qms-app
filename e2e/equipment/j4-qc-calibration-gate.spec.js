// EQ-J4 — the QC calibration gate: an out-of-calibration instrument blocks
// inspection-result capture, and recording a calibration clears it.
//
// WHY THIS IS THE MODULE'S MOST IMPORTANT JOURNEY. `requires_calibration` is not
// bookkeeping — it is an enforced production control. `inspectionResultService`
// refuses a measurement taken with a lapsed instrument, and that refusal is the
// only reason the whole calibration programme has teeth. It reaches ACROSS into
// QC Inspection, which is exactly why no test in either module had ever
// exercised it: it is nobody's obvious responsibility.
//
// ── AND WHY EVERY ASSERTION HERE IS AGAINST THE SERVER ──────────────────────
// The frontend half of this gate is a BANNER. `InspectionLotDetail.vue` computes
// `calibrationBlocked` and renders an amber strip that says results "will be
// blocked" — and then leaves every capture control fully enabled. There is no
// `disabled`, no guard on Save results, no client-side refusal of any kind. So a
// DOM assertion here would prove nothing about enforcement: a build that deleted
// the entire backend gate would still render the banner, and a build that
// deleted the banner would still be safe.
//
// This file therefore does two different things with two different tools:
//   • the UI is asserted to be DECORATION — the banner names the instrument AND
//     the capture control is confirmed still enabled, which is the honest
//     statement of what the frontend does;
//   • the RULE is asserted over the API, because the API is where it lives.
//
// FIXTURE OWNERSHIP. `EQUIPMENT.calExpired` (§36b row 2) is this journey's
// instrument and this journey RECALIBRATES it — that is the second half of the
// story. The seed is `ON CONFLICT DO NOTHING` and will never put it back, so
// `expireCalibration()` is the arrange step, written in SQL because no product
// surface can move a due date backwards.
import { test, expect } from '@playwright/test'
import { EQUIPMENT, SITES } from '../fixtures/cast.js'
import { sql, sqlValue, waitForSqlValue } from '../fixtures/db.js'
import {
  createEquipmentViaRest,
  createPersonaPool,
  errorMessage,
  expireCalibration,
  findEquipment,
  purgeEquipmentByCode,
  restPost,
} from '../fixtures/equipment.js'

const pool = createPersonaPool()
test.afterAll(() => pool.close())

// The §36c fixture: one product, one EFFECTIVE spec whose single characteristic
// is flagged `requires_instrument` with `preferred_equipment_id` pointing at the
// lapsed pH meter, one ACTIVE sampling plan, one template.
const GATE = EQUIPMENT.qcGate
const INSTRUMENT = EQUIPMENT.calExpired
const NEVER_CALIBRATED = { code: 'E2E-EQ-J4-NEVERCAL', name: 'E2E J4 Probe (never calibrated)' }

const LOT_PREFIX = 'E2E-EQJ4'

function purgeLots() {
  sql(
    `DELETE FROM inspection_results
      WHERE inspection_lot_id IN (SELECT id FROM inspection_lots WHERE lot_number LIKE '${LOT_PREFIX}-%')`,
  )
  sql(`DELETE FROM inspection_lots WHERE lot_number LIKE '${LOT_PREFIX}-%'`)
}

/** Rows captured against this lot's gated characteristic, live only. */
function resultRows(lotId) {
  const out = sql(
    `SELECT outcome, value_numeric, equipment_id
       FROM inspection_results
      WHERE inspection_lot_id = '${lotId}' AND deleted_at IS NULL`,
  )
  if (!out) return []
  return out.split('\n').map((l) => {
    const [outcome, valueNumeric, equipmentId] = l.split('|')
    return { outcome, valueNumeric, equipmentId: equipmentId || null }
  })
}

/**
 * A fresh OPEN/PENDING lot on the §36c fixture, checked in to the acting
 * persona, with the LAPSED instrument as its lot-level default.
 *
 * `equipmentId` on the lot is set deliberately even though the characteristic
 * already carries `preferred_equipment_id`: the frontend banner reads the LOT's
 * instrument, not the characteristic's, so without it the UI half of this
 * journey would have nothing to look at while the server half still refused —
 * and the two halves would be silently testing different resolutions.
 */
async function openGatedLot(page) {
  const lotNumber = `${LOT_PREFIX}-${Date.now()}`
  const created = await page.request.post('/api/v1/services/qcInspection/lots', {
    data: {
      lotNumber,
      inspectionPoint: 'INCOMING',
      source: 'MANUAL',
      productId: GATE.product.id,
      templateId: GATE.template.id,
      specificationId: GATE.specification.id,
      samplingPlanId: GATE.samplingPlan.id,
      equipmentId: INSTRUMENT.id,
      quantity: 50,
      batchNumber: `B-${Date.now()}`,
    },
  })
  expect(created.status(), `lot create failed: ${await created.text()}`).toBe(201)
  // Read the id out of the RESPONSE, not back out of Postgres by lot number.
  // The round trip added a second thing that could be wrong (and was: a lookup
  // that found nothing reported as "the lot row exists", which points at the
  // database when the request had already told us the answer).
  const lotId = (await created.json())?.lot?.id
  expect(lotId, `the create response carries the lot id: ${await created.text()}`).toBeTruthy()

  const checkIn = await page.request.post(
    `/api/v1/services/qcInspection/lots/${lotId}/check-in`,
    { data: {} },
  )
  expect(checkIn.ok(), `check-in failed: ${await checkIn.text()}`).toBeTruthy()
  await waitForSqlValue(
    `SELECT assigned_to IS NOT NULL FROM inspection_lots WHERE id = '${lotId}'`,
    { timeoutMs: 15_000, label: 'check-in landed in Postgres' },
  )
  return { lotId, lotNumber }
}

/** Capture one pH reading. `equipmentId` null = let the gate resolve it. */
function captureResult(page, lotId, { value = 7.0, equipmentId = undefined } = {}) {
  return page.request.post(`/api/v1/services/qcInspection/lots/${lotId}/results`, {
    data: {
      results: [
        {
          characteristicId: GATE.characteristic.id,
          sampleIndex: 1,
          valueNumeric: value,
          ...(equipmentId === undefined ? {} : { equipmentId }),
        },
      ],
    },
  })
}

test.describe('EQ-J4 · the QC calibration gate', () => {
  test.beforeAll(() => {
    purgeLots()
    purgeEquipmentByCode(NEVER_CALIBRATED.code)
    expireCalibration(INSTRUMENT.id, { daysOverdue: 45, intervalMonths: 3 })
  })

  test.afterAll(() => {
    purgeLots()
    purgeEquipmentByCode(NEVER_CALIBRATED.code)
    // Leave the shared fixture the way the seed describes it, so a re-run of
    // this file (or of anything else that reads §36b row 2) starts from "out of
    // calibration" rather than from whatever this run left.
    expireCalibration(INSTRUMENT.id, { daysOverdue: 45, intervalMonths: 3 })
  })

  test('the SERVER refuses a measurement taken with a lapsed instrument', async ({ browser }) => {
    // qcInspector holds inspection_qc:create/execute AND
    // calibration_equipment:update — the same persona runs the inspection and
    // records the calibration, which is what makes the second half of this
    // journey a single continuous story rather than two disconnected probes.
    const page = await pool.page(browser, EQUIPMENT.technician.auth)
    // Arranged per test, not only in beforeAll: this file RECALIBRATES the
    // shared instrument as part of its story, and a Playwright retry of a later
    // test re-runs that test against whatever the failed attempt left. Written
    // in SQL because no product surface can move a due date backwards.
    expireCalibration(INSTRUMENT.id, { daysOverdue: 45, intervalMonths: 3 })
    const { lotId } = await openGatedLot(page)

    const lapsed = findEquipment(INSTRUMENT.id)
    expect(
      new Date(lapsed.nextCalibrationDue).getTime(),
      'the arrange step really did lapse the instrument',
    ).toBeLessThan(Date.now())

    const refused = await captureResult(page, lotId, { value: 7.0 })
    expect(refused.status(), 'capture is refused, not merely warned about').toBe(400)
    const message = await errorMessage(refused)
    expect(message, 'the refusal names the reason, not just "invalid"').toMatch(
      /CALIBRATION_EXPIRED/,
    )
    expect(message).toContain(lapsed.name ?? 'E2E pH Meter')

    // The measurement is the thing that must not exist. A 400 with a row behind
    // it would be worse than no gate at all, because the lot would then carry a
    // result nobody could see was taken on a lapsed gauge.
    expect(
      resultRows(lotId),
      'nothing was written — the value 7.0 was in spec and would have read as a clean PASS',
    ).toEqual([])
  })

  test('an instrument that has NEVER been calibrated is refused differently, and just as hard', async ({
    browser,
  }) => {
    // The gate has two arms and they are not the same rule: `!due` is
    // NOT_CALIBRATED and `due < now` is CALIBRATION_EXPIRED. A test that only
    // covered the second would let someone "simplify" the first away, and an
    // instrument with no calibration history at all is the more dangerous of
    // the two — it has never been proven accurate even once.
    const page = await pool.page(browser, EQUIPMENT.technician.auth)
    // Minted by the ADMIN persona, not the technician. `qcInspector` holds
    // `calibration_equipment:update` and deliberately NOT `:create` — that
    // asymmetry is EQ-J3's whole subject — so a create from this page is a 403
    // that has nothing to do with calibration. The technician still does the
    // capturing below, which is the part under test.
    const registrar = await pool.page(browser, EQUIPMENT.admin.auth)
    const probe = await createEquipmentViaRest(registrar, {
      ...NEVER_CALIBRATED,
      siteId: SITES.primary.id,
      category: 'INSTRUMENT',
      requiresCalibration: true,
      calibrationInterval: 12,
      calibrationIntervalUnit: 'MONTH',
    })
    expect(findEquipment(probe.id).nextCalibrationDue, 'no calibration history').toBeNull()

    const { lotId } = await openGatedLot(page)
    const refused = await captureResult(page, lotId, { value: 7.0, equipmentId: probe.id })
    expect(refused.status()).toBe(400)
    expect(await errorMessage(refused)).toMatch(/NOT_CALIBRATED/)
    expect(resultRows(lotId)).toEqual([])
  })

  test('the gate is per-instrument, not a blanket block', async ({ browser }) => {
    // Without this, "the server refused" says nothing about whether it refuses
    // everything. Two negatives, both routed through the row-level
    // `equipmentId` override that the resolution order puts FIRST:
    //   • an in-calibration instrument is accepted while the lot default is lapsed;
    //   • an instrument that is not calibration-tracked at all is never gated.
    const page = await pool.page(browser, EQUIPMENT.technician.auth)

    const current = findEquipment(EQUIPMENT.undeletable.id)
    expect(current.requiresCalibration, 'the control row is calibration-tracked').toBe(true)
    expect(
      new Date(current.nextCalibrationDue).getTime(),
      'and it is in calibration',
    ).toBeGreaterThan(Date.now())

    const inCal = await openGatedLot(page)
    const accepted = await captureResult(page, inCal.lotId, {
      value: 7.0,
      equipmentId: EQUIPMENT.undeletable.id,
    })
    expect(accepted.ok(), `an in-calibration instrument is accepted: ${await accepted.text()}`).toBe(
      true,
    )
    const captured = resultRows(inCal.lotId)
    expect(captured).toHaveLength(1)
    expect(captured[0].outcome).toBe('PASS')
    // psql renders a bare `numeric` without trailing zeros, so compare the
    // NUMBER — a string comparison here would be an assertion about psql.
    expect(Number(captured[0].valueNumeric)).toBe(7)
    expect(captured[0].equipmentId).toBe(EQUIPMENT.undeletable.id)

    const untracked = findEquipment(EQUIPMENT.notTracked.id)
    expect(untracked.requiresCalibration, 'the contrast row is deliberately untracked').toBe(false)
    const notGated = await openGatedLot(page)
    const allowed = await captureResult(page, notGated.lotId, {
      value: 7.0,
      equipmentId: EQUIPMENT.notTracked.id,
    })
    expect(
      allowed.ok(),
      `only calibration-TRACKED instruments are gated: ${await allowed.text()}`,
    ).toBe(true)
  })

  test('the frontend half is a banner with nothing behind it — and it says so', async ({
    browser,
  }) => {
    // This test exists to record what the UI actually does, not to certify the
    // gate. It asserts BOTH that the warning is shown AND that it stops nothing,
    // because the second half is the finding: an operator can type a reading and
    // press Save with a lapsed gauge selected, and only the server's 400 stops
    // the result landing. A future change that added a real client-side
    // `disabled` would fail here — correctly, because it would mean the comment
    // in this file, in the component and in the pack are all out of date.
    const page = await pool.page(browser, EQUIPMENT.technician.auth)
    expireCalibration(INSTRUMENT.id, { daysOverdue: 45, intervalMonths: 3 })
    const { lotId } = await openGatedLot(page)

    // RELOAD AND RETRY, not a longer wait. The lot was written over REST and the
    // page reads it from IndexedDB, so it appears only once the sync broadcast
    // lands; a single goto that arrives first sits on a permanently empty
    // detail page. Same remedy (and the same reason) as
    // `fixtures/qcInspection.js checkInLotViaRest`.
    const banner = page.getByText(/is out of calibration \(due .*\) — instrument-based tests/)
    let shown = false
    for (let attempt = 0; attempt < 5 && !shown; attempt += 1) {
      await page.goto(`/qc-inspection/lots/${lotId}`)
      shown = await banner
        .waitFor({ state: 'visible', timeout: 20_000 })
        .then(() => true)
        .catch(() => false)
    }
    expect(shown, 'the operator is warned that the default instrument is out of calibration').toBe(
      true,
    )
    // `.first()` deliberately: the instrument's name renders in the banner, in
    // the rail's instrument card and in the result grid's per-row picker, so an
    // unqualified getByText is a strict-mode violation rather than an assertion.
    await expect(page.getByText(findEquipment(INSTRUMENT.id).name).first()).toBeVisible()

    // The proof that it is decoration. `Save results` renders because the lot is
    // checked in to this persona; nothing about the lapsed instrument disables it.
    const save = page.getByRole('button', { name: 'Save results' })
    await expect(save).toBeVisible({ timeout: 45_000 })
    await expect(
      save,
      'the banner carries no `disabled` — the SERVER is the only control',
    ).toBeEnabled()
    await expect(page.locator('main input[type="number"]').first()).toBeEnabled()
  })

  test('recording a calibration clears the gate, and the same capture then succeeds', async ({
    browser,
  }) => {
    const page = await pool.page(browser, EQUIPMENT.technician.auth)
    expireCalibration(INSTRUMENT.id, { daysOverdue: 45, intervalMonths: 3 })
    const { lotId } = await openGatedLot(page)

    // 1. Refused, as the arrange state demands.
    const before = await captureResult(page, lotId, { value: 7.05 })
    expect(before.status()).toBe(400)
    expect(await errorMessage(before)).toMatch(/CALIBRATION_EXPIRED/)

    // 2. Recalibrate. Through the REST route with full Part-11 evidence — the
    //    UI flow for the same act is driven end to end by EQ-J2; what matters
    //    here is that the act which clears an ENFORCED PRODUCTION CONTROL is the
    //    signed one, and that a technician holding only
    //    `calibration_equipment:update` can perform it.
    const recorded = await restPost(page, `/equipment/${INSTRUMENT.id}/record-calibration`, {
      certificateNumber: `CAL-J4-${Date.now()}`,
      calibrationVendorName: 'E2E Metrology Bench',
      method: 'PIN',
      token: '12345678',
      comments: 'EQ-J4 — clearing the QC gate',
    })
    expect(recorded.ok(), `recalibration failed: ${await recorded.text()}`).toBe(true)
    expect(
      sqlValue(`SELECT next_calibration_due > NOW() FROM equipment WHERE id = '${INSTRUMENT.id}'`),
      'the instrument is back in calibration',
    ).toBe('t')

    // 3. The identical capture now lands.
    const after = await captureResult(page, lotId, { value: 7.05 })
    expect(after.ok(), `the gate cleared: ${await after.text()}`).toBe(true)
    const rows = resultRows(lotId)
    expect(rows).toHaveLength(1)
    expect(rows[0].outcome, '7.05 is inside the 6.80–7.20 limits').toBe('PASS')
    expect(
      rows[0].equipmentId,
      'the result records WHICH instrument measured it — the preferred one, resolved by the gate',
    ).toBe(INSTRUMENT.id)

    // 4. And the calibration that cleared it is signed, so the audit chain from
    //    "this result was accepted" back to "somebody attested the gauge" is
    //    unbroken.
    expect(
      sqlValue(
        `SELECT count(*) FROM signatures
          WHERE equipment_id = '${INSTRUMENT.id}' AND user_id = '${EQUIPMENT.technician.user.id}'`,
      ),
    ).not.toBe('0')
  })

  test('a lapse AFTER capture does not retroactively invalidate the reading, but blocks the next one', async ({
    browser,
  }) => {
    // The gate is evaluated at CAPTURE time. Making that explicit matters: a
    // reader could reasonably assume a lapse invalidates results already taken,
    // and it does not — the recorded row keeps its outcome, and the evidence
    // that it was taken on an in-calibration gauge is the calibration history,
    // not a re-evaluation. What the lapse blocks is the NEXT reading.
    const page = await pool.page(browser, EQUIPMENT.technician.auth)

    // Arrange the in-calibration state HERE rather than inheriting it from the
    // test above. Sharing mutable fixture state down a file in test order means
    // a failure up there surfaces down here as "the instrument is not in
    // calibration", which points at the wrong rule entirely.
    const armed = await restPost(page, `/equipment/${INSTRUMENT.id}/record-calibration`, {
      certificateNumber: `CAL-J4-ARRANGE-${Date.now()}`,
      calibrationVendorName: 'E2E Metrology Bench',
      method: 'PIN',
      token: '12345678',
    })
    expect(armed.ok(), `arrange failed: ${await armed.text()}`).toBe(true)

    const { lotId } = await openGatedLot(page)

    const ok = await captureResult(page, lotId, { value: 7.0 })
    expect(ok.ok(), `precondition — the instrument is in calibration here: ${await ok.text()}`).toBe(
      true,
    )
    expect(resultRows(lotId)).toHaveLength(1)

    expireCalibration(INSTRUMENT.id, { daysOverdue: 45, intervalMonths: 3 })

    expect(resultRows(lotId)[0].outcome, 'the captured reading is untouched').toBe('PASS')
    const blocked = await captureResult(page, lotId, { value: 7.1 })
    expect(blocked.status(), 'but the next reading is refused').toBe(400)
    expect(await errorMessage(blocked)).toMatch(/CALIBRATION_EXPIRED/)
    expect(
      Number(resultRows(lotId)[0].valueNumeric),
      'and the refused value did not overwrite the accepted one',
    ).toBe(7)
  })
})
