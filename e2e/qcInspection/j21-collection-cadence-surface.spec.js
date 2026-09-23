// PW-J21 — The sampling-collection cadence: displayed, client-gated, and
// enforced nowhere (URS-QCI-12 / OQ-09 TC-09-12 steps 4 and 5).
//
// ── READ THIS BEFORE CHANGING ANYTHING IN THIS FILE ────────────────────────
//
// The §12 coverage row and OQ-09's note beneath TC-09-12 both state:
//
//   "The sampling cadence is **not implemented** rather than untested — the
//    plan's interval is advisory and nothing displays or enforces a
//    next-collection due time."
//
// **Half of that is false, and this file is the evidence.** The claim was
// derived from the schema (`j17`'s closing assertion reasons "no due column is
// stored anywhere, so none can be displayed") and the inference does not hold:
// the due time is COMPUTED on the client from two things that ARE stored —
// `sampling_plans.collection_interval_minutes` and
// `inspection_samples.collected_at` — and never persisted.
//
// What `src/components/qcInspection/InspectionLotDetail.vue:359-403` actually
// does:
//
//   nextDueAt        = max(collected_at) + collectionIntervalMinutes
//   collectAllowedAt = nextDueAt − 5 min
//   collectTooEarly  = now < collectAllowedAt
//
// and then renders a live traffic-light banner repainted every 15 s by
// `useNow` — green "Next sample collection at HH:MM", amber "due soon", red
// pulsing "was due HH:MM" — and DISABLES both Collect controls while
// `collectTooEarly` (`:975` and `:1088`, the second with the tooltip
// "Next collection at HH:MM").
//
// So the accurate position for a validation reader is not "no such control is
// claimed" but the considerably sharper:
//
//   · a next-collection due time IS displayed, with approaching and overdue
//     states — TC-09-12 step 5 is NOT N/A;
//   · the interval IS gated, in the browser only — TC-09-12 step 4's
//     "permitted" outcome holds at the API and NOT through the interface;
//   · `inspectionSampleService.addSamples` performs no time check whatsoever,
//     so the gate is cosmetic and anyone reaching past the UI collects at will.
//
// That last line is the one that matters for a GMP claim, and it is asserted
// here from both ends: the UI refuses, the server does not.
//
// ── WHY THIS NEEDED A NEW FIXTURE ──────────────────────────────────────────
//
// None of the four seeded E2ELAB sampling plans carried
// `collection_interval_minutes` (measured: all NULL), so `intervalMin` was
// always null, `nextDueAt` always null, and the banner has rendered its
// "no fixed interval set" branch in every run this repository has ever made.
// The cadence UI has literally never been exercised. e2e-seed.sql §48 adds
// **E2E Widget Cadence Plan** (180 min, 3 per collection) for this file.
//
// TWO FIXTURE CONSTRAINTS SHAPE HOW THE PLAN IS REACHED, and both were found
// by running this file rather than by reading the schema:
//
//   · It has NO template. `qc_inspection_templates_active_scope_unique` allows
//     one active template per (company, point, product); §22c holds that slot.
//   · It is seeded **DRAFT**, not ACTIVE. `resolveSamplingPlans` returns every
//     ACTIVE plan for the tier and `createLot` refuses with "Multiple sampling
//     plans match — select one." at two. Seeding it ACTIVE therefore broke
//     EVERY in-process lot creation in the suite — this file's first run failed
//     exactly that way, and j2/j17 would have followed.
//
// So the lot is created from the ordinary in-process template and its
// `sampling_plan_id` is repointed. That is not a workaround around the product:
// it is what the UI reads. InspectionLotDetail loads the plan LIVE off
// `lot.samplingPlanId` (`db.SamplingPlan.findByPk`), with no status predicate
// and NOT from `sampling_snapshot` — because `resolvePlanSampling` never copies
// the interval into that snapshot at all. That omission is a second, quieter
// finding in its own right: editing a plan's interval retroactively changes the
// cadence displayed on lots already in flight, and a lot created from an ad-hoc
// sampling override (`samplingPlanId` null) shows no cadence whatsoever.
//
// ── WHY THE CLOCK IS NEVER WAITED ON ───────────────────────────────────────
//
// 180 minutes. Every state is reached by moving `collected_at` in the database
// — backwards to make a collection overdue, left alone to make the next one
// too early. A test that waited would be a test of the machine it ran on.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH, COMPANY_ID } from '../fixtures/cast.js'
import { collectSamples, createLotViaRest, findLotByNumber } from '../fixtures/qcInspection.js'
import { sql, sqlValue, waitForSqlValue } from '../fixtures/db.js'

const q = (s) => `'${String(s).replace(/'/g, "''")}'`

// e2e-seed.sql §48.
const CADENCE_PLAN_ID = 'e2e98000-0000-4000-8000-000000000003'
const INTERVAL_MINUTES = 180
const LOT_TAG = 'J21'
const PRODUCT_ID = 'e2e91000-0000-4000-8000-000000000001' // §22b's shared widget

function purgeJ21Lots() {
  const scope = `SELECT id FROM inspection_lots
     WHERE company_id = ${q(COMPANY_ID)} AND lot_number LIKE 'E2E-LOT-${LOT_TAG}-%'`
  sql(`
    DELETE FROM inspection_results WHERE inspection_lot_id IN (${scope});
    DELETE FROM inspection_samples WHERE inspection_lot_id IN (${scope});
    DELETE FROM inspection_lot_events WHERE inspection_lot_id IN (${scope});
    UPDATE inspection_lots SET active_batch_id = NULL
     WHERE company_id = ${q(COMPANY_ID)} AND lot_number LIKE 'E2E-LOT-${LOT_TAG}-%';
    DELETE FROM inspection_batches WHERE inspection_lot_id IN (${scope});
    DELETE FROM inspection_lots
     WHERE company_id = ${q(COMPANY_ID)} AND lot_number LIKE 'E2E-LOT-${LOT_TAG}-%';
  `)
}

/**
 * An IN_PROGRESS in-process lot bound to the cadence plan.
 *
 * `sampling_plan_id` is an ordinary FK, not one of the lifecycle columns
 * `enforce_inspection_lot_lifecycle` guards, so repointing it as the superuser
 * slips past no trigger — there is no trigger on it to slip past. Same
 * reasoning j17 uses for seeding a prior `assigned_to`.
 */
async function startedCadenceLot(page, suffix) {
  const lot = await createLotViaRest(page, {
    lotNumber: `E2E-LOT-${LOT_TAG}-${suffix}-${Date.now()}`,
    inspectionPoint: 'IN_PROCESS',
  })
  sql(`UPDATE inspection_lots SET sampling_plan_id = ${q(CADENCE_PLAN_ID)} WHERE id = ${q(lot.id)}`)

  const checkIn = await page.request.post(
    `/api/v1/services/qcInspection/lots/${lot.id}/check-in`,
    { data: {} },
  )
  expect(checkIn.ok(), `check-in failed: ${await checkIn.text()}`).toBeTruthy()
  const start = await page.request.post(`/api/v1/services/qcInspection/lots/${lot.id}/start`, {
    data: {},
  })
  expect(start.ok(), `start failed: ${await start.text()}`).toBeTruthy()
  return lot
}

async function collect(page, lotId, count = 1) {
  return page.request.post(`/api/v1/services/qcInspection/lots/${lotId}/samples`, {
    data: { count },
  })
}

function sampleCount(lotId) {
  return Number(sqlValue(`SELECT count(*) FROM inspection_samples WHERE inspection_lot_id = ${q(lotId)}`))
}

/**
 * Move every collected unit on a lot back in time.
 *
 * ⚠️ CALL THIS BEFORE THE PAGE FIRST OPENS THE LOT, never after. The cadence is
 * computed from `collectedSamples`, which is read out of IndexedDB, and getting
 * a raw SQL edit in front of an ALREADY-LOADED page is genuinely hard here:
 * `forceResync` clears the localStorage bootstrap GATE so bootstrap re-runs,
 * but bootstrap is a DELTA filtered `updatedAt > lastSyncValue`, and that
 * watermark lives in IndexedDB — the row was written seconds earlier by the
 * collect this follows, so the watermark is already past it and the delta comes
 * back empty. The page then re-renders exactly the stale `collectedAt` it had,
 * which is indistinguishable from a broken cadence banner. (Measured: that is
 * how this file failed three times before the ordering was fixed.)
 *
 * A context that has never loaded the lot has no stale copy to prefer, so the
 * first bootstrap reads the back-dated row and the cadence is right from the
 * start. `updated_at` is bumped anyway so the row is unambiguously fresh.
 */
function backdateSamples(lotId, minutes) {
  sql(
    `UPDATE inspection_samples
        SET collected_at = collected_at - INTERVAL '${Number(minutes)} minutes',
            updated_at = now()
      WHERE inspection_lot_id = ${q(lotId)}`,
  )
}

test.describe('PW-J21 — collection cadence', () => {
  test.use({ storageState: AUTH.qcInspector })

  test.beforeAll(() => purgeJ21Lots())
  test.afterAll(() => purgeJ21Lots())

  test('PREMISE — the cadence fixture carries an interval, which no other plan does', () => {
    // Without this, every assertion below would exercise the "no fixed interval
    // set" branch and pass for the wrong reason — which is precisely how the
    // cadence surface stayed untested while looking covered.
    expect(
      sqlValue(
        `SELECT collection_interval_minutes FROM sampling_plans WHERE id = ${q(CADENCE_PLAN_ID)}`,
      ),
      'e2e-seed.sql §48 seeded the cadence plan',
    ).toBe(String(INTERVAL_MINUTES))

    // And it is still the ONLY one, so no other journey has quietly acquired a
    // cadence that would start disabling its Collect button.
    expect(
      sqlValue(
        `SELECT count(*) FROM sampling_plans
          WHERE company_id = ${q(COMPANY_ID)} AND collection_interval_minutes IS NOT NULL
            AND deleted_at IS NULL`,
      ),
      'exactly one E2ELAB plan carries an interval — the other suites are untouched',
    ).toBe('1')

    // The guard that protects every OTHER in-process journey. If this plan is
    // ever promoted to ACTIVE it joins §22d's in the same resolver tier and
    // `createLot` starts refusing every in-process lot in the suite with
    // "Multiple sampling plans match". Asserting it here means that mistake is
    // reported as one failing premise rather than as a dozen unrelated-looking
    // failures in j2 and j17.
    expect(
      sqlValue(`SELECT status_id FROM sampling_plans WHERE id = ${q(CADENCE_PLAN_ID)}`),
      'the cadence plan stays DRAFT so it never enters the lot-creation resolver',
    ).toBe('DRAFT')
    expect(
      sqlValue(
        `SELECT count(*) FROM sampling_plans
          WHERE company_id = ${q(COMPANY_ID)} AND status_id = 'ACTIVE'
            AND inspection_point = 'IN_PROCESS' AND product_id = ${q(PRODUCT_ID)}
            AND deleted_at IS NULL`,
      ),
      'exactly one ACTIVE in-process plan for this product — the resolver stays unambiguous',
    ).toBe('1')
  })

  test('the record DOES display when the next collection is due — TC-09-12 step 5 is not N/A', async ({
    page,
  }) => {
    // The assertion that contradicts the documented position. Anchored on the
    // banner's own copy (`cadence.text`, InspectionLotDetail.vue:392-403), which
    // is generated from `nextDueAt.formatDate('time')` — so a green run means a
    // concrete clock time was computed and rendered, not merely that some
    // cadence element exists.
    const lot = await startedCadenceLot(page, 'DISPLAY')

    // Before anything is collected the banner states the opening position.
    await page.goto(`/qc-inspection/lots/${lot.id}`)
    await expect(
      page.getByText('Sample collection is due now — collect the first sample.'),
      'with nothing collected yet, the first collection is due immediately',
    ).toBeVisible({ timeout: 30_000 })

    // Collect one THROUGH THE UI. Deliberately not `page.request`: the cadence
    // is computed from `collectedSamples`, which is read out of IndexedDB, and
    // a REST write reaches the server without passing through the syncEngine —
    // the page then keeps rendering "collect the first sample" and the whole
    // test reads as "the banner does not work". (Measured: that is exactly how
    // this failed before the switch.) The dialog is reachable here because
    // nothing has been collected yet, so `nextDueAt` is null and the control is
    // not gated. The cadence clock starts from this unit's server timestamp.
    await collectSamples(page, { count: 1 })
    await waitForSqlValue(
      `SELECT count(*) FROM inspection_samples WHERE inspection_lot_id = ${q(lot.id)}`,
      { timeoutMs: 30_000, label: 'first unit collected' },
    )

    await expect(
      page.getByText(/Next sample collection at \d/),
      'TC-09-12 step 5: the record DOES indicate when the next collection is due',
    ).toBeVisible({ timeout: 30_000 })

    // ── Overdue ────────────────────────────────────────────────────────────
    // Push the collection back past the interval, then read it in a context
    // that has never seen this lot — see `backdateSamples`' header for why the
    // already-open page cannot be made to notice.
    backdateSamples(lot.id, INTERVAL_MINUTES + 10)
    const freshCtx = await page.context().browser().newContext({ storageState: AUTH.qcInspector })
    const fresh = await freshCtx.newPage()
    try {
      await fresh.goto(`/qc-inspection/lots/${lot.id}`)
      await expect(
        fresh.getByText(/Sample collection is due now — was due \d/),
        'and an OVERDUE warning exists too, naming the time it was due',
      ).toBeVisible({ timeout: 60_000 })
    } finally {
      await freshCtx.close()
    }

    test.info().annotations.push({
      type: 'doc-defect',
      description:
        'DOC-QCI-12 — OQ-09 TC-09-12 step 5 and the §12 coverage row both state that no ' +
        'next-collection due time, approaching warning or overdue warning is displayed, and ' +
        'instruct the executor to mark the step N/A. All three exist, in ' +
        'InspectionLotDetail.vue:359-403 + 964-989. The claim came from reasoning over the ' +
        'schema (no due column is stored) — but the due time is derived on the client from ' +
        'collection_interval_minutes + collected_at and never persisted. Step 5 should be ' +
        'executed, not marked N/A.',
    })
  })

  test('the interval IS gated in the browser — and not at all on the server', async ({ page }) => {
    // TC-09-12 step 4, which expects "Permitted — the interval is guidance, not
    // a gate". That is true of the API and FALSE of the interface, and the two
    // halves are asserted side by side because the gap between them is the
    // finding: a control a user cannot bypass through the product, and a
    // caller reaching past it can.
    const lot = await startedCadenceLot(page, 'GATE')

    // Through the UI, for the reason the display test explains: the gate is
    // computed from IndexedDB, so a REST-only first collection would leave
    // `nextDueAt` null and the button enabled — the assertion below would then
    // be green while proving nothing.
    await page.goto(`/qc-inspection/lots/${lot.id}`)
    await collectSamples(page, { count: 1 })
    await waitForSqlValue(
      `SELECT count(*) FROM inspection_samples WHERE inspection_lot_id = ${q(lot.id)}`,
      { timeoutMs: 30_000, label: 'first unit collected' },
    )

    // ── The UI refuses ─────────────────────────────────────────────────────
    // 180 minutes out, minus the 5-minute grace, so `collectTooEarly` is true
    // and stays true for the life of the test. The banner is asserted first so
    // a disabled button cannot be mistaken for some unrelated block (an absent
    // batch, an uncleared line) — the cadence has to be the reason.
    const collectButtons = page.getByRole('button', { name: 'Collect sample(s)' })
    await expect(
      page.getByText(/Next sample collection at \d/),
      'the page knows a unit was collected and when the next one is due',
    ).toBeVisible({ timeout: 30_000 })
    const count = await collectButtons.count()
    for (let i = 0; i < count; i += 1) {
      await expect(
        collectButtons.nth(i),
        `collect control ${i + 1} is disabled while the interval has not elapsed`,
      ).toBeDisabled()
    }

    // ── The server does not ────────────────────────────────────────────────
    // The identical request the disabled button would have made, issued
    // directly. This is the assertion with teeth: the cadence is a browser
    // convention, so an API key, a script, or a devtools session collects
    // whenever it likes and the record carries no sign of it.
    const before = sampleCount(lot.id)
    const immediate = await collect(page, lot.id, 1)
    expect(
      immediate.ok(),
      'the server accepts a collection the interface refuses — the cadence gate is client-side only',
    ).toBeTruthy()
    await expect
      .poll(() => sampleCount(lot.id), { timeout: 20_000, message: 'the unit was appended' })
      .toBe(before + 1)

    // Over-collection past the plan's per-collection size is permitted too, and
    // the service says so in its own docstring ("the plan size is a guideline").
    // Pinned beside the interval because a reader weighing the cadence as a
    // control needs both facts: neither WHEN nor HOW MANY is enforced.
    const over = await collect(page, lot.id, 9)
    expect(
      over.ok(),
      'and collecting more units than the plan prescribes is permitted, by design',
    ).toBeTruthy()

    test.info().annotations.push({
      type: 'known-defect',
      description:
        'QCI-D1 — the collection cadence is enforced only in the browser. ' +
        'InspectionLotDetail.vue disables both Collect controls while collectTooEarly, but ' +
        'inspectionSampleService.addSamples validates only phase, active inspector, batch ' +
        'clearance and 1..500 count — it never loads the sampling plan and never reads a ' +
        'previous collected_at. So the record can claim a cadence the system cannot evidence. ' +
        'If a timed sampling cadence is relied upon, it is a procedural control.',
    })
  })

  test('once the interval has elapsed the control re-opens, and the server was never the gate', async ({
    page,
  }) => {
    // The other side of the same boundary. A guard that is merely "always
    // disabled" would satisfy the test above just as well as a working one, so
    // the button has to be shown re-enabling for the right reason.
    const lot = await startedCadenceLot(page, 'REOPEN')
    await page.goto(`/qc-inspection/lots/${lot.id}`)
    await collectSamples(page, { count: 1 })
    await waitForSqlValue(
      `SELECT count(*) FROM inspection_samples WHERE inspection_lot_id = ${q(lot.id)}`,
      { timeoutMs: 30_000, label: 'first unit collected' },
    )

    await expect(
      page.getByText(/Next sample collection at \d/),
      'the page sees the collected unit',
    ).toBeVisible({ timeout: 30_000 })
    await expect(
      page.getByRole('button', { name: 'Collect sample(s)' }).first(),
      'too early: disabled',
    ).toBeDisabled({ timeout: 30_000 })

    // Age the collection past the interval — the window is now open. Read in a
    // fresh context for the reason `backdateSamples` documents.
    backdateSamples(lot.id, INTERVAL_MINUTES + 10)
    const freshCtx = await page.context().browser().newContext({ storageState: AUTH.qcInspector })
    const fresh = await freshCtx.newPage()
    try {
      await fresh.goto(`/qc-inspection/lots/${lot.id}`)
      await expect(
        fresh.getByText(/Sample collection is due now — was due \d/),
        'the cadence has fallen due',
      ).toBeVisible({ timeout: 60_000 })
      await expect(
        fresh.getByRole('button', { name: 'Collect sample(s)' }).first(),
        'interval elapsed: the control re-opens',
      ).toBeEnabled({ timeout: 30_000 })
    } finally {
      await freshCtx.close()
    }

    // And the lot never left the state the gate is scoped to, so the enable /
    // disable difference is attributable to the cadence and to nothing else.
    expect(findLotByNumber(lot.lotNumber).phase, 'still in progress throughout').toBe('IN_PROGRESS')
  })
})
