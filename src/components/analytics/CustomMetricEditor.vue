<script setup>
/**
 * Create or edit one custom metric — /analytics/metrics/new and
 * /analytics/metrics/:id.
 *
 * ── WHY THIS IS A PAGE AND NO LONGER A DIALOG ───────────────────────────────
 * The builder outgrew a modal. It is a long multi-section form (module, what to
 * count, filters, breakdowns, presentation) that opens on a chooser of ~170
 * template cards, and a dialog gave both the least room of any surface in the
 * app. A page gives it the full content width, a URL that can be linked to and
 * reloaded, and a browser Back button that does what people expect instead of
 * leaving the modal floating over a page they thought they had left.
 *
 * The old dialog was `persistent` so a stray click on the backdrop could not
 * throw away a half-built definition. A page has no backdrop, but it has more
 * ways out — Back, the sidebar, a breadcrumb — so that protection is now the
 * route-leave guard (useUnsavedChangesGuard), fed by the builder's `dirty`.
 *
 * ── WHY THE BUILDER MOUNTS ONLY ONCE EVERYTHING HAS LOADED ──────────────────
 * CustomMetricBuilder seeds its form from `metric` once, on mount. Mounting it
 * while the row (edit) or the field vocabulary / templates were still
 * `undefined` would seed an empty form that no later prop change repairs — so
 * every query here deliberately has no `initial`, and `undefined` means
 * "still loading" rather than "nothing".
 */
import {
  canCreateCustomMetrics,
  canUpdateCustomMetrics,
} from '@/utils/analyticsCustomMetricAccess.js'
import { isAllowed } from '@/utils/currentSession'
import { IconMathFunction, IconLock } from '@tabler/icons-vue'

const route = useRoute()
const router = useRouter()
const { entitled } = useAnalyticsEntitlement()
const { setRecordTitle } = useRouteMeta()

/** null ⇒ create mode (/analytics/metrics/new has no :id param). */
const metricId = computed(() => (route.params.id ? String(route.params.id) : null))
const isCreate = computed(() => !metricId.value)

// No `initial`: UNDEFINED until the first result lands, so "still loading" and
// "not found, or not readable by you" stay distinguishable. The `?? null` is
// load-bearing — findByPk answers a missing row with `undefined`, the same value
// as loading, and without it an unknown id would spin forever (the defect
// AlertDetail, DashboardDetail and ReportDetail each had in turn). In create
// mode this resolves to null, which is why the template checks `isCreate`
// before reading `metric === null` as "not found".
const metric = useLiveQueryWithDeps(
  [() => metricId.value],
  async (db, [id]) => (id ? ((await db.AnalyticsCustomMetric.findByPk(id)) ?? null) : null),
  { models: 'AnalyticsCustomMetric' },
)

watch(
  () => metric.value?.name,
  (name) => {
    if (metricId.value && name) setRecordTitle(name)
  },
  { immediate: true },
)

// The whole vocabulary, fetched ONCE here and handed to the builder. The builder
// slices it by module and source table; re-querying it inside the builder per
// section would re-read the same static reference data over and over.
//
// The tenant filtering — and why a second layer is not redundant over the
// server's own — lives in the composable. It moved there when the metrics LIST
// grew a preview and needed the same rows: that filter is a security filter,
// and two copies of one would drift.
//
// No `initial: []` — see the header: undefined is the loading signal the
// builder's mount waits on, which the composable preserves.
const {
  fields,
  templates: ownModuleTemplates,
  loading: fieldsLoading,
} = useAnalyticsModuleFields()

// The cap belongs to the ROLLUP (analytics_dimension_capacity), not to this
// page, so it is read from the catalog rather than written here — the same
// reasoning AnalyticsQuestionBuilder uses. Falls back to 3, which is the value
// the rollup ships with, so the builder still works if the catalog is empty.
const { metrics: catalog } = useMetricCatalog()
const dimensionCap = computed(() => catalog.value?.[0]?.dimensionCapacity ?? 3)

// Same verbs and the same `isAllowed` reasoning as CustomMetricsHome: it
// short-circuits true for a company owner, who holds no role_module_permissions
// rows at all. Mirrors analytics_custom_metrics_{insert,update}_rls. The route
// guard only checks `analytics_metrics:read` for this whole subtree, so this is
// what stops a read-only role from being handed a form the RLS would refuse.
const viewer = computed(() => ({
  canCreate: isAllowed(['analytics_metrics:create']),
  canUpdate: isAllowed(['analytics_metrics:update']),
}))
const allowed = computed(() =>
  isCreate.value ? canCreateCustomMetrics(viewer.value) : canUpdateCustomMetrics(viewer.value),
)

const loading = computed(
  () => fieldsLoading.value || (!isCreate.value && metric.value === undefined),
)

const notFound = computed(() => !isCreate.value && metric.value === null)

const title = computed(() =>
  isCreate.value ? 'New metric' : metric.value?.name || 'Edit metric',
)

// Written by the builder. A new metric opens on the template chooser, which is
// a card grid that wants the standard page. The form is WIDE: it sits beside a
// live preview (qms/docs/plans/custom-metric-live-preview.md), and each column
// needs the room a narrow page gave the form alone.
const choosing = ref(!metricId.value)
const dirty = ref(false)

const { allowLeave } = useUnsavedChangesGuard(dirty)

function backToList() {
  router.push('/analytics/metrics')
}

// The builder has already toasted. The post-save navigation must not prompt —
// by the time `saved` fires the form is no longer unsaved, whatever `dirty`
// still says.
function onSaved() {
  allowLeave()
  backToList()
}

// No confirm here: the route-leave guard prompts when the form is dirty, so
// Cancel, Back and the sidebar all get the same question from one place.
function onCancel() {
  backToList()
}
</script>

<template>
  <BasePage :width="choosing ? 'standard' : 'wide'" fullHeight>
    <PageHeader :icon="IconMathFunction" :title="title" />

    <PageSection v-if="entitled === false" variant="card">
      <BaseEmptyState
        :icon="IconLock"
        title="Not included in your plan"
        description="Reports & Dashboards is not part of your current subscription."
      />
    </PageSection>

    <BaseEmptyState
      v-else-if="!allowed"
      :icon="IconLock"
      :title="isCreate ? 'You can\'t create metrics' : 'You can\'t edit metrics'"
      description="Your role can view metrics but not change them. Ask an administrator if you need to."
    >
      <template #action>
        <BaseButton size="sm" variant="outline" @click="backToList">Back to metrics</BaseButton>
      </template>
    </BaseEmptyState>

    <BaseEmptyState
      v-else-if="notFound"
      title="Metric not found"
      description="It may have been deleted, or you may not have access to it."
    >
      <template #action>
        <BaseButton size="sm" variant="outline" @click="backToList">Back to metrics</BaseButton>
      </template>
    </BaseEmptyState>

    <div v-else-if="loading" class="tw:flex tw:flex-1 tw:items-center tw:justify-center">
      <BaseSpinner size="md" />
    </div>

    <CustomMetricBuilder
      v-else
      v-model:dirty="dirty"
      v-model:choosing="choosing"
      :metric="metric ?? null"
      :fields="fields"
      :templates="ownModuleTemplates ?? []"
      :dimensionCap="dimensionCap"
      @saved="onSaved"
      @cancel="onCancel"
    />
  </BasePage>
</template>
