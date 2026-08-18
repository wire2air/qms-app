<script setup>
/**
 * Ad-hoc analysis: the widget builder with the save step removed.
 *
 * Deliberately assembled from the SAME two components the dashboard uses —
 * AnalyticsQuestionBuilder for the pickers, AnalyticsQuestionTile for the
 * answer. The Explorer is not a second, looser way to query the metric layer;
 * it is the same question, unsaved. Building it from its own components is how
 * an explorer and a dashboard start disagreeing about what a metric means.
 *
 * "Save as widget" is therefore a one-line hand-off: the question is already in
 * the exact shape a widget row stores.
 */
import { DEFAULT_PERIOD_TOKEN } from '@/utils/analyticsPeriods.js'
import { DEFAULT_VIZ, clampQuestion } from '@/utils/analyticsViz.js'
import { canEditDashboard } from '@/utils/analyticsDashboardAccess.js'
import { currentSession } from '@/utils/currentSession'
import { IconCompass, IconLock, IconDeviceFloppy } from '@tabler/icons-vue'

const toast = useToast()
const { entitled } = useAnalyticsEntitlement()
const { metrics, loading: metricsLoading } = useMetricCatalog()

const question = ref({
  metricKey: null,
  viz: DEFAULT_VIZ,
  dimension: null,
  periodToken: DEFAULT_PERIOD_TOKEN,
  compare: null,
  title: '',
  filters: {},
})

const metric = computed(
  () => (metrics.value ?? []).find((m) => m.metricKey === question.value.metricKey) ?? null,
)
const normalised = computed(() => clampQuestion(metric.value, question.value))

// Only boards this user may actually write to — offering the rest produces a
// save button that 403s.
const viewer = computed(() => ({
  userId: currentSession.value?.id ?? null,
  canManage: !!currentSession.value?.permissions?.includes?.('reports_dashboards:manage'),
}))

const dashboards = useLiveQuery(async (db) => await db.AnalyticsDashboard.where().exec(), {
  models: 'AnalyticsDashboard',
  initial: [],
})
const writable = computed(() =>
  (dashboards.value ?? [])
    .filter((d) => canEditDashboard(d, viewer.value))
    .map((d) => ({ value: d.id, label: d.name })),
)

const targetDashboard = ref(null)
const saving = ref(false)

const saveAsWidget = useLiveMutation(async (db, { dashboardId, attrs }) => {
  const existing = await db.AnalyticsWidget.where('dashboardId', dashboardId).exec()
  const w = db.AnalyticsWidget.create({ ...attrs, dashboardId, position: existing.length })
  await w.save()
  return w
})

async function save() {
  if (!normalised.value.metricKey || !targetDashboard.value || saving.value) return
  saving.value = true
  const q = normalised.value
  try {
    await saveAsWidget({
      dashboardId: targetDashboard.value,
      attrs: {
        metricKey: q.metricKey,
        title: q.title?.trim() ? q.title.trim() : null,
        viz: q.viz,
        dimension: q.dimension || null,
        periodToken: q.periodToken || DEFAULT_PERIOD_TOKEN,
        compare: q.compare || null,
        filters: q.filters ?? {},
      },
    })
    toast.success('Saved to dashboard')
  } catch (err) {
    toast.error(err?.message || 'Could not save the widget')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <BasePage width="wide">
    <PageHeader
      :icon="IconCompass"
      title="Data Explorer"
      subtitle="Ask a question without saving it. Numbers resolve under your own access."
    />

    <PageSection v-if="entitled === false" variant="card">
      <BaseEmptyState
        :icon="IconLock"
        title="Not included in your plan"
        description="Reports & Dashboards is not part of your current subscription."
      />
    </PageSection>

    <div v-else class="tw:grid tw:gap-6 tw:lg:grid-cols-[minmax(0,20rem)_1fr]">
      <PageSection variant="card">
        <AnalyticsQuestionBuilder
          v-model="question"
          :metrics="metrics ?? []"
          :loading="metricsLoading"
          :showTitle="false"
        />

        <div class="tw:mt-4 tw:border-t tw:border-divider tw:pt-4">
          <BaseSelect
            v-model="targetDashboard"
            label="Save to dashboard"
            :options="writable"
            placeholder="Choose a dashboard…"
            :disabled="writable.length === 0"
          />
          <BaseText v-if="writable.length === 0" variant="caption" color="secondary" class="tw:mt-1">
            You have no dashboard you can edit yet. Create one first.
          </BaseText>
          <BaseButton
            class="tw:mt-2 tw:w-full"
            :disabled="!normalised.metricKey || !targetDashboard || saving"
            :isLoading="saving"
            @click="save"
          >
            <IconDeviceFloppy :size="14" aria-hidden="true" />
            Save as widget
          </BaseButton>
        </div>
      </PageSection>

      <div>
        <AnalyticsQuestionTile
          v-if="normalised.metricKey"
          :question="normalised"
          :metric="metric"
        />
        <BaseEmptyState
          v-else
          title="Pick a metric to begin"
          description="Choose what to measure, then how to slice it."
        />
      </div>
    </div>
  </BasePage>
</template>
