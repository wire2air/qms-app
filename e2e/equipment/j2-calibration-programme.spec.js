// EQ-J2 — the calibration programme: record a calibration, watch the schedule
// roll forward, watch the register's badge follow it.
//
// WHY THIS FILE EXISTS. `next_calibration_due` is not bookkeeping. The QC
// capture gate (`inspectionResultService.js`) refuses a measurement taken with a
// lapsed instrument, and `POST /equipment/:id/record-calibration` is the single
// call that clears that refusal — it re-opens an instrument for production use.
// Nothing had ever driven it through a browser.
//
// It is also the only place the module SHOWS calibration status at all. There is
// no detail page, no print module for a calibration certificate and no dashboard
// widget: the register's amber/red date badge is the whole surface, so a rule
// that stopped painting it would be invisible to every other layer of tests.
//
// ── The 2026-09-08 Part 11 window ───────────────────────────────────────────
// This journey was specified against the OLD endpoint — a bare POST with an
// empty body — and is written against the new one. `record-calibration` now
// requires an e-signature (`signatures.equipment_id`, migration 20260911110000)
// plus certificate and vendor evidence (20260911120000), and the register's
// quick action opens `RecordCalibrationDialog` to collect them rather than
// firing the POST off the row. Both halves are asserted here: the UI flow end to
// end, and — because a dialog can only ever be a convenience — the SERVER
// refusing each piece of evidence individually over REST.
//
// FIXTURES ARE MINTED PER RUN, not seeded. This journey MUTATES the instrument
// it records against (that is the journey), and `database/e2e-seed.sql` is
// `ON CONFLICT DO NOTHING`, so a seeded row is never put back: the second run
// would assert a roll-forward against an instrument the first run already
// recalibrated. That is the quietest possible false green.
import { test, expect } from '@playwright/test'
import { EQUIPMENT, SITES } from '../fixtures/cast.js'
import { signWithPin } from '../fixtures/esign.js'
import { sql, sqlRow, sqlValue } from '../fixtures/db.js'
import {
  calibrationBadgeClass,
  cellFor,
  createEquipmentViaRest,
  createPersonaPool,
  daysBetween,
  errorMessage,
  expireCalibration,
  findEquipment,
  findEquipmentByCode,
  openRegister,
  purgeEquipmentByCode,
  recordCalibrationFromRow,
  recordPmFromRow,
  registerRow,
  restPost,
  signaturesForEquipment,
} from '../fixtures/equipment.js'

const pool = createPersonaPool()
test.afterAll(() => pool.close())

// Constant codes, purged in beforeAll — the same reasoning as EQ-J1. Playwright
// restarts the worker after a failed test and re-evaluates module scope, so a
// timestamped code would change mid-file and a later test would hunt for a row
// created under a different name.
const OVERDUE = { code: 'E2E-EQ-J2-OVERDUE', name: 'E2E J2 pH Meter (overdue)' }
const DUE_SOON = { code: 'E2E-EQ-J2-DUESOON', name: 'E2E J2 Micrometer (due soon)' }
const CLEAR = { code: 'E2E-EQ-J2-CLEAR', name: 'E2E J2 Balance (in calibration)' }
const UNTRACKED = { code: 'E2E-EQ-J2-UNTRACKED', name: 'E2E J2 Trolley (uncontrolled)' }
const BOTH = { code: 'E2E-EQ-J2-BOTH', name: 'E2E J2 Oven (calibration and PM)' }
const ALL = [OVERDUE, DUE_SOON, CLEAR, UNTRACKED, BOTH]

// A supplier in the OTHER tenant, so "the vendor must belong to this company"
// can be asserted against a real cross-tenant id rather than a random UUID —
// which would only prove the row was missing, not that tenancy is what stopped
// it. Inserted in SQL because E2EALT has no supplier fixture and the seed file
// belongs to another workstream. NOTE `suppliers.code` is varchar(10) — a
// longer code raises "value too long for type character varying(10)" out of
// psql, which surfaces as every test in this file failing in 0ms with no
// obvious link to the supplier row.
const ALT_VENDOR_ID = 'e2e70000-0000-4000-8000-0000000000a1'

function isoDaysFromNow(n) {
  return new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10)
}

/** The certificate/vendor evidence columns, straight out of Postgres. */
function calibrationEvidence(id) {
  const row = sqlRow(
    `SELECT last_calibration_certificate_number, last_calibration_certificate_url,
            last_calibration_vendor_id, last_calibration_vendor_name
       FROM equipment WHERE id = '${id}'`,
  )
  if (!row) return null
  const nz = (v) => (v === '' ? null : v)
  return {
    certificateNumber: nz(row[0]),
    certificateUrl: nz(row[1]),
    vendorId: nz(row[2]),
    vendorName: nz(row[3]),
  }
}

/** The minimum body the server will accept, as one object to vary from. */
function validBody(overrides = {}) {
  return {
    certificateNumber: `CAL-${Date.now()}`,
    calibrationVendorName: 'E2E Metrology Bench',
    method: 'PIN',
    token: '12345678',
    ...overrides,
  }
}

test.describe('EQ-J2 · the calibration programme', () => {
  // Every fixture is minted ONCE, here, before any test runs — not inside the
  // first test. Sharing mutable state down a file in test order means a failure
  // in the badge test surfaces in the evidence test as "the fixture is null",
  // which points at the wrong thing and wastes the reader's time. (EQ-J1 learned
  // this the hard way; see the note on its retire journey.)
  test.beforeAll(async ({ browser }) => {
    for (const e of ALL) purgeEquipmentByCode(e.code)
    sql(
      `INSERT INTO suppliers (id, company_id, name, code, category, status_id, created_at, updated_at)
       VALUES ('${ALT_VENDOR_ID}', 'e2e00002-0000-4000-8000-000000000002',
               'E2EALT Calibration House', 'E2EALTCAL', 'SERVICE', 'APPROVED', NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
    )

    // Minted against the REST route as the acting persona, so the rows arrive
    // the way a user's would — through equipmentService, with its unique-code
    // and enum checks — rather than by an INSERT that could store a shape the
    // product cannot produce.
    const page = await pool.page(browser, EQUIPMENT.admin.auth)
    await createEquipmentViaRest(page, {
      ...OVERDUE,
      siteId: SITES.primary.id,
      category: 'INSTRUMENT',
      requiresCalibration: true,
      calibrationInterval: 3,
      calibrationIntervalUnit: 'MONTH',
      nextCalibrationDue: isoDaysFromNow(-45),
    })
    await createEquipmentViaRest(page, {
      ...DUE_SOON,
      siteId: SITES.primary.id,
      category: 'INSTRUMENT',
      requiresCalibration: true,
      calibrationInterval: 6,
      calibrationIntervalUnit: 'MONTH',
      nextCalibrationDue: isoDaysFromNow(20),
    })
    await createEquipmentViaRest(page, {
      ...CLEAR,
      siteId: SITES.primary.id,
      category: 'INSTRUMENT',
      requiresCalibration: true,
      calibrationInterval: 12,
      calibrationIntervalUnit: 'MONTH',
      nextCalibrationDue: isoDaysFromNow(200),
    })
    await createEquipmentViaRest(page, {
      ...UNTRACKED,
      siteId: SITES.primary.id,
      category: 'OTHER',
      requiresCalibration: false,
    })
    await createEquipmentViaRest(page, {
      ...BOTH,
      siteId: SITES.primary.id,
      category: 'MACHINE',
      requiresCalibration: true,
      calibrationInterval: 6,
      calibrationIntervalUnit: 'MONTH',
      nextCalibrationDue: isoDaysFromNow(-5),
      requiresPm: true,
      pmInterval: 3,
      pmIntervalUnit: 'MONTH',
      nextPmDue: isoDaysFromNow(-5),
    })
  })

  test.afterAll(() => {
    for (const e of ALL) purgeEquipmentByCode(e.code)
    sql(`DELETE FROM suppliers WHERE id = '${ALT_VENDOR_ID}'`)
  })

  test('the register paints the calibration schedule — overdue red, due-soon amber, clear neutral', async ({
    browser,
  }) => {
    const page = await pool.page(browser, EQUIPMENT.admin.auth)
    await openRegister(page, { anchorName: OVERDUE.name })

    // The badge is a class, not a word: `dueClass()` returns red / amber /
    // neutral and the only rendered difference besides colour is the icon. A
    // test that read the DATE would pass no matter which colour it was in, which
    // is the entire failure this journey is here to catch.
    await expect
      .poll(() => calibrationBadgeClass(page, OVERDUE.name), { timeout: 30_000 })
      .toContain('tw:text-red-700')
    expect(await calibrationBadgeClass(page, DUE_SOON.name)).toContain('tw:text-amber-700')
    expect(
      await calibrationBadgeClass(page, DUE_SOON.name),
      'due-soon is a warning, not a breach',
    ).not.toContain('tw:text-red-700')
    expect(await calibrationBadgeClass(page, CLEAR.name)).toContain('tw:text-secondary')

    // An instrument that is not calibration-tracked shows nothing, and — the
    // half that makes the gate a GATE — offers no way to record a calibration.
    const untrackedCell = await cellFor(page, UNTRACKED.name, 'Next calibration')
    await expect(untrackedCell).toHaveText('—')
    await expect(
      registerRow(page, UNTRACKED.name).getByRole('button', { name: /Record calibration/ }),
      'requires_calibration=false has no calibration programme to record against',
    ).toHaveCount(0)
  })

  test('recording a calibration is e-signed and evidenced, and the schedule rolls forward', async ({
    browser,
  }) => {
    const page = await pool.page(browser, EQUIPMENT.admin.auth)
    const subject = findEquipmentByCode(OVERDUE.code)
    expect(subject, 'the overdue fixture exists').not.toBeNull()

    // Re-arranged here, not just in beforeAll: this is the test that RECORDS a
    // calibration, so a Playwright retry would otherwise run against the
    // instrument its own failed attempt already recalibrated — and assert a
    // roll-forward from a date that had already rolled. Written in SQL because
    // no product surface can move a due date backwards.
    expireCalibration(subject.id, { daysOverdue: 45, intervalMonths: 3 })

    const before = findEquipment(subject.id)
    expect(
      new Date(before.nextCalibrationDue).getTime(),
      'the arrange step really is out of calibration',
    ).toBeLessThan(Date.now())
    const signaturesBefore = signaturesForEquipment(subject.id).length

    await openRegister(page, { anchorName: OVERDUE.name })

    // Prove the badge is RED before touching anything. Without this the closing
    // assertion ("it stopped reading overdue") could pass vacuously — if the
    // arrange step's SQL had never reached IndexedDB, the badge would never have
    // been red in the first place and "not red" would be true throughout.
    await expect
      .poll(() => calibrationBadgeClass(page, OVERDUE.name), {
        timeout: 45_000,
        message: 'the register shows the instrument as overdue before it is recalibrated',
      })
      .toContain('tw:text-red-700')

    await recordCalibrationFromRow(page, OVERDUE.name)

    // The dialog. Every field below is one the server refuses the request
    // without — the negatives are asserted separately, over REST.
    await expect(page.getByText('Record Calibration', { exact: true }).last()).toBeVisible()
    const certificate = `CAL-J2-${Date.now()}`
    await page.getByPlaceholder('e.g. CAL-2026-00417').fill(certificate)
    await page.getByPlaceholder('e.g. In-house metrology bench').fill('E2E Metrology Bench')
    await page.getByRole('button', { name: 'Sign & Record Calibration' }).click()

    // §11.50/§11.70 — the act is signed, not merely performed.
    await signWithPin(page)

    // ── Postgres, not the toast ────────────────────────────────────────────
    await expect
      .poll(() => sqlValue(`SELECT next_calibration_due > NOW() FROM equipment WHERE id = '${subject.id}'`), {
        timeout: 30_000,
        message: 'the next-due date moved into the future',
      })
      .toBe('t')

    const after = findEquipment(subject.id)
    expect(after.lastCalibratedAt, 'the completion stamped a calibration date').not.toBeNull()
    expect(
      Math.abs(daysBetween(after.lastCalibratedAt, new Date().toISOString())),
      'calibrated today',
    ).toBeLessThanOrEqual(1)
    // Three MONTHs, checked in days with tolerance: addInterval uses
    // Date.setMonth, so "three months from the 31st" is not 90 days and cannot
    // be asserted to the second.
    expect(
      daysBetween(after.lastCalibratedAt, after.nextCalibrationDue),
      'next-due is last-calibrated + the instrument interval (3 months)',
    ).toBeGreaterThanOrEqual(88)
    expect(daysBetween(after.lastCalibratedAt, after.nextCalibrationDue)).toBeLessThanOrEqual(93)
    expect(after.requiresCalibration, 'recording a calibration keeps it tracked').toBe(true)
    expect(after.calibrationIntervalUnit, 'the cadence is untouched').toBe('MONTH')

    // ── The evidence (finding #7) ──────────────────────────────────────────
    const evidence = calibrationEvidence(subject.id)
    expect(evidence.certificateNumber, 'the certificate the operator typed is stored').toBe(
      certificate,
    )
    expect(evidence.vendorName).toBe('E2E Metrology Bench')

    // ── The signature (finding #2) ─────────────────────────────────────────
    const signatures = signaturesForEquipment(subject.id)
    expect(
      signatures.length,
      'a calibration completion manifests a signature against the INSTRUMENT',
    ).toBe(signaturesBefore + 1)
    expect(signatures[0].userId, 'signed by the operator who recorded it').toBe(
      EQUIPMENT.admin.user.id,
    )
    expect(signatures[0].meaning).toBe('PERFORMED')
    expect(signatures[0].isRevoked).toBe(false)

    // ── And the register follows, without a reload ─────────────────────────
    // The live query over IndexedDB is the only reason an operator sees the
    // instrument come back into calibration. A DB-only assertion would pass on a
    // register that still showed red.
    await expect
      .poll(() => calibrationBadgeClass(page, OVERDUE.name), {
        timeout: 45_000,
        message: 'the badge stopped reading overdue',
      })
      .not.toContain('tw:text-red-700')
  })

  test('the server refuses a completion that is missing any one piece of evidence', async ({
    browser,
  }) => {
    // The dialog disables its own submit until certificate + vendor are present,
    // which is a courtesy. This is the enforcement: each field is dropped from a
    // direct REST call by a persona that legitimately holds
    // `calibration_equipment:update`, and the schedule must not move.
    const page = await pool.page(browser, EQUIPMENT.admin.auth)
    const subject = findEquipmentByCode(DUE_SOON.code)
    const before = findEquipment(subject.id)
    const path = `/equipment/${subject.id}/record-calibration`

    // 1. No signature at all — the shape the quick action used to send.
    const unsigned = await restPost(page, path, {
      certificateNumber: 'CAL-UNSIGNED',
      calibrationVendorName: 'E2E Metrology Bench',
    })
    expect(unsigned.status(), 'an unsigned calibration is refused').toBe(400)
    expect(await errorMessage(unsigned)).toMatch(/e-signature credentials are required/i)

    // 2. Signed, but no certificate — "a date and nothing else".
    const noCert = await restPost(page, path, validBody({ certificateNumber: '' }))
    expect(noCert.status()).toBe(400)
    expect(await errorMessage(noCert)).toMatch(/certificateNumber is required/i)

    // 3. Signed and certificated, but nobody said who performed it.
    const noVendor = await restPost(
      page,
      path,
      validBody({ calibrationVendorName: '', calibrationVendorId: null }),
    )
    expect(noVendor.status()).toBe(400)
    expect(await errorMessage(noVendor)).toMatch(/calibrationVendorId|calibrationVendorName/i)

    // 4. A vendor from the other tenant. The composite FK makes it
    //    unrepresentable at the storage layer; this is the product answer.
    const crossTenantVendor = await restPost(
      page,
      path,
      validBody({ calibrationVendorName: '', calibrationVendorId: ALT_VENDOR_ID }),
    )
    expect(crossTenantVendor.status()).toBe(400)
    expect(await errorMessage(crossTenantVendor)).toMatch(/vendor not found/i)

    const after = findEquipment(subject.id)
    expect(
      after.nextCalibrationDue,
      'not one of the four refusals moved the schedule — a partial write here would ' +
        'clear the QC gate on an instrument nobody signed for',
    ).toBe(before.nextCalibrationDue)
    expect(after.lastCalibratedAt).toBe(before.lastCalibratedAt)
    expect(calibrationEvidence(subject.id).certificateNumber).toBeNull()
    expect(signaturesForEquipment(subject.id)).toHaveLength(0)
  })

  test('the calibration date is bounded, and a bad interval unit cannot widen the schedule', async ({
    browser,
  }) => {
    const page = await pool.page(browser, EQUIPMENT.admin.auth)
    const subject = findEquipmentByCode(CLEAR.code)
    const before = findEquipment(subject.id)
    const path = `/equipment/${subject.id}/record-calibration`

    // E4 — a forward-dated calibration buys a longer next-due window than the
    // instrument's interval allows.
    const future = await restPost(
      page,
      path,
      validBody({ calibratedAt: new Date(Date.now() + 3 * 86_400_000).toISOString() }),
    )
    expect(future.status()).toBe(400)
    expect(await errorMessage(future)).toMatch(/cannot be in the future/i)

    // The mirror-image abuse: backdate far enough that the rolled-forward
    // next-due lands in the past and the instrument reads as permanently overdue.
    const ancient = await restPost(page, path, validBody({ calibratedAt: '1900-01-01' }))
    expect(ancient.status()).toBe(400)
    expect(await errorMessage(ancient)).toMatch(/too far in the past/i)

    // E3 — this path PERSISTS calibration_interval_unit, so an unvalidated unit
    // would silently widen the interval that feeds the enforced QC gate.
    const badUnit = await restPost(
      page,
      path,
      validBody({ calibrationIntervalUnit: 'FORTNIGHT' }),
    )
    expect(badUnit.status()).toBe(400)
    expect(await errorMessage(badUnit)).toMatch(/calibrationIntervalUnit/i)

    const after = findEquipment(subject.id)
    expect(after.calibrationIntervalUnit, 'the stored cadence is untouched').toBe(
      before.calibrationIntervalUnit,
    )
    expect(after.nextCalibrationDue).toBe(before.nextCalibrationDue)
  })

  test('an instrument with no interval is refused rather than silently left unscheduled', async ({
    browser,
  }) => {
    // `requiresCalibration` with no interval and no explicit next-due has nothing
    // to roll forward from. Accepting it would stamp last_calibrated_at, leave
    // next_calibration_due null, and NOT_CALIBRATED would keep the QC gate shut
    // on an instrument the operator believes they just calibrated.
    const page = await pool.page(browser, EQUIPMENT.admin.auth)
    const code = 'E2E-EQ-J2-NOINTERVAL'
    purgeEquipmentByCode(code)
    const row = await createEquipmentViaRest(page, {
      code,
      name: 'E2E J2 Gauge (no interval)',
      siteId: SITES.primary.id,
      requiresCalibration: true,
    })
    try {
      const res = await restPost(page, `/equipment/${row.id}/record-calibration`, validBody())
      expect(res.status()).toBe(400)
      expect(await errorMessage(res)).toMatch(/calibration interval/i)
      expect(findEquipment(row.id).lastCalibratedAt).toBeNull()
    } finally {
      purgeEquipmentByCode(code)
    }
  })

  test('PM is a separate schedule: neither programme moves the other', async ({ browser }) => {
    // The PM quick action is deliberately NOT e-signed — no QC gate reads PM, so
    // a Part-11 signature there would buy no compliance and break a one-click
    // action. Asserting the asymmetry is what keeps it a decision rather than an
    // oversight, and asserting the independence is what keeps a future "tidy the
    // two paths together" refactor honest.
    const page = await pool.page(browser, EQUIPMENT.admin.auth)
    const subject = findEquipmentByCode(BOTH.code)
    const before = findEquipment(subject.id)

    await openRegister(page, { anchorName: BOTH.name })

    // ── Calibration first ──────────────────────────────────────────────────
    await recordCalibrationFromRow(page, BOTH.name)
    await page.getByPlaceholder('e.g. CAL-2026-00417').fill(`CAL-BOTH-${Date.now()}`)
    await page.getByPlaceholder('e.g. In-house metrology bench').fill('E2E Metrology Bench')
    await page.getByRole('button', { name: 'Sign & Record Calibration' }).click()
    await signWithPin(page)

    await expect
      .poll(() => sqlValue(`SELECT next_calibration_due > NOW() FROM equipment WHERE id = '${subject.id}'`), {
        timeout: 30_000,
      })
      .toBe('t')
    expect(
      findEquipment(subject.id).nextPmDue,
      'a calibration does not touch the PM schedule',
    ).toBe(before.nextPmDue)

    // ── Then PM, which is one click and no signature ───────────────────────
    const afterCal = findEquipment(subject.id)
    await recordPmFromRow(page, BOTH.name)
    await expect
      .poll(() => sqlValue(`SELECT next_pm_due > NOW() FROM equipment WHERE id = '${subject.id}'`), {
        timeout: 30_000,
        message: 'the PM quick action needs no dialog and no PIN',
      })
      .toBe('t')

    const afterPm = findEquipment(subject.id)
    expect(afterPm.lastPmAt).not.toBeNull()
    expect(
      daysBetween(afterPm.lastPmAt, afterPm.nextPmDue),
      'next-PM is last-PM + the PM interval (3 months), not the calibration one',
    ).toBeGreaterThanOrEqual(88)
    expect(daysBetween(afterPm.lastPmAt, afterPm.nextPmDue)).toBeLessThanOrEqual(93)
    expect(
      afterPm.nextCalibrationDue,
      'and recording PM does not touch the calibration schedule',
    ).toBe(afterCal.nextCalibrationDue)
    expect(
      signaturesForEquipment(subject.id),
      'exactly one signature — the calibration. PM is unsigned by design.',
    ).toHaveLength(1)
  })
})
