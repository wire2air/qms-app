// ANL-A14 · The Insights tab, on all five modules that carry one.
//
// ── WHY A SEPARATE FILE FOR WHAT LOOKS LIKE THE SAME COMPONENT ──────────────
// ModuleInsightsTab renders the same tiles as the command centre, so the
// tempting conclusion is that A13 already covers it. It does not, for two
// reasons that only show up in the host:
//
//   1. The tab is reached by `?tab=insights` on a module list route, so it is
//      mounted inside ANOTHER page's tab machinery. A panel that never mounts,
//      or that renders blank on return, fails here and nowhere else — and Vue
//      discards children handed to a slot that does not exist, silently, which
//      is precisely how the report builder's Save button went missing once.
//   2. Each host passes a different `moduleId`. A tab wired to the wrong one
//      renders perfectly and reports ANOTHER module's numbers, which is worse
//      than a blank panel: it is confidently wrong, on a screen a quality
//      manager takes decisions from.
//
// ── WHY THE MODULE LIST IS A TABLE HERE ─────────────────────────────────────
// Four of the five hosts share one persona and one behaviour, so they are a loop
// over a mapping rather than four near-identical tests: adding another Insights
// tab is one row, and the moduleId each route is expected to carry is stated in
// one readable place instead of being buried four times. Training needs a
// different persona and so has its own describe at the foot of the file.
//
// ── ON NOT ASSERTING A METRIC COUNT ─────────────────────────────────────────
// The per-module metric counts are deliberately uneven — CAPA 7, NC 6, Change
// Control 5, Documents 4, Training 1 — so "at least one tile" is the honest
// assertion. Pinning a number here would fail every time the catalog grows,
// which trains people to update the number without looking at why it moved.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH } from '../fixtures/cast.js'
import { sql } from '../fixtures/db.js'
import { ensureRollup } from '../fixtures/analytics.js'

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

// route → the moduleId that host declares on ModuleInsightsTab.
const HOSTS = [
  { label: 'Documents', route: '/documents', moduleId: 'document_control' },
  { label: 'CAPAs', route: '/capas', moduleId: 'capa' },
  { label: 'Nonconformances', route: '/nonconformances', moduleId: 'ncr' },
  { label: 'Change Requests', route: '/change-requests', moduleId: 'change_control' },
]

// Training sits in its own describe below: the author persona has no access to
// /training-instances and gets "Access denied" before any tab renders.
const TRAINING = { route: '/training-instances', moduleId: 'training_instances' }

/**
 * A tile that resolved.
 *
 * ⚠️ Located by the "How it's calculated" affordance, NOT by the drill contract,
 * and the difference is a real property of the product rather than a locator
 * preference. Drilling is not universal: the twelve work-item metrics, Documents
 * overdue for review and Electronic signatures captured have no list to open and
 * are deliberately not clickable. Every one of Documents' four metrics happens to
 * be in that set, so a drill-based locator finds nothing there and reports a
 * perfectly healthy tab as broken — which is exactly what it did on the first
 * run of this file.
 *
 * The calculation affordance is the one thing every metric surface carries.
 */
function tiles(page) {
  return page.getByRole('button', { name: /how this is calculated/i })
}

/**
 * Every metric name in the catalog, grouped by the module that owns it.
 *
 * Read from the database rather than written here for the same reason the
 * header refuses to assert a tile COUNT: which metrics exist is a property of
 * the migration set on the day, and a list typed into this file would stop
 * covering a new one without anything saying so.
 *
 * `is_active` only — `metric_catalog()` narrows further (entitlement, the
 * measured module's read, and `EXISTS (rollup)`), so this is a SUPERSET of what
 * any tab can render. That is the right direction for both halves below: the
 * positive one only needs ONE of these names on screen, and the negative one is
 * strictly stronger for including metrics the tab could not have shown anyway.
 *
 * ⚠️ `sql()` returns pipe-separated columns. Safe here because no metric name
 * or module id contains a pipe; do not extend this projection with anything
 * free-text.
 */
function metricNamesByModule() {
  const map = new Map()
  for (const line of sql(
    `SELECT module_id, name FROM public.analytics_metrics WHERE is_active ORDER BY module_id, id`,
  ).split('\n')) {
    const [moduleId, name] = line.trim().split('|')
    if (!moduleId || !name) continue
    if (!map.has(moduleId)) map.set(moduleId, [])
    map.get(moduleId).push(name)
  }
  return map
}

test.describe('ANL-A14 · module Insights tabs', () => {
  /** @type {Map<string, string[]>} */
  let catalog = new Map()

  test.beforeAll(async () => {
    await ensureRollup()
    catalog = metricNamesByModule()
  })

  for (const host of HOSTS) {
    test(`${host.label} · the Insights tab mounts and renders its own metrics`, async ({
      page,
    }) => {
      const check = watchForErrors(page)

      await page.goto(`${host.route}?tab=insights`)

      // The panel mounted at all. `?tab=insights` selecting nothing — a typo in
      // the tab value, a panel wired to a slot that does not exist — leaves the
      // list tab showing and this finds nothing.
      const panel = page.getByRole('tabpanel')
      await expect(panel).toBeVisible({ timeout: 20_000 })

      // Something resolved. One is the floor; see the header on why no upper
      // bound is asserted.
      await expect(tiles(page).first()).toBeVisible({ timeout: 20_000 })

      // And it resolved rather than failing quietly — a tile that cannot load
      // still renders a card.
      await expect(panel.getByText(/couldn't load/i)).toHaveCount(0)

      // ── THE moduleId COLUMN, FINALLY ASSERTED (2026-08-28) ────────────────
      // The header has always named this as reason #2 for the file existing —
      // "a tab wired to the wrong moduleId renders perfectly and reports
      // ANOTHER module's numbers" — and the HOSTS table has always carried the
      // expected id. Nothing ever read it. Every assertion above is satisfied
      // by a tab pointed at any module at all, so the file's own headline claim
      // was the thing it did not check.
      //
      // ModuleInsightsTab passes `moduleId` straight to `useMetricCatalog`,
      // which filters server-side, so the metric NAMES the panel prints are the
      // observable consequence of that one prop. Names are unique across these
      // four modules by construction ("CAPAs Raised" / "NCs Raised" / "Change
      // Requests Raised"), which is what makes this checkable from outside.
      const own = catalog.get(host.moduleId) ?? []
      expect(own.length, `the catalog knows metrics for ${host.moduleId}`).toBeGreaterThan(0)

      const shown = []
      for (const metricName of own) {
        if (await panel.getByText(metricName, { exact: true }).count()) shown.push(metricName)
      }
      expect(
        shown.length,
        `not one of ${host.moduleId}'s own metrics is on the ${host.label} tab`,
      ).toBeGreaterThan(0)

      // The half that catches a MIS-wiring rather than a broken one. A tab
      // handed the wrong id still renders tiles, still resolves figures, and
      // still passes every assertion above — it just answers a different
      // question, on a screen a quality manager takes decisions from.
      const foreign = HOSTS.filter((h) => h.moduleId !== host.moduleId)
        .flatMap((h) => catalog.get(h.moduleId) ?? [])
        .filter((n) => !own.includes(n))
      for (const metricName of foreign) {
        await expect(
          panel.getByText(metricName, { exact: true }),
          `"${metricName}" belongs to another module and is on the ${host.label} tab`,
        ).toHaveCount(0)
      }

      check()
    })
  }

  test('leaving the tab and coming back re-renders it, rather than blanking', async ({ page }) => {
    const check = watchForErrors(page)

    // CAPAs, because it carries the most metrics and so has the most to lose.
    await page.goto('/capas?tab=insights')
    await expect(tiles(page).first()).toBeVisible({ timeout: 20_000 })
    const before = await tiles(page).count()

    // Away, then back — through the tab controls, the way a person does it,
    // not by re-navigating, which would remount everything and prove nothing.
    await page.getByRole('tab', { name: /capas/i }).click()
    await expect(page.getByRole('tab', { name: /capas/i })).toHaveAttribute('aria-selected', 'true')
    await page.getByRole('tab', { name: /insights/i }).click()

    // The count is compared rather than mere visibility: a panel that comes back
    // half-populated is the failure worth catching, and "something is visible"
    // would pass on one surviving tile.
    await expect(tiles(page)).toHaveCount(before, { timeout: 20_000 })

    check()
  })
})

test.describe('ANL-A14 · module Insights tabs · Training', () => {
  // A DIFFERENT persona, because module access and analytics access are separate
  // grants: the author can read analytics but cannot reach /training-instances at
  // all, and a test run as them asserts nothing about the Insights tab — it only
  // proves the route guard works, which is authentication's job, not this file's.
  test.use({ storageState: AUTH.trainingAdmin })

  test.beforeAll(async () => {
    await ensureRollup()
  })

  test('the Insights tab mounts and accounts for itself, tiles or not', async ({ page }) => {
    const check = watchForErrors(page)

    await page.goto(`${TRAINING.route}?tab=insights`)

    const panel = page.getByRole('tabpanel')
    await expect(panel).toBeVisible({ timeout: 20_000 })

    // Tiles OR the named empty state — deliberately not "tiles", which is what
    // this asserted first and was wrong about. training_instances carries a
    // single metric and this persona does not see it, so the panel correctly
    // renders "No metrics for this module yet · Nothing here is measured yet, or
    // none of it is visible under your access."
    //
    // That wording is the thing worth protecting, and it is why the assertion is
    // shaped this way rather than relaxed to "the panel exists". It names BOTH
    // possibilities instead of implying the module has nothing to measure, and a
    // reader who cannot tell "not measured" from "not visible to me" will
    // conclude the wrong one. The failure this guards is a BLANK panel: no
    // tiles, no sentence, nothing to act on.
    const empty = panel.getByText(/no metrics for this module yet/i)
    await expect(tiles(page).first().or(empty)).toBeVisible({ timeout: 20_000 })
    await expect(panel.getByText(/couldn't load/i)).toHaveCount(0)

    check()
  })
})
