// ANL-A16 · The Insights panel quotes the metric layer, and nothing else.
//
// ── THE RULE THIS FILE POLICES ──────────────────────────────────────────────
// Insights are the only surface in this module that speaks in SENTENCES rather
// than tiles, and a sentence is far more persuasive than a tile. "Under Review
// stands out on Change Requests Raised — 459 against a median of 71 across 5
// segments" is read as a finding; somebody raises a CAPA about it. So the
// governing rule of the whole module — no figure is ever produced by anything
// other than the semantic metric layer — matters more here than anywhere else,
// and its violation would be INVISIBLE on screen: the sentence reads exactly
// the same whether the 459 came out of metric_breakdown() or out of a stray
// COUNT(*) somebody added to the worker in a hurry.
//
// generate_analytics_insights is built so that cannot happen — it contains no
// aggregate SQL at all, not one GROUP BY, and every figure arrives from
// metric_value() / metric_series() / metric_breakdown(). This spec is the test
// that says so from the outside, where a reader stands.
//
// ── THE CLAIM DECOMPOSES INTO TWO LINKS, AND BOTH ARE CHECKED ───────────────
// The generator writes the sentence AND the figures it quotes onto the same row
// (`value`, `comparison_value`, `basis_count`, `test_statistic`, the period, the
// dimension it split by), so "the number agrees with the metric" is really:
//
//   screen ↔ row    the panel prints the generator's sentence verbatim — it
//                   does not paraphrase it, re-round it, or recompute anything
//                   inside it client-side.
//   row    ↔ layer  those figures are re-derivable by calling the layer AGAIN,
//                   as the same reader, for the same metric, dimension and
//                   period, with the generator's own arguments.
//
// The second link is what earns the file. Reading the row back and comparing it
// to itself would pass just as happily on a number the worker invented; the
// only honest check re-asks the question and compares answers.
//
// ── WHY IT REGENERATES BEFORE IT LOOKS ──────────────────────────────────────
// Insights are nightly. On a database reset there are none at all, and by
// mid-afternoon the ones from 05:30 describe a tenant that other suites have
// been adding records to all day — so a row saying 459 and a fresh breakdown
// saying 461 would fail this spec for a reason that is not a defect. The file
// therefore establishes its own premise through the REAL worker task, the way
// `ensureRollup()` does for the rollup: enqueue, wait, then assert. A green run
// then also means the generation path itself works, rather than that somebody
// hand-wrote a plausible row.
//
// ── THREE TRAPS, EACH PAID FOR ONCE ─────────────────────────────────────────
//  1. FIGURES ARE COMPARED AS RENDERED, NOT AS NUMBERS. The author's second
//     insight stores comparison_value = 57.5 and says "a median of 58": the
//     metric declares precision 0, so formatValue() rounds it for the reader.
//     A `Number(...)` equality check on the median is therefore wrong, and
//     wrong in the direction that looks like a product bug. `asDisplayed()`
//     below mirrors the generator's own formatter so the comparison happens in
//     the same units the sentence is written in.
//  2. `disabled` HERE IS aria-disabled, NOT AN ATTRIBUTE. BaseClickableRow
//     renders a div[role=button][aria-disabled], so the inert card is clicked
//     with `force: true` — an ordinary click can sit in Playwright's
//     actionability wait for the full 25s action timeout and report a hang
//     where the assertion is "nothing happens".
//  3. THE DATABASE IS POLLED AT 2s, NEVER TIGHTER. Every probe here spawns a
//     `docker exec`; a 500ms interval over half a minute has already produced a
//     `spawnSync docker ETIMEDOUT` elsewhere in this suite.
//
// ── WHAT THE SEEDED READER ACTUALLY HAS ─────────────────────────────────────
// Measured on app-db, 2026-08-27: the author holds exactly two insights, both
// `ranked_outlier` — one over change_control.raised WITH a drill route, one over
// part11.signatures_captured with none, because that metric has no list to open.
// That is why both shapes are covered and why neither is hardcoded: which rules
// fire is a property of the tenant's data on the day, so every expectation in
// this file is derived from the rows the reader can actually see.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH, COMPANY_ID, USERS } from '../fixtures/cast.js'
import { sql, sqlAsAppUser, waitForSqlValue } from '../fixtures/db.js'
import { ensureRollup, gotoAnalytics } from '../fixtures/analytics.js'

test.use({ storageState: AUTH.author })

const READER = USERS.author.id

// AnalyticsHome mounts the panel as `<AnalyticsInsightsPanel :limit="6" />`, so
// a reader with more than six sees six and a "N more not shown" line.
const PANEL_LIMIT = 6

const BENIGN =
  /favicon|\[vite\]|Download the Vue Devtools|WebSocket connection|net::ERR_ABORTED|ResizeObserver loop/i

/** Fail on what the page throws, not only on what it shows. See A12. */
function watchForErrors(page) {
  const uncaught = []
  const consoleErrors = []
  page.on('pageerror', (err) => uncaught.push(err.message))
  page.on('console', (msg) => {
    if (msg.type() === 'error' && !BENIGN.test(msg.text())) consoleErrors.push(msg.text())
  })
  return function check() {
    expect(uncaught, `uncaught page errors:\n${uncaught.join('\n')}`).toEqual([])
    expect(consoleErrors, `console errors:\n${consoleErrors.join('\n')}`).toEqual([])
  }
}

const q = (s) => `'${String(s).replace(/'/g, "''")}'`

// psql is asked for one column per row and the columns are joined on a control
// character, because `sqlAsAppUser` echoes its own set_config() calls first and
// those echoes are indistinguishable from a result by shape alone. Tagging the
// payload line is the fixture's own idiom (see `metricValueAs`).
const SEP = '\u001f'
const cols = (list) => list.map((c) => `coalesce(${c}, '')`).join(` || '${SEP}' || `)

// ─────────────────────────────────────────────────────────────────────────────
// The generator's own arithmetic, mirrored — deliberately, and only this much
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `insightRules.formatValue`, reproduced.
 *
 * The sentence on screen is TEXT, so the only comparison that means anything is
 * a text comparison: unit suffix included, and at the precision the metric
 * itself declares. Comparing parsed numbers instead would fail on the perfectly
 * correct "a median of 58" for a stored 57.5 (see trap 1 in the header), and
 * would silently accept "12.4%" where the layer says 12.35%.
 */
function asDisplayed(value, unit, precision) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return 'no value'
  const p = unit === 'count' ? 0 : Number.isFinite(precision) ? precision : 1
  const n = Number(value).toFixed(p)
  if (unit === 'percent') return `${n}%`
  if (unit === 'days') return `${n} days`
  return n
}

/** The median of the layer's own segment values — not a second opinion about them. */
function median(values) {
  const xs = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b)
  if (!xs.length) return null
  const mid = Math.floor(xs.length / 2)
  return xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2
}

/**
 * How many records a breakdown row rests on: the denominator where there is one,
 * else the numerator. A count metric has no denominator and the count IS the
 * exposure — treating it as unbounded is how "3 NCs, up from 1" reaches a
 * management review as a 200% rise.
 */
const basisOf = (row) => (row.denominator !== null ? row.denominator : row.numerator)

// ─────────────────────────────────────────────────────────────────────────────
// Establishing the premise
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Regenerate this reader's insights through the real worker task and wait for
 * the queue to drain.
 *
 * The barrier is the JOB, not a row count, and that is not incidental: a run
 * that legitimately produces NOTHING (every rule declined) sweeps the reader's
 * rows and leaves the table empty, so any barrier phrased as "wait for rows"
 * would hang for its whole timeout on a correct outcome. graphile-worker deletes
 * a job when it succeeds, so "no such job remains" covers both endings, and a
 * job that keeps failing correctly holds the barrier until it times out with a
 * message naming what it waited for.
 *
 * `payload` is `json`, NOT `jsonb` — the jsonb cast raises "function
 * graphile_worker.add_job(unknown, jsonb) does not exist", which reads like a
 * missing extension rather than a wrong cast.
 */
async function regenerateInsights({ timeoutMs = 60_000 } = {}) {
  sql(
    `SELECT graphile_worker.add_job('generate_analytics_insights',
       ${q(JSON.stringify({ userId: READER, companyId: COMPANY_ID }))}::json)`,
  )
  await waitForSqlValue(
    `SELECT (count(*) = 0)::text
       FROM graphile_worker._private_jobs j
       JOIN graphile_worker._private_tasks t ON t.id = j.task_id
      WHERE t.identifier = 'generate_analytics_insights'`,
    {
      timeoutMs,
      // 2s, never tighter — see trap 3.
      intervalMs: 2_000,
      label: 'the generate_analytics_insights job finished',
    },
  )
}

/**
 * The insights this reader can see, in the order the panel puts them.
 *
 * Read under `app_user` with no WHERE clause on purpose. `analytics_insights_
 * select_rls` ends with `scope_fingerprint = analytics_scope_fingerprint()`, so
 * the policy — not this query — decides which rows belong to the reader. If that
 * clause ever stopped matching, this query and the panel would go empty
 * together, which is the honest outcome; filtering by generated_for_user_id as
 * the superuser would instead hand the spec rows the user cannot actually read
 * and turn a visibility defect into a mysterious UI failure.
 *
 * `precision` is pulled from analytics_metrics.format in the same pass because
 * metric_catalog() does not expose it and the sentence cannot be checked without
 * it.
 */
function insightsForReader() {
  const payload = cols([
    'i.rule_id',
    'i.metric_key',
    'i.metric_name',
    'i.unit',
    'i.period_grain',
    'i.period_start::text',
    'i.period_end::text',
    'i.dimension_key',
    'i.dimension_value',
    'i.value::text',
    'i.comparison_value::text',
    'i.basis_count::text',
    'i.test_statistic::text',
    'i.drill_route',
    'i.drill_filters::text',
    'i.headline',
    'i.detail',
    `(SELECT m.format->>'precision' FROM public.analytics_metrics m WHERE m.id = i.metric_key)`,
  ])

  const res = sqlAsAppUser(
    `SELECT 'A16INS=' || ${payload}
       FROM public.analytics_insights i
      -- The panel's own ordering: most recently computed first, then by how much
      -- moved. One run stamps every row with the same computed_at, so in practice
      -- the second key is the one that decides what the top six are.
      ORDER BY i.computed_at DESC, abs(coalesce(i.delta_pct, 0)) DESC`,
    { userId: READER, companyId: COMPANY_ID },
  )
  expect(res.ok, `reading analytics_insights as the reader failed:\n${res.error}`).toBe(true)

  return res.output
    .split('\n')
    .filter((l) => l.startsWith('A16INS='))
    .map((line) => {
      const f = line.slice('A16INS='.length).split(SEP)
      const numOrNull = (v) => (v === '' ? null : Number(v))
      return {
        ruleId: f[0],
        metricKey: f[1],
        metricName: f[2],
        unit: f[3],
        periodGrain: f[4],
        periodStart: f[5],
        periodEnd: f[6],
        dimensionKey: f[7] || null,
        dimensionValue: f[8],
        value: numOrNull(f[9]),
        comparisonValue: numOrNull(f[10]),
        basisCount: numOrNull(f[11]),
        testStatistic: numOrNull(f[12]),
        drillRoute: f[13] || null,
        drillFilters: f[14] ? JSON.parse(f[14]) : {},
        headline: f[15],
        detail: f[16],
        precision: f[17] === '' ? 1 : Number(f[17]),
      }
    })
}

/**
 * `metric_breakdown()` for one insight, re-asked as the same reader.
 *
 * ⚠️ The arguments are the GENERATOR'S: limit 12, min cell 5, ranked by
 * contribution. They are the metric layer's own defaults and the generator does
 * not second-guess them, so neither may this — a breakdown taken with different
 * arguments is the answer to a different question, and comparing it to the
 * sentence would produce failures that mean nothing.
 */
function breakdownForInsight(row) {
  const payload = cols([
    'dimension_value',
    'value::text',
    'numerator::text',
    'denominator::text',
    'share_of_total::text',
    'is_residual::text',
    'suppressed::text',
  ])

  const res = sqlAsAppUser(
    `SELECT 'A16BD=' || ${payload}
       FROM public.metric_breakdown(${q(row.metricKey)}, ${q(row.dimensionKey)},
            ${q(row.periodStart)}::date, ${q(row.periodEnd)}::date, 12, 5, 'contribution')`,
    { userId: READER, companyId: COMPANY_ID },
  )
  expect(res.ok, `metric_breakdown(${row.metricKey}) failed:\n${res.error}`).toBe(true)

  return res.output
    .split('\n')
    .filter((l) => l.startsWith('A16BD='))
    .map((line) => {
      const f = line.slice('A16BD='.length).split(SEP)
      const numOrNull = (v) => (v === '' ? null : Number(v))
      return {
        dimensionValue: f[0],
        value: numOrNull(f[1]),
        numerator: numOrNull(f[2]),
        denominator: numOrNull(f[3]),
        shareOfTotal: numOrNull(f[4]),
        isResidual: f[5] === 'true',
        suppressed: f[6] === 'true',
      }
    })
}

// ─────────────────────────────────────────────────────────────────────────────
// Locators
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The Insights section.
 *
 * PageSection renders a plain `<section>`, and the panel's is the one carrying
 * the "Insights" heading. `.last()` rather than `.first()`: if the page ever
 * nests another section around this one, DOM order puts the ANCESTOR first, and
 * the ancestor contains every card on the page.
 */
function insightsPanel(page) {
  return page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: 'Insights', exact: true }) })
    .last()
}

/** Every insight card. BaseClickableRow renders each one as a role=button. */
const insightCards = (page) => insightsPanel(page).getByRole('button')

/**
 * One card, by the accessible name the panel gives it.
 *
 * The two names are not interchangeable and the difference is the product's:
 * a card with a drill target announces "Open the records behind: …" because
 * pressing it does something, and one without announces the headline alone
 * because pressing it does not. Deriving the expected name from `drillRoute`
 * therefore also asserts that the panel labelled the card honestly.
 */
function cardFor(page, row) {
  const name = row.drillRoute ? `Open the records behind: ${row.headline}` : row.headline
  return insightsPanel(page).getByRole('button', { name, exact: true }).first()
}

// The two clauses of a ranked_outlier sentence that carry figures. Written
// against the generator's template rather than against one captured example, so
// a percent or days metric ("reads 12.5% against a median of 9.0%", "reads 3.2
// days …") parses with the same expressions as a count one.
const QUOTED_COMPARISON =
  /reads (\S+(?: days)?) against a median of (\S+(?: days)?) across (\d+) segments \(modified z (-?[\d.]+)\)/
const QUOTED_BASIS = /rests on ([\d.]+) records(?: and is ([\d.]+)% of the total)?/

test.describe('ANL-A16 · insights agree with the metrics they cite', () => {
  /** @type {ReturnType<typeof insightsForReader>} */
  let insights = []

  test.beforeAll(async () => {
    await ensureRollup()
    await regenerateInsights()
    insights = insightsForReader()
  })

  test('the panel accounts for itself — sentences, or a named reason there are none', async ({
    page,
  }) => {
    const check = watchForErrors(page)
    await gotoAnalytics(page)

    await expect(page.getByRole('heading', { name: 'Insights', exact: true })).toBeVisible({
      timeout: 20_000,
    })

    // Cards OR one of the three NAMED empties — never a bare blank. Which empty
    // it is carries the whole meaning: "nothing stood out" and "your access
    // changed, so these are being rebuilt" are pixel-identical lists and mean
    // opposite things, and a quality manager told "nothing to report" during a
    // week when something WAS reported only finds out by asking a colleague.
    // This test exists so the file always asserts something even on a tenant
    // where every rule legitimately declines.
    const named = insightsPanel(page).getByText(
      /nothing stood out|no insights have been generated yet|your access changed/i,
    )
    await expect(insightCards(page).first().or(named).first()).toBeVisible({ timeout: 20_000 })

    check()
  })

  test('every sentence on screen is the one the generator wrote, with its citation', async ({
    page,
  }) => {
    test.skip(
      insights.length === 0,
      'no rule fired for this reader on the current data — nothing to compare',
    )
    const check = watchForErrors(page)
    await gotoAnalytics(page)

    const shown = insights.slice(0, PANEL_LIMIT)
    await expect(insightCards(page).first()).toBeVisible({ timeout: 20_000 })

    for (const row of shown) {
      const card = cardFor(page, row)
      await expect(card, `an insight card for "${row.headline}"`).toBeVisible({ timeout: 20_000 })

      // THE POINT OF THIS TEST. The sentence is rendered VERBATIM. A panel that
      // re-rounds a figure, re-words a claim or recomputes anything inside the
      // detail is producing a number the citation underneath no longer accounts
      // for — and it would look completely normal.
      await expect(card).toContainText(row.detail)

      // The citation. Phase 9's exit criterion is that every insight links to
      // the metric and the period that produced it; the metric name and the
      // basis are that link's visible half.
      await expect(card).toContainText(row.metricName)

      // Tolerant of trailing zeros only: `basis_count` is a numeric column and
      // what the client makes of it on the way through is not this test's
      // business. The DIGITS are.
      await expect(card).toHaveText(
        new RegExp(`based on\\s+${row.basisCount}(?:\\.0+)?\\s+records?`),
      )
    }

    // No card may exist that no row accounts for. Without this, a panel
    // rendering a stale or fabricated seventh sentence would pass every
    // assertion above.
    await expect(insightCards(page)).toHaveCount(shown.length)

    check()
  })

  test('the figures a sentence quotes are the metric layer’s own figures', async ({ page }) => {
    const outliers = insights.slice(0, PANEL_LIMIT).filter((i) => i.ruleId === 'ranked_outlier')
    test.skip(
      outliers.length === 0,
      'no ranked_outlier insight is on the panel; the other rules quote a series, not a breakdown',
    )
    const check = watchForErrors(page)
    await gotoAnalytics(page)

    for (const row of outliers) {
      const card = cardFor(page, row)
      await expect(card).toBeVisible({ timeout: 20_000 })

      // Parsed from the SCREEN, not from the row. The row is where the number
      // was stored; the screen is where somebody believes it.
      const sentence = (await card.innerText()).replace(/\s+/g, ' ')
      const compared = QUOTED_COMPARISON.exec(sentence)
      const rested = QUOTED_BASIS.exec(sentence)
      expect(compared, `the outlier sentence states its figures: ${sentence}`).not.toBeNull()
      expect(rested, `the outlier sentence states what it rests on: ${sentence}`).not.toBeNull()
      const [, quotedValue, quotedMedian, quotedSegments, quotedZ] = compared
      const [, quotedBasis, quotedShare] = rested

      // It says which metric, and over what — a figure with no period attached
      // is not checkable by anybody, reader or test.
      expect(sentence, 'the sentence names the metric it came from').toContain(`(${row.metricKey})`)

      // Ask the layer the same question again, as the same person.
      const layer = breakdownForInsight(row)
      const comparable = layer.filter((r) => !r.isResidual && !r.suppressed && r.value !== null)
      const segment = comparable.find((r) => r.dimensionValue === row.dimensionValue)
      expect(
        segment,
        `metric_breakdown still returns the "${row.dimensionValue}" segment the sentence is about`,
      ).toBeTruthy()

      // Each quoted figure against the layer's answer, compared as RENDERED.
      expect(quotedValue, 'the segment figure is the layer’s figure').toBe(
        asDisplayed(segment.value, row.unit, row.precision),
      )
      expect(quotedMedian, 'the median is the median of the layer’s own segments').toBe(
        asDisplayed(median(comparable.map((r) => r.value)), row.unit, row.precision),
      )
      expect(Number(quotedSegments), 'the segment count is what the breakdown returned').toBe(
        comparable.length,
      )
      expect(Number(quotedBasis), 'the claim rests on the records the layer counted').toBe(
        basisOf(segment),
      )

      // The share is the one figure given a tolerance, and the asymmetry is
      // deliberate rather than a hedge: a segment's own count moves only if a
      // record lands in THAT segment, while the share is a ratio over the
      // whole-period total, so any record another suite creates anywhere in the
      // tenant between generation and this re-derivation nudges it. A tenth of a
      // point of slack still catches an invented number, which would be out by
      // whole percentage points.
      if (quotedShare !== undefined && segment.shareOfTotal !== null) {
        expect(
          Math.abs(Number(quotedShare) - segment.shareOfTotal),
          `the quoted share (${quotedShare}%) is the layer’s share (${segment.shareOfTotal}%)`,
        ).toBeLessThanOrEqual(0.2)
      }

      // The modified z is the RULE's arithmetic over those figures rather than a
      // figure the layer produces, so it is checked against what the row
      // recorded. Its job here is to prove the statistic on screen belongs to
      // this insight — a sentence carrying another row's z would otherwise read
      // perfectly.
      expect(quotedZ, 'the statistic on screen is the one this insight recorded').toBe(
        Number(row.testStatistic).toFixed(2),
      )
    }

    check()
  })

  test('an insight with records behind it opens exactly those records', async ({ page }) => {
    const drillable = insights.slice(0, PANEL_LIMIT).find((i) => i.drillRoute)
    test.skip(
      !drillable,
      'none of this reader’s insights carries a drill target; several metrics have no list to open',
    )
    const check = watchForErrors(page)
    await gotoAnalytics(page)

    const card = cardFor(page, drillable)
    await expect(card).toBeVisible({ timeout: 20_000 })
    await expect(card, 'a card with a drill target is operable').toBeEnabled()
    await card.click()

    // The FILTERS, not just the route. The generator stored the filters that
    // reproduce the population it counted, and the panel is required to pass the
    // stored target through rather than re-derive one — a drill that lands on
    // the right list UNFILTERED shows a different population than the sentence
    // counted, and the destination looks perfectly correct while it does it.
    //
    // ⚠️ Asserted INSIDE the predicate rather than by reading `page.url()`
    // afterwards, and that is a race, not a style choice: every list page here
    // syncs its own filters back to the query with `router.replace` the moment
    // it hydrates, and `filtersToQuery` DELETES any value equal to that list's
    // own default. Checking after the fact would sometimes be checking the
    // list's normalised URL instead of the one the panel navigated to.
    const carried = Object.entries(drillable.drillFilters ?? {}).filter(
      ([, v]) => v !== null && v !== undefined && v !== '',
    )
    await page.waitForURL(
      (url) =>
        url.pathname === drillable.drillRoute &&
        carried.every(([key, value]) => url.searchParams.get(key) === String(value)),
      { timeout: 20_000 },
    )

    // Somewhere real. Asserted as "a page rendered and it is not a refusal"
    // rather than by looking for a table: drill targets span several modules
    // whose lists are built differently, and pinning one module's markup here
    // would fail for reasons that have nothing to do with drilling. An insight
    // computed under this reader's own scope cannot legitimately point at a
    // module they may not read, so a denial here IS the defect.
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText(/not found|no access|isn't included/i)).toHaveCount(0)

    check()
  })

  test('an insight with nothing to open says so, and goes nowhere when pressed', async ({
    page,
  }) => {
    const inert = insights.slice(0, PANEL_LIMIT).find((i) => !i.drillRoute)
    test.skip(!inert, 'every insight this reader holds has a drill target on the current data')
    const check = watchForErrors(page)
    await gotoAnalytics(page)

    const card = cardFor(page, inert)
    await expect(card).toBeVisible({ timeout: 20_000 })

    // Announced as disabled, so a keyboard or screen-reader user is not offered
    // a control that does nothing. `toBeDisabled()` reads aria-disabled, which
    // is what BaseClickableRow sets on a non-link row.
    await expect(card, 'a card with no drill target announces itself as disabled').toBeDisabled()

    // `force`, on purpose — see trap 2. The assertion is that the click changes
    // nothing, and a non-forced click would spend the whole action timeout
    // waiting for the element to become enabled and then report that instead.
    await card.click({ force: true })
    await expect(page).toHaveURL(/\/analytics(\/|\?|$)/)
    await expect(card).toBeVisible()

    check()
  })
})
