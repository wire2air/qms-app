// ANL-A13 · The command centre renders, and the explorer does not lie.
//
// ── WHY THESE TWO SCREENS, TOGETHER ─────────────────────────────────────────
// /analytics is the module's landing page and /analytics/explore is its most
// interactive surface, and until this file neither had a single automated test.
// They fail in opposite ways, which is why one spec covers both:
//
//   • The command centre fails QUIETLY. A tile that cannot resolve its figure
//     still renders a card, so the screen looks finished while a number is
//     missing or wrong.
//   • The explorer fails LOUDLY but late. It has more interacting controls than
//     anything else here — metric × visualisation × dimension × period — so the
//     combinations nobody tried are where it breaks.
//
// ── THE ASSERTION THAT MATTERS MOST ─────────────────────────────────────────
// "A stale render is worse than an error." If changing the metric leaves the
// PREVIOUS series on screen, the reader is looking at a real-looking number
// attached to the wrong question, and nothing anywhere says so. That is the one
// failure mode this file is built around; the rest is scaffolding for it.
//
// ── ON NOT HARDCODING THE VISUALISATION LIST ────────────────────────────────
// The viz test walks the options the builder ACTUALLY OFFERS rather than a list
// written here. Which visualisations are legal depends on the metric's shape
// (VIZ_RULES gates them), so a hardcoded list would either test combinations the
// UI refuses or silently stop covering a new one. The same lesson capaClosureDate
// learned the hard way when a hardcoded status list outlived its vocabulary.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH, ANALYTICS } from '../fixtures/cast.js'
import { ensureRollup, gotoAnalytics } from '../fixtures/analytics.js'

test.use({ storageState: AUTH.author })

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

/**
 * Pick from one of the builder's selects.
 *
 * Deliberately NOT the shared `pickFromSelect`: that one presses Escape after
 * choosing, which suits a dialog but here closes the popover the next assertion
 * wants to read back. Kept local until a second caller needs it.
 */
async function choose(page, label, optionText) {
  await openPicker(page, label)
  const option = page.getByRole('option', { name: optionText, exact: false }).first()
  await option.waitFor({ state: 'visible' })
  await option.click()
}

/**
 * Open one of the builder's pickers by its field label.
 *
 * ⚠️ The regex is ANCHORED, and that is the whole point. The page header carries
 * a help button whose accessible name is "Help: Metric Definitions", so an
 * unanchored `getByLabel('Metric')` matches IT first — the click opened the
 * Metric Definitions dialog and the test then waited 25s for an option behind
 * it. Anchoring to the start of the name excludes the help button, because its
 * name begins with "Help:". Labels also carry a required marker ("Metric *"),
 * which is why this cannot simply use exact matching either.
 */
function openPicker(page, label) {
  return page
    .getByLabel(new RegExp(`^${label}\\b`, 'i'))
    .first()
    .click()
}

/**
 * Any KPI tile on the command centre, chosen from what the page actually
 * renders.
 *
 * Not a named metric: "Key metrics" shows a SUBSET behind a "Show all N
 * metrics" control, so a hardcoded name is a coin flip on whether it is on
 * screen.
 *
 * ── WHY THIS NO LONGER KEYS OFF THE DRILL CONTRACT ──────────────────────────
 * It used to find a tile by the aria-label suffix "— open the records behind
 * this number", which AnalyticsKpiCard emits ONLY when the metric carries a
 * `drill` (route + filters). That was a safe handle while the catalog was the
 * 27 SHIPPED metrics, every one of which declared one.
 *
 * Those were removed on 2026-09-25, and `drill` is not something a tenant can
 * set: the custom-metric builder does not expose it and the compiler leaves the
 * column NULL. So no metric in the seeded catalog is drillable, and a locator
 * built on that suffix now matches nothing on a page that is otherwise working.
 */
function anyKpiTile(page) {
  // A testid, added to AnalyticsKpiCard for this. The card's root element is a
  // <div> when the metric is not drillable and BaseClickableRow when it is, so
  // there is no stable role or class to key off — and matching on the metric
  // NAME would also match the "Show all" list and the Data Explorer picker,
  // where the same string appears.
  return page.getByTestId('analytics-kpi-card').first()
}

test.describe('ANL-A13 · command centre', () => {
  test.beforeAll(async () => {
    await ensureRollup()
  })

  test('tiles resolve to real figures, and say what scope produced them', async ({ page }) => {
    const check = watchForErrors(page)
    // ⚠ /analytics/browse, NOT /analytics. The KPI strip (AnalyticsHome) moved
    // behind the Dashboards page's "Browse all metrics" action; /analytics now
    // renders DashboardsHome, which has no tiles at all. This test was asserting
    // against a page that stopped carrying the thing it tests.
    await gotoAnalytics(page, '/browse')

    const tile = anyKpiTile(page)
    await expect(tile).toBeVisible({ timeout: 20_000 })

    // Whatever it shows, it must not be the failure caption. A tile that cannot
    // load still renders a card, which is exactly how this screen fails quietly.
    await expect(tile.getByText(/couldn't load/i)).toHaveCount(0)

    // The design promise, in one assertion: every figure states the scope and
    // freshness it was computed under, because two colleagues comparing the same
    // KPI will legitimately see different totals.
    await expect(tile.getByText(/scope|tenant|site|computed|ago|updated/i).first()).toBeVisible()

    check()
  })

  // ⚠ REMOVED 2026-09-25 — 'a tile drills to the records behind its number'.
  //
  // The drill-through it asserted cannot happen for any metric this tenant can
  // have. `analytics_metrics.drill` is populated only by the shipped catalog,
  // which was deleted; the custom-metric builder has no field for it and the
  // compiler writes NULL. The test was not detecting a regression — it was
  // asserting a capability the product no longer offers to anyone.
  //
  // It is deleted rather than skipped because a skip implies "temporarily
  // broken, fix the code". The correct fix is a PRODUCT decision — give custom
  // metrics a drill target — and when that lands this test should be written
  // against the new mechanism rather than restored against the old one.
})

test.describe('ANL-A13 · data explorer', () => {
  test.beforeAll(async () => {
    await ensureRollup()
  })

  test('changing the metric replaces the result — no stale render', async ({ page }) => {
    const check = watchForErrors(page)
    await gotoAnalytics(page, '/explore')

    await choose(page, 'Metric', ANALYTICS.METRIC_LABEL)
    const first = page.getByText(ANALYTICS.METRIC_LABEL).first()
    await expect(first).toBeVisible({ timeout: 20_000 })

    // Any second metric the picker offers. Read from the UI rather than named
    // here, so this keeps working as the catalog grows.
    await openPicker(page, 'Metric')
    const options = page.getByRole('option')
    await options.first().waitFor({ state: 'visible' })
    // FIRST LINE ONLY. Each option renders its metric name and then the metric's
    // description underneath, so `allInnerTexts` yields
    // "Audit Findings Raised\nFindings recorded in the period." — handing that
    // whole two-line string to getByText matches nothing anywhere.
    const labels = await options.allInnerTexts()
    const other = labels
      .map((t) => t.split('\n')[0].trim())
      .find((t) => t && t !== ANALYTICS.METRIC_LABEL)
    expect(other, 'the catalog offers a second metric to switch to').toBeTruthy()
    await page.getByRole('option', { name: other, exact: false }).first().click()

    // THE POINT OF THIS TEST. The previous metric's name must be gone from the
    // result, not merely joined by the new one. A chart that keeps the old
    // series after the question changed is a real-looking number attached to the
    // wrong question, and nothing on screen admits it.
    await expect(page.getByText(other, { exact: false }).first()).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText(ANALYTICS.METRIC_LABEL, { exact: true })).toHaveCount(0)

    check()
  })

  test('every visualisation the builder offers actually renders', async ({ page }) => {
    const check = watchForErrors(page)
    await gotoAnalytics(page, '/explore')

    await choose(page, 'Metric', ANALYTICS.METRIC_LABEL)

    await openPicker(page, 'Visualisation')
    const opts = page.getByRole('option')
    await opts.first().waitFor({ state: 'visible' })
    const offered = (await opts.allInnerTexts()).map((t) => t.trim()).filter(Boolean)
    await page.keyboard.press('Escape')

    // Guards the derivation: an empty list would make this test pass by
    // exercising nothing at all.
    expect(offered.length, 'the builder offers at least one visualisation').toBeGreaterThan(0)

    for (const viz of offered) {
      await choose(page, 'Visualisation', viz)
      // Rendered something, and not the failure state. Each viz draws different
      // markup, so the assertion is deliberately about what must NOT be there.
      await expect(page.getByText(/couldn't load|something went wrong/i)).toHaveCount(0)
      // Re-checked per option rather than once at the end, so a failure names
      // the visualisation that caused it instead of the last one tried.
      check()
    }
  })

  test('a period change is applied, not ignored', async ({ page }) => {
    const check = watchForErrors(page)
    await gotoAnalytics(page, '/explore')

    await choose(page, 'Metric', ANALYTICS.METRIC_LABEL)
    await choose(page, 'Period', 'Last 30 days')
    await expect(page.getByText(/last 30 days/i).first()).toBeVisible({ timeout: 20_000 })

    await choose(page, 'Period', 'Last 12 months')
    await expect(page.getByText(/last 12 months/i).first()).toBeVisible({ timeout: 20_000 })
    // The token that was replaced is gone from the control, not merely
    // outranked by the new one somewhere else on the page.
    await expect(page.getByText(/last 30 days/i)).toHaveCount(0)

    check()
  })
})
