<script setup>
/**
 * BaseChart — a thin, lazy-loaded wrapper over ApexCharts (vue3-apexcharts) for
 * dashboards, reports and the analytics module. ApexCharts (~140KB) is
 * `defineAsyncComponent`-loaded, so it ships only on routes that actually render
 * a chart (BaseSpinner shows while it loads). Theme-aware brand defaults are
 * deep-merged under a per-type preset, which is deep-merged under the consumer's
 * `options`.
 *
 *   <BaseChart type="area" :series="[{ name: 'Open NCs', data: [3,5,2,8,6] }]"
 *              :options="{ xaxis: { categories: ['Mon','Tue','Wed','Thu','Fri'] } }" />
 *   <BaseChart type="donut" :series="[44, 55, 13]" :options="{ labels: ['Open','Closed','Draft'] }" />
 *   <BaseChart type="stackedBar" :series="bySeverity" :loading="loading" :error="error"
 *              scope="site" :computedAt="computedAt" :suppressedCount="2" />
 *
 * **Dark mode.** The palette and the grid/axis colours follow `isDark` from
 * `@/utils/theme.js` — the app's one dark-mode source of truth, the same ref the
 * theme toggle writes and the `.dark` class on `<html>` mirrors. A CSS class
 * can't reach an SVG fill, and `getComputedStyle` on its own isn't reactive, so
 * `isDark` supplies the reactivity and `resolveChartChrome()` reads the live
 * `--divider` / `--secondary` / `--on-main` / `--card` custom properties for the
 * chrome so it can never drift from `base.css`. Series colours come from the
 * validated Okabe-Ito scales in `@/utils/chartPalette.js` (they have no token
 * equivalent).
 *
 * **Reading analytics figures honestly.** The analytics API distinguishes three
 * things a chart must not flatten:
 *   - a `null` value with `suppressed: true` is *withheld for small-cell
 *     privacy*, not zero — pass it through as `null` and it renders as a gap
 *     (heatmap: a neutral cell), never as a zero-height mark;
 *   - `is_significant: null` means *no valid statistical test applies* — pass
 *     `null` in `significance` and NO marker is rendered, not a "not
 *     significant" one;
 *   - every figure carries an `effective_scope` and a `computed_at`, surfaced by
 *     the `scope` / `computedAt` props (or the `#footnote` slot) because two
 *     viewers at different scopes legitimately see different totals.
 *
 * ApexCharts renders SVG (needs a real DOM) — verify in Storybook/app, not jsdom.
 */
import { defineAsyncComponent } from 'vue'
import { DateTime } from 'luxon'
import { IconEyeOff } from '@tabler/icons-vue'
import BaseSpinner from './BaseSpinner.vue'
import { resolveListState } from '../composables/listLayoutHelpers.js'
import { isDark } from '@/utils/theme.js'
import {
  categoricalScale,
  ordinalScale,
  resolveChartChrome,
  heatmapRanges,
  suppressedFill,
  SUPPRESSED_SENTINEL,
} from '@/utils/chartPalette.js'

const props = defineProps({
  // Native ApexCharts types (line | area | bar | donut | pie | radialBar |
  // scatter | heatmap | …) plus the analytics presets below: stackedBar |
  // sparkline | combo | histogram | funnel.
  type: { type: String, default: 'line' },
  // May be empty while loading. Data points may be `null` — see the header.
  series: { type: Array, default: () => [] },
  height: { type: [Number, String], default: null },
  // ApexCharts options; deep-merged over the defaults + the type preset.
  options: { type: Object, default: () => ({}) },
  // Charts are images to a screen reader — always describe what this one shows.
  ariaLabel: { type: String, default: '' },

  // ---- state (mirrors BaseListLayout) ----
  loading: { type: Boolean, default: false },
  error: { type: [String, Object, Error], default: null },
  // 'auto' derives from loading/error/series; force one to preview it.
  state: {
    type: String,
    default: 'auto',
    validator: (v) => ['auto', 'ready', 'loading', 'error', 'empty', 'suppressed'].includes(v),
  },
  emptyTitle: { type: String, default: 'No data for this period' },
  emptyDescription: { type: String, default: '' },
  errorTitle: { type: String, default: "Couldn't load this chart" },
  errorDescription: { type: String, default: '' },

  // ---- analytics figure metadata ----
  // Parallel to the primary series' data (or an array-of-arrays, one row per
  // series). `true` / `false` label the point; `null` / `undefined` label
  // nothing at all, because no test was applicable.
  significance: { type: Array, default: null },
  // How many cells the server withheld — stated in the footnote so a gap in the
  // plot is never read as "nothing happened".
  suppressedCount: { type: Number, default: 0 },
  suppressedLabel: { type: String, default: 'Withheld (small group)' },
  significantLabel: { type: String, default: 'statistically significant' },
  notSignificantLabel: { type: String, default: 'not statistically significant' },
  // `effective_scope` from the API — the tier this figure was computed under.
  scope: {
    type: String,
    default: null,
    validator: (v) => v === null || ['own', 'department', 'site', 'tenant'].includes(v),
  },
  // `computed_at` freshness stamp: a luxon DateTime (what the axios transformer
  // yields) or an ISO string.
  computedAt: { type: [Object, String], default: null },
})

const ApexChart = defineAsyncComponent({
  loader: () => import('vue3-apexcharts'),
  loadingComponent: BaseSpinner,
})

const SCOPE_LABEL = {
  own: 'Own records',
  department: 'Department',
  site: 'Site',
  tenant: 'Organisation',
}

// Friendly type → the real ApexCharts chart type. Every preset below is plain
// configuration of the installed renderer — no plugin and no extra dependency.
const TYPE_PRESET = {
  stackedBar: { apex: 'bar', build: buildStackedBar },
  heatmap: { apex: 'heatmap', build: buildHeatmap },
  sparkline: { apex: 'area', build: buildSparkline },
  combo: { apex: 'line', build: buildCombo },
  histogram: { apex: 'bar', build: buildHistogram },
  funnel: { apex: 'bar', build: buildFunnel },
}

// Per-type height defaults; everything else keeps the dashboard default.
const DEFAULT_HEIGHT = { sparkline: 48 }

const apexType = computed(() => TYPE_PRESET[props.type]?.apex || props.type)
const resolvedHeight = computed(() => props.height ?? DEFAULT_HEIGHT[props.type] ?? 300)

// `isDark` drives the reactivity; the DOM read inside resolveChartChrome() then
// picks up the `.dark` class, which theme.js toggles in the same synchronous
// call that sets the ref (so the class is already correct by the time Vue
// re-evaluates this).
const chrome = computed(() => resolveChartChrome(isDark.value))
const palette = computed(() => categoricalScale(isDark.value))

/* ------------------------------------------------------------------ series */

// ApexCharts accepts two series shapes: `[{ name, data: [...] }]` and a bare
// number array (donut/pie/radialBar). Flatten to y values so the state machine
// can tell "no data at all" from "every value withheld".
function yOf(point) {
  if (point === null || point === undefined) return null
  if (typeof point === 'number') return point
  if (Array.isArray(point)) return point[1] ?? null
  return point.y ?? null
}

function yValues(series) {
  const arr = Array.isArray(series) ? series : []
  const first = arr.find((s) => s !== null && s !== undefined)
  const keyed = first && typeof first === 'object' && !Array.isArray(first) && 'data' in first
  if (keyed) return arr.flatMap((s) => (Array.isArray(s?.data) ? s.data.map(yOf) : []))
  return arr.map(yOf)
}

const points = computed(() => yValues(props.series))

const domain = computed(() => {
  const nums = points.value.filter((v) => typeof v === 'number')
  return nums.length ? { min: Math.min(...nums), max: Math.max(...nums) } : { min: 0, max: 1 }
})

// ApexCharts has no "no value" heatmap cell — a null paints at the bottom of the
// colour scale, i.e. identical to a genuine zero. Route withheld cells to a
// sentinel that heatmapRanges() paints with the neutral suppression fill.
function suppressPoint(point) {
  if (Array.isArray(point)) return [point[0], SUPPRESSED_SENTINEL]
  if (point && typeof point === 'object') return { ...point, y: SUPPRESSED_SENTINEL }
  return SUPPRESSED_SENTINEL
}

const preparedSeries = computed(() => {
  if (apexType.value !== 'heatmap') return props.series
  return (props.series || []).map((s) => ({
    ...s,
    data: (s?.data || []).map((p) => (yOf(p) === null ? suppressPoint(p) : p)),
  }))
})

/* ------------------------------------------------------------------- state */

const resolvedState = computed(() => {
  if (props.state !== 'auto') return props.state
  const base = resolveListState({
    loading: props.loading,
    error: props.error,
    empty: points.value.length === 0,
  })
  // Every point withheld is not "no data" — and an empty axis frame would read
  // as zero. Name it for what it is.
  if (base === 'ready' && points.value.every((v) => v === null)) return 'suppressed'
  return base
})

const stateStyle = computed(() => {
  const h = resolvedHeight.value
  return { minHeight: typeof h === 'number' ? `${h}px` : h }
})

const resolvedErrorDescription = computed(
  () => props.errorDescription || (typeof props.error === 'string' ? props.error : '') || null,
)

/* --------------------------------------------------------- figure metadata */

// `null`/`undefined` means no test applied — render nothing. Only an explicit
// boolean has been tested and may be labelled.
function significanceNote(seriesIndex, pointIndex) {
  if (!props.significance) return ''
  const row = Array.isArray(props.significance[0]) ? props.significance[seriesIndex] : props.significance
  const flag = row?.[pointIndex]
  if (flag === true) return props.significantLabel
  if (flag === false) return props.notSignificantLabel
  return ''
}

function formatValue(value, ctx) {
  if (value === null || value === undefined || value === SUPPRESSED_SENTINEL) {
    return props.suppressedLabel
  }
  const note = significanceNote(ctx?.seriesIndex ?? 0, ctx?.dataPointIndex ?? 0)
  return note ? `${value} · ${note}` : String(value)
}

const scopeLabel = computed(() => (props.scope ? SCOPE_LABEL[props.scope] : ''))

const freshness = computed(() => {
  if (!props.computedAt) return ''
  const d = typeof props.computedAt === 'string' ? DateTime.fromISO(props.computedAt) : props.computedAt
  return d?.isValid ? d.formatDate('datetime') : ''
})

const hasFootnote = computed(
  () => Boolean(scopeLabel.value || freshness.value || props.suppressedCount > 0),
)

/* ----------------------------------------------------------------- options */

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
}

// Arrays and scalars replace wholesale: `colors`, `categories` and ApexCharts'
// `ranges` are positional, so merging them by index would silently interleave
// two palettes.
function deepMerge(base, override) {
  if (override === undefined) return base
  if (!isPlainObject(base) || !isPlainObject(override)) return override
  const out = { ...base }
  for (const [key, value] of Object.entries(override)) {
    out[key] = isPlainObject(value) && isPlainObject(base[key]) ? deepMerge(base[key], value) : value
  }
  return out
}

function baseDefaults(ctx) {
  return {
    chart: {
      toolbar: { show: false },
      fontFamily: 'inherit',
      background: 'transparent',
      foreColor: ctx.chrome.text,
      animations: { speed: 300 },
    },
    // Apex's own theme drives tooltip/legend chrome it doesn't expose directly.
    theme: { mode: ctx.dark ? 'dark' : 'light' },
    colors: ctx.palette,
    dataLabels: { enabled: false },
    grid: { borderColor: ctx.chrome.grid, strokeDashArray: 4 },
    // Identity is never colour-alone: a legend is present whenever more than one
    // thing is plotted (label-per-slice types always need it).
    legend: { position: 'bottom', show: ctx.seriesCount > 1 || ctx.labelled },
    stroke: { curve: 'smooth', width: 2 },
    tooltip: { theme: ctx.dark ? 'dark' : 'light', y: { formatter: formatValue } },
    // Apex never gets to draw its own "No Data" — the empty state is handled in
    // the template, before the chart is even mounted.
    noData: { text: '' },
  }
}

// 2px surface gap between touching fills so adjacent segments never bleed.
function segmentGap(ctx) {
  return { show: true, width: 2, colors: [ctx.chrome.surface] }
}

function buildStackedBar(ctx) {
  return {
    chart: { stacked: true },
    plotOptions: {
      bar: { borderRadius: 4, borderRadiusApplication: 'end', columnWidth: '60%' },
    },
    stroke: segmentGap(ctx),
  }
}

function buildHeatmap(ctx) {
  return {
    plotOptions: {
      heatmap: {
        enableShades: false,
        colorScale: {
          ranges: heatmapRanges({ min: ctx.domain.min, max: ctx.domain.max, dark: ctx.dark }),
        },
      },
    },
    stroke: segmentGap(ctx),
    legend: { show: false },
  }
}

function buildSparkline() {
  // A sparkline is a trend glyph, not a chart: no axes, grid, legend or title.
  return {
    chart: { sparkline: { enabled: true } },
    stroke: { curve: 'smooth', width: 2 },
    fill: { opacity: 0.15 },
    tooltip: { fixed: { enabled: false } },
  }
}

function buildCombo(ctx) {
  // Bar + line share ONE y-axis on purpose. A second y-scale is not offered:
  // two axes let the reader infer a crossover the data does not contain.
  return {
    stroke: { width: ctx.series.map((s) => (s?.type === 'line' ? 2 : 0)) },
    plotOptions: {
      bar: { borderRadius: 4, borderRadiusApplication: 'end', columnWidth: '55%' },
    },
    markers: { size: 4, strokeColors: ctx.chrome.surface, strokeWidth: 2 },
  }
}

function buildHistogram(ctx) {
  // Aging buckets arrive pre-binned from the API — ApexCharts has no binning,
  // and re-binning in the browser would disagree with the counts the same API
  // returns for the drill-through list. Bins touch, separated by the 2px surface
  // hairline, so the axis reads as one continuous scale rather than categories.
  return {
    plotOptions: { bar: { columnWidth: '96%', borderRadius: 2, borderRadiusApplication: 'end' } },
    stroke: segmentGap(ctx),
    // One hue: bar length already encodes the count, so colour would re-encode it.
    colors: [ctx.palette[0]],
    legend: { show: false },
  }
}

function buildFunnel(ctx) {
  // `isFunnel` is native to the bar renderer in ApexCharts 5 — no plugin.
  // Stages are ORDINAL (swapping two changes the meaning), so they take a
  // one-hue ramp rather than categorical slots. Direct labels are mandatory:
  // the ramp's pale end sits below 3:1, and the label is that relief channel.
  // Past six stages `ordinalScale` collapses to a single hue — stage position
  // and the labels already carry the order, and a seventh step would not be
  // distinguishable from its neighbour anyway.
  return {
    plotOptions: {
      bar: { horizontal: true, isFunnel: true, borderRadius: 0, distributed: true },
    },
    colors: ordinalScale(ctx.dark, ctx.pointCount),
    dataLabels: {
      enabled: true,
      style: { colors: ['#ffffff'] },
      dropShadow: { enabled: true, blur: 2, opacity: 0.5 },
    },
    stroke: segmentGap(ctx),
    legend: { show: false },
    grid: { show: false },
    xaxis: { labels: { show: false } },
  }
}

const LABELLED_TYPES = ['donut', 'pie', 'radialBar', 'polarArea']

const mergedOptions = computed(() => {
  const ctx = {
    dark: isDark.value,
    chrome: chrome.value,
    palette: palette.value,
    series: props.series || [],
    seriesCount: (props.series || []).length,
    pointCount: points.value.length,
    domain: domain.value,
    labelled: LABELLED_TYPES.includes(props.type),
  }
  const preset = TYPE_PRESET[props.type]?.build?.(ctx) || {}
  return deepMerge(deepMerge(baseDefaults(ctx), preset), props.options || {})
})
</script>

<template>
  <div class="tw:w-full">
    <div
      v-if="resolvedState === 'loading'"
      class="tw:flex tw:flex-col tw:justify-end"
      :style="stateStyle"
    >
      <slot name="loading">
        <BaseSkeleton variant="rect" height="100%" rounded="tw:rounded-lg" />
      </slot>
    </div>

    <div
      v-else-if="resolvedState === 'error'"
      class="tw:flex tw:items-center tw:justify-center"
      :style="stateStyle"
    >
      <slot name="error">
        <BaseStatusState
          variant="error"
          :title="errorTitle"
          :description="resolvedErrorDescription"
        >
          <template v-if="$slots['error-action']" #action><slot name="error-action" /></template>
        </BaseStatusState>
      </slot>
    </div>

    <!-- An empty axis frame reads as "zero". Say there is no data instead. -->
    <div
      v-else-if="resolvedState === 'empty'"
      class="tw:flex tw:items-center tw:justify-center"
      :style="stateStyle"
    >
      <slot name="empty">
        <BaseStatusState variant="empty" :title="emptyTitle" :description="emptyDescription || null">
          <template v-if="$slots['empty-action']" #action><slot name="empty-action" /></template>
        </BaseStatusState>
      </slot>
    </div>

    <!-- Withheld ≠ absent ≠ zero: this is data the viewer may not see. -->
    <div
      v-else-if="resolvedState === 'suppressed'"
      class="tw:flex tw:items-center tw:justify-center"
      :style="stateStyle"
    >
      <slot name="suppressed">
        <BaseStatusState
          variant="denied"
          :icon="IconEyeOff"
          title="Withheld to protect small groups"
          description="Every value in this view fell below the reporting threshold."
        />
      </slot>
    </div>

    <div v-else role="img" :aria-label="ariaLabel || undefined">
      <ApexChart
        :key="isDark ? 'dark' : 'light'"
        :type="apexType"
        :series="preparedSeries"
        :height="resolvedHeight"
        :options="mergedOptions"
      />
    </div>

    <p
      v-if="hasFootnote || $slots.footnote"
      class="tw:mt-2 tw:flex tw:flex-wrap tw:items-center tw:gap-x-3 tw:gap-y-1 tw:text-micro tw:text-secondary"
    >
      <slot name="footnote">
        <span v-if="scopeLabel">Scope: {{ scopeLabel }}</span>
        <span v-if="freshness">Updated {{ freshness }}</span>
        <span v-if="suppressedCount > 0" class="tw:inline-flex tw:items-center tw:gap-1">
          <span
            class="tw:size-2 tw:shrink-0 tw:rounded-sm"
            :style="{ backgroundColor: suppressedFill(isDark) }"
            aria-hidden="true"
          />
          {{ suppressedCount }} withheld to protect small groups
        </span>
      </slot>
    </p>
  </div>
</template>
