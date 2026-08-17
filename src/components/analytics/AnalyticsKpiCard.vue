<script setup>
/**
 * One KPI tile in the executive strip. Receives a metric KEY (plus the catalog
 * row's presentation attributes) and fetches its own number — components take
 * ids and query for themselves; nothing is passed down as fetched data.
 *
 * The three semantics that must not be papered over:
 *  - `direction` decides whether a positive delta is good. Up ≠ good: over half
 *    the catalog is `lower_is_better`, and volume metrics are `neutral`.
 *  - `isSignificant === null` means the statistical test does not apply to this
 *    metric — so NO marker renders, not a "not significant" one.
 *  - scope + freshness + tier are on every tile, because the same key computed
 *    under a different scope is a different number.
 */
import { IconAlertTriangle, IconRefresh } from '@tabler/icons-vue'
// Explicit import: a dynamic `<component :is>` cannot resolve an auto-imported
// component from a string name.
import BaseClickableRow from '@shared/components/BaseClickableRow.vue'
import { moduleIcon } from '@/utils/moduleIcons.js'
import { useMetricValue } from '@/composables/useAnalytics.js'
import {
  formatMetricValue,
  formatDelta,
  deltaTone,
  deltaDirection,
  significanceMarker,
  drillLocation,
} from '@/utils/analyticsFormat.js'

const props = defineProps({
  // Catalog row fields (metric_catalog): identity + how to present it.
  metricKey: { type: String, required: true },
  name: { type: String, default: '' },
  moduleId: { type: String, default: null },
  unit: { type: String, default: 'count' },
  direction: { type: String, default: null },
  // `drill` jsonb from the catalog: { route, filters }.
  drill: { type: Object, default: null },
  // Resolved window (ISO dates) — null lets the server pick its default month.
  periodStart: { type: String, default: null },
  periodEnd: { type: String, default: null },
  compare: { type: String, default: 'previous_period' },
  iconColor: { type: String, default: 'primary' },
  // Gate so a tile does not fire before entitlement is known.
  enabled: { type: Boolean, default: true },
})

const {
  metric,
  loading,
  error,
  retry: retryMetric,
} = useMetricValue(
  {
    metricKey: () => props.metricKey,
    periodStart: () => props.periodStart,
    periodEnd: () => props.periodEnd,
    compare: () => props.compare,
  },
  { enabled: () => props.enabled },
)

const icon = computed(() => moduleIcon(props.moduleId))

const displayValue = computed(() => formatMetricValue(metric.value?.value, props.unit))

// The catalog's direction is authoritative; the value row repeats it, so fall
// back to whichever is present rather than assuming.
const effectiveDirection = computed(() => props.direction ?? metric.value?.direction ?? null)

const trend = computed(() => {
  const row = metric.value
  if (!row) return null
  const raw = row.unit === 'percent' ? row.deltaAbs : row.deltaPct
  const arrow = deltaDirection(raw)
  if (!arrow) return null
  const text = formatDelta(row, props.compare)
  if (!text) return null
  return { direction: arrow, value: text, tone: deltaTone(raw, effectiveDirection.value) }
})

// Only an explicit true/false earns a marker — null means "no valid test".
const marker = computed(() => significanceMarker(metric.value?.isSignificant))

const drillTo = computed(() => {
  if (!props.drill?.route) return null
  return drillLocation({ drillRoute: props.drill.route, drillFilters: props.drill.filters })
})

const noData = computed(
  () => !loading.value && !error.value && (!metric.value || metric.value.value === null),
)

// Drill by router.push rather than by giving BaseClickableRow a `to`: the tile
// contains its own interactive controls (the retry button, the tooltip
// triggers), and interactive content nested inside an <a> is invalid HTML —
// BaseClickableRow's role="button" branch is the documented pattern for exactly
// this case. Nested controls stop propagation.
const router = useRouter()
function openDrill() {
  if (drillTo.value) router.push(drillTo.value)
}
</script>

<template>
  <component
    :is="drillTo ? BaseClickableRow : 'div'"
    :aria-label="drillTo ? `${name} — open the records behind this number` : undefined"
    class="tw:block"
    @click="openDrill"
  >
    <BaseStatCard
      :label="name"
      :value="displayValue"
      :icon="icon"
      :iconColor="iconColor"
      :trend="trend"
      :loading="loading"
    >
      <template #footer>
        <div class="tw:flex tw:flex-col tw:gap-1.5">
          <div v-if="error" class="tw:flex tw:items-center tw:gap-2">
            <BaseText
              variant="caption"
              color="error"
              class="tw:inline-flex tw:items-center tw:gap-1"
            >
              <IconAlertTriangle :size="13" aria-hidden="true" />
              Couldn't load
            </BaseText>
            <BaseButton size="sm" variant="text" @click.stop.prevent="retryMetric">
              <IconRefresh :size="13" aria-hidden="true" />
              Retry
            </BaseButton>
          </div>

          <BaseText v-else-if="noData" variant="caption" color="secondary">
            No data for this period
          </BaseText>

          <BaseTooltip v-if="marker" :content="marker.help">
            <BaseText variant="caption" color="secondary">{{ marker.label }}</BaseText>
          </BaseTooltip>

          <AnalyticsMetaLine
            v-if="metric"
            :scope="metric.effectiveScope"
            :tier="metric.tier"
            :computedAt="metric.computedAt"
          />
        </div>
      </template>
    </BaseStatCard>
  </component>
</template>
