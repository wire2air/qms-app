import { computed, toValue } from 'vue'
import { useGraphQLQuery, useServerQueryWithDeps } from '@/composables/useServerQuery.js'
import { graphqlRequest } from '@syncEngine/network/graphqlClient.js'
// Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
// The metric PREVIEW endpoint persists nothing and returns aggregates, so it is
// an action outcome, not a record. `apiClient` rather than `post` for one
// reason only — see parsePlainJson below.
import { apiClient } from '@/api'
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
 *
 * ── THE ONE REST READ: THE UNSAVED-METRIC PREVIEW ───────────────────────────
 * useMetricValue / useMetricSeries / useMetricBreakdown each take an optional
 * `preview` param (the frozen `previewDefinition` from
 * utils/analyticsMetricPreview.js). When it is set, the SAME composable sends
 * the read to `POST /v1/services/analytics/metrics/preview` instead of GraphQL.
 * That endpoint shadow-runs the draft through the real compiler, rollup SQL
 * and metric_* read functions inside a rolled-back transaction (plan:
 * qms/docs/plans/custom-metric-live-preview.md), and returns the same rows,
 * camelCased the way PostGraphile names them. The response is re-wrapped into
 * the GraphQL connection shape before it reaches the normalisers below, so a
 * preview tile and a dashboard tile run the identical coercion and render the
 * identical way. Still never cached, for the same three reasons as rule #4.
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
        # What the value is CALLED. dimensionValue is a UUID for every
        # dimension that points at a record, so a legend built from it read
        # d2000001-1111-4000-8000-000000000012 where the ranked charts, which
        # go through metricBreakdown, said Anna Sorensen. Null when the
        # dimension has no lookup (a free-text column) — fall back to the value.
        label
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
/**
 * The smallest group a breakdown will name, never below the server's floor.
 *
 * ⚠ THIS IS THE SECOND LAYER, NOT THE CONTROL. metric_breakdown and
 * metric_series clamp with GREATEST(COALESCE(p_min_cell, 5), 5) as of
 * 20260923250000, because a floor enforced here would protect only callers
 * who come through this file — and the parameter travels over GraphQL, where
 * anyone can replay a request with their own value.
 *
 * It was `?? 5`, a DEFAULT: passing 0 returned every withheld cell by name.
 * Measured on a live tenant, a department breakdown that read
 * "Other (6, 6 below threshold)" at 5 returned six named departments at 0,
 * two of them with a count of one — a single identifiable record each.
 *
 * Kept here so this client never sends a value the server must correct, and so
 * the intent is visible where the request is built.
 */
function minCellFloor(asked) {
  return Math.max(Number.isFinite(asked) ? asked : 5, 5)
}

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

// ── preview transport ───────────────────────────────────────────────────────

const PREVIEW_URL = '/v1/services/analytics/metrics/preview'

/**
 * How long a preview read waits for the draft to stop changing. A shadow run is
 * a real (bounded) rollup recompute, so a request per keystroke would be both
 * wasteful and pointless — every one but the last is superseded anyway.
 */
// Short since the Preview button (2026-09-24): an explicit press decides WHEN a
// run happens, so this only coalesces the burst of reactive changes one press or
// one settings-strip pick produces (the question re-clamp patches viz/dimension
// right after). 600 ms made every press feel sluggish for no saving.
export const PREVIEW_DEBOUNCE_MS = 150

/** Where the preview-only fields ride on a handle's `data`. Never a GraphQL field name. */
const PREVIEW_META = '__preview'

/**
 * Error codes a preview read can surface as `error.code`, and the sentence each
 * one reads as. COMPILE_ERROR carries the compiler's own sentence instead.
 */
export const PREVIEW_ERROR = {
  COMPILE_ERROR: 'COMPILE_ERROR',
  TIMEOUT: 'PREVIEW_TIMEOUT',
  FORBIDDEN: 'FORBIDDEN',
  WINDOW_TOO_LARGE: 'PREVIEW_WINDOW_TOO_LARGE',
}

const PREVIEW_MESSAGES = {
  [PREVIEW_ERROR.TIMEOUT]: 'Too much data to preview — narrow the period.',
  [PREVIEW_ERROR.FORBIDDEN]: "You can't preview metrics.",
  [PREVIEW_ERROR.WINDOW_TOO_LARGE]: 'Preview covers at most 24 months — choose a shorter period.',
}

/**
 * Retrying cannot change the answer to these — the draft or the grant has to
 * change first — so a tile should not offer a Retry button for them.
 */
export function isPreviewTerminalError(err) {
  return (
    err?.code === PREVIEW_ERROR.COMPILE_ERROR ||
    err?.code === PREVIEW_ERROR.FORBIDDEN ||
    err?.code === PREVIEW_ERROR.WINDOW_TOO_LARGE
  )
}

/**
 * ⚠ WHY NOT `post` FROM @/api. The shared axios instance's transformResponse
 * turns every string that parses as an ISO date into a luxon DateTime. The
 * GraphQL path returns plain strings (`bucket: "2026-08-01"`), and the tile's
 * renderer calls DateTime.fromISO on them — handed a DateTime it plots nothing.
 * Worse, the reviver cannot be undone reliably: a dimension VALUE such as
 * "2026-W12" or "2026-01" would be converted too, and its original spelling
 * lost. So this one request parses JSON plainly, and the rows reach the
 * normalisers byte-for-byte as the GraphQL path delivers them.
 */
function parsePlainJson(data) {
  if (typeof data !== 'string' || data === '') return data
  try {
    return JSON.parse(data)
  } catch {
    return data
  }
}

/**
 * Wait `ms`, or reject the moment `signal` aborts. This IS the debounce: every
 * new run of a server query aborts the previous run's signal (useServerQuery's
 * supersede rule), so a draft that changes again within the window cancels the
 * pending request before it is ever sent, and an aborted run is dropped
 * silently rather than surfaced as an error.
 */
function abortableDelay(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason)
      return
    }
    function onAbort() {
      clearTimeout(timer)
      reject(signal.reason)
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

function previewFailure(code, message, status = null) {
  const err = new Error(message)
  err.code = code
  err.status = status
  return err
}

/** Map the endpoint's HTTP failures onto the sentences the tile shows. */
function previewError(err) {
  if (err?.code === 'CANCELLED') return err
  const body = err?.raw?.response?.data
  // The 422 interceptor in api/client.js rewrites every 422 to
  // VALIDATION_ERROR, so the endpoint's own code has to be read off the body.
  const bodyCode = body?.error?.code ?? body?.code ?? null
  if (err?.status === 422 && bodyCode === PREVIEW_ERROR.TIMEOUT) {
    return previewFailure(PREVIEW_ERROR.TIMEOUT, PREVIEW_MESSAGES[PREVIEW_ERROR.TIMEOUT], 422)
  }
  // Same period, same answer: only picking a shorter one changes it, so this is
  // terminal (no Retry) rather than the generic failure it would otherwise be.
  if (err?.status === 400 && bodyCode === PREVIEW_ERROR.WINDOW_TOO_LARGE) {
    return previewFailure(
      PREVIEW_ERROR.WINDOW_TOO_LARGE,
      PREVIEW_MESSAGES[PREVIEW_ERROR.WINDOW_TOO_LARGE],
      400,
    )
  }
  if (err?.status === 403) {
    return previewFailure(PREVIEW_ERROR.FORBIDDEN, PREVIEW_MESSAGES[PREVIEW_ERROR.FORBIDDEN], 403)
  }
  return err
}

/**
 * One preview read, returned in the GraphQL connection shape `{ [field]:
 * { nodes } }` so the caller's normaliser cannot tell the difference.
 * A compile error is thrown — it is the tile's error state, worded by the
 * compiler — rather than returned as an empty result that would read as zero.
 */
async function fetchPreview(field, requestBody, signal) {
  await abortableDelay(PREVIEW_DEBOUNCE_MS, signal)
  let body
  try {
    const res = await apiClient.post(PREVIEW_URL, requestBody, {
      signal,
      transformResponse: [parsePlainJson],
    })
    body = res.data
  } catch (err) {
    throw previewError(err)
  }
  if (body?.compileError) {
    throw previewFailure(PREVIEW_ERROR.COMPILE_ERROR, body.compileError)
  }
  return {
    [field]: { nodes: Array.isArray(body?.rows) ? body.rows : [] },
    [PREVIEW_META]: {
      driftWarning: body?.driftWarning ?? null,
      computedAt: body?.computedAt ?? null,
    },
  }
}

/**
 * The shared read: GraphQL normally, the preview endpoint when `params.preview`
 * resolves to a payload. One handle either way, so a tile never holds two
 * queries and never has to choose between them.
 *
 * The preview request is a dependency by its JSON SERIALISATION, not its
 * identity: a page that rebuilds an equal payload on every keystroke (a
 * computed returning a fresh frozen object) must not refetch an unchanged
 * question.
 *
 * @param {object} cfg
 * @param {string} cfg.field            GraphQL field the normaliser reads
 * @param {string} cfg.query            GraphQL document
 * @param {() => object} cfg.variables  GraphQL variables
 * @param {'value'|'series'|'breakdown'} cfg.kind
 * @param {() => object} cfg.previewParams the endpoint's `params` for this read
 * @param {*} cfg.preview               the previewDefinition (value, ref or getter)
 * @param {object} [options]            useServerQuery options (`enabled`, …)
 */
function useMetricRead({ field, query, variables, kind, previewParams, preview }, options = {}) {
  // A caller that never asks for preview mode (every dashboard surface) gets the
  // plain GraphQL query, exactly as before this mode existed. Decided once, at
  // setup: whether a component CAN preview is fixed by its code, whether it IS
  // previewing is the reactive `preview` value below.
  if (preview === undefined) {
    const q = useGraphQLQuery(query, variables, { initial: null, ...options })
    return { ...q, previewMeta: computed(() => null) }
  }

  function previewRequestKey() {
    const def = toValue(preview)
    if (!def) return null
    return JSON.stringify({
      moduleId: def.moduleId,
      grain: def.grain,
      direction: def.direction,
      definition: def.definition,
      kind,
      params: previewParams(),
    })
  }

  const q = useServerQueryWithDeps(
    [variables, previewRequestKey],
    (signal, [vars, previewKey]) =>
      previewKey
        ? fetchPreview(field, JSON.parse(previewKey), signal)
        : graphqlRequest(query, vars, { signal }),
    { initial: null, ...options },
  )

  // Null outside preview mode. `computedAt` is the shadow run's clock — the
  // preview's replacement for a tile's tier/scope/freshness line.
  const previewMeta = computed(() => q.data.value?.[PREVIEW_META] ?? null)
  return { ...q, previewMeta }
}

/**
 * Does this tenant's plan include Reports & Dashboards? False means the whole
 * feature is unavailable — the page must say so rather than render an empty
 * dashboard that reads as broken.
 *
 * @returns {import('@/composables/useServerQuery.js').ServerQueryHandle & { entitled: import('vue').ComputedRef<boolean|null> }}
 */
export function useAnalyticsEntitlement(options = {}) {
  // `options` forwards straight through — in practice `enabled`, so a caller
  // that only sometimes needs the answer does not pay for a round trip it will
  // not read. The home page is the reason: it asks only when the user has
  // actually starred a dashboard, which most have not, and an unconditional
  // query there would add a GraphQL request to every single page load.
  const q = useGraphQLQuery(ENTITLEMENT_QUERY, {}, { initial: null, ...options })
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

/**
 * Has each custom metric ever refreshed, and did that run produce anything?
 *
 * ⚠ SEPARATE FROM useMetricCatalog, AND IT HAS TO BE. The catalog lists only
 * metrics that HAVE rollup rows, so it is definitionally silent about the ones
 * this answers for — a metric that ran and matched nothing is absent from it
 * for exactly the same reason as one that has never run.
 *
 * That ambiguity is what made "Preparing" mean two opposite things: a metric
 * filtering on a status that does not exist sat under "figures are worked out
 * every 15 minutes" indefinitely. See metricState().
 */
const REFRESH_STATE_QUERY = `
  query CustomMetricRefreshState {
    customMetricRefreshState {
      nodes {
        metricKey
        # NULL = the worker has never completed a run for this metric, which is
        # the only honest reading of "Preparing".
        lastRefreshedAt
        # 0 alongside a timestamp = it ran and matched nothing. A real answer,
        # not a missing one.
        lastRefreshRows
      }
    }
  }
`

export function useCustomMetricRefreshState(options = {}) {
  const q = useGraphQLQuery(REFRESH_STATE_QUERY, () => ({}), { initial: null, ...options })
  const byMetricKey = computed(() => {
    const out = new Map()
    for (const row of nodesOf(q.data.value, 'customMetricRefreshState')) {
      out.set(row.metricKey, row)
    }
    return out
  })
  return { ...q, byMetricKey }
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
 * @param {*} [params.preview]     a previewDefinition — reads an UNSAVED metric
 *   through the preview endpoint instead (see the header); `metricKey` is then
 *   ignored
 * @param {object} [options]
 */
export function useMetricValue(params, options = {}) {
  const q = useMetricRead(
    {
      field: 'metricValue',
      query: METRIC_VALUE_QUERY,
      variables: () => ({
        pMetricKey: toValue(params.metricKey) ?? null,
        pPeriodStart: toValue(params.periodStart) ?? null,
        pPeriodEnd: toValue(params.periodEnd) ?? null,
        pCompare: toValue(params.compare) ?? 'previous_period',
      }),
      kind: 'value',
      previewParams: () => ({
        periodStart: toValue(params.periodStart) ?? null,
        periodEnd: toValue(params.periodEnd) ?? null,
        compare: toValue(params.compare) ?? 'previous_period',
        dimension: null,
        limit: null,
        minCell: null,
        rankBy: null,
      }),
      preview: params.preview,
    },
    options,
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
 * @param {object} params — metricKey, periodStart, periodEnd, dimension, minCell,
 *   and optionally `preview` (see useMetricValue)
 * @param {object} [options]
 */
export function useMetricSeries(params, options = {}) {
  const q = useMetricRead(
    {
      field: 'metricSeries',
      query: METRIC_SERIES_QUERY,
      variables: () => ({
        pMetricKey: toValue(params.metricKey) ?? null,
        pPeriodStart: toValue(params.periodStart) ?? null,
        pPeriodEnd: toValue(params.periodEnd) ?? null,
        pDimension: toValue(params.dimension) ?? null,
        pMinCell: minCellFloor(toValue(params.minCell)),
        first: SERIES_LIMIT,
      }),
      kind: 'series',
      previewParams: () => ({
        periodStart: toValue(params.periodStart) ?? null,
        periodEnd: toValue(params.periodEnd) ?? null,
        compare: null,
        dimension: toValue(params.dimension) ?? null,
        limit: null,
        minCell: minCellFloor(toValue(params.minCell)),
        rankBy: null,
      }),
      preview: params.preview,
    },
    options,
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
 * In preview mode the rows' `drillRoute` is whatever the shadow run computed
 * for a metric that is about to be rolled back — the CALLER must not offer it
 * as a link (AnalyticsQuestionTile strips it).
 *
 * @param {object} params — metricKey, dimension, periodStart, periodEnd, limit,
 *   minCell, rankBy, and optionally `preview` (see useMetricValue)
 * @param {object} [options]
 */
export function useMetricBreakdown(params, options = {}) {
  const q = useMetricRead(
    {
      field: 'metricBreakdown',
      query: METRIC_BREAKDOWN_QUERY,
      variables: () => ({
        pMetricKey: toValue(params.metricKey) ?? null,
        pDimension: toValue(params.dimension) ?? null,
        pPeriodStart: toValue(params.periodStart) ?? null,
        pPeriodEnd: toValue(params.periodEnd) ?? null,
        pLimit: toValue(params.limit) ?? 10,
        pMinCell: minCellFloor(toValue(params.minCell)),
        pRankBy: toValue(params.rankBy) ?? 'contribution',
      }),
      kind: 'breakdown',
      previewParams: () => ({
        periodStart: toValue(params.periodStart) ?? null,
        periodEnd: toValue(params.periodEnd) ?? null,
        compare: null,
        dimension: toValue(params.dimension) ?? null,
        limit: toValue(params.limit) ?? 10,
        minCell: minCellFloor(toValue(params.minCell)),
        rankBy: toValue(params.rankBy) ?? 'contribution',
      }),
      preview: params.preview,
    },
    options,
  )
  const rows = computed(() =>
    nodesOf(q.data.value, 'metricBreakdown').map((row) =>
      numeric(row, ['value', 'numerator', 'denominator', 'shareOfTotal']),
    ),
  )
  return { ...q, rows }
}
