<script setup>
/**
 * Add or edit one widget — a QUESTION, never an answer.
 *
 * Composed of the two pieces that already exist rather than reimplementing
 * either: AnalyticsQuestionBuilder supplies the pickers, AnalyticsQuestionTile
 * renders the live preview. The preview is deliberately the SAME component the
 * dashboard uses, so what you approve here is literally what gets rendered
 * later — a bespoke preview renderer is how "it looked fine in the builder"
 * becomes a bug report.
 *
 * The preview also resolves as YOU, right now, which is the honest thing to
 * show: you are configuring a question, and the only answer you can be shown is
 * your own. A reader with narrower scope will see a different number from the
 * same widget, and that is the feature, not a defect.
 */
import { DEFAULT_PERIOD_TOKEN } from '@/utils/analyticsPeriods.js'
import { DEFAULT_VIZ, clampQuestion } from '@/utils/analyticsViz.js'

const props = defineProps({
  dashboardId: { type: String, required: true },
  // metric_catalog rows, fetched by the page so the dialog does not re-query.
  metrics: { type: Array, default: () => [] },
  metricsLoading: { type: Boolean, default: false },
  // An existing widget to edit; null to create.
  widget: { type: Object, default: null },
  // Appended to the end of the board when creating.
  nextPosition: { type: Number, default: 0 },
})

const emit = defineEmits(['saved'])
const open = defineModel('open', { type: Boolean, default: false })

const toast = useToast()
const saving = ref(false)

function blankQuestion() {
  return {
    metricKey: null,
    viz: DEFAULT_VIZ,
    dimension: null,
    periodToken: DEFAULT_PERIOD_TOKEN,
    compare: null,
    title: '',
    filters: {},
  }
}

const question = ref(blankQuestion())

// Re-seed whenever the dialog opens, so reopening after a cancel does not
// resurrect the abandoned draft.
watch(
  () => [open.value, props.widget?.id],
  () => {
    if (!open.value) return
    question.value = props.widget
      ? {
          metricKey: props.widget.metricKey,
          viz: props.widget.viz || DEFAULT_VIZ,
          dimension: props.widget.dimension,
          periodToken: props.widget.periodToken || DEFAULT_PERIOD_TOKEN,
          compare: props.widget.compare,
          title: props.widget.title || '',
          filters: props.widget.filters || {},
        }
      : blankQuestion()
  },
  { immediate: true },
)

const metric = computed(
  () => props.metrics.find((m) => m.metricKey === question.value.metricKey) ?? null,
)

// clampQuestion is the same rule the builder applies, run once more at the
// boundary: a viz/dimension pair can be made invalid by changing the metric, and
// persisting an invalid pair produces a widget that errors on every render
// rather than one that renders wrongly.
const normalised = computed(() => clampQuestion(metric.value, question.value))

const canSave = computed(() => !!normalised.value.metricKey && !saving.value)

const saveWidget = useLiveMutation(async (db, payload) => {
  if (payload.id) {
    const existing = await db.AnalyticsWidget.findByPk(payload.id)
    if (!existing) throw new Error('That widget no longer exists.')
    Object.assign(existing, payload.attrs)
    await existing.save()
    return existing
  }
  const created = db.AnalyticsWidget.create(payload.attrs)
  await created.save()
  return created
})

async function save() {
  if (!canSave.value) return
  saving.value = true
  const q = normalised.value
  try {
    await saveWidget({
      id: props.widget?.id ?? null,
      attrs: {
        dashboardId: props.dashboardId,
        metricKey: q.metricKey,
        // An empty title is stored as NULL, not '', so the tile falls back to
        // the metric's own name instead of rendering a blank heading.
        title: q.title?.trim() ? q.title.trim() : null,
        viz: q.viz,
        dimension: q.dimension || null,
        periodToken: q.periodToken || DEFAULT_PERIOD_TOKEN,
        compare: q.compare || null,
        filters: q.filters ?? {},
        ...(props.widget ? {} : { position: props.nextPosition }),
      },
    })
    toast.success(props.widget ? 'Widget updated' : 'Widget added')
    emit('saved')
    open.value = false
  } catch (err) {
    // useLiveMutation resolves rather than rejects on some failures, so the
    // catch alone is not a guarantee — surface whatever we do get, and never
    // close the dialog on failure, which would silently discard the draft.
    toast.error(err?.message || 'Could not save the widget')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <BaseDialog
    v-model="open"
    :title="widget ? 'Edit widget' : 'Add widget'"
    subtitle="Pick what the tile should answer. The numbers are resolved for each viewer under their own access."
    size="lg"
    persistent
    showClose
  >
    <div class="tw:grid tw:gap-6 tw:lg:grid-cols-2">
      <AnalyticsQuestionBuilder
        v-model="question"
        :metrics="metrics"
        :loading="metricsLoading"
        showTitle
      />

      <div class="tw:flex tw:flex-col tw:gap-2">
        <BaseText variant="caption" color="secondary">
          Preview — resolved as you, right now
        </BaseText>

        <AnalyticsQuestionTile
          v-if="normalised.metricKey"
          :question="normalised"
          :metric="metric"
        />

        <BaseEmptyState
          v-else
          title="Pick a metric"
          description="The preview appears once the tile has a question to ask."
        />
      </div>
    </div>

    <template #footer>
      <BaseDialogFooter>
        <BaseButton variant="outline" @click="open = false">Cancel</BaseButton>
        <BaseButton :disabled="!canSave" :loading="saving" @click="save">
          {{ widget ? 'Save changes' : 'Add widget' }}
        </BaseButton>
      </BaseDialogFooter>
    </template>
  </BaseDialog>
</template>
