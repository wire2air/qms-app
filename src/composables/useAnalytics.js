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
        moduleId
        unit
        direction
        tier
        defaultGrain
        dimensions
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
