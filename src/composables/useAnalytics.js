import { computed, toValue } from 'vue'
import { useGraphQLQuery } from '@/composables/useServerQuery.js'
import { toNumber } from '@/utils/analyticsFormat.js'

/**
 * Read side of the metric/semantic layer.
 *
 * These are the ONLY reads in the app that bypass the SyncEngine (CLAUDE.md
 * rule #4 → "Analytics exception"). They are server-computed aggregates, not
 * records: the server applies the caller's access scope while computing, so the
 * same metric key legitimately yields different numbers for different viewers
 * and must never be cached per-record in IndexedDB.
 *
 * Field names below were taken from the built PostGraphile v5 schema, not
 * guessed: each `public.metric_*` SQL function is auto-exposed as a CONNECTION
 * field named after the function in camelCase, with the pg argument names
 * camelCased verbatim — `p_metric_key` → `pMetricKey`. `analytics_feature_
 * entitled()` returns a scalar, so it is a plain Boolean field.
 *
 * `numeric` columns arrive as the `BigFloat` scalar — a STRING — so every
 * numeric field is coerced here, once, before it reaches a chart or a format
 * helper.
 */

const METRIC_CATALOG_QUERY = `
  query MetricCatalog($pModuleId: String) {
    metricCatalog(pModuleId: $pModuleId) {
      nodes {
        metricKey
        name
        description
        # Plain-English "how this number is worked out", shown behind the info
        # affordance on every metric tile. The description above is the WHAT;
        # this is the HOW — complementary, never the same sentence. NULL for a
        # metric that has not been given one yet, and the UI then renders no
        # affordance at all rather than an empty popover.
        calculationNote
        moduleId
        unit
        direction
        tier
        defaultGrain
        dimensions
        # The ceiling the rollup was built with. The dimensions array above is
        # ALREADY truncated to it server-side, so the builder never needs to
        # enforce it — it reads this only to explain a short list ("this metric
        # can be split 3 ways") instead of leaving the shortness unexplained.
        dimensionCapacity
        drill
        effectiveScope
      }
    }
  }
`

const METRIC_VALUE_QUERY = `
  query MetricValue($pMetricKey: String, $pPeriodStart: Date, $pPeriodEnd: Date, $pCompare: String) {
    metricValue(
      pMetricKey: $pMetricKey
      pPeriodStart: $pPeriodStart
      pPeriodEnd: $pPeriodEnd
      pCompare: $pCompare
    ) {
      nodes {
        metricKey
        name
        moduleId
        unit
        value
        numerator
        denominator
        comparisonValue
        deltaAbs
        deltaPct
        direction
        isSignificant
        effectiveScope
        periodStart
        periodEnd
        bucketCount
        computedAt
        tier
      }
    }
  }
`

const METRIC_SERIES_QUERY = `
  query MetricSeries(
    $pMetricKey: String
    $pPeriodStart: Date
    $pPeriodEnd: Date
    $pDimension: String
    $pMinCell: Int
    $first: Int
  ) {
    metricSeries(
      pMetricKey: $pMetricKey
      pPeriodStart: $pPeriodStart
      pPeriodEnd: $pPeriodEnd
      pDimension: $pDimension
      pMinCell: $pMinCell
      first: $first
    ) {
      nodes {
        bucket
        dimensionValue
        value
        numerator
        denominator
        suppressed
      }
    }
  }
`

const METRIC_BREAKDOWN_QUERY = `
  query MetricBreakdown(
    $pMetricKey: String
    $pDimension: String
    $pPeriodStart: Date
    $pPeriodEnd: Date
    $pLimit: Int
    $pMinCell: Int
    $pRankBy: String
  ) {
    metricBreakdown(
      pMetricKey: $pMetricKey
      pDimension: $pDimension
      pPeriodStart: $pPeriodStart
      pPeriodEnd: $pPeriodEnd
      pLimit: $pLimit
      pMinCell: $pMinCell
      pRankBy: $pRankBy
    ) {
      nodes {
        dimensionKey
        dimensionValue
        label
        value
        numerator
        denominator
        shareOfTotal
        rank
        suppressed
        isResidual
        drillRoute
        drillFilters
      }
    }
  }
`

const ENTITLEMENT_QUERY = `
  query AnalyticsEntitlement {
    analyticsFeatureEntitled
  }
`

/** Series/breakdown cap. The functions bucket by month, so 600 covers 50 years. */
const SERIES_LIMIT = 600

/** Coerce the BigFloat (string) fields of a row, leaving nulls as null. */
function numeric(row, keys) {
  const out = { ...row }
  for (const k of keys) out[k] = toNumber(row?.[k])
  return out
}

function nodesOf(data, field) {
  return data?.[field]?.nodes ?? []
}

/**
 * Does this tenant's plan include Reports & Dashboards? False means the whole
 * feature is unavailable — the page must say so rather than render an empty
 * dashboard that reads as broken.
 *
 * @returns {import('@/composables/useServerQuery.js').ServerQueryHandle & { entitled: import('vue').ComputedRef<boolean|null> }}
 */
export function useAnalyticsEntitlement() {
  const q = useGraphQLQuery(ENTITLEMENT_QUERY, {}, { initial: null })
  // null while unknown — distinguishable from a definite `false`, so the page
  // shows a skeleton rather than flashing "not in your plan" on every load.
  const entitled = computed(() =>
    q.data.value === null || q.data.value === undefined
      ? null
      : !!q.data.value.analyticsFeatureEntitled,
  )
  return { ...q, entitled }
}

/**
 * The metrics THIS caller can actually get a number out of. Drives the UI —
 * never hardcode a metric list; the catalog already applies permission,
 * entitlement and "is there any rollup data" filtering server-side.
 *
 * @param {object} [params]
 * @param {string|import('vue').Ref<string>|(() => string)} [params.moduleId] restrict to one authz module
 * @param {object} [options] passed to useServerQuery (e.g. `enabled`)
 */
const INSIGHT_STALENESS_QUERY = `
  query InsightStaleness {
    analyticsInsightStaleness {
      nodes {
        visibleCount
        staleCount
        lastRunAt
      }
    }
  }
`

/**
 * Which EMPTY the insights list is showing.
 *
 * ── WHY A SEPARATE CALL AT ALL ──────────────────────────────────────────────
 * `analytics_insights_select_rls` ends with
 * `scope_fingerprint = analytics_scope_fingerprint()`, comparing the row's
 * stored fingerprint to the READER'S CURRENT one. That is the right rule — an
 * insight is a sentence, already aggregated, so a demoted user would otherwise
 * keep reading last night's wider figures — but it means a scope change hides
 * ALL of that user's rows at once.
 *
 * The resulting empty list is pixel-identical to a genuinely quiet week and
 * means the opposite thing:
 *
 *   nothing crossed a threshold      -> nothing is wrong
 *   your access changed              -> your insights exist and are withheld,
 *                                       and tomorrow's run rebuilds them
 *
 * No query against the table can tell them apart, because the rows you would
 * have to count are exactly the rows the policy is hiding. Hence a SECURITY
 * DEFINER probe that answers from above the policy, hard-scoped to the caller's
 * own user and company and returning counts and one timestamp — never a
 * headline, figure, metric key or dimension.
 *
 * Guessing here is worse than either truth: telling a quality manager "nothing
 * to report" during a week when something WAS reported misleads them, and they
 * only find out by asking a colleague what they saw.
 *
 * @returns {import('@/composables/useServerQuery.js').ServerQueryHandle & {
 *   staleness: import('vue').ComputedRef<{visibleCount:number, staleCount:number, lastRunAt:string|null}|null>,
 *   emptyReason: import('vue').ComputedRef<'loading'|'never_run'|'quiet'|'scope_changed'|null>
 * }}
 */
export function useInsightStaleness(options = {}) {
  const q = useGraphQLQuery(INSIGHT_STALENESS_QUERY, {}, { initial: null, ...options })

  const staleness = computed(() => nodesOf(q.data.value, 'analyticsInsightStaleness')[0] ?? null)

  // `null` means "there are insights to show" — the caller renders the list and
  // never reaches an empty state at all.
  const emptyReason = computed(() => {
    const s = staleness.value
    if (!s) return 'loading'
    if (Number(s.visibleCount) > 0) return null
    if (Number(s.staleCount) > 0) return 'scope_changed'
    // No rows at all, ever, for this person: the generator has not reached them.
    // Distinguished from `quiet` because "come back tomorrow" is a lie if the
    // nightly job is not running — a different problem, for a different person.
    if (!s.lastRunAt) return 'never_run'
    return 'quiet'
  })

  return { ...q, staleness, emptyReason }
}

export function useMetricCatalog(params = {}, options = {}) {
  const q = useGraphQLQuery(
    METRIC_CATALOG_QUERY,
    () => ({ pModuleId: toValue(params.moduleId) ?? null }),
    { initial: null, ...options },
  )
  const metrics = computed(() => nodesOf(q.data.value, 'metricCatalog'))
  return { ...q, metrics }
}

/**
 * One KPI. The connection returns at most one row; `metric` is that row or null.
 *
 * @param {object} params  each value may be a value, ref or getter
 * @param {*} params.metricKey
 * @param {*} [params.periodStart] ISO date
 * @param {*} [params.periodEnd]   ISO date
 * @param {*} [params.compare]     'previous_period' | 'same_period_last_year'
 * @param {object} [options]
 */
export function useMetricValue(params, options = {}) {
  const q = useGraphQLQuery(
    METRIC_VALUE_QUERY,
    () => ({
      pMetricKey: toValue(params.metricKey) ?? null,
      pPeriodStart: toValue(params.periodStart) ?? null,
      pPeriodEnd: toValue(params.periodEnd) ?? null,
      pCompare: toValue(params.compare) ?? 'previous_period',
    }),
    { initial: null, ...options },
  )
  const metric = computed(() => {
    const node = nodesOf(q.data.value, 'metricValue')[0]
    if (!node) return null
    return numeric(node, [
      'value',
      'numerator',
      'denominator',
      'comparisonValue',
      'deltaAbs',
      'deltaPct',
    ])
  })
  return { ...q, metric }
}

/**
 * Time series for a metric, optionally split by one dimension.
 * Rows with `suppressed: true` carry a null value and MUST render as suppressed
 * — not as zero and not as a gap.
 *
 * @param {object} params — metricKey, periodStart, periodEnd, dimension, minCell
 * @param {object} [options]
 */
export function useMetricSeries(params, options = {}) {
  const q = useGraphQLQuery(
    METRIC_SERIES_QUERY,
    () => ({
      pMetricKey: toValue(params.metricKey) ?? null,
      pPeriodStart: toValue(params.periodStart) ?? null,
      pPeriodEnd: toValue(params.periodEnd) ?? null,
      pDimension: toValue(params.dimension) ?? null,
      pMinCell: toValue(params.minCell) ?? 5,
      first: SERIES_LIMIT,
    }),
    { initial: null, ...options },
  )
  const points = computed(() =>
    nodesOf(q.data.value, 'metricSeries').map((row) =>
      numeric(row, ['value', 'numerator', 'denominator']),
    ),
  )
  return { ...q, points }
}

/**
 * Ranked contribution by a dimension, plus the drill target for each segment.
 * The last row may be the RESIDUAL bucket (`isResidual: true`, null
 * `dimensionValue`, null drill target) — render it distinctly and never as a
 * drillable segment.
 *
 * `dimension` accepts the metric's own declared dimension keys plus the three
 * scope dimensions 'site', 'department' and 'owner'.
 *
 * @param {object} params — metricKey, dimension, periodStart, periodEnd, limit, minCell, rankBy
 * @param {object} [options]
 */
export function useMetricBreakdown(params, options = {}) {
  const q = useGraphQLQuery(
    METRIC_BREAKDOWN_QUERY,
    () => ({
      pMetricKey: toValue(params.metricKey) ?? null,
      pDimension: toValue(params.dimension) ?? null,
      pPeriodStart: toValue(params.periodStart) ?? null,
      pPeriodEnd: toValue(params.periodEnd) ?? null,
      pLimit: toValue(params.limit) ?? 10,
      pMinCell: toValue(params.minCell) ?? 5,
      pRankBy: toValue(params.rankBy) ?? 'contribution',
    }),
    { initial: null, ...options },
  )
  const rows = computed(() =>
    nodesOf(q.data.value, 'metricBreakdown').map((row) =>
      numeric(row, ['value', 'numerator', 'denominator', 'shareOfTotal']),
    ),
  )
  return { ...q, rows }
}
