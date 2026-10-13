<script setup>
/**
 * The custom-metric builder's live preview: the unsaved definition, shown as a
 * real widget. See qms/docs/plans/custom-metric-live-preview.md.
 *
 * ── WHY IT IS THE WIDGET, NOT A NEW RENDERER ────────────────────────────────
 * Assembled from the same two components the dashboard and the Data Explorer
 * use: AnalyticsQuestionBuilder for the settings (with the metric picker
 * locked, since the metric IS the draft) and AnalyticsQuestionTile for the
 * answer. A preview that drew its own chart would be a second opinion on what
 * the metric means — the figures here must be the figures the saved metric
 * will show, computed by the real pipeline in a rolled-back transaction.
 *
 * The tile fetches its own data from `previewDefinition` (debounced, superseded
 * requests aborted) and renders its own compile-error / timeout / empty states.
 * This panel only decides whether there is anything worth asking yet.
 *
 * ── WHY NO REQUEST WHILE `problem` IS SET ───────────────────────────────────
 * An incomplete definition cannot compile, so asking would only return the
 * compiler's refusal of something the form already knows is unfinished — and
 * would do so on every keystroke. The form's own sentence says it better.
 *
 * ── WHY AN EXPLICIT PREVIEW BUTTON, NOT AUTO-REFRESH ────────────────────────
 * Each preview request makes the server recompute a rollup in a rolled-back
 * transaction, so refetching on every definition edit spent a full compute per
 * pause in typing. The tile is handed a SNAPSHOT of the definition taken when
 * the author presses Preview; editing the form sends nothing until they press
 * it again. Explicit runs keep the cost proportional to intent (user decision
 * 2026-09-24). The widget-style settings strip (viz, split, period, compare,
 * rank, top N) still applies immediately — those are questions about the
 * snapshot, not edits to the definition.
 */
import { DEFAULT_PERIOD_TOKEN } from '@/utils/analyticsPeriods.js'
import { DEFAULT_VIZ, clampQuestion } from '@/utils/analyticsViz.js'
import { IconChartBar, IconPlayerPlay, IconRefresh } from '@tabler/icons-vue'

const props = defineProps({
  /** A catalog-shaped row for the draft (draftCatalogRow), or null. */
  draftRow: { type: Object, default: null },
  /** The preview request body (previewPayload), or null while incomplete. */
  previewDefinition: { type: Object, default: null },
  /** Why the definition cannot be previewed yet, or null. */
  problem: { type: String, default: null },
  /**
   * The line under the "Preview" heading.
   *
   * The default speaks for the BUILDER, where the definition is unsaved. The
   * metrics list previews a metric that is already saved, where "nothing is
   * saved until you press Save" would be untrue — and the useful thing to say
   * there is what a disagreement with the dashboards means.
   */
  caption: {
    type: String,
    default: 'Computed live from current records — nothing is saved until you press Save.',
  },
  /**
   * Run once, as soon as the definition is previewable, without waiting for the
   * button.
   *
   * ⚠ OFF IN THE BUILDER, AND IT MUST STAY OFF THERE. The builder's definition
   * changes on every keystroke, so an automatic run would spend a full
   * server-side rollup recompute per pause in typing — the cost that made the
   * run explicit in the first place (user decision 2026-09-24).
   *
   * The metrics list is the opposite case: the definition is SAVED and cannot
   * change while the dialog is open, so there is exactly one run per open, and
   * opening a dialog is already the deliberate act the button was asking for.
   * Making the reader press a second button to see the thing they just asked
   * to see is a click with nothing behind it.
   */
  autoRun: { type: Boolean, default: false },
})

const question = ref({
  metricKey: 'preview',
  title: '',
  viz: DEFAULT_VIZ,
  dimension: null,
  periodToken: DEFAULT_PERIOD_TOKEN,
  compare: null,
  filters: {},
})

/**
 * The definition as it stood at the last Preview press, or null before the
 * first. Deep-copied through JSON so later form edits cannot reach into it.
 */
const snapshot = ref(null)

/**
 * Bumped on every press and used as the tile's `key`, so pressing Preview with
 * an unchanged definition still remounts the tile and refetches (the records
 * underneath may have changed even when the definition has not).
 */
const runId = ref(0)

/**
 * The row the settings strip and the clamp work against: the snapshot's once
 * there is one — a dimension that exists only in the live draft must not be
 * offered, or sent, for figures computed from the snapshot — else the live
 * draft, so the strip can be set up before the first run.
 */
const questionRow = computed(() => snapshot.value?.draftRow ?? props.draftRow)

/**
 * Re-clamp when the draft changes shape.
 *
 * Removing a breakdown from the form takes away the dimension the question may
 * be split by, and a unit change can take away a viz. Assigned only when the
 * clamp actually CHANGES something: the draft row is rebuilt on every keystroke
 * in the name field, and replacing the question each time would hand the tile a
 * new object for an unchanged question.
 */
watch(
  questionRow,
  (row) => {
    if (!row) return
    const next = clampQuestion(row, question.value)
    if (next.viz !== question.value.viz || next.dimension !== question.value.dimension) {
      question.value = next
    }
  },
  { immediate: true },
)

const normalised = computed(() => clampQuestion(questionRow.value, question.value))

const ready = computed(() => !props.problem && !!props.previewDefinition && !!props.draftRow)

/**
 * The name is left out of the comparison: the figures do not depend on it, so
 * typing a name should not call the preview stale. The tile shows the live name
 * over the snapshot's row instead (see `tileMetric`).
 */
function fingerprint(definition, row) {
  if (!definition || !row) return null
  const { name: _name, ...shape } = row
  return JSON.stringify({ definition, row: shape })
}

const stale = computed(
  () =>
    !!snapshot.value &&
    fingerprint(props.previewDefinition, props.draftRow) !==
      fingerprint(snapshot.value.previewDefinition, snapshot.value.draftRow),
)

const tileMetric = computed(() =>
  snapshot.value
    ? { ...snapshot.value.draftRow, name: props.draftRow?.name ?? snapshot.value.draftRow.name }
    : null,
)

// Apostrophes, so they live in the script rather than as entities in an
// attribute expression, where they would not be decoded.
const preparingTitle = "Working out this metric's figures…"
const pressPreviewTitle = "Press Preview to see this metric's figures"

/**
 * The one automatic run, for a caller that opted in.
 *
 * Guarded on `snapshot` rather than a fired flag: once a run has happened there
 * is a snapshot, so a later `ready` flicker — a field query resolving, the row
 * being rebuilt — cannot spend a second recompute. Refresh preview stays the
 * only way to run again.
 */
watch(
  ready,
  (isReady) => {
    if (isReady && props.autoRun && !snapshot.value) runPreview()
  },
  { immediate: true },
)

function runPreview() {
  if (!ready.value) return
  snapshot.value = {
    previewDefinition: Object.freeze(JSON.parse(JSON.stringify(props.previewDefinition))),
    draftRow: JSON.parse(JSON.stringify(props.draftRow)),
  }
  runId.value += 1
}
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-4">
    <div>
      <div class="tw:flex tw:items-start tw:justify-between tw:gap-3">
        <div>
          <BaseText weight="medium">Preview</BaseText>
          <BaseText variant="caption" color="secondary">
            {{ caption }}
          </BaseText>
        </div>
        <!--
          Explicit, not automatic: each preview recomputes a rollup server-side,
          so runs happen only when asked for (user decision 2026-09-24).
        -->
        <BaseButton
          size="sm"
          class="tw:shrink-0"
          :disabled="!ready"
          :title="problem || undefined"
          @click="runPreview"
        >
          <IconRefresh v-if="snapshot" :size="14" aria-hidden="true" />
          <IconPlayerPlay v-else :size="14" aria-hidden="true" />
          {{ snapshot ? 'Refresh preview' : 'Preview' }}
        </BaseButton>
      </div>
      <BaseText
        v-if="stale && !problem"
        variant="caption"
        color="inherit"
        class="tw:mt-1 tw:text-amber-700"
        role="status"
      >
        The definition changed — press Refresh preview to update.
      </BaseText>
    </div>

    <div v-if="questionRow" class="tw:rounded tw:border tw:border-divider tw:p-3">
      <AnalyticsQuestionBuilder
        v-model="question"
        :metrics="[questionRow]"
        :showTitle="false"
        lockMetric
      />
    </div>

    <BaseEmptyState
      v-if="!ready"
      :icon="IconChartBar"
      title="Finish the highlighted section to see a preview"
      :description="problem || 'Choose what this metric counts to see it here.'"
    />
    <AnalyticsQuestionTile
      v-else-if="snapshot"
      :key="runId"
      :question="normalised"
      :metric="tileMetric"
      :previewDefinition="snapshot.previewDefinition"
    />
    <BaseEmptyState
      v-else
      :icon="IconPlayerPlay"
      :title="autoRun ? preparingTitle : pressPreviewTitle"
      description="Computed live from current records — nothing is saved."
    />
  </div>
</template>
