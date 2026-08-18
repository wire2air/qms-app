<script setup>
/**
 * The Insights tab for ONE module, dropped into that module's own Home page.
 *
 * ── WHY THIS IS NOT A SECOND ANALYTICS PAGE ─────────────────────────────────
 * /analytics answers "how is the business doing" across everything. This answers
 * "how is THIS module doing" while the user is already standing in it, one tab
 * away from the records — so the terminal hop of Insight → Evidence → Record →
 * Action is a click, not a navigation across the app. It follows the shape
 * AuditsHome already established (`?tab=insights`), so there is one convention
 * rather than a per-module invention.
 *
 * ── TWO SYNCING LAYOUTS ON ONE ROUTE, WHICH IS NOW SAFE ─────────────────────
 * Every module Home already runs `useListLayout({ syncUrl: true })` for its LIST
 * filters, and this tab runs a second one for its period. That used to be
 * impossible: the writer replaced the whole query object, so whichever instance
 * moved last erased the other's keys — the list's status filter would vanish the
 * moment the period changed here.
 *
 * The writer now MERGES, preserving every key it does not own (see
 * useListLayout.js). Each instance stays authoritative over its own keys — a
 * filter back at its default is still deleted — so the two coexist and the
 * period is shareable by URL like everything else.
 *
 * The keys here (`period`, `compare`) are deliberately distinct from every
 * wired list's filter keys. Two instances owning the SAME key would still
 * fight, and merging cannot fix that — it is a naming contract, not a
 * mechanism.
 *
 * ── THE CATALOG DECIDES WHAT RENDERS, NOT THIS COMPONENT ────────────────────
 * `useMetricCatalog({ moduleId })` filters server-side and already applies
 * permission, entitlement and has-any-data filtering. So a module with no
 * metrics renders the empty state rather than a broken grid — which is not
 * hypothetical: Complaints has no metrics at all today, and Documents has only
 * task metrics. Never hardcode a metric list here.
 */
import { periodFromDateToken } from '@/utils/analyticsFormat.js'
import { IconChartHistogram, IconLock } from '@tabler/icons-vue'

const props = defineProps({
  /** authz module id, e.g. 'capa' — must match analytics_metrics.module_id. */
  moduleId: { type: String, required: true },
  /** How many KPI tiles before the charted section. */
  kpiLimit: { type: Number, default: 8 },
  /** How many trend widgets to render. */
  chartCount: { type: Number, default: 2 },
})

const { entitled } = useAnalyticsEntitlement()
const isEntitled = computed(() => entitled.value === true)

// Own keys only; the host list's filters are preserved by the merging writer.
const { filters } = useListLayout({
  filters: { period: null, compare: 'previous_period' },
  syncUrl: true,
})

const period = computed({
  get: () => filters.value.period,
  set: (v) => (filters.value.period = v),
})
const compare = computed({
  get: () => filters.value.compare,
  set: (v) => (filters.value.compare = v),
})

const resolvedPeriod = computed(() => periodFromDateToken(period.value))

const {
  metrics,
  loading: catalogLoading,
  error: catalogError,
  retry: retryCatalog,
} = useMetricCatalog({ moduleId: () => props.moduleId }, { enabled: isEntitled })

const kpiMetrics = computed(() => (metrics.value || []).slice(0, props.kpiLimit))
const chartedMetrics = computed(() => (metrics.value || []).slice(0, props.chartCount))

const catalogEmpty = computed(
  () => isEntitled.value && !catalogLoading.value && !catalogError.value && !metrics.value?.length,
)
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-6">
    <BaseEmptyState
      v-if="entitled === false"
      :icon="IconLock"
      title="Not included in your plan"
      description="Reports & Dashboards is not part of your current subscription."
    />

    <template v-else>
      <AnalyticsFilterBar v-model:period="period" v-model:compare="compare" :metrics="metrics ?? []" />

      <div v-if="catalogLoading" class="tw:grid tw:gap-4">
        <ContentGrid min="16rem">
          <BaseSkeleton v-for="n in 4" :key="n" variant="rect" height="104px" />
        </ContentGrid>
      </div>

      <BaseEmptyState
        v-else-if="catalogError"
        title="Could not load metrics"
        description="The metric catalog did not load."
      >
        <BaseButton size="sm" variant="outline" @click="retryCatalog">Try again</BaseButton>
      </BaseEmptyState>

      <!-- A module with no metrics is a real, expected state — not a failure. -->
      <BaseEmptyState
        v-else-if="catalogEmpty"
        title="No metrics for this module yet"
        description="Nothing here is measured yet, or none of it is visible under your access."
      />

      <template v-else>
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
            :compare="compare"
            :enabled="isEntitled"
          />
        </ContentGrid>

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
              :compare="compare"
              :enabled="isEntitled"
            />
          </div>
        </PageSection>
      </template>
    </template>
  </div>
</template>
