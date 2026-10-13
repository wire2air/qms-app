<script setup>
/**
 * Renders ONE question — as the current viewer, right now.
 *
 * ── THE POINT OF THIS COMPONENT ─────────────────────────────────────────────
 * A dashboard row stores a metric key, a dimension, a period token and some
 * shaping options. It stores no number. So "opening a dashboard" is not loading
 * data, it is asking every tile to go and compute its own answer under the
 * caller's access scope. That is what makes a shared dashboard safe: the author
 * and the reader run the same query and legitimately get different figures, and
 * neither ever sees the other's.
 *
 * The consequence for this file is a rule with no exceptions: it takes a
 * question and issues its OWN requests. It never accepts a value, a series or a
 * breakdown as a prop, because a prop is exactly how another viewer's numbers
 * would get in.
 *
 * Shared by the dashboard view, the widget dialog's live preview, the Data
 * Explorer and the metric builder's unsaved-metric preview — one renderer, so a
 * tile cannot look different depending on where you are standing.
 *
 * ── PREVIEW MODE: STILL ITS OWN REQUESTS ────────────────────────────────────
 * On the metric builder there is no saved metric to name, so the page passes a
 * `previewDefinition` (the draft, from utils/analyticsMetricPreview.js) and a
 * draft catalog row as `metric`. That is a QUESTION, not an answer: the tile
 * still issues every request itself, through the same useMetricValue / Series /
 * Breakdown calls, which route to the preview endpoint when the definition is
 * set (debounced, superseded requests aborted). The rule above is untouched —
 * no value, series or breakdown ever arrives as a prop.
 *
 * What preview mode changes is only what the tile may CLAIM:
 *  - no tier, scope or stored freshness exist yet, so the meta line reads
 *    "Preview — computed live from current records, not saved" plus the shadow
 *    run's own compute time;
 *  - the compiler's refusal is the error message, verbatim, and so are the
 *    timeout and no-permission sentences (useAnalytics maps those);
 *  - an empty result reads "Nothing matches right now" — a real zero, not a
 *    missing period;
 *  - nothing drills: the metric the rows came from was rolled back with the
 *    request, so every drill target points at a metric that does not exist.
 *
 * ── SEMANTICS IT MUST NOT BREAK ─────────────────────────────────────────────
 *  - a suppressed cell is plotted as `null`, NEVER 0 — zero is information and a
 *    withheld cell must never be readable as one;
 *  - `isSignificant === null` draws no marker (it means "no test applies", not
 *    "not significant") — handled by AnalyticsWidget, which is why the raw
 *    tri-state is passed through rather than coerced;
 *  - residual rows are never drillable — handled by AnalyticsBreakdownList;
 *  - numerics arrive as BigFloat STRINGS and are coerced once in useAnalytics.
 *
 * ── WHY A MISSING METRIC IS A FIRST-CLASS STATE ─────────────────────────────
 * `metricCatalog` is permission-filtered, so a reader of a shared dashboard can
 * legitimately hold a tile whose metric they may not read. That is the system
 * working, not an error, and it has to say so — an empty chart would read as
 * "there is no data", which is a different and false claim.
 */
import { IconAlertTriangle, IconLock, IconRefresh } from '@tabler/icons-vue'
import { DateTime } from 'luxon'
import { moduleIcon } from '@/utils/moduleIcons.js'
import {
  useMetricValue,
  useMetricSeries,
  useMetricBreakdown,
  isPreviewTerminalError,
} from '@/composables/useAnalytics.js'
import { PREVIEW_METRIC_KEY } from '@/utils/analyticsMetricPreview.js'
import {
  drillLocation,
  formatMetricValue,
  METRIC_PRECISION,
  MIN_CELL_FLOOR,
  SUPPRESSED_LABEL,
} from '@/utils/analyticsFormat.js'
import { resolvePeriodToken, periodTokenLabel } from '@/utils/analyticsPeriods.js'
import { SOURCE, vizRule } from '@/utils/analyticsViz.js'

const props = defineProps({
  /**
   * The stored (or draft) question:
   * { metricKey, viz, dimension, periodToken, compare, title, filters }.
   * `filters` carries breakdown SHAPING only — `{ limit, rankBy }` — which is
   * part of the question ("top 10 by contribution") and holds no computed value.
   */
  question: { type: Object, required: true },
  // The matching metric_catalog row, or null when this viewer cannot read it.
  metric: { type: Object, default: null },
  // True once the catalog has loaded, so a tile does not flash "unavailable"
  // while the catalog is still in flight.
  catalogLoaded: { type: Boolean, default: true },
  height: { type: Number, default: 260 },
  minCell: { type: Number, default: MIN_CELL_FLOOR },
  enabled: { type: Boolean, default: true },
  /**
   * An UNSAVED metric to preview — previewPayload() from
   * utils/analyticsMetricPreview.js — or null for a normal tile. When set, every
   * read goes to the preview endpoint and `question.metricKey` is a placeholder.
   * See "PREVIEW MODE" in the header.
   */
  previewDefinition: { type: Object, default: null },
})

const isPreview = computed(() => !!props.previewDefinition)

/**
 * BaseChart's categorical palette holds six accessible hues; a seventh split
 * would silently repeat one and make two segments indistinguishable. Fold the
 * tail into an explicit "Other" rather than letting the palette wrap.
 */
const MAX_SERIES = 6

const rule = computed(() => vizRule(props.question?.viz))
const source = computed(() => rule.value?.source ?? SOURCE.VALUE)
const unit = computed(() => props.metric?.unit || 'count')
const metricKey = computed(() => props.question?.metricKey ?? null)
const dimension = computed(() => props.question?.dimension ?? null)

// Resolved HERE, at render time, from the relative token — which is the whole
// reason the token is stored instead of dates.
const period = computed(() => resolvePeriodToken(props.question?.periodToken))

const shaping = computed(() => props.question?.filters || {})

const title = computed(() => props.question?.title || props.metric?.name || metricKey.value)

// A tile whose metric this viewer cannot read. Distinct from "no data".
const unavailable = computed(() => props.catalogLoaded && !props.metric)

// The placeholder key without a definition means the draft is not complete
// enough to preview — ask nothing, rather than asking GraphQL for a metric
// called "preview".
const active = computed(
  () =>
    props.enabled &&
    !!props.metric &&
    !!metricKey.value &&
    (isPreview.value || metricKey.value !== PREVIEW_METRIC_KEY),
)

const preview = () => props.previewDefinition

// ── provenance + headline ───────────────────────────────────────────────────
// Every tile states the scope, tier and freshness its number was computed
// under, so `metric_value` is fetched for all viz types. The KPI tile is the
// exception: AnalyticsKpiCard already does this itself, so gate it off there
// rather than issuing the same request twice.
const wantsValue = computed(() => active.value && source.value !== SOURCE.VALUE)

const {
  metric: valueRow,
  error: valueError,
  retry: retryValue,
  previewMeta: valuePreviewMeta,
} = useMetricValue(
  {
    metricKey,
    periodStart: () => period.value.periodStart,
    periodEnd: () => period.value.periodEnd,
    compare: () => props.question?.compare || 'previous_period',
    preview,
  },
  { enabled: wantsValue },
)

const seriesEnabled = computed(() => active.value && source.value === SOURCE.SERIES)

const {
  points,
  loading: seriesLoading,
  error: seriesError,
  retry: retrySeries,
  previewMeta: seriesPreviewMeta,
} = useMetricSeries(
  {
    metricKey,
    periodStart: () => period.value.periodStart,
    periodEnd: () => period.value.periodEnd,
    // Series accepts the metric's DECLARED keys only; the picker already
    // guarantees that, and clampQuestion repairs a stale stored value.
    dimension,
    minCell: () => props.minCell,
    preview,
  },
  { enabled: seriesEnabled },
)

const breakdownEnabled = computed(() => active.value && source.value === SOURCE.BREAKDOWN)

const {
  rows: fetchedBreakdownRows,
  loading: breakdownLoading,
  error: breakdownError,
  retry: retryBreakdown,
  previewMeta: breakdownPreviewMeta,
} = useMetricBreakdown(
  {
    metricKey,
    dimension,
    periodStart: () => period.value.periodStart,
    periodEnd: () => period.value.periodEnd,
    limit: () => shaping.value.limit ?? 10,
    minCell: () => props.minCell,
    rankBy: () => shaping.value.rankBy ?? 'contribution',
    preview,
  },
  { enabled: breakdownEnabled },
)

/**
 * The rows everything below renders. In preview the drill target is stripped:
 * the shadow run computed it for a metric that was rolled back, and
 * AnalyticsBreakdownList offers a row as a link exactly when it has a
 * `drillRoute` (isDrillable), so blanking it is what disables the link.
 */
const breakdownRows = computed(() =>
  isPreview.value
    ? (fetchedBreakdownRows.value || []).map((r) => ({
        ...r,
        drillRoute: null,
        drillFilters: null,
      }))
    : fetchedBreakdownRows.value,
)

// ── series-shaped charts ────────────────────────────────────────────────────

/**
 * A withheld bucket is `null`, never 0. BaseChart draws it as a gap.
 *
 * ⚠️ `{ zone: 'utc' }` is load-bearing — see the long note on the same function
 * in AnalyticsMetricWidget.vue. A bucket is a Postgres DATE with no timezone;
 * Luxon parses local, ApexCharts renders UTC, so without this every point slid
 * one day backwards for anyone ahead of UTC (IST showed 2026-08-01 as 31 Jul).
 */
function pointOf(p) {
  return {
    x: DateTime.fromISO(p.bucket, { zone: 'utc' }).toMillis(),
    y: p.suppressed ? null : p.value,
  }
}

function bucketLabel(iso) {
  const dt = DateTime.fromISO(iso)
  return dt.isValid ? dt.formatDate('date') : String(iso)
}

/**
 * Group series rows by dimension value, ranked by total, tail folded to "Other".
 *
 * ⚠ GROUPED BY VALUE, NAMED BY LABEL — and those are not the same thing.
 * The value is the identity: two people can share a display name, and folding
 * them into one line because of it would silently merge two owners' work.
 * The label is only what the legend says. Grouping by label would be a data
 * bug that looks like a rendering choice.
 *
 * Falls back to the value when there is no label — a dimension over a
 * free-text column has no lookup to resolve, so the raw value IS the name.
 */
function groupedSeries(rows, toPoint) {
  const bySeries = new Map()
  const totals = new Map()
  const names = new Map()
  for (const p of rows) {
    const key = p.dimensionValue ?? 'Unspecified'
    if (!bySeries.has(key)) bySeries.set(key, [])
    bySeries.get(key).push(p)
    totals.set(key, (totals.get(key) ?? 0) + (p.value ?? 0))
    // First non-empty label wins; every row for one value carries the same one.
    if (!names.has(key) && p.label) names.set(key, p.label)
  }
  const nameOf = (key) => names.get(key) ?? key
  const ranked = [...bySeries.keys()].sort((a, b) => (totals.get(b) ?? 0) - (totals.get(a) ?? 0))
  if (ranked.length <= MAX_SERIES) {
    return ranked.map((key) => ({ name: nameOf(key), data: bySeries.get(key).map(toPoint) }))
  }
  const kept = ranked.slice(0, MAX_SERIES - 1)
  const tail = ranked.slice(MAX_SERIES - 1)
  const otherByBucket = new Map()
  for (const key of tail) {
    for (const p of bySeries.get(key)) {
      if (p.suppressed) continue
      otherByBucket.set(p.bucket, (otherByBucket.get(p.bucket) ?? 0) + (p.value ?? 0))
    }
  }
  return [
    ...kept.map((key) => ({ name: nameOf(key), data: bySeries.get(key).map(toPoint) })),
    {
      name: `Other (${tail.length})`,
      data: [...otherByBucket.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([bucket, value]) => toPoint({ bucket, value, suppressed: false })),
    },
  ]
}

/** Distinct buckets in order — the heatmap's x categories. */
const buckets = computed(() => [...new Set((points.value || []).map((p) => p.bucket))].sort())

const chartSeries = computed(() => {
  const rows = points.value || []
  if (source.value === SOURCE.SERIES) {
    if (!rows.length) return []
    if (props.question?.viz === 'heatmap') {
      // Apex heatmaps want one row per series with a point per x CATEGORY, and
      // every row must cover every category or the grid goes ragged.
      const byDim = new Map()
      const heatNames = new Map()
      for (const p of rows) {
        // Keyed by VALUE, labelled separately — see groupedSeries. Two owners
        // sharing a display name must stay two rows of the grid.
        const key = p.dimensionValue ?? 'Unspecified'
        if (!byDim.has(key)) byDim.set(key, new Map())
        byDim.get(key).set(p.bucket, p)
        if (!heatNames.has(key) && p.label) heatNames.set(key, p.label)
      }
      return [...byDim.entries()].map(([key, cells]) => ({
        name: heatNames.get(key) ?? key,
        data: buckets.value.map((b) => {
          const cell = cells.get(b)
          return { x: bucketLabel(b), y: cell && !cell.suppressed ? cell.value : null }
        }),
      }))
    }
    if (!dimension.value) {
      return [{ name: props.metric?.name || 'Value', data: rows.map(pointOf) }]
    }
    return groupedSeries(rows, pointOf)
  }

  // ── breakdown-shaped charts ──
  const rowsB = breakdownRows.value || []
  if (!rowsB.length) return []

  if (props.question?.viz === 'donut') {
    // A donut takes a BARE NUMBER ARRAY, which cannot express "withheld".
    // Withheld slices are therefore dropped from the ring and counted in the
    // tile's suppression note instead — a zero-width slice would read as zero,
    // which is the one thing suppression must never look like.
    return rowsB.filter((r) => !r.suppressed && r.value !== null).map((r) => r.value)
  }
  if (props.question?.viz === 'funnel') {
    return [
      {
        name: props.metric?.name || 'Value',
        data: rowsB.map((r) => (r.suppressed ? null : r.value)),
      },
    ]
  }
  // bar
  return [
    {
      name: props.metric?.name || 'Value',
      data: rowsB.map((r) => ({
        x: r.label || r.dimensionValue || '—',
        y: r.suppressed ? null : r.value,
      })),
    },
  ]
})

const chartOptions = computed(() => {
  const precision = METRIC_PRECISION[unit.value] ?? 0
  const yaxis = {
    decimalsInFloat: precision,
    labels: { formatter: (v) => formatMetricValue(v, unit.value) },
  }
  switch (props.question?.viz) {
    case 'donut': {
      const labels = (breakdownRows.value || [])
        .filter((r) => !r.suppressed && r.value !== null)
        .map((r) => r.label || r.dimensionValue || '—')
      return { labels }
    }
    case 'funnel':
      return {
        xaxis: {
          categories: (breakdownRows.value || []).map((r) => r.label || r.dimensionValue || '—'),
        },
      }
    case 'heatmap':
      return { yaxis }
    case 'bar':
      return { yaxis }
    default:
      return { xaxis: { type: 'datetime' }, yaxis }
  }
})

const chartAriaLabel = computed(() => {
  const split = dimension.value ? ` split by ${dimension.value}` : ''
  const over = source.value === SOURCE.SERIES ? ' over time' : ''
  return `${title.value}${over}${split}, ${periodTokenLabel(props.question?.periodToken)}`
})

// ── privacy accounting ──────────────────────────────────────────────────────
const suppressedPoints = computed(() =>
  source.value === SOURCE.SERIES ? (points.value || []).filter((p) => p.suppressed) : [],
)
const suppressedBreakdown = computed(() =>
  source.value === SOURCE.BREAKDOWN ? (breakdownRows.value || []).filter((r) => r.suppressed) : [],
)
const suppressedCount = computed(
  () => suppressedPoints.value.length + suppressedBreakdown.value.length,
)
const suppressedDetail = computed(() => {
  const parts = []
  if (suppressedPoints.value.length) parts.push(`${suppressedPoints.value.length} in the trend`)
  if (suppressedBreakdown.value.length) {
    parts.push(`${suppressedBreakdown.value.length} in the breakdown`)
  }
  if (props.question?.viz === 'donut' && suppressedBreakdown.value.length) {
    parts.push('withheld slices are omitted from the ring rather than drawn as zero')
  }
  return parts.length ? `(${parts.join('; ')}).` : null
})

/**
 * Shown only when EVERY value is withheld, so there is no chart at all.
 *
 * Names the threshold and what to do about it. The old wording — "fell below
 * the reporting threshold" — stated the rule and stopped, leaving a reader
 * unable to tell whether one more record would help or nothing ever would.
 *
 * ⚠ IT SAYS "no segment reaches N", NEVER HOW FAR SHORT THEY FELL. The largest
 * withheld cell is itself a protected figure: "the biggest has 4" is a count
 * the threshold exists to hide, and repeating the view over different periods
 * would narrow it further. The remedy is named without any figure being
 * disclosed.
 */
const suppressedDescription = computed(() => {
  const each = `No group in this view reaches the minimum of ${MIN_CELL_FLOOR} records.`
  const remedy = dimension.value
    ? ' Try a longer period, or split by something with fewer segments.'
    : ' Try a longer period.'
  return each + remedy
})

// ── shell wiring ────────────────────────────────────────────────────────────
const loading = computed(() =>
  source.value === SOURCE.SERIES ? seriesLoading.value : breakdownLoading.value,
)
const error = computed(() =>
  source.value === SOURCE.SERIES ? seriesError.value : breakdownError.value,
)

// ── preview wording ─────────────────────────────────────────────────────────
// Undefined outside preview, so BaseChart keeps its own default wording there.
const emptyTitle = computed(() => (isPreview.value ? 'Nothing matches right now' : undefined))
const errorTitle = computed(() => (isPreview.value ? "Can't preview this yet" : undefined))
const errorDescription = computed(() =>
  isPreview.value && error.value?.message ? error.value.message : undefined,
)
// The compiler's refusal and a missing grant cannot be retried away. Preview
// only: a dashboard tile's RLS denial also arrives as code FORBIDDEN (the
// GraphQL error normaliser maps 42501), and there Retry has always been shown.
const canRetryBody = computed(() => !(isPreview.value && isPreviewTerminalError(error.value)))

// The body read's meta (the headline read may be off, e.g. never for a KPI).
const previewMeta = computed(() => {
  if (!isPreview.value) return null
  const body = source.value === SOURCE.SERIES ? seriesPreviewMeta.value : breakdownPreviewMeta.value
  return body ?? valuePreviewMeta.value ?? null
})

const previewComputedAt = computed(() => {
  const raw = previewMeta.value?.computedAt
  if (!raw) return null
  const dt = DateTime.fromISO(String(raw))
  return dt.isValid ? dt.formatDate('datetime') : null
})

function retryBody() {
  if (source.value === SOURCE.SERIES) retrySeries()
  else retryBreakdown()
}

const drillTo = computed(() =>
  isPreview.value
    ? null
    : drillLocation({
        drillRoute: props.metric?.drill?.route,
        drillFilters: props.metric?.drill?.filters,
      }),
)

// A failed preview keeps the last good figure, which belongs to an EARLIER
// draft; blank it rather than print it beside the new draft's error.
const headline = computed(() =>
  formatMetricValue(
    isPreview.value && (valueError.value || error.value) ? null : valueRow.value?.value,
    unit.value,
  ),
)

// Export the DATA behind the chart, not a picture of it, so a figure in a
// spreadsheet reconciles with the one on screen — including its suppression.
const seriesColumns = [
  { name: 'bucket', label: 'Period', field: 'bucket' },
  // The NAME, matching the legend, matching what breakdownColumns already did.
  // Exporting the UUID meant the spreadsheet and the chart disagreed about who
  // a row was about — the reconciliation this export exists for.
  { name: 'dimensionValue', label: 'Segment', field: (r) => r.label || r.dimensionValue || '—' },
  {
    name: 'value',
    label: 'Value',
    field: (r) => (r.suppressed ? SUPPRESSED_LABEL : r.value),
  },
  { name: 'numerator', label: 'Numerator', field: 'numerator' },
  { name: 'denominator', label: 'Denominator', field: 'denominator' },
  { name: 'suppressed', label: 'Withheld', field: (r) => (r.suppressed ? 'yes' : 'no') },
]

const breakdownColumns = [
  { name: 'label', label: 'Segment', field: (r) => r.label || r.dimensionValue || '—' },
  {
    name: 'value',
    label: 'Value',
    field: (r) => (r.suppressed ? SUPPRESSED_LABEL : r.value),
  },
  { name: 'shareOfTotal', label: 'Share %', field: 'shareOfTotal' },
  { name: 'rank', label: 'Rank', field: 'rank' },
  { name: 'isResidual', label: 'Residual', field: (r) => (r.isResidual ? 'yes' : 'no') },
  { name: 'suppressed', label: 'Withheld', field: (r) => (r.suppressed ? 'yes' : 'no') },
]

const exportRows = computed(() =>
  source.value === SOURCE.SERIES ? points.value || [] : breakdownRows.value || [],
)
const exportColumns = computed(() =>
  source.value === SOURCE.SERIES ? seriesColumns : breakdownColumns,
)
const exportName = computed(() => `${metricKey.value || 'metric'}-${props.question?.periodToken}`)
</script>

<template>
  <!-- A metric this viewer cannot read. Say that, rather than drawing an empty
       chart that claims there is no data. -->
  <BaseCard v-if="unavailable" class="tw:flex tw:flex-col tw:gap-3">
    <BaseEmptyState
      :icon="IconLock"
      :title="question.title || 'Metric not available to you'"
      description="This tile measures something you don't have access to. Shared dashboards store the question, not the answer, so each person sees only the metrics they may read."
      dense
    />
  </BaseCard>

  <!-- The single-number tile is AnalyticsKpiCard, which already owns the
       delta, the significance marker and its own provenance line. -->
  <AnalyticsKpiCard
    v-else-if="rule?.source === SOURCE.VALUE && metric"
    :metricKey="metric.metricKey"
    :name="title"
    :moduleId="metric.moduleId"
    :unit="metric.unit"
    :direction="metric.direction"
    :drill="metric.drill"
    :calculationNote="metric.calculationNote"
    :periodStart="period.periodStart"
    :periodEnd="period.periodEnd"
    :compare="question.compare || 'previous_period'"
    :enabled="active"
    :previewDefinition="previewDefinition"
  />

  <AnalyticsWidget
    v-else-if="metric"
    :title="title"
    :subtitle="metric.description"
    :icon="moduleIcon(metric.moduleId)"
    :scope="isPreview ? null : (valueRow?.effectiveScope ?? metric.effectiveScope)"
    :tier="isPreview ? null : (valueRow?.tier ?? metric.tier)"
    :computedAt="isPreview ? null : valueRow?.computedAt"
    :calculationNote="metric.calculationNote"
    :periodStart="valueRow?.periodStart ?? period.periodStart"
    :periodEnd="valueRow?.periodEnd ?? period.periodEnd"
    :suppressedCount="suppressedCount"
    :suppressedDetail="suppressedDetail"
    :isSignificant="valueRow?.isSignificant ?? null"
    :exportRows="exportRows"
    :exportColumns="exportColumns"
    :exportName="exportName"
    :drillTo="drillTo"
    :height="height"
  >
    <template #actions>
      <BaseText variant="subheading" weight="bold" class="tw:tabular-nums">
        {{ headline }}
      </BaseText>
      <slot name="actions" />
    </template>

    <!-- The ranked list is not a chart; BaseChart has no table type and
         AnalyticsBreakdownList already handles residual + withheld + drill. -->
    <template v-if="question.viz === 'table'">
      <BaseSkeleton v-if="loading" variant="rect" :height="`${height}px`" />
      <div v-else-if="error" class="tw:flex tw:flex-col tw:items-center tw:gap-2 tw:py-8">
        <BaseText variant="caption" color="secondary">
          {{ errorDescription || "Couldn't load this breakdown." }}
        </BaseText>
        <BaseButton v-if="canRetryBody" size="sm" variant="outline" @click="retryBody">
          <IconRefresh :size="14" aria-hidden="true" />
          Retry
        </BaseButton>
      </div>
      <BaseEmptyState
        v-else-if="!breakdownRows?.length"
        :icon="moduleIcon(metric.moduleId)"
        :title="emptyTitle || 'No data for this period'"
        dense
      />
      <AnalyticsBreakdownList v-else :rows="breakdownRows" :unit="unit" />
    </template>

    <!-- Chart-area content states (loading / error / empty / all-withheld) are
         BaseChart's; the tile does not second-guess them. -->
    <BaseChart
      v-else
      :type="rule?.chartType || 'line'"
      :series="chartSeries"
      :options="chartOptions"
      :height="height"
      :loading="loading"
      :error="error"
      :emptyTitle="emptyTitle"
      :suppressedDescription="suppressedDescription"
      :errorTitle="errorTitle"
      :errorDescription="errorDescription"
      :ariaLabel="chartAriaLabel"
    >
      <template v-if="canRetryBody" #error-action>
        <BaseButton size="sm" variant="outline" @click="retryBody">
          <IconRefresh :size="14" aria-hidden="true" />
          Retry
        </BaseButton>
      </template>
    </BaseChart>

    <!-- The headline, scope and freshness all come from metric_value. If only
         that call failed the chart is still valid, so name what's missing
         rather than blanking the tile. -->
    <template v-if="valueError || isPreview" #footer>
      <!-- In preview this replaces the tier / scope / freshness line, which
           would claim things about a metric that does not exist yet. -->
      <template v-if="isPreview">
        <BaseText
          v-if="previewMeta?.driftWarning"
          variant="caption"
          color="inherit"
          class="tw:inline-flex tw:items-start tw:gap-1 tw:text-warn"
        >
          <IconAlertTriangle :size="13" class="tw:mt-0.5 tw:shrink-0" aria-hidden="true" />
          {{ previewMeta.driftWarning }}
        </BaseText>
        <BaseText variant="caption" color="secondary">
          Preview — computed live from current records, not saved<template v-if="previewComputedAt">
            · {{ previewComputedAt }}</template
          >
        </BaseText>
      </template>
      <!-- A body error in preview already says why; a second "couldn't load"
           for the headline would repeat it. -->
      <div v-if="valueError && !(isPreview && error)" class="tw:flex tw:items-center tw:gap-2">
        <BaseText variant="caption" color="secondary">
          {{
            isPreview
              ? valueError.message
              : "Couldn't load this tile's headline figure, scope or freshness."
          }}
        </BaseText>
        <BaseButton
          v-if="!(isPreview && isPreviewTerminalError(valueError))"
          size="sm"
          variant="text"
          @click="retryValue"
        >
          Retry
        </BaseButton>
      </div>
    </template>
  </AnalyticsWidget>

  <!-- Catalog still in flight. -->
  <BaseSkeleton v-else variant="rect" :height="`${height + 96}px`" />
</template>
