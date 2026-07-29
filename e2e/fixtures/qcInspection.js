// Shared UI flows + DB assertions for the QC Inspection journeys.
//
// Reuses the generic BaseSelect / e-sign / reload-tolerant helpers from
// fixtures/documents.js (they are not document-specific, just the project's
// only home for them so far), the same way fixtures/capas.js does.
//
// Fixtures live in qms/database/e2e-seed.sql §22 and are mirrored in cast.js
// as `QC`. Two facts about this module shape most of what follows:
//   1. Reads go through the syncEngine (GraphQL → IndexedDB), so after a REST
//      write the UI catches up asynchronously — assert on the DB for hard
//      facts and let the UI assertions retry.
//   2. Retain-sample writes are REST action-RPCs, not entity CRUD, so the
//      request helpers below hit /api/v1/services/qcInspection/... directly
//      when a journey needs to prove a SERVER-side gate rather than a UI one.
import { expect } from '@playwright/test'
import { ESIGN_PIN, QC } from './cast.js'
import { sql, sqlRow, sqlValue, waitForSqlValue } from './db.js'
import { clickWhenReady, selectOption } from './documents.js'

const quote = (s) => `'${String(s).replace(/'/g, "''")}'`

/** Unique, greppable lot number for one test run. */
export function uniqueLotNumber(tag) {
  return `E2E-LOT-${tag}-${Date.now()}`
}

// ─── DB reads ───────────────────────────────────────────────────────────────

/** Inspection lot by exact lot_number (E2E lot numbers are unique per run). */
export function findLotByNumber(lotNumber) {
  const row = sqlRow(
    `SELECT id, lot_number, status_id, quality_state, nc_id, inspection_point
       FROM inspection_lots WHERE lot_number = ${quote(lotNumber)}
      ORDER BY created_at DESC LIMIT 1`,
  )
  if (!row) return null
  return {
    id: row[0],
    lotNumber: row[1],
    statusId: row[2],
    qualityState: row[3] || null,
    ncId: row[4] || null,
    inspectionPoint: row[5],
  }
}

/** Retain sample by id. */
export function findRetainSample(id) {
  const row = sqlRow(
    `SELECT id, rs_number, status_id, seal_state, inspection_lot_id, storage_location_id,
            position, quantity, disposal_method, disposed_at, retain_until, lot_number
       FROM retain_samples WHERE id = ${quote(id)}`,
  )
  if (!row) return null
  return {
    id: row[0],
    rsNumber: row[1],
    statusId: row[2],
    sealState: row[3],
    inspectionLotId: row[4],
    storageLocationId: row[5] || null,
    position: row[6] || null,
    quantity: row[7] || null,
    disposalMethod: row[8] || null,
    disposedAt: row[9] || null,
    retainUntil: row[10] || null,
    lotNumber: row[11] || null,
  }
}

/** The newest retain sample attached to a lot (what a create journey just made). */
export function findLatestRetainSampleForLot(lotId) {
  const id = sqlValue(
    `SELECT id FROM retain_samples WHERE inspection_lot_id = ${quote(lotId)}
       AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1`,
  )
  return id ? findRetainSample(id) : null
}

/** Custody event types for a retain sample, oldest first. */
export function retainEventTypes(retainSampleId) {
  const out = sql(
    `SELECT event_type FROM retain_sample_events
      WHERE retain_sample_id = ${quote(retainSampleId)} ORDER BY created_at, event_type`,
  )
  return out ? out.split('\n') : []
}

/** Audit-log actions recorded against a retain sample, oldest first. */
export function retainAuditActions(retainSampleId) {
  const out = sql(
    `SELECT action FROM audit_logs
      WHERE entity_id = ${quote(retainSampleId)} ORDER BY created_at`,
  )
  return out ? out.split('\n') : []
}

/**
 * Wait for the disposal-due ACTION task the nightly cron creates for a sample.
 * Returns the task id. The cron is `retain_sample_disposal_due` (crontab
 * `45 3 * * *`); a journey triggers it directly rather than waiting a day.
 */
export function waitForDisposalTask(retainSampleId, opts = {}) {
  return waitForSqlValue(
    `SELECT id FROM task_instances
      WHERE entity_type = 'RetainSample' AND entity_id = ${quote(retainSampleId)}
        AND deleted_at IS NULL`,
    { timeoutMs: 45_000, label: 'retain disposal-due task', ...opts },
  )
}

// ─── UI flows ───────────────────────────────────────────────────────────────

/**
 * Open the QC Inspection surface on a given tab. The switcher is the sidebar's
 * QC submenu (?tab= links), and QcInspectionHome keeps ?tab= in the URL at all
 * times — so navigating straight to the query URL is the supported entry, not a
 * shortcut around the UI.
 *
 * Tabs and their gates (QcInspectionHome.vue ALL_TABS): lots→inspection_qc:read,
 * retain-samples→retain_samples:read, inspection-plans→inspection_templates:read,
 * specifications→inspection_spec:read, sampling-plans→inspection_plan:read,
 * aql-standards→inspection_standards:read, test-library→inspection_catalog:read,
 * line-clearance→inspection_settings:read.
 */
export async function gotoQcTab(page, tab = 'lots') {
  await page.goto(`/qc-inspection?tab=${tab}`)
}

/**
 * Create a retain sample from a lot's Retain Samples card.
 * Card entry: InspectionLotRetainSamplesCard.vue "Add Retain Sample" (gated
 * retain_samples:create OR :update); dialog: RetainSampleCreateDialog.vue.
 * Returns the DB row once the REST create has landed.
 */
export async function createRetainSample(page, lotId, { quantity = '6', position = 'Shelf B, Box 12' } = {}) {
  const before = sqlValue(
    `SELECT count(*) FROM retain_samples WHERE inspection_lot_id = ${quote(lotId)} AND deleted_at IS NULL`,
  )
  await page.goto(`/qc-inspection/lots/${lotId}`)
  // exact:true — the rail's collapsible section header renders as a button too
  // ("RETAINED SAMPLES (0)"), and a loose /retain sample/i would match it first.
  await clickWhenReady(page, page.getByRole('button', { name: 'Retain Sample', exact: true }))
  // "Create Retain Sample" is BOTH the dialog title and its submit button, so
  // a bare getByText hits strict-mode. Anchor the open-check on the heading.
  await expect(page.getByRole('heading', { name: 'Create Retain Sample' })).toBeVisible({ timeout: 10_000 })

  await page.getByPlaceholder('e.g. 6').fill(quantity)
  await selectOption(page, 'Storage location', QC.storageLocation.name)
  await page.getByPlaceholder('e.g. Shelf B, Box 12').fill(position)
  await page.getByRole('button', { name: 'Create Retain Sample' }).click()

  await waitForSqlValue(
    `SELECT count(*) > ${Number(before)} FROM retain_samples
      WHERE inspection_lot_id = ${quote(lotId)} AND deleted_at IS NULL`,
    { timeoutMs: 30_000, label: 'retain sample created' },
  )
  return findLatestRetainSampleForLot(lotId)
}

/**
 * Dispose a retain sample through the UI: Record Disposal → method + notes →
 * Sign & Record Disposal → PIN e-sign dialog.
 *
 * NOTE what this does and does not prove. The PIN *is* verified server-side
 * (signatureService verifyAndSign), but no `signatures` ledger row is minted —
 * the dispose call passes `step: null`, so verifyAndSign returns early. The
 * only durable evidence is the DISPOSE audit_logs row. That is security-review
 * finding #16, not a bug in this helper: assert audit, never `signatures`.
 */
export async function disposeRetainSample(page, retainSampleId, { method = 'Incinerated', notes = '' } = {}) {
  await page.goto(`/qc-inspection/retain-samples/${retainSampleId}`)
  // clickWhenReady, not a bare click: the detail page hydrates from IndexedDB
  // after the syncEngine bootstrap, so an early click lands on a button whose
  // handler is not wired yet — the dialog silently never opens.
  await clickWhenReady(page, page.getByRole('button', { name: 'Record Disposal' }))
  await expect(page.getByText(/Record Disposal —/)).toBeVisible({ timeout: 15_000 })
  await expect(page.getByLabel(/Disposal method/), 'dispose dialog is interactive').toBeVisible({
    timeout: 15_000,
  })

  // Disposal method is a NATIVE <select> (RetainSampleDisposeDialog.vue:78-84),
  // not the project's BaseSelect combobox — so the label-anchored combobox
  // helper does not apply; drive it with selectOption on the element itself.
  // NOT exact:true — BaseField appends the required marker, so the accessible
  // name is "Disposal method *", and the detail page behind the dialog has
  // three more <select>s of its own.
  await page.getByLabel(/Disposal method/).selectOption(method)
  if (notes) {
    await page.getByPlaceholder('Witness, certificate reference, anything worth recording').fill(notes)
  }
  await page.getByRole('button', { name: 'Sign & Record Disposal' }).click()

  const pin = page.getByPlaceholder('Enter your e-signature PIN')
  await expect(pin).toBeVisible({ timeout: 15_000 })
  const signBtn = page.getByRole('button', { name: 'Sign', exact: true })
  await expect(async () => {
    await pin.fill(ESIGN_PIN)
    await expect(signBtn).toBeEnabled({ timeout: 3_000 })
  }).toPass({ timeout: 15_000 })
  await signBtn.click()

  await waitForSqlValue(
    `SELECT status_id = 'DISPOSED' FROM retain_samples WHERE id = ${quote(retainSampleId)}`,
    { timeoutMs: 30_000, label: 'retain sample disposed' },
  )
}

// ─── Lot lifecycle (PW-J1…J3) ──────────────────────────────────────────────

/**
 * Open a lot's detail page, tolerating the sync lag.
 *
 * A lot created over REST reaches the browser only after the sync service
 * broadcasts and the syncEngine pulls it into IndexedDB, so a plain goto can
 * land on an empty page. Anchoring on a control that only renders once the lot
 * is in IDB (and reloading until it appears) is the project's standard remedy.
 */
export async function openLot(page, lotId) {
  await page.goto(`/qc-inspection/lots/${lotId}`)
  await expect(page.getByRole('button', { name: 'Print report' })).toBeVisible({ timeout: 30_000 })
}

/**
 * Check in as the active inspector. Execute actions are gated on this — the
 * page states "No inspector is checked in" until it happens — and the button
 * opens a confirm dialog whose own button repeats the label, hence `.last()`.
 */
/**
 * Claim the active-inspector slot over REST, then land on the writable page.
 *
 * Use this when check-in is a PRECONDITION rather than the thing under test.
 * Driving the dialog through the UI for every journey proved flaky under
 * full-suite load — the page can still be hydrating from IndexedDB when the
 * click lands, so the dialog silently never opens. PW-J3 still exercises the
 * real dialog, because there the gate IS the subject; everywhere else this is
 * both faster and deterministic.
 */
export async function checkInLotViaRest(page, lotId) {
  const res = await page.request.post(`/api/v1/services/qcInspection/lots/${lotId}/check-in`, { data: {} })
  expect(res.ok(), `check-in failed: ${await res.text()}`).toBeTruthy()

  // A REST write lands in Postgres immediately, but the page reads the lot from
  // IndexedDB — which only catches up when the sync service broadcasts and the
  // syncEngine refetches. If this tab already cached the pre-check-in lot (any
  // journey that visited the page first, e.g. to add a retain sample), a single
  // goto can render the stale "No inspector is checked in" state forever.
  // Reload until the writable surface appears.
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await page.goto(`/qc-inspection/lots/${lotId}`)
    const ready = await page
      .getByRole('button', { name: 'Save results' })
      .waitFor({ state: 'visible', timeout: 15_000 })
      .then(() => true)
      .catch(() => false)
    if (ready) return
  }
  throw new Error(`checkInLotViaRest: lot ${lotId} never became writable in the UI`)
}

export async function checkInLot(page, lotId) {
  // Retry across reloads: check-in is exclusive per user, so when a previous
  // spec left this inspector checked in elsewhere the dialog becomes a
  // take-over confirm and the first click can land before it re-renders.
  // The trigger's label depends on whether anyone else holds the slot:
  // 'Check in' when free, 'Take over (check in)' when another inspector is
  // already checked in (inspectionLotDetailConfig.js:50). The dialog's own
  // submit likewise reads 'Check in' or 'Take over'.
  const trigger = page.getByRole('button', { name: /^(Check in|Take over \(check in\))$/ })
  const confirmBtn = page.getByRole('button', { name: /^(Check in|Take over)$/ })
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.goto(`/qc-inspection/lots/${lotId}`)
    await clickWhenReady(page, trigger)
    await confirmBtn.last().click()
    const saved = await page
      .getByRole('button', { name: 'Save results' })
      .waitFor({ state: 'visible', timeout: 20_000 })
      .then(() => true)
      .catch(() => false)
    if (saved) return
  }
  throw new Error(`checkInLot: never became writable for lot ${lotId}`)
}

/**
 * Drive a lot to COMPLETED entirely over REST: check in, score every seeded
 * characteristic on sample 0, then complete.
 *
 * For journeys whose SUBJECT is a server-side rule (PW-J2's retain-waiver gate),
 * getting the lot into the right state through the UI adds nothing but
 * flakiness: the in-process results grid only becomes interactive once a REST
 * write has round-tripped through the sync service into IndexedDB, and that lag
 * is unbounded under load. The UI paths are exercised where they are the point
 * — PW-J1 (incoming lifecycle) and PW-J3 (the execute gates) both drive the
 * real grid.
 */
export async function completeLotViaRest(
  page,
  lotId,
  { length = 10.0, visualPass = true, label = 'Legible', collect = false } = {},
) {
  const checkIn = await page.request.post(`/api/v1/services/qcInspection/lots/${lotId}/check-in`, { data: {} })
  expect(checkIn.ok(), `check-in failed: ${await checkIn.text()}`).toBeTruthy()

  // IN_PROCESS lots must have units pulled off the line first — completing one
  // with none is refused ("No samples have been collected"). Incoming lots get
  // their sample set at create and must NOT collect, so this is opt-in.
  if (collect) {
    // Collection is only legal while the lot is IN_PROGRESS ("Samples can only
    // be collected while the lot is IN_PROGRESS (is PENDING)"), and check-in
    // alone does not start it — `start` is the separate transition. Ignore a
    // failure here: on a lot already IN_PROGRESS the call is redundant, and the
    // collect below is the real assertion.
    await page.request.post(`/api/v1/services/qcInspection/lots/${lotId}/start`, { data: {} })
    const collected = await page.request.post(`/api/v1/services/qcInspection/lots/${lotId}/samples`, {
      data: { count: 1 },
    })
    expect(collected.ok(), `collect samples failed: ${await collected.text()}`).toBeTruthy()
  }

  // Score the sample indices the lot actually has. A collected in-process
  // sample is NOT index 0 — collection assigns the next number — so hardcoding
  // 0 posts results the completeness check never sees ("3 of 3 not recorded").
  const collectedIndices = sql(
    `SELECT DISTINCT sample_no FROM inspection_samples
      WHERE inspection_lot_id = ${quote(lotId)} ORDER BY sample_no`,
  )
  const indices = collectedIndices ? collectedIndices.split('\n').map(Number) : [0]

  const results = await page.request.post(`/api/v1/services/qcInspection/lots/${lotId}/results`, {
    data: {
      results: indices.flatMap((sampleIndex) => [
        { characteristicId: QC.characteristics.length.id, sampleIndex, valueNumeric: length },
        { characteristicId: QC.characteristics.visual.id, sampleIndex, valueBool: visualPass },
        { characteristicId: QC.characteristics.label.id, sampleIndex, valueText: label },
      ]),
    },
  })
  expect(results.ok(), `results failed: ${await results.text()}`).toBeTruthy()

  const complete = await page.request.post(`/api/v1/services/qcInspection/lots/${lotId}/complete`, { data: {} })
  expect(complete.ok(), `complete failed: ${await complete.text()}`).toBeTruthy()
  await waitForSqlValue(`SELECT status_id = 'COMPLETED' FROM inspection_lots WHERE id = ${quote(lotId)}`, {
    timeoutMs: 30_000,
    label: 'lot COMPLETED (via REST)',
  })
}

/**
 * Collect samples on an IN_PROCESS lot.
 *
 * In-process inspection is progressive: units are pulled off the line during
 * the run, so the results grid stays empty ("No samples collected yet") until
 * samples exist. Incoming lots skip this — their sample set is fixed at create
 * from the AQL table. Call this before recordResults on any IN_PROCESS lot.
 */
export async function collectSamples(page, { count = 1 } = {}) {
  // Reload-tolerant like checkInLot: under full-suite load the results panel
  // can still be hydrating when the click lands, leaving the dialog unopened.
  const trigger = page.getByRole('button', { name: 'Collect sample(s)' }).first()
  const heading = page.getByRole('heading', { name: 'Collect samples' })
  let opened = false
  for (let attempt = 0; attempt < 3 && !opened; attempt += 1) {
    await clickWhenReady(page, trigger)
    opened = await heading
      .waitFor({ state: 'visible', timeout: 10_000 })
      .then(() => true)
      .catch(() => false)
    if (!opened) await page.reload()
  }
  await expect(heading, 'collect-samples dialog opened').toBeVisible({ timeout: 15_000 })
  // "Number collected" defaults to the plan's per_collection_size (5 on the
  // seeded IN_PROCESS plan). Every collected sample multiplies the work the
  // completeness gate demands — 5 samples × 3 characteristics = 15 results —
  // so journeys that are not testing bulk entry collect exactly one.
  // getByLabel does not reach it (BaseField does not wire htmlFor here);
  // number inputs expose role=spinbutton, and the dialog's is the last one.
  const countField = page.getByRole('spinbutton').last()
  await expect(countField).toBeVisible({ timeout: 10_000 })
  await countField.fill(String(count))
  await page.getByRole('button', { name: 'Collect', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Collect samples' })).toHaveCount(0, { timeout: 20_000 })
}

/**
 * Record one result per seeded characteristic and save.
 *
 * The grid renders a control per characteristic keyed off its test_type
 * (InspectionSampleGrid.vue): NUMERIC → number input, PASS_FAIL → a radio pair,
 * TEXT → a free-text "observation" input. Pass `length: 12.5` to drive a
 * deliberate out-of-spec value (the seeded LEN spec is 9.90–10.10 mm).
 * Omit a field to leave that characteristic unscored — which is what PW-J3's
 * completeness gate needs.
 */
export async function recordResults(page, { length = null, visualPass = null, label = null } = {}) {
  if (length !== null) {
    await page.locator('main input[type="number"]').first().fill(String(length))
  }
  if (visualPass !== null) {
    // PassFailRadio renders two BaseRadios whose visible "Pass"/"Fail" labels
    // are NOT associated with the inputs — getByRole('radio', { name: 'Fail' })
    // matches nothing because the accessible name is empty. Worth fixing in the
    // component (BaseRadio should wire htmlFor/id); until then, target `value`.
    // Click the LABEL, not the input. The input's `checked` is Vue-controlled
    // (`:modelValue="selected"` + `@update:modelValue`), so a native .check()
    // reports "clicking the checkbox did not change its state" — the DOM state
    // only follows once the model round-trips.
    await page.locator('main label', { hasText: visualPass ? 'Pass' : 'Fail' }).first().click()
  }
  if (label !== null) {
    await page.getByPlaceholder('observation').first().fill(label)
  }
  await page.getByRole('button', { name: 'Save results' }).click()
}

/**
 * Complete the inspection. When fewer samples were collected than planned the
 * app raises a "Complete with fewer samples?" confirm first — always true for
 * these journeys, which record one result rather than all 50.
 */
export async function completeLot(page) {
  await page.getByRole('button', { name: 'Complete', exact: true }).click()
  const confirm = page.getByRole('button', { name: 'Complete', exact: true }).last()
  await expect(confirm).toBeVisible({ timeout: 10_000 })
  await confirm.click()
}

/**
 * Submit a COMPLETED lot for QA disposition.
 *
 * Gated on `inspection_qc:dispose` (inspectionLots.js submitForReview) — the
 * inspector who ran the inspection cannot do this, which is the module's real
 * separation of duties. `waiverComment` covers the IN_PROCESS retain gate:
 * submitting an in-process lot with no retain sample is refused
 * (RETAIN_SAMPLE_REQUIRED) unless a reason is supplied.
 */
export async function submitForDisposition(page, lotId, { waiverComment = null } = {}) {
  await openLot(page, lotId)
  await clickWhenReady(page, page.getByRole('button', { name: 'Submit for QA Disposition' }))
  await expect(page.getByRole('button', { name: 'Submit for Disposition' })).toBeVisible({ timeout: 15_000 })
  if (waiverComment) {
    const waiver = page.getByPlaceholder(/without a retain|why|reason/i).first()
    if (await waiver.count()) await waiver.fill(waiverComment)
  }
  await page.getByRole('button', { name: 'Submit for Disposition' }).click()
  await waitForSqlValue(`SELECT status_id = 'UNDER_REVIEW' FROM inspection_lots WHERE id = ${quote(lotId)}`, {
    timeoutMs: 45_000,
    label: 'lot submitted for review',
  })
}

/**
 * Record the QA disposition on an UNDER_REVIEW lot (RELEASE / REJECT / …).
 * One step, e-signed — InspectionLotDispositionAction replaced the older
 * "pick disposition → separate approve/reject" pair.
 */
export async function recordDisposition(page, lotId, dispositionName, { notes = '' } = {}) {
  await openLot(page, lotId)
  await selectOption(page, 'Disposition', dispositionName)
  if (notes) {
    await page.getByPlaceholder(/Reasoning for this disposition/i).fill(notes)
  }
  await clickWhenReady(page, page.getByRole('button', { name: 'Record Disposition' }))
  const pin = page.getByPlaceholder('Enter your e-signature PIN')
  if (await pin.count()) {
    const signBtn = page.getByRole('button', { name: 'Sign', exact: true })
    await expect(async () => {
      await pin.fill(ESIGN_PIN)
      await expect(signBtn).toBeEnabled({ timeout: 3_000 })
    }).toPass({ timeout: 15_000 })
    await signBtn.click()
  }
}

// ─── Server-gate probes (REST, deliberately not through the UI) ─────────────

/**
 * PATCH a retain sample over the REST route and expect the server to reject it.
 * Used to prove the DISPOSED seal is enforced server-side, not just by a hidden
 * button (RetainSampleDetail.vue `editable = canUpdate && !isDisposed`).
 */
export async function expectRetainPatchRejected(page, retainSampleId, patch, expectedMessage) {
  const res = await page.request.patch(`/api/v1/services/qcInspection/retainSamples/${retainSampleId}`, {
    data: patch,
  })
  expect(res.ok(), `server must reject the patch: ${expectedMessage}`).toBeFalsy()
  const body = await res.json().catch(() => null)
  expect(body?.error?.message ?? '', 'server seal message').toMatch(expectedMessage)
}

/**
 * Create an inspection lot over the REST action route (`inspection_qc:create`).
 *
 * The lot-creation *dialog* is exercised by the lifecycle journeys; the retain
 * journeys need a lot as a precondition, not as their subject, so they mint one
 * this way rather than driving a 20-field form they are not testing. The route
 * is the same one the dialog posts to, so the record is identical.
 */
export async function createLotViaRest(page, { lotNumber, inspectionPoint = 'INCOMING', templateId = null } = {}) {
  const number = lotNumber || uniqueLotNumber('RETAIN')
  const res = await page.request.post('/api/v1/services/qcInspection/lots', {
    data: {
      lotNumber: number,
      inspectionPoint,
      source: 'MANUAL',
      productId: QC.product.id,
      supplierId: inspectionPoint === 'INCOMING' ? QC.supplier.id : null,
      templateId: templateId || (inspectionPoint === 'IN_PROCESS' ? QC.templateInProcess.id : QC.templateIncoming.id),
      quantity: 100,
      batchNumber: `B-${Date.now()}`,
    },
  })
  expect(res.status(), `lot create failed: ${await res.text()}`).toBe(201)
  const lot = findLotByNumber(number)
  expect(lot, 'lot row exists after create').not.toBeNull()
  return lot
}

/** Dispose over REST without the UI — used for the permission-denial half. */
export async function disposeViaRest(page, retainSampleId, { method = 'Incinerated', token = ESIGN_PIN } = {}) {
  return page.request.post(`/api/v1/services/qcInspection/retainSamples/${retainSampleId}/dispose`, {
    data: { disposalMethod: method, method: 'PIN', token, provider: null },
  })
}
