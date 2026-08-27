/**
 * Which visualisations a metric may legitimately be drawn as, and what each one
 * needs in order to be drawn at all.
 *
 * `analytics_widgets.viz` is CHECK-constrained to eleven values. That constraint
 * says what the COLUMN may hold; it says nothing about what is meaningful. This
 * module is the meaning. A picker that offered all eleven for every metric would
 * let a user save a chart that is not wrong-looking but wrong — a stacked bar of
 * percentages, a funnel over average days — and a chart that lies is worse than
 * one that is missing, because nobody double-checks a chart that rendered.
 *
 * ── THE RULE, IN ONE SENTENCE ───────────────────────────────────────────────
 * A visualisation is offered only when (1) the metric's UNIT makes the mark's
 * claim true, and (2) the metric layer can actually return the SHAPE the mark
 * needs. Both halves matter, and the second one eliminates more options than
 * the first.
 *
 * ── (1) WHAT EACH MARK CLAIMS ABOUT THE UNIT ────────────────────────────────
 * Stacking, slicing and funnelling all assert that the parts SUM TO THE WHOLE.
 * That is true of `count` and of nothing else in the catalog: 40 % + 55 % is not
 * 95 % of anything, and an average closure time of 12 days at one site plus 9 at
 * another is not 21 days anywhere. So `stacked_bar`, `donut` and `funnel` are
 * count-only. Position and colour marks — `line`, `bar`, `sparkline`, `heatmap`
 * — claim only "this is bigger than that", which holds for every unit.
 *
 * ── (2) WHAT THE SERVER CAN RETURN ──────────────────────────────────────────
 * There are exactly three read shapes: one value (`metric_value`), a time series
 * (`metric_series`), and a ranked breakdown (`metric_breakdown`). Two of the
 * eleven allowed viz values have no shape behind them and are therefore NEVER
 * offered — see UNSUPPORTED_VIZ below for why, stated per value so the reasoning
 * survives someone later asking "why can't I pick a histogram?".
 *
 * ── AND THE DIMENSION CONTRACT IS ASYMMETRIC (verified against the API) ─────
 * This is the sharp edge. `metric_breakdown` accepts a metric's declared
 * dimension keys PLUS the three scope dimensions site / department / owner.
 * `metric_series` accepts the declared keys ONLY — asking it for `site` is a
 * server error, not an empty result. So the dimensions a picker may offer depend
 * on WHICH VIZ is selected, which is why `dimensionSourceFor()` exists and why
 * the viz must be chosen before the dimension list can be built.
 */

/** The three read shapes, i.e. which metric function a viz is fed by. */
export const SOURCE = {
  VALUE: 'value',
  SERIES: 'series',
  BREAKDOWN: 'breakdown',
}

/**
 * Dimension keys `metric_breakdown` accepts on top of a metric's declared ones.
 * `metric_series` does NOT accept these — see the header.
 */
export const SCOPE_DIMENSIONS = [
  { value: 'site', label: 'Site' },
  { value: 'department', label: 'Department' },
  { value: 'owner', label: 'Owner' },
]

const SCOPE_DIMENSION_KEYS = new Set(SCOPE_DIMENSIONS.map((d) => d.value))

/**
 * A funnel asserts that each stage is a SUBSET of the one before it. A ranked
 * breakdown returns disjoint segments, so drawing one as a funnel would assert
 * a containment that is not in the data. Funnel is therefore gated on the metric
 * declaring an ordered-stage dimension rather than switched off: no metric in
 * the catalog declares one today, so it is never offered, but the reason is
 * encoded rather than the conclusion.
 */
const ORDERED_STAGE_KEYS = new Set(['stage', 'step', 'phase'])

/** Every unit the catalog currently uses. */
const ALL_UNITS = null // null = no unit restriction

/**
 * The offerable visualisations.
 *
 * @typedef {object} VizRule
 * @property {string} id            the value stored in `analytics_widgets.viz`
 * @property {string} label         picker label
 * @property {string} description   why you would choose it — shown in the picker
 * @property {string} source        which metric function feeds it (SOURCE.*)
 * @property {string[]|null} units  allowed `unit` values, or null for any
 * @property {'none'|'optional'|'required'} dimension
 * @property {string|null} chartType `BaseChart`'s `type` prop, or null when the
 *   viz is not a BaseChart at all (kpi is a stat card, table is a ranked list)
 */
export const VIZ_RULES = [
  {
    id: 'kpi',
    label: 'Single number',
    description: 'The headline figure with its change against the comparison period.',
    source: SOURCE.VALUE,
    units: ALL_UNITS,
    dimension: 'none',
    chartType: null,
  },
  {
    id: 'line',
    label: 'Line',
    description: 'How the metric moved over time.',
    source: SOURCE.SERIES,
    units: ALL_UNITS,
    dimension: 'optional',
    chartType: 'line',
  },
  {
    id: 'sparkline',
    label: 'Sparkline',
    description: 'A compact trend with no axes — for a dense tile.',
    source: SOURCE.SERIES,
    units: ALL_UNITS,
    dimension: 'none',
    chartType: 'sparkline',
  },
  {
    id: 'stacked_bar',
    label: 'Stacked bar',
    description: 'How the total splits over time. Counts only — the parts must add up.',
    source: SOURCE.SERIES,
    // Stacking asserts additivity. See the header.
    units: ['count'],
    dimension: 'required',
    chartType: 'stackedBar',
  },
  {
    id: 'heatmap',
    label: 'Heatmap',
    description: 'Segment against time, coloured by value — for spotting where and when.',
    source: SOURCE.SERIES,
    // Colour encodes magnitude per cell; it never sums, so any unit is honest.
    units: ALL_UNITS,
    dimension: 'required',
    chartType: 'heatmap',
  },
  {
    id: 'bar',
    label: 'Bar',
    description: 'Ranked comparison across segments for the period.',
    source: SOURCE.BREAKDOWN,
    units: ALL_UNITS,
    dimension: 'required',
    chartType: 'bar',
  },
  {
    id: 'donut',
    label: 'Donut',
    description: 'Share of the total by segment. Counts only — the slices must add up.',
    source: SOURCE.BREAKDOWN,
    units: ['count'],
    dimension: 'required',
    chartType: 'donut',
  },
  {
    id: 'table',
    label: 'Ranked list',
    description: 'Every segment with its share and a link to the records behind it.',
    source: SOURCE.BREAKDOWN,
    units: ALL_UNITS,
    dimension: 'required',
    // Rendered by AnalyticsBreakdownList, which already honours the residual
    // bucket and withheld rows correctly. BaseChart has no table type.
    chartType: null,
  },
  {
    id: 'funnel',
    label: 'Funnel',
    description: 'Stage-to-stage drop-off. Needs a metric with an ordered-stage dimension.',
    source: SOURCE.BREAKDOWN,
    units: ['count'],
    dimension: 'required',
    chartType: 'funnel',
    requiresOrderedStage: true,
  },
]

/**
 * In the column's CHECK constraint but never offered, with the reason. Both are
 * shape problems, not taste:
 *
 *  - `histogram` needs the DISTRIBUTION of a measure across bins. The metric
 *    layer returns aggregates — one value, a monthly series, a ranked breakdown
 *    — and none of them is a distribution. `BaseChart`'s histogram preset even
 *    documents that it expects data "pre-binned server-side", which nothing
 *    here produces. Offering it would draw a bar chart of a breakdown and call
 *    it a histogram.
 *
 *  - `combo` needs two measures on two scales. `BaseChart`'s combo deliberately
 *    puts every series on ONE y-axis ("A second y-scale is not offered"), and
 *    the only two measures a single metric exposes are a rate and its own
 *    denominator — 85 (%) and 300 (records) on one axis renders the rate as a
 *    flat line at the bottom of the plot.
 */
export const UNSUPPORTED_VIZ = {
  histogram: 'The metric layer returns aggregates, not distributions, so there is nothing to bin.',
  combo: 'A rate and its volume need two y-axes, and the chart component shares one on purpose.',
}

const RULE_BY_ID = new Map(VIZ_RULES.map((r) => [r.id, r]))

/** The safe fallback, and the column's own default. */
export const DEFAULT_VIZ = 'kpi'

/**
 * @param {string|null} viz
 * @returns {VizRule|null}
 */
export function vizRule(viz) {
  return RULE_BY_ID.get(viz) ?? null
}

/** Picker label for a stored viz value, falling back to the raw value. */
export function vizLabel(viz) {
  return RULE_BY_ID.get(viz)?.label ?? String(viz ?? DEFAULT_VIZ)
}

/**
 * Does this metric declare a dimension a funnel could legitimately walk?
 * @param {object} metric a metric_catalog row
 */
function hasOrderedStage(metric) {
  return (metric?.dimensions || []).some((d) => ORDERED_STAGE_KEYS.has(d?.key))
}

/**
 * The visualisations offerable for a metric, in picker order.
 *
 * @param {object|null} metric a metric_catalog row ({ unit, dimensions, … })
 * @returns {VizRule[]}
 */
export function vizOptionsFor(metric) {
  if (!metric) return []
  const unit = metric.unit || 'count'
  const declaredCount = (metric.dimensions || []).length
  return VIZ_RULES.filter((rule) => {
    if (rule.units && !rule.units.includes(unit)) return false
    if (rule.requiresOrderedStage && !hasOrderedStage(metric)) return false
    // A viz that must split by something is unofferable on a metric that can be
    // split by nothing. Breakdown-sourced ones can still fall back on the scope
    // dimensions, which every metric supports.
    if (rule.dimension === 'required' && rule.source === SOURCE.SERIES && declaredCount === 0) {
      return false
    }
    return true
  })
}

/**
 * Where a viz's dimensions may come from — see the asymmetry note in the header.
 *
 * @param {string|null} viz
 * @returns {'declared'|'declared+scope'|'none'}
 */
export function dimensionSourceFor(viz) {
  const rule = vizRule(viz)
  if (!rule || rule.dimension === 'none') return 'none'
  return rule.source === SOURCE.BREAKDOWN ? 'declared+scope' : 'declared'
}

function titleise(key) {
  return String(key)
    .replace(/[_-]+/g, ' ')
    .replace(/^\w/, (c) => c.toUpperCase())
}

/**
 * The dimension options a picker may offer for this metric AND this viz.
 *
 * THE CATALOG IS THE CONTRACT. A metric's `dimensions` array is already
 * truncated server-side to what the rollup can actually serve (`dimensionCapacity`
 * is the ceiling), and asking for a key outside it is a 500 rather than an empty
 * chart — verified against the live API. So this never invents a key, and never
 * adds the scope dimensions to a series-sourced viz.
 *
 * @param {object|null} metric a metric_catalog row
 * @param {string|null} viz
 * @returns {{ value: string, label: string, scope?: boolean }[]}
 */
export function dimensionOptionsFor(metric, viz) {
  const source = dimensionSourceFor(viz)
  if (source === 'none') return []
  const declared = (metric?.dimensions || [])
    .filter((d) => d?.key)
    .map((d) => ({ value: d.key, label: titleise(d.key) }))
  if (source === 'declared') return declared
  return [...declared, ...SCOPE_DIMENSIONS.map((d) => ({ ...d, scope: true }))]
}

/**
 * Is this dimension one the server will accept for this metric and viz?
 * Used to CLAMP a stored widget whose metric has since had a dimension removed,
 * so a stale row degrades to the un-split view instead of erroring forever.
 *
 * @param {object|null} metric
 * @param {string|null} viz
 * @param {string|null} dimension
 */
export function isDimensionAllowed(metric, viz, dimension) {
  if (!dimension) return true // "no split" is always valid
  const source = dimensionSourceFor(viz)
  if (source === 'none') return false
  if (source === 'declared+scope' && SCOPE_DIMENSION_KEYS.has(dimension)) return true
  return (metric?.dimensions || []).some((d) => d?.key === dimension)
}

/**
 * Coerce a (metric, viz, dimension) triple into one the server will accept.
 *
 * A saved widget outlives the catalog that produced it: a metric can lose a
 * dimension, or a viz can be stored that this build no longer offers. Rather
 * than render a permanently broken tile, degrade — to the default viz, and to
 * no dimension — and let the tile render the un-split answer.
 *
 * Returns the WHOLE question with `viz`/`dimension` corrected — not just the
 * two repaired keys. Callers read the result as the question they are about to
 * render or persist (`normalised.metricKey`, `q.title`, `q.filters`), so
 * returning a fragment silently strips every field it does not mention.
 *
 * @param {object|null} metric
 * @param {object} draft the question so far
 * @returns {object} `draft` with a legal `viz`/`dimension` pair
 */
export function clampQuestion(metric, draft = {}) {
  const offered = vizOptionsFor(metric)
  const viz = offered.some((r) => r.id === draft.viz) ? draft.viz : (offered[0]?.id ?? DEFAULT_VIZ)
  const rule = vizRule(viz)

  let dimension = isDimensionAllowed(metric, viz, draft.dimension) ? (draft.dimension ?? null) : null
  // A required-dimension viz with nothing to split by is not renderable; take
  // the first option the contract allows rather than firing a request that 500s.
  if (!dimension && rule?.dimension === 'required') {
    dimension = dimensionOptionsFor(metric, viz)[0]?.value ?? null
  }
  return { ...draft, viz, dimension }
}

/**
 * A readable name for a breakdown segment.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 * metric_breakdown resolves `label` by following the FOREIGN KEY on the
 * dimension column, so a dimension with no FK gets NULL and every consumer falls
 * back to the raw stored value. That is how the Insights panel came to tell a
 * quality manager "APPROVED stands out on Electronic signatures captured".
 *
 * The FK is missing for a good reason and should stay missing: signatures.meaning
 * is written through a `meaningOverride` parameter, so its value set is open. A
 * lookup table plus an FK would turn an unlisted meaning into a FAILED INSERT at
 * e-signature time, on Part 11 evidence. Constraining that to tidy up a caption
 * would be a bad trade.
 *
 * So this is fixed where it belongs — at the point of display.
 *
 * ── WHY IT IS DELIBERATELY TIMID ────────────────────────────────────────────
 * It only touches strings that are unambiguously machine codes: all-caps, and
 * either purely alphabetic or underscore-separated. Anything else is returned
 * untouched, because the alternative is mangling real data. A site named
 * "Site A" keeps its capital A; a UUID stays a UUID; and `ISO9001` — all-caps
 * but carrying digits with no underscore — is left alone rather than being
 * "corrected" to the worse-reading `Iso9001`.
 *
 * Known limitation, left unhandled on purpose: a code containing a domain
 * acronym would lose it — `CAPA_REVIEW` reads back as "Capa review". No live
 * dimension value contains one (the real ones are statuses and severities:
 * APPROVED, CLOSED, MINOR, CRITICAL), so an acronym allow-list would be
 * machinery built for a hypothetical, and a list like that rots quietly. If one
 * ever appears, this is where it goes.
 *
 * @param {string|null|undefined} value
 * @returns {string|null}
 */
export function segmentLabel(value) {
  if (value === null || value === undefined) return null
  const text = String(value)
  const isCode = /^[A-Z]+$/.test(text) || /^[A-Z0-9]+(_[A-Z0-9]+)+$/.test(text)
  if (!isCode) return text
  const words = text.toLowerCase().split('_').join(' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}
