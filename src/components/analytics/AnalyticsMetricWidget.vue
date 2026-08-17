<script setup>
/**
 * A metric-bound analytics tile: trend chart + ranked breakdown + drill.
 *
 * Composes the generic `AnalyticsWidget` shell and passes the chart in through
 * its slot, so the shell never reaches into `BaseChart` and BaseChart stays
 * free to evolve. Takes a metric_catalog ROW — the catalog drives the UI, no
 * metric list is hardcoded — and fetches its own value / series / breakdown.
 *
 * **Division of labour with BaseChart (deliberate, do not duplicate).**
 * BaseChart can render the scope / freshness / withheld-count footnote itself,
 * and it owns the CHART-AREA content states (loading, error, empty, and the
 * all-values-withheld "suppressed" state, which it distinguishes from empty).
 * This widget therefore:
 *   - delegates loading / error / empty / suppressed to BaseChart, and
 *   - deliberately does NOT pass `scope`, `computedAt` or `suppressedCount` to
 *     it, because the TILE owns provenance for every tile type (a KPI stat card
 *     has no chart at all, so `AnalyticsWidget` + `AnalyticsMetaLine` is the one
 *     presentation of scope/freshness/tier across the module). Passing both
 *     would print the same metadata twice on every chart tile.
 * The tile's withheld count also spans the breakdown, which the chart cannot
 * see — another reason it belongs to the tile.
 */
import { IconRefresh } from '@tabler/icons-vue'
import { DateTime } from 'luxon'
import { moduleIcon } from '@/utils/moduleIcons.js'
import { useMetricValue, useMetricSeries, useMetricBreakdown } from '@/composables/useAnalytics.js'
import { drillLocation, formatMetricValue, METRIC_PRECISION } from '@/utils/analyticsFormat.js'

const props = defineProps({
  // A metric_catalog node: { metricKey, name, description, moduleId, unit,
  // direction, tier, defaultGrain, dimensions, drill, effectiveScope }.
  metric: { type: Object, required: true },
  periodStart: { type: String, default: null },
  periodEnd: { type: String, default: null },
  compare: { type: String, default: 'previous_period' },
  // Small-cell threshold; the server default is 5.
  minCell: { type: Number, default: 5 },
  chartType: { type: String, default: 'area' },
  height: { type: Number, default: 260 },
  enabled: { type: Boolean, default: true },
})

/**
 * BaseChart's categorical palette is capped at six accessible hues, so a
 * seventh split would repeat a colour and two segments would become
 * indistinguishable. Fold the tail into an explicit "Other" series instead of
 * letting the palette wrap silently.
 */
const MAX_SERIES = 6

const metricKey = computed(() => props.metric?.metricKey)
const unit = computed(() => props.metric?.unit || 'count')

/**
 * Group-by options: the three scope dimensions the breakdown function always
 * accepts, plus whatever the metric itself declares in its `dimensions` jsonb
 * (`[{ key, expr }]`).
 */
const SCOPE_DIMENSIONS = [
  { value: 'site', label: 'Site' },
  { value: 'department', label: 'Department' },
  { value: 'owner', label: 'Owner' },
]

function titleise(key) {
  return String(key)
    .replace(/[_-]+/g, ' ')
    .replace(/^\w/, (c) => c.toUpperCase())
}

const dimensionOptions = computed(() => {
  const declared = (props.metric?.dimensions || []).map((d) => ({
    value: d.key,
    label: titleise(d.key),
  }))
  return [...declared, ...SCOPE_DIMENSIONS]
})

// Default: the metric's own first declared dimension.
const dimension = ref(null)
watch(
  () => props.metric?.metricKey,
  () => {
    dimension.value = dimensionOptions.value[0]?.value ?? null
  },
  { immediate: true },
)

const enabled = computed(() => props.enabled && !!metricKey.value)

const {
  metric: valueRow,
  error: valueError,
  retry: retryValue,
} = useMetricValue(
  {
    metricKey,
    periodStart: () => props.periodStart,
    periodEnd: () => props.periodEnd,
    compare: () => props.compare,
  },
  { enabled },
)

const {
  points,
  loading: seriesLoading,
  error: seriesError,
  retry: retrySeries,
} = useMetricSeries(
  {
    metricKey,
    periodStart: () => props.periodStart,
    periodEnd: () => props.periodEnd,
    // Splitting the trend by the same dimension the breakdown ranks by keeps
    // "what changed" and "who moved it" reading as one answer.
    dimension: () => dimension.value,
    minCell: () => props.minCell,
  },
  { enabled },
)

const {
  rows: breakdownRows,
  error: breakdownError,
  retry: retryBreakdown,
} = useMetricBreakdown(
  {
    metricKey,
    dimension: () => dimension.value,
    periodStart: () => props.periodStart,
    periodEnd: () => props.periodEnd,
    minCell: () => props.minCell,
  },
  { enabled },
)

/**
 * Chart series. A SUPPRESSED bucket is plotted as `null`, never 0 — zero is
 * itself information and a withheld cell must not be readable as one. BaseChart
 * renders nulls as a gap, names them in the tooltip, and escalates to its
 * "withheld" state when every point in view is null.
 *
 * ApexCharts is given epoch-millisecond x values with `xaxis.type: 'datetime'`
 * so it formats the axis itself — no hand-rolled date formatting (CLAUDE.md #10).
 */
function pointOf(p) {
  return { x: DateTime.fromISO(p.bucket).toMillis(), y: p.suppressed ? null : p.value }
}

const chartSeries = computed(() => {
  const rows = points.value || []
  if (!rows.length) return []
  if (!dimension.value) {
    return [{ name: props.metric?.name || 'Value', data: rows.map(pointOf) }]
  }

  const bySeries = new Map()
  const totals = new Map()
  for (const p of rows) {
    const key = p.dimensionValue ?? 'Unspecified'
    if (!bySeries.has(key)) bySeries.set(key, [])
    bySeries.get(key).push(p)
    totals.set(key, (totals.get(key) ?? 0) + (p.value ?? 0))
  }

  const ranked = [...bySeries.keys()].sort((a, b) => (totals.get(b) ?? 0) - (totals.get(a) ?? 0))
  if (ranked.length <= MAX_SERIES) {
    return ranked.map((name) => ({ name, data: bySeries.get(name).map(pointOf) }))
  }

  // Keep the top (MAX_SERIES - 1) and sum the tail into one "Other" series, so
  // the totals still reconcile and no two segments share a colour.
  const kept = ranked.slice(0, MAX_SERIES - 1)
  const tail = ranked.slice(MAX_SERIES - 1)
  const otherByBucket = new Map()
  for (const key of tail) {
    for (const p of bySeries.get(key)) {
      if (p.suppressed) continue
      const x = DateTime.fromISO(p.bucket).toMillis()
      otherByBucket.set(x, (otherByBucket.get(x) ?? 0) + (p.value ?? 0))
    }
  }
  return [
    ...kept.map((name) => ({ name, data: bySeries.get(name).map(pointOf) })),
    {
      name: `Other (${tail.length})`,
      data: [...otherByBucket.entries()].sort((a, b) => a[0] - b[0]).map(([x, y]) => ({ x, y })),
    },
  ]
})

const chartOptions = computed(() => ({
  xaxis: { type: 'datetime' },
  yaxis: {
    decimalsInFloat: METRIC_PRECISION[unit.value] ?? 0,
    labels: { formatter: (v) => formatMetricValue(v, unit.value) },
  },
}))

const chartAriaLabel = computed(() => {
  const grouped = dimension.value ? ` grouped by ${titleise(dimension.value)}` : ''
  return `${props.metric?.name || 'Metric'} over time${grouped}`
})

const suppressedPoints = computed(() => (points.value || []).filter((p) => p.suppressed))
const suppressedRows = computed(() => (breakdownRows.value || []).filter((r) => r.suppressed))
const suppressedCount = computed(() => suppressedPoints.value.length + suppressedRows.value.length)
const suppressedDetail = computed(() => {
  const parts = []
  if (suppressedPoints.value.length) parts.push(`${suppressedPoints.value.length} in the trend`)
  if (suppressedRows.value.length) parts.push(`${suppressedRows.value.length} in the breakdown`)
  return parts.length ? `(${parts.join(', ')}).` : null
})

const drillTo = computed(() =>
  drillLocation({
    drillRoute: props.metric?.drill?.route,
    drillFilters: props.metric?.drill?.filters,
  }),
)

const headline = computed(() => formatMetricValue(valueRow.value?.value, unit.value))

// Export the data BEHIND the chart, not a picture of it, so a number in a
// spreadsheet reconciles with the number on screen (including its suppression).
const exportColumns = [
  { name: 'bucket', label: 'Period', field: 'bucket' },
  { name: 'dimensionValue', label: 'Segment', field: 'dimensionValue' },
  { name: 'value', label: 'Value', field: (r) => (r.suppressed ? 'Withheld' : r.value) },
  { name: 'numerator', label: 'Numerator', field: 'numerator' },
  { name: 'denominator', label: 'Denominator', field: 'denominator' },
  { name: 'suppressed', label: 'Withheld', field: (r) => (r.suppressed ? 'yes' : 'no') },
]

const exportName = computed(
  () => `${props.metric?.metricKey || 'metric'}-${props.periodEnd || 'current'}`,
)
</script>

<template>
  <AnalyticsWidget
    :title="metric?.name"
    :subtitle="metric?.description"
    :icon="moduleIcon(metric?.moduleId)"
    :scope="valueRow?.effectiveScope ?? metric?.effectiveScope"
    :tier="valueRow?.tier ?? metric?.tier"
    :computedAt="valueRow?.computedAt"
    :periodStart="valueRow?.periodStart ?? periodStart"
    :periodEnd="valueRow?.periodEnd ?? periodEnd"
    :suppressedCount="suppressedCount"
    :suppressedDetail="suppressedDetail"
    :isSignificant="valueRow?.isSignificant ?? null"
    :exportRows="points || []"
    :exportColumns="exportColumns"
    :exportName="exportName"
    :drillTo="drillTo"
    :height="height"
  >
    <template #filters>
      <BaseSelect
        v-model="dimension"
        :options="dimensionOptions"
        label="Group by"
        nullLabel="No breakdown (total)"
        clearable
        :searchable="false"
      />
    </template>

    <template #actions>
      <BaseText variant="subheading" weight="bold" class="tw:tabular-nums">{{ headline }}</BaseText>
    </template>

    <!-- Chart-area content state (loading / error / empty / all-withheld) is
         BaseChart's; the tile does not second-guess it. -->
    <BaseChart
      :type="chartType"
      :series="chartSeries"
      :options="chartOptions"
      :height="height"
      :loading="seriesLoading"
      :error="seriesError"
      :ariaLabel="chartAriaLabel"
    >
      <template #error-action>
        <BaseButton size="sm" variant="outline" @click="retrySeries">
          <IconRefresh :size="14" aria-hidden="true" />
          Retry
        </BaseButton>
      </template>
    </BaseChart>

    <template #body>
      <div v-if="breakdownError" class="tw:flex tw:items-center tw:gap-2">
        <BaseText variant="caption" color="secondary">Couldn't load the breakdown.</BaseText>
        <BaseButton size="sm" variant="text" @click="retryBreakdown">Retry</BaseButton>
      </div>
      <AnalyticsBreakdownList
        v-else-if="breakdownRows?.length"
        :rows="breakdownRows"
        :unit="unit"
      />
    </template>

    <!-- The headline figure and the provenance line both come from
         `metric_value`; if that call fails the tile still shows its chart, so
         say what is missing rather than blanking the whole tile. -->
    <template v-if="valueError" #footer>
      <div class="tw:flex tw:items-center tw:gap-2">
        <BaseText variant="caption" color="secondary">
          Couldn't load this metric's headline figure, scope or freshness.
        </BaseText>
        <BaseButton size="sm" variant="text" @click="retryValue">Retry</BaseButton>
      </div>
    </template>
  </AnalyticsWidget>
</template>
