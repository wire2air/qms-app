<script setup>
/**
 * The pickers that compose a QUESTION: metric → visualisation → dimension →
 * period → comparison. One component, used by both the widget dialog (which
 * then persists the question) and the Data Explorer (which does not) — the
 * Explorer is precisely this builder with the save step removed, so duplicating
 * the picker logic would guarantee the two drifted.
 *
 * ── THE CATALOG IS THE CONTRACT, IN BOTH DIRECTIONS ─────────────────────────
 * The metric list is `metricCatalog` and nothing else: it is already filtered
 * server-side by permission, commercial entitlement, and whether the rollup
 * holds any data, so a hardcoded list would necessarily offer someone a metric
 * they cannot read. The dimension list is likewise the metric's own `dimensions`
 * array — asking for a key outside it is a server ERROR, not an empty chart, so
 * an over-generous picker produces a broken saved widget rather than a slightly
 * wrong one.
 *
 * ── WHY THE VISUALISATION IS PICKED BEFORE THE DIMENSION ────────────────────
 * Because the dimension vocabulary depends on it, and asymmetrically:
 * `metric_breakdown` accepts the declared keys PLUS site / department / owner,
 * while `metric_series` accepts the declared keys ONLY. So a bar chart may be
 * split by Site and a stacked bar may not, and the control order reflects the
 * dependency rather than hiding it. `src/utils/analyticsViz.js` owns that rule.
 *
 * ── WHY THE PERIOD IS A SELECT AND NOT A DATE PICKER ────────────────────────
 * `period_token` must stay RELATIVE so a saved dashboard keeps meaning "the last
 * twelve months" instead of freezing to whichever twelve were current when it
 * was saved. Offering `BaseDateFilter` here would expose an absolute `between`
 * range, and a user picking one would silently save the frozen period the column
 * exists to prevent. A select over `PERIOD_TOKENS` makes that unrepresentable.
 */
import { IconInfoCircle } from '@tabler/icons-vue'
import { moduleLabel } from '@/utils/analyticsFormat.js'
import { PERIOD_TOKEN_OPTIONS, DEFAULT_PERIOD_TOKEN } from '@/utils/analyticsPeriods.js'
import {
  SOURCE,
  vizOptionsFor,
  vizRule,
  dimensionOptionsFor,
  clampQuestion,
} from '@/utils/analyticsViz.js'

const props = defineProps({
  // metric_catalog rows. The PARENT fetches them so a dialog and the page
  // behind it don't issue the same query twice.
  metrics: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  // Hide the title field where a title makes no sense (the Explorer is not
  // saving anything to name).
  showTitle: { type: Boolean, default: true },
})

/**
 * The question. Mutated by REPLACEMENT so a parent `watch` fires without
 * needing `deep`.
 * @type {import('vue').ModelRef<{metricKey: string|null, viz: string, dimension: string|null, periodToken: string, compare: string|null, title: string|null, filters: object}>}
 */
const question = defineModel({ type: Object, required: true })

function patch(next) {
  question.value = { ...question.value, ...next }
}

const metric = computed(
  () => props.metrics.find((m) => m.metricKey === question.value?.metricKey) ?? null,
)

// Grouped by module so a 22-metric list reads as five short ones.
const metricOptions = computed(() =>
  props.metrics.map((m) => ({
    value: m.metricKey,
    label: m.name || m.metricKey,
    description: m.description,
    group: moduleLabel(m.moduleId),
  })),
)

const vizOptions = computed(() =>
  vizOptionsFor(metric.value).map((r) => ({
    value: r.id,
    label: r.label,
    description: r.description,
  })),
)

const currentRule = computed(() => vizRule(question.value?.viz))

const dimensionOptions = computed(() => dimensionOptionsFor(metric.value, question.value?.viz))

const dimensionMode = computed(() => currentRule.value?.dimension ?? 'none')

/**
 * Why the dimension list is as short as it is. `dimensionCapacity` is the
 * ceiling the rollup was built with and `dimensions` is already truncated to it,
 * so this explains a short list rather than enforcing anything.
 */
const dimensionHint = computed(() => {
  if (!metric.value) return null
  if (dimensionMode.value === 'none') {
    return `A ${currentRule.value?.label?.toLowerCase() ?? 'single number'} shows one total, so there is nothing to split by.`
  }
  const declared = (metric.value.dimensions || []).length
  const capacity = metric.value.dimensionCapacity
  const base = `This metric is pre-aggregated, so it can only be split by the ${declared} dimension${declared === 1 ? '' : 's'} it was rolled up with${capacity ? ` (of a possible ${capacity})` : ''}.`
  if (currentRule.value?.source === SOURCE.BREAKDOWN) {
    return `${base} Site, department and owner are always available for this chart type.`
  }
  return `${base} Site, department and owner can only be used on the chart types that rank a period, not on ones that plot over time.`
})

// Comparison only changes what `metric_value` returns, and the single-number
// tile is the only one that renders a delta — so offering it elsewhere would be
// a control that does nothing.
const showCompare = computed(() => currentRule.value?.source === SOURCE.VALUE)

const COMPARE_OPTIONS = [
  { value: 'previous_period', label: 'vs previous period' },
  { value: 'same_period_last_year', label: 'vs same period last year' },
]

// Breakdown shaping. These live in the widget's `filters` jsonb because they
// are part of the QUESTION ("top 10 by contribution") and hold no computed
// value — see the note in AnalyticsQuestionTile.
const showRanking = computed(() => currentRule.value?.source === SOURCE.BREAKDOWN)

const RANK_OPTIONS = [
  {
    value: 'contribution',
    label: 'Biggest contributors',
    description: 'Ranked by how much each segment moves the overall number.',
  },
  {
    value: 'value',
    label: 'Highest value',
    description: 'Ranked by the segment’s own figure, however small the segment.',
  },
]

const LIMIT_OPTIONS = [5, 10, 15, 20].map((n) => ({ value: n, label: `Top ${n}` }))

const filters = computed(() => question.value?.filters || {})

function patchFilters(next) {
  patch({ filters: { ...filters.value, ...next } })
}

/**
 * Keep the triple legal. A metric change can strand a viz (a stacked bar of a
 * percentage), and a viz change can strand a dimension (Site on a time series).
 * Clamping here rather than at render means the user never sees a control in a
 * state the server would reject.
 */
watch(
  [metric, () => question.value?.viz],
  () => {
    if (!metric.value) return
    const clamped = clampQuestion(metric.value, question.value)
    if (clamped.viz !== question.value.viz || clamped.dimension !== question.value.dimension) {
      patch(clamped)
    }
  },
  { immediate: true },
)

function onMetricChange(metricKey) {
  const next = props.metrics.find((m) => m.metricKey === metricKey) ?? null
  // Re-clamp against the NEW metric in the same tick, so the viz/dimension
  // selects never flash a combination that belongs to the previous metric.
  // The new metric goes INTO the draft rather than over the clamp's result:
  // clampQuestion returns the whole question, so spreading it last would put
  // the outgoing metricKey back and the picker would never change.
  patch(
    clampQuestion(next, {
      ...question.value,
      metricKey,
      periodToken: question.value?.periodToken || DEFAULT_PERIOD_TOKEN,
    }),
  )
}
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-4">
    <BaseSelect
      :modelValue="question.metricKey"
      :options="metricOptions"
      optionGroup="group"
      optionDescription="description"
      label="Metric"
      :hint="metric?.description || ''"
      :loading="loading"
      :required="true"
      placeholder="Choose what to measure"
      @update:modelValue="onMetricChange"
    />

    <template v-if="metric">
      <BaseSelect
        :modelValue="question.viz"
        :options="vizOptions"
        optionDescription="description"
        label="Visualisation"
        :required="true"
        :searchable="false"
        @update:modelValue="(v) => patch({ viz: v })"
      />

      <BaseSelect
        v-if="dimensionMode !== 'none'"
        :modelValue="question.dimension"
        :options="dimensionOptions"
        label="Split by"
        :required="dimensionMode === 'required'"
        :clearable="dimensionMode === 'optional'"
        :nullLabel="dimensionMode === 'optional' ? 'No split (total)' : null"
        :searchable="false"
        @update:modelValue="(v) => patch({ dimension: v })"
      >
        <template v-if="dimensionHint" #hint>
          <span class="tw:flex tw:items-start tw:gap-1">
            <IconInfoCircle :size="13" class="tw:mt-0.5 tw:shrink-0" aria-hidden="true" />
            <span>{{ dimensionHint }}</span>
          </span>
        </template>
      </BaseSelect>
      <BaseText v-else-if="dimensionHint" variant="helper" color="secondary">
        {{ dimensionHint }}
      </BaseText>

      <div class="tw:grid tw:grid-cols-1 tw:gap-4 tw:sm:grid-cols-2">
        <BaseSelect
          :modelValue="question.periodToken || DEFAULT_PERIOD_TOKEN"
          :options="PERIOD_TOKEN_OPTIONS"
          label="Period"
          hint="Saved as a relative window, so this tile keeps meaning the same thing next month."
          :required="true"
          :searchable="false"
          @update:modelValue="(v) => patch({ periodToken: v })"
        />

        <BaseSelect
          v-if="showCompare"
          :modelValue="question.compare || 'previous_period'"
          :options="COMPARE_OPTIONS"
          label="Compare against"
          :required="true"
          :searchable="false"
          @update:modelValue="(v) => patch({ compare: v })"
        />

        <template v-if="showRanking">
          <BaseSelect
            :modelValue="filters.rankBy || 'contribution'"
            :options="RANK_OPTIONS"
            optionDescription="description"
            label="Rank by"
            :required="true"
            :searchable="false"
            @update:modelValue="(v) => patchFilters({ rankBy: v })"
          />
          <BaseSelect
            :modelValue="filters.limit || 10"
            :options="LIMIT_OPTIONS"
            label="Show"
            :required="true"
            :searchable="false"
            @update:modelValue="(v) => patchFilters({ limit: v })"
          />
        </template>
      </div>

      <BaseTextInput
        v-if="showTitle"
        :modelValue="question.title || ''"
        label="Title"
        instructions="Leave blank to use the metric's own name."
        :placeholder="metric.name || 'Tile title'"
        @update:modelValue="(v) => patch({ title: v || null })"
      />
    </template>
  </div>
</template>
