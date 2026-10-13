<script setup>
/**
 * The pickers that compose a QUESTION: metric → visualisation → dimension →
 * period → comparison. One component, used by both the widget dialog (which
 * then persists the question) and the Data Explorer (which does not) — the
 * Explorer is precisely this builder with the save step removed, so duplicating
 * the picker logic would guarantee the two drifted.
 *
 * The metric builder's live preview is the third user, with `lockMetric`: the
 * metric is the one being defined, so the picker is hidden and `metrics` holds
 * exactly one row — a DRAFT catalog row from utils/analyticsMetricPreview.js
 * (draftCatalogRow). Everything else is unchanged, which is the point: the
 * preview offers the same visualisations and splits a dashboard widget will,
 * because the same rules below decide them from a row of the same shape.
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
 * ── WHY THE METRIC PICKER OPTS OUT OF autoFill ──────────────────────────────
 * BaseSelect auto-selects the first option when `required` is set, which is
 * right for a field with a defensible default and wrong here: the catalog is
 * ordered `module_id, id`, so the "default" is whichever metric sorts first
 * alphabetically by module — on a 140-metric tenant, "Audit findings by
 * department". That is not a suggestion, it is an accident of sort order, and
 * it arrives with a live preview that makes it look like a decision already
 * taken. Opting out restores the placeholder ("Choose what to measure") and
 * the dialog's own "Pick a metric" empty state, which assumes a null metric.
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
  // Fix the question to the single entry in `metrics` and hide the picker —
  // for the metric builder's preview, where there is nothing else to choose.
  lockMetric: { type: Boolean, default: false },
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

/**
 * With the picker hidden nothing else can choose the metric, so adopt the one
 * offered. Runs through onMetricChange so the viz/dimension are clamped against
 * it in the same tick — a draft row's dimensions change as the author edits the
 * group-by, and the watch further down re-clamps from there.
 */
watch(
  () => (props.lockMetric ? (props.metrics[0]?.metricKey ?? null) : null),
  (lockedKey) => {
    if (lockedKey && question.value?.metricKey !== lockedKey) onMetricChange(lockedKey)
  },
  { immediate: true },
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
    return `A ${currentRule.value?.label?.toLowerCase() ?? 'single number'} shows one total, so there is nothing to show separately.`
  }
  // Named, not counted. "the 1 dimension it was rolled up with" told the reader
  // how many there were and left them to guess which — and "dimension",
  // "pre-aggregated" and "rolled up" are three pieces of warehouse vocabulary in
  // one sentence, none of which a quality manager has any reason to know.
  // Labelled through dimensionOptionsFor() rather than off the raw key, so the
  // names in this sentence are the same strings the picker below shows. A
  // catalog dimension carries only {key, expr, filterKey} — there is no label on
  // it — and printing the key would say "root_cause" where the dropdown says
  // "Root cause".
  const declared = dimensionOptionsFor(metric.value, question.value?.viz)
    .filter((o) => !o.scope)
    .map((o) => o.label)
  const base = declared.length
    ? `This metric was set up to break down by ${declared.join(', ')}. To add another, edit the metric.`
    : 'This metric was not set up with a breakdown. To add one, edit the metric.'
  if (currentRule.value?.source === SOURCE.BREAKDOWN) {
    return `${base} Site, department and owner can also be used here.`
  }
  return `${base} Site, department and owner can only be used on charts that rank a period, not on ones that plot over time.`
})

// Comparison only changes what `metric_value` returns, and the single-number
// tile is the only one that renders a delta — so offering it elsewhere would be
// a control that does nothing.
const showCompare = computed(() => currentRule.value?.source === SOURCE.VALUE)

/**
 * Which accordion panels are open. Closed on arrival, and it stays a ref rather
 * than a prop: whether someone opened Options is a property of this editing
 * session, not of the question being edited.
 */
const openOptions = ref([])

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
      v-if="!lockMetric"
      :modelValue="question.metricKey"
      :options="metricOptions"
      optionGroup="group"
      optionDescription="description"
      searchDescription
      label="Metric"
      :hint="metric?.description || ''"
      :loading="loading"
      :required="true"
      :autoFill="false"
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
        label="Show separately by"
        :required="dimensionMode === 'required'"
        :clearable="dimensionMode === 'optional'"
        :nullLabel="dimensionMode === 'optional' ? 'Combined total' : null"
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

      <!--
        Everything below is optional and defaulted.

        Metric and Visualisation are the two answers that cannot be guessed; the
        period defaults to a sensible relative window, the comparison only
        decorates a single-number tile with an arrow, and a blank title falls
        back to the metric's own name. Presented flat, those three read as three
        more decisions to make before the tile works — which is how a two-choice
        task came to look like a five-field form.
      -->
      <BaseAccordion
        v-model="openOptions"
        :items="[{ value: 'options', title: 'Options' }]"
        :level="4"
      >
        <template #options>
          <div class="tw:flex tw:flex-col tw:gap-4">
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
          label="Show change vs"
          hint="Adds an up or down arrow against the earlier period. It does not change the number itself."
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
          </div>
        </template>
      </BaseAccordion>
    </template>
  </div>
</template>
