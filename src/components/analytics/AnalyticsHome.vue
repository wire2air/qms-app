<script setup>
/**
 * /analytics — the executive command centre.
 *
 * Everything on this page is driven by `metric_catalog()`: the server returns
 * only the metrics this caller may actually get a number out of (permission,
 * commercial entitlement and "is there any rollup data" are all applied
 * server-side), so no metric list is hardcoded here or anywhere else in the UI.
 *
 * The whole page reads through `useServerQuery`, NOT the SyncEngine — see the
 * "Analytics exception" clause in CLAUDE.md. These are server-computed,
 * scope-dependent aggregates, not records.
 *
 * When the tenant's plan does not include Reports & Dashboards, the page says
 * so. An empty dashboard would read as a broken one.
 */
import {
  IconChartBar,
  IconLock,
  IconRefresh,
  IconAlertTriangle,
  IconChartHistogram,
} from '@tabler/icons-vue'
import { useAnalyticsEntitlement, useMetricCatalog } from '@/composables/useAnalytics.js'
import { periodFromDateToken } from '@/utils/analyticsFormat.js'

defineOptions({ name: 'AnalyticsHome' })

// How many KPI tiles the strip shows before the "show all" affordance. Each
// tile is its own scoped rollup read, so the cap is about first paint, not
// about hiding metrics.
const KPI_LIMIT = 12
// Charts default to the first N catalog metrics until the user picks their own.
const DEFAULT_CHART_COUNT = 2

// `entitled` is tri-state: null while the check is in flight (so the page shows
// a skeleton instead of flashing "not in your plan" on every load).
const { entitled, error: entitlementError, retry: retryEntitlement } = useAnalyticsEntitlement()

const isEntitled = computed(() => entitled.value === true)

// Filters live in the URL so a filtered view is shareable — `useListLayout`
// wraps `filtersToQuery` / `queryToFilters` (resource/js/shared/composables/
// listLayoutHelpers.js), which round-trips the object-valued BaseDateFilter
// token as JSON. All defaults are primitives/empty so an untouched view has a
// clean URL, and a null period means "server default" = trailing 12 months.
const { filters, hasActiveFilters, reset } = useListLayout({
  filters: { period: null, compare: 'previous_period', moduleId: null, charts: [] },
  syncUrl: true,
})

const resolvedPeriod = computed(() => periodFromDateToken(filters.value.period))

const {
  metrics,
  loading: catalogLoading,
  error: catalogError,
  retry: retryCatalog,
} = useMetricCatalog({}, { enabled: isEntitled })

const moduleIds = computed(() => [...new Set((metrics.value || []).map((m) => m.moduleId))].sort())

const visibleMetrics = computed(() => {
  const all = metrics.value || []
  if (!filters.value.moduleId) return all
  return all.filter((m) => m.moduleId === filters.value.moduleId)
})

const showAllKpis = ref(false)
const kpiMetrics = computed(() =>
  showAllKpis.value ? visibleMetrics.value : visibleMetrics.value.slice(0, KPI_LIMIT),
)
const hiddenKpiCount = computed(() => Math.max(0, visibleMetrics.value.length - KPI_LIMIT))

// Charted metrics: the user's picks, else the first few of whatever the
// catalog offers for the current module filter.
const chartedMetrics = computed(() => {
  const picked = filters.value.charts || []
  if (!picked.length) return visibleMetrics.value.slice(0, DEFAULT_CHART_COUNT)
  const byKey = new Map(visibleMetrics.value.map((m) => [m.metricKey, m]))
  return picked.map((key) => byKey.get(key)).filter(Boolean)
})

const catalogEmpty = computed(
  () => isEntitled.value && !catalogLoading.value && !catalogError.value && !metrics.value?.length,
)
</script>

<template>
  <BasePage width="wide">
    <PageHeader :icon="IconChartBar" title="Analytics" />

    <!-- Entitlement unknown: don't flash "not in your plan" on every load. -->
    <ContentGrid v-if="entitled === null && !entitlementError" min="16rem">
      <BaseSkeleton v-for="n in 4" :key="n" variant="rect" height="104px" />
    </ContentGrid>

    <PageSection v-else-if="entitlementError" variant="card">
      <div class="tw:flex tw:flex-col tw:items-center tw:gap-2 tw:py-8">
        <IconAlertTriangle :size="28" class="tw:text-bad" aria-hidden="true" />
        <BaseText variant="caption" color="secondary">
          Couldn't check whether analytics is available on your plan.
        </BaseText>
        <BaseButton size="sm" variant="outline" @click="retryEntitlement">
          <IconRefresh :size="14" aria-hidden="true" />
          Retry
        </BaseButton>
      </div>
    </PageSection>

    <!-- Commercially gated: say so plainly. -->
    <PageSection v-else-if="entitled === false" variant="card">
      <BaseEmptyState
        :icon="IconLock"
        title="Reports & Dashboards isn't included in your plan"
        description="Cross-module KPIs, trends and drill-down reporting are part of the Reports & Dashboards module. Talk to your administrator to add it."
      />
    </PageSection>

    <template v-else>
      <AnalyticsFilterBar
        v-model:period="filters.period"
        v-model:compare="filters.compare"
        v-model:moduleId="filters.moduleId"
        v-model:charts="filters.charts"
        :moduleIds="moduleIds"
        :metrics="visibleMetrics"
        :showClear="hasActiveFilters"
        @clear="reset"
      />

      <!--
        Insights sit ABOVE the tiles on purpose. A tile answers a question the
        reader already thought to ask; an insight is the thing nobody was looking
        at. Below the fold it would only ever be found by someone who already
        knew to scroll for it, which is the opposite of what it is for.

        It deliberately ignores the filter bar: an insight was computed against
        a period the generator chose and states that period on its own face, so
        re-filtering it client-side would make the sentence disagree with its own
        citation. `moduleId` is the one exception, and that is passed explicitly
        where a module tab uses this component.
      -->
      <AnalyticsInsightsPanel :limit="6" />

      <!-- Catalog failure: one message, one retry — not 20 broken tiles. -->
      <PageSection v-if="catalogError" variant="card">
        <div class="tw:flex tw:flex-col tw:items-center tw:gap-2 tw:py-8">
          <IconAlertTriangle :size="28" class="tw:text-bad" aria-hidden="true" />
          <BaseText variant="caption" color="secondary">Couldn't load the metric catalog.</BaseText>
          <BaseButton size="sm" variant="outline" @click="retryCatalog">
            <IconRefresh :size="14" aria-hidden="true" />
            Retry
          </BaseButton>
        </div>
      </PageSection>

      <ContentGrid v-else-if="catalogLoading" min="16rem">
        <BaseSkeleton v-for="n in 8" :key="n" variant="rect" height="128px" />
      </ContentGrid>

      <PageSection v-else-if="catalogEmpty" variant="card">
        <BaseEmptyState
          :icon="IconChartHistogram"
          title="No metrics available yet"
          description="Metrics appear here once the analytics rollup has run for your organization and you hold read access on the modules they measure."
        />
      </PageSection>

      <template v-else>
        <!-- KPI strip -->
        <PageSection title="Key metrics" :icon="IconChartBar">
          <template #actions>
            <BaseButton
              v-if="hiddenKpiCount > 0"
              size="sm"
              variant="outline"
              @click="showAllKpis = !showAllKpis"
            >
              {{ showAllKpis ? 'Show fewer' : `Show all ${visibleMetrics.length} metrics` }}
            </BaseButton>
          </template>

          <ContentGrid min="16rem">
            <AnalyticsKpiCard
              v-for="m in kpiMetrics"
              :key="m.metricKey"
              :metricKey="m.metricKey"
              :name="m.name"
              :moduleId="m.moduleId"
              :unit="m.unit"
              :direction="m.direction"
              :drill="m.drill"
              :periodStart="resolvedPeriod.periodStart"
              :periodEnd="resolvedPeriod.periodEnd"
              :compare="filters.compare"
              :enabled="isEntitled"
            />
          </ContentGrid>
        </PageSection>

        <!-- Trend + breakdown widgets -->
        <PageSection
          v-if="chartedMetrics.length"
          title="Trends"
          subtitle="Every tile states the scope, freshness and tier its number was computed under, and drills to the records behind it."
          :icon="IconChartHistogram"
        >
          <div class="tw:grid tw:grid-cols-1 tw:gap-4 tw:xl:grid-cols-2">
            <AnalyticsMetricWidget
              v-for="m in chartedMetrics"
              :key="m.metricKey"
              :metric="m"
              :periodStart="resolvedPeriod.periodStart"
              :periodEnd="resolvedPeriod.periodEnd"
              :compare="filters.compare"
              :enabled="isEntitled"
            />
          </div>
        </PageSection>
      </template>
    </template>
  </BasePage>
</template>
