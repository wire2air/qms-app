// RA-J6 — TC-08-03 (URS-RSK-03), the OQ's own "critical test": does the tool
// derive the risk class the SOP says it should?
//
// WHY THIS FILE EXISTS, given J1 and J2 already drive the widget. Neither of
// them verifies a CALCULATION. J1 clicks ONE cell (HIGH_CELL) and asserts the
// derived row carries that cell's labels; J2 clicks LOW_CELL and HIGH_CELL to
// observe the finalize STAMP, never the arithmetic. OQ-08 §1 says outright:
// "TC-08-03 verifies the derivation against independently calculated expected
// values — do not skip it", and the coverage doc (§11, URS-RSK-03) records the
// gap as "boundary values and reconciliation against hand calculation". That
// is what this file adds, and nothing else in the suite does.
//
// ── THE TWO INDEPENDENT DERIVATIONS, AND WHY BOTH ARE ASSERTED ──────────────
// The protocol's note under the hand-calculation table is the design of this
// file: the band and the score come from two DIFFERENT mechanisms, and a
// single mis-entered score can produce a wrong RPN sitting behind a
// correct-looking colour.
//
//   · the RPN is ARITHMETIC — RiskAssessmentField#computeRpn, likelihood.score
//     x severity.score (x detectability.score where the template enables FMEA
//     mode, which the E2E template does NOT — config.enableDetectability is
//     false, so TC-08-01's "FMEA mode: Disabled" box is what applies here).
//   · the BAND is a LOOKUP — RiskAssessmentField#cellLevel reads
//     `config.cells["<likelihoodId>:<severityId>"]` and resolves that id in
//     `config.riskLevels`. It is not computed from the RPN at all.
//
// The seeded 3x3 matrix (e2e-seed.sql §44b) is what makes that distinction
// OBSERVABLE rather than merely stated, and the hand table below is calculated
// from that JSONB by hand, exactly as an executor would from an SOP:
//
//   Likelihood(score) x Severity(score)  RPN   Band (from config.cells)
//   ------------------------------------------------------------------
//   Low(1)    x Minor(1)                   1   Low       <- lowest-risk case
//   Low(1)    x Severe(3)                  3   Medium    <- band threshold
//   High(3)   x Minor(1)                   3   Medium    <- SAME RPN, and see below
//   Medium(2) x Moderate(2)                4   Medium    <- just below the High band
//   Medium(2) x Severe(3)                  6   High      <- just above it
//   High(3)   x Severe(3)                  9   High      <- highest-risk case
//
// THE ROW THAT EARNS THIS FILE. Low x Severe and High x Minor BOTH score 3.
// If the band were derived from the RPN — the single most plausible way to get
// this wrong, and the way a reader of the UI would assume it works — the two
// could never disagree, and an implementation that computed the band from the
// score would pass every other row in the table. They agree here (both Medium)
// because §44b's cell map says so, but the pair is still the evidence that the
// two derivations are independent: 4 and 6 straddle a band boundary the score
// alone cannot explain either (Medium x Moderate = 4 is Medium; High x Minor =
// 3 is ALSO Medium, so the band is not monotone in the RPN across the matrix).
//
// ── WHY THE ASSERTION IS ON capa_records.payload, NOT risk_assessments ──────
// The hand table has SIX rows, and driving six CAPAs through create -> Start
// -> score -> approve would be six full workflow runs. It is also the wrong
// place to look: `risk_assessments` is written by rcaRaDerivationService.js,
// which COPIES `finalized.computedScore` / `finalized.computedRiskLevelLabel`
// straight off the payload (no recomputation anywhere on the server). So the
// row proves the SERVICE, and the payload proves the CALCULATION — and the
// calculation is what TC-08-03 is about.
//
// So: one CAPA, one reviewer step, six re-scores on the same widget, each one
// persisted with "Save draft" (which runs the auto-finalize registry in
// WorkflowStepForm#runFinalizers, so the frozen `finalized` block is written
// without a separate Finalize click). Then ONE approval at the end carries the
// last scored cell into `risk_assessments` and closes the loop the derivation
// service owns. That is both cheaper and strictly more evidence than six runs.
//
// Steps 6 and 7 of TC-08-03 get their own tests below.
import { test, expect } from '@playwright/test'
import { AUTH, RISK_ASSESSMENT, USERS } from '../fixtures/cast.js'
import { findCapaByTitle, sql, sqlValue, waitForSqlValue } from '../fixtures/db.js'
import { createCapa, uniqueTitle, openCapa } from '../fixtures/capas.js'
import {
  waitForRiskAssessment,
  purgeRiskAssessment,
  createPersonaPool,
} from '../fixtures/riskAssessment.js'
import { clickWhenReady } from '../fixtures/documents.js'

const pool = createPersonaPool()
test.afterAll(() => pool.close())

const quote = (s) => `'${String(s).replace(/'/g, "''")}'`

/**
 * Click a matrix cell by its axis LABELS — a local replacement for
 * fixtures/riskAssessment.js#selectMatrixCell, which selects the wrong cell.
 *
 * ── THE DEFECT IN THE SHARED HELPER (found by this file, 2026-09-22) ───────
 * It resolves the row with
 *
 *     page.locator('tbody tr', { has: page.getByText(likelihood, { exact: false }) })
 *
 * and then `.first()`. Every matrix CELL renders its risk-BAND label — "Low",
 * "Medium", "High" — as its own text, and the band vocabulary is the same
 * vocabulary as the likelihood axis. So the `has:` predicate matches rows by
 * their cell contents, not by their axis label:
 *
 *     Low row     cells: Low    Low    Medium
 *     Medium row  cells: Low    Medium High
 *     High row    cells: Medium High   High
 *
 * Asking for "Medium" matches all three rows; asking for "High" matches the
 * Medium row and the High row. `.first()` then takes the topmost match, which
 * is the WRONG likelihood. Measured live on this seed: requesting
 * Low x Severe (expected RPN 3) recorded **Medium x Minor = 2**, and
 * requesting High x Severe (the suite-wide HIGH_CELL, expected RPN 9)
 * records **Medium x Severe = 6**.
 *
 * It went unnoticed because the sibling journeys only ever assert the BAND,
 * and the mis-selected cell happens to land in the same band as the intended
 * one for both HIGH_CELL and LOW_CELL. A calculation test cannot tolerate
 * that — it is the entire subject of TC-08-03 — so this file selects the row
 * by its LABEL CELL (`td:first-child`, the only cell that carries the axis
 * label) rather than by "a row containing this text anywhere".
 *
 * Defined locally and NOT patched into the shared fixture on purpose: the
 * fixture is in concurrent use by j1-j5 and by other agents in this repo, and
 * changing HIGH_CELL's meaning from "Medium x Severe" to "High x Severe"
 * would flip J1's own `computedScore` expectation. Reported rather than
 * fixed here.
 */
async function selectCell(page, { likelihood, severity }) {
  // Let the SyncEngine bootstrap burst settle, then wait for the grid itself
  // — the widget renders its header before the template's config arrives from
  // IndexedDB, so the table can be absent while the page looks ready.
  await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {})
  const table = page
    .locator('table')
    .filter({ has: page.getByText('Likelihood', { exact: false }) })
    .first()
  // The grid only draws once the template's `config` has synced into
  // IndexedDB, and under a loaded stack that can outlast a single 30s wait —
  // the widget's header and Matrix picker render first, so the page looks
  // ready while no <table> exists at all. Reload and re-check rather than
  // waiting once for longer.
  await expect(async () => {
    if (!(await table.isVisible().catch(() => false))) {
      await page.reload({ waitUntil: 'domcontentloaded' })
      await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {})
    }
    await expect(table).toBeVisible({ timeout: 30_000 })
  }).toPass({ timeout: 120_000 })

  // The row whose FIRST cell is the likelihood label. `td:first-child` is the
  // label column (the widget renders `{{ row.label }}` plus its score there);
  // every other td in the row is a clickable band cell.
  const rows = table.locator('tbody tr')
  const rowCount = await rows.count()
  let rowIndex = -1
  for (let i = 0; i < rowCount; i += 1) {
    const label = (await rows.nth(i).locator('td').first().innerText()).trim()
    // Anchored: "Low" must not match a hypothetical "Very Low", and the cell
    // also carries a "(score)" suffix on its own line.
    if (new RegExp(`^${likelihood}\\b`).test(label)) {
      rowIndex = i
      break
    }
  }
  expect(rowIndex, `a likelihood row labelled "${likelihood}" exists`).toBeGreaterThanOrEqual(0)

  // The column index among the header cells. nth(0) is the
  // "Likelihood ↓ / Severity →" corner, so the axis starts at 1.
  const headers = table.locator('thead th')
  const headerCount = await headers.count()
  let colIndex = -1
  for (let i = 1; i < headerCount; i += 1) {
    const label = (await headers.nth(i).innerText()).trim()
    if (new RegExp(`^${severity}\\b`).test(label)) {
      colIndex = i
      break
    }
  }
  expect(colIndex, `a severity column labelled "${severity}" exists`).toBeGreaterThan(0)

  await rows.nth(rowIndex).locator('td').nth(colIndex).click()

  // Prove the click LANDED on the intended cell before moving on: the
  // selected-cell summary reads "<likelihood> × <severity>". Without this the
  // next assertion would be against whatever the widget actually selected,
  // which is exactly how the shared helper's defect stayed invisible.
  await expect(
    page.getByText(new RegExp(`${likelihood}\\s*×\\s*${severity}`)),
    `the widget confirms ${likelihood} × ${severity} is selected`,
  ).toBeVisible({ timeout: 15_000 })
}

/**
 * The hand calculation, written from e2e-seed.sql §44b by reading the JSONB —
 * NOT by running the product. `rpn` is likelihood.score * severity.score;
 * `band` is the riskLevels[] label that `config.cells["<lId>:<sId>"]` points
 * at. FMEA mode is Disabled on this template (enableDetectability: false), so
 * there is no third factor — TC-08-01's mode box.
 */
const HAND_CALCULATION = [
  { likelihood: 'Low', severity: 'Minor', rpn: 1, band: 'Low', why: 'lowest-risk case' },
  { likelihood: 'Low', severity: 'Severe', rpn: 3, band: 'Medium', why: 'band threshold' },
  {
    likelihood: 'High',
    severity: 'Minor',
    rpn: 3,
    band: 'Medium',
    why: 'SAME RPN as Low x Severe — the band is a lookup, not a function of the score',
  },
  { likelihood: 'Medium', severity: 'Moderate', rpn: 4, band: 'Medium', why: 'just below the High band' },
  { likelihood: 'Medium', severity: 'Severe', rpn: 6, band: 'High', why: 'just above the High band' },
  { likelihood: 'High', severity: 'Severe', rpn: 9, band: 'High', why: 'highest-risk case' },
]

/**
 * The reviewer's own saved form payload for this CAPA's risk-review step, as
 * a parsed object.
 *
 * Postgres renders jsonb WITH spaces after ':' and ',', so this is parsed
 * rather than string-matched — and it is fetched with `sql()` (not sqlRow)
 * because a justification can contain a newline and `sqlRow` reads only
 * `out.split('\n')[0]`, which would silently truncate the JSON mid-object.
 */
function readFinalizedPayload(capaId) {
  const out = sql(
    `SELECT COALESCE(payload->'riskAssessment', 'null'::jsonb)::text
       FROM capa_records
      WHERE capa_id = ${quote(capaId)}
        AND user_id = ${quote(USERS.reviewer.id)}
        AND deleted_at IS NULL
      ORDER BY updated_at DESC LIMIT 1`,
  )
  if (!out) return null
  try {
    return JSON.parse(out)
  } catch {
    return null
  }
}

/** Click "Save draft" — runs the auto-finalize registry, then persists. */
async function saveDraft(page) {
  await clickWhenReady(page, page.getByRole('button', { name: 'Save draft' }))
}

/**
 * Arrange a CAPA on the dedicated Risk Assessment workflow, opened, with the
 * reviewer's task live and the reviewer's browser sitting on the step.
 *
 * EVERY test calls this for itself. Playwright discards the worker after a
 * failing test and runs its pending afterAll, so a file-level fixture shared
 * across tests turns one failure into a cascade of missing-precondition
 * failures (e2e/README.md's harness note; the same reason RA-J3's beforeAll is
 * deliberately empty).
 */
async function arrangeScoredStep(browser, tag) {
  const ctxAuthor = await browser.newContext({ storageState: AUTH.author })
  const authorPage = await ctxAuthor.newPage()
  const title = uniqueTitle(tag)
  await createCapa(authorPage, title, { workflowName: RISK_ASSESSMENT.workflowName })
  const capa = findCapaByTitle(title)
  expect(capa, 'the CAPA landed in Postgres').not.toBeNull()
  purgeRiskAssessment(capa.id)
  await openCapa(authorPage, capa.id)
  await ctxAuthor.close()

  await waitForSqlValue(
    `SELECT count(*) FROM task_instances
      WHERE entity_type = 'Capa' AND entity_id = ${quote(capa.id)}
        AND assigned_to = ${quote(USERS.reviewer.id)} AND status_id IN ('ASSIGNED','FORM_SUBMITTED')`,
    { timeoutMs: 45_000, label: 'reviewer task assigned' },
  )

  const ctxReviewer = await browser.newContext({ storageState: AUTH.reviewer })
  const page = await ctxReviewer.newPage()
  await page.goto(`/capas/${capa.id}`, { waitUntil: 'domcontentloaded' })
  return { capaId: capa.id, page, close: () => ctxReviewer.close() }
}

test.describe('RA-J6 · TC-08-03 risk level derivation against a hand calculation', () => {
  test('every cell in the hand-calculation table derives the expected RPN *and* the expected band', async ({
    browser,
  }) => {
    test.setTimeout(300_000)
    const { capaId, page, close } = await arrangeScoredStep(browser, 'RA-J6-matrix')

    for (const row of HAND_CALCULATION) {
      await selectCell(page, row)
      await saveDraft(page)

      // The write is a SyncEngine mutation, so poll rather than read once.
      const label = `${row.likelihood} x ${row.severity} persisted`
      await expect
        .poll(() => readFinalizedPayload(capaId)?.finalized?.likelihoodLabel, {
          timeout: 30_000,
          message: label,
        })
        .toBe(row.likelihood)
      await expect
        .poll(() => readFinalizedPayload(capaId)?.finalized?.severityLabel, {
          timeout: 30_000,
          message: label,
        })
        .toBe(row.severity)

      const ra = readFinalizedPayload(capaId).finalized
      const context = `${row.likelihood}(x) x ${row.severity}(y) — ${row.why}`

      // 1. THE RPN — likelihood.score * severity.score, FMEA mode disabled.
      expect(
        ra.computedScore,
        `${context}: RPN must equal the hand calculation ${row.rpn}`,
      ).toBe(row.rpn)
      expect(
        ra.likelihoodScore * ra.severityScore,
        `${context}: the FROZEN input scores must reproduce the stored RPN — a stored score that its own inputs cannot explain is the inconsistency the audit registry tracks all nine input columns to make detectable`,
      ).toBe(ra.computedScore)
      expect(
        ra.detectabilityScore ?? null,
        `${context}: this template has enableDetectability=false, so no third factor may enter the RPN`,
      ).toBeNull()

      // 2. THE BAND — a lookup in config.cells, independent of the RPN.
      expect(
        ra.computedRiskLevelLabel,
        `${context}: the band must equal the cell map's answer ${row.band}, which is NOT derived from the RPN`,
      ).toBe(row.band)
      expect(
        ra.computedRiskLevelId,
        `${context}: the band's id must be the riskLevels[] id the cell map points at, not a re-derived one`,
      ).toBe(RISK_ASSESSMENT.template.riskLevels[row.band.toLowerCase()].id)
    }

    // The two RPN-3 rows are the file's whole argument — restate it as an
    // assertion so a future reader cannot delete one of them without the
    // suite noticing the pair is gone.
    const rpn3 = HAND_CALCULATION.filter((r) => r.rpn === 3)
    expect(
      rpn3.length,
      'the table must keep BOTH RPN-3 cells: they are what proves the band is a lookup rather than a function of the score',
    ).toBe(2)

    // Close the loop the derivation service owns: approving carries the LAST
    // scored cell (High x Severe, RPN 9, High) onto risk_assessments verbatim.
    await clickWhenReady(page, page.getByRole('button', { name: 'Mark Complete' }))
    const derived = await waitForRiskAssessment(capaId)
    const last = HAND_CALCULATION[HAND_CALCULATION.length - 1]
    expect(derived.computedScore, 'the derived row carries the payload RPN unchanged').toBe(last.rpn)
    expect(derived.computedRiskLevelLabel, 'and the payload band unchanged').toBe(last.band)
    expect(derived.likelihoodLabel).toBe(last.likelihood)
    expect(derived.severityLabel).toBe(last.severity)

    await close()
  })

  test('TC-08-03 step 6 — changing one score recalculates BOTH the band and the RPN and un-finalizes the assessment', async ({
    browser,
  }) => {
    test.setTimeout(240_000)
    const { capaId, page, close } = await arrangeScoredStep(browser, 'RA-J6-recalc')

    // Score and finalize explicitly, then persist. The Finalize click is a
    // PLAIN click, not clickWhenReady: that helper RELOADS the page on a
    // failed attempt, and the matrix selection is unsaved client state, so a
    // reload silently discards the cell and leaves Finalize permanently
    // disabled. (Measured: the stamp never appeared, because by then there
    // was nothing selected to finalize.)
    await selectCell(page, { likelihood: 'Low', severity: 'Minor' })
    const finalizeFirst = page.getByRole('button', { name: 'Finalize Assessment' })
    await expect(finalizeFirst, 'both axes chosen, so Finalize is enabled').toBeEnabled({
      timeout: 15_000,
    })
    await finalizeFirst.click()
    // The stamp is asserted where it is EVIDENCE — on the persisted payload —
    // rather than only in the DOM. `finalizedAt` is what the derivation
    // service and the reporting register actually read.
    await expect(finalizeFirst, 'the Finalize control disappears once stamped').toHaveCount(0, {
      timeout: 15_000,
    })
    await saveDraft(page)
    await expect
      .poll(() => readFinalizedPayload(capaId)?.finalized?.computedScore, { timeout: 30_000 })
      .toBe(1)
    const before = readFinalizedPayload(capaId).finalized
    expect(before.computedRiskLevelLabel, 'Low x Minor is the Low band').toBe('Low')
    expect(before.finalizedAt, 'the stamp is set after an explicit Finalize').toBeTruthy()

    // Change ONE score: keep the likelihood, move the severity Minor -> Severe.
    // Hand calculation: 1 x 3 = 3, and cells["Low:Severe"] -> Medium. BOTH
    // move, which is the step's expected result.
    await selectCell(page, { likelihood: 'Low', severity: 'Severe' })

    // The stamp clears in the widget the instant the cell changes — the
    // Finalize button coming back IS the observable un-finalize (J2 pins the
    // same transition; here it is the third half of TC-08-03 step 6, asserted
    // alongside the recalculation rather than on its own).
    const finalizeBtn = page.getByRole('button', { name: 'Finalize Assessment' })
    await expect(
      finalizeBtn,
      'changing a score returns the assessment to un-finalized — it must be re-finalized before submission',
    ).toBeVisible({ timeout: 15_000 })

    await finalizeBtn.click()
    await expect(finalizeBtn, 'stamped again').toHaveCount(0, { timeout: 15_000 })
    await saveDraft(page)

    await expect
      .poll(() => readFinalizedPayload(capaId)?.finalized?.computedScore, {
        timeout: 30_000,
        message: 'the RPN recalculated',
      })
      .toBe(3)
    const after = readFinalizedPayload(capaId).finalized
    expect(after.computedRiskLevelLabel, 'and the band recalculated with it, by lookup').toBe(
      'Medium',
    )
    expect(after.severityLabel, 'the frozen severity label followed the change').toBe('Severe')
    expect(after.likelihoodLabel, 'the untouched axis did not move').toBe('Low')
    expect(after.finalizedAt, 're-finalizing set a fresh stamp').toBeTruthy()
    expect(
      after.finalizedAt,
      'and it is a NEW stamp, not the pre-change one carried over',
    ).not.toBe(before.finalizedAt)

    await close()
  })

  test('TC-08-03 step 7 — the risk level is derived: no control in the widget offers a hand-entered band or RPN', async ({
    browser,
  }) => {
    test.setTimeout(240_000)
    const { capaId, page, close } = await arrangeScoredStep(browser, 'RA-J6-noentry')

    await selectCell(page, { likelihood: 'High', severity: 'Severe' })

    // The widget's ONLY writable control besides the matrix cells is the
    // Justification rich-text editor (and, on a multi-template tenant, the
    // Matrix picker). There is no input, select or contenteditable bound to
    // the band or the score — the badge and the RPN tile are read-only spans.
    // Enumerate what is actually editable rather than asserting the absence of
    // a named control that was never there.
    const editable = page.locator(
      '.dynamic-form input, .dynamic-form select, .dynamic-form textarea, .dynamic-form [contenteditable="true"]',
    )
    const count = await editable.count()
    for (let i = 0; i < count; i += 1) {
      const el = editable.nth(i)
      const [name, placeholder, aria] = await Promise.all([
        el.getAttribute('name'),
        el.getAttribute('placeholder'),
        el.getAttribute('aria-label'),
      ])
      const blob = `${name ?? ''} ${placeholder ?? ''} ${aria ?? ''}`.toLowerCase()
      expect(
        /risk level|rpn|\bband\b|\bscore\b/.test(blob),
        `no writable control may accept a hand-entered risk level or score — found one described as "${blob.trim()}"`,
      ).toBe(false)
    }

    // And positively: the band that IS displayed is the cell map's answer for
    // the selected cell, so what the assessor sees is the derivation's output.
    await expect(
      page.getByText('High', { exact: true }).first(),
      'the derived band renders on the selected-cell summary',
    ).toBeVisible({ timeout: 15_000 })

    await saveDraft(page)
    await expect
      .poll(() => readFinalizedPayload(capaId)?.finalized?.computedRiskLevelLabel, {
        timeout: 30_000,
      })
      .toBe('High')

    // The boundary of the control, stated by TC-08-03's own note: the stored
    // row carries an audit trigger but NO database-level immutability seal
    // (unlike root_causes' sibling seal). Pin that as a fact, so "derived and
    // not hand-enterable" is never read as "tamper-proof at the database".
    const sealed = sqlValue(
      `SELECT count(*) FROM pg_trigger t
        WHERE t.tgrelid = 'risk_assessments'::regclass AND NOT t.tgisinternal
          AND t.tgname ILIKE '%immutab%'`,
    )
    expect(
      sealed,
      'KNOWN LIMITATION (TC-08-03 step 7 note): risk_assessments has NO immutability trigger — an out-of-interface change is captured by the audit trail but not refused. Pinned so a future seal is noticed, not so the gap is excused.',
    ).toBe('0')
    const audited = sqlValue(
      `SELECT count(*) FROM pg_trigger t
        WHERE t.tgrelid = 'risk_assessments'::regclass AND NOT t.tgisinternal
          AND t.tgname = 'risk_assessments_audit_trigger'`,
    )
    expect(audited, 'the audit trigger the note relies on IS attached').toBe('1')

    await close()
  })
})
