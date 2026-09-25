<script setup>
/**
 * Preview one SAVED custom metric from the metrics list, without opening the
 * editor.
 *
 * ── WHY A DIALOG AND NOT A ROUTE ────────────────────────────────────────────
 * The list is a scanning surface: someone checking fourteen audit-finding
 * metrics wants to look and close, not lose their scroll position and filters
 * on every look. Navigating to the editor and back does exactly that.
 *
 * ── WHY IT PREVIEWS A METRIC THAT ALREADY HAS FIGURES ───────────────────────
 * The preview endpoint takes a DEFINITION, not an id: it inserts the draft,
 * compiles, recomputes and rolls back (services/analyticsMetricPreview.js). It
 * never asks whether the metric is saved, so a published metric previews
 * exactly as a draft does — which is why the button needs no `isPublished`
 * condition, unlike Refresh.
 *
 * A preview CAN disagree with the dashboards, and that disagreement is the
 * useful part. Per the service header, there is no second formula to disagree
 * with — the draft goes through the production pipeline — so a difference can
 * only mean the source records changed since the last 15-minute rollup. The
 * caption says so rather than hedging.
 *
 * ── WHY NOTHING RUNS UNTIL THE BUTTON IS PRESSED ────────────────────────────
 * Each preview recomputes a rollup server-side. On a list of a dozen-plus cards
 * an auto-run on open would make that cost trivially easy to trigger by
 * browsing, so the panel's explicit-run rule (user decision 2026-09-24) is kept
 * here rather than quietly reversed on a new surface.
 */
import { draftCatalogRow, previewPayload } from '@/utils/analyticsMetricPreview.js'

const props = defineProps({
  /** The AnalyticsCustomMetric row being previewed, or null when closed. */
  metric: { type: Object, default: null },
  /** The field vocabulary, already tenant-filtered by the parent. */
  fields: { type: Array, default: () => [] },
})

const open = defineModel({ type: Boolean, default: false })

/** The stored definition, which is what a save wrote and what preview reads. */
const definition = computed(() => props.metric?.definition ?? null)

const draftRow = computed(() =>
  props.metric
    ? draftCatalogRow({
        name: props.metric.name,
        moduleId: props.metric.moduleId,
        direction: props.metric.direction,
        grain: props.metric.grain,
        definition: definition.value,
        fields: props.fields,
      })
    : null,
)

const previewDefinition = computed(() =>
  props.metric
    ? previewPayload({
        moduleId: props.metric.moduleId,
        grain: props.metric.grain,
        direction: props.metric.direction,
        definition: definition.value,
      })
    : null,
)

/**
 * Why this metric cannot be previewed, in the panel's own `problem` slot.
 *
 * A stored compile error is shown verbatim — it names the field or rule that
 * failed, and the preview would only return the same sentence after paying for
 * a round trip. `previewPayload` returns null for a definition missing its
 * source table or time field, which is a metric saved before those were
 * required rather than anything the reader can fix from here.
 */
const problem = computed(() => {
  if (!props.metric) return null
  if (props.metric.compileError) return props.metric.compileError
  if (!previewDefinition.value) return 'This metric has no source table or time field to read.'
  return null
})
</script>

<template>
  <BaseDialog v-model="open" :title="metric?.name || 'Preview'" size="4xl">
    <!--
      Keyed by metric id so switching metrics REMOUNTS the panel. Without it the
      panel keeps the previous metric's snapshot, and `autoRun`'s `!snapshot`
      guard would then suppress the run for the new one — leaving the dialog
      showing one metric's figures under another's name.
    -->
    <CustomMetricPreviewPanel
      v-if="metric"
      :key="metric.id"
      :draftRow="draftRow"
      :previewDefinition="previewDefinition"
      :problem="problem"
      caption="Computed live from current records — a difference from the dashboards means records changed since the last refresh."
      autoRun
    />
  </BaseDialog>
</template>
