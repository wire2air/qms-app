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
 *
 * ── PREVIEW MODE (`previewDefinition`) ──────────────────────────────────────
 * On the metric builder the metric does not exist yet, so there is no key to
 * ask for. Given a `previewDefinition` (utils/analyticsMetricPreview.js), the
 * same useMetricValue call goes to the preview endpoint instead — still this
 * component's OWN request, so "nothing is passed down as fetched data" holds.
 * What changes is what the footer can truthfully claim: there is no tier and
 * no stored freshness, so it says "Preview — computed live from current
 * records, not saved" with the shadow run's time; the compiler's refusal,
 * a timeout or a missing grant is shown as the sentence itself; and there is
 * nothing to drill into, because the records' metric was rolled back.
 */
import { IconAlertTriangle, IconRefresh } from '@tabler/icons-vue'
import { DateTime } from 'luxon'
// Explicit import: a dynamic `<component :is>` cannot resolve an auto-imported
// component from a string name.
import BaseClickableRow from '@shared/components/BaseClickableRow.vue'
import { moduleIcon } from '@/utils/moduleIcons.js'
import { useMetricValue, isPreviewTerminalError } from '@/composables/useAnalytics.js'
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
  // Catalog `calculationNote` — how this number is worked out, in plain
  // English. Passed down rather than fetched: it is a property of the METRIC,
  // not of the value row, so it is already in the catalog row the caller holds.
  calculationNote: { type: String, default: null },
  // Resolved window (ISO dates) — null lets the server pick its default month.
  periodStart: { type: String, default: null },
  periodEnd: { type: String, default: null },
  compare: { type: String, default: 'previous_period' },
  iconColor: { type: String, default: 'primary' },
  // Gate so a tile does not fire before entitlement is known.
  enabled: { type: Boolean, default: true },
  // An UNSAVED metric to preview (previewPayload() from
  // utils/analyticsMetricPreview.js). When set, the value is computed live
  // through the preview endpoint and `metricKey` is only a placeholder.
  previewDefinition: { type: Object, default: null },
})

const isPreview = computed(() => !!props.previewDefinition)

const {
  metric,
  loading,
  error,
  retry: retryMetric,
  previewMeta,
} = useMetricValue(
  {
    metricKey: () => props.metricKey,
    periodStart: () => props.periodStart,
    periodEnd: () => props.periodEnd,
    compare: () => props.compare,
    preview: () => props.previewDefinition,
  },
  { enabled: () => props.enabled },
)

const icon = computed(() => moduleIcon(props.moduleId))

/**
 * The row the card displays. A failed PREVIEW keeps the handle's last good
 * data, which was computed for an earlier draft — showing it beside the new
 * draft's error would read as that draft's figure. Dashboards keep the old
 * behaviour: their question did not change, only the request failed.
 */
const shown = computed(() => (isPreview.value && error.value ? null : metric.value))

const displayValue = computed(() => formatMetricValue(shown.value?.value, props.unit))

// The catalog's direction is authoritative; the value row repeats it, so fall
// back to whichever is present rather than assuming.
const effectiveDirection = computed(() => props.direction ?? shown.value?.direction ?? null)

const trend = computed(() => {
  const row = shown.value
  if (!row) return null
  const raw = row.unit === 'percent' ? row.deltaAbs : row.deltaPct
  const arrow = deltaDirection(raw)
  if (!arrow) return null
  const text = formatDelta(row, props.compare)
  if (!text) return null
  return { direction: arrow, value: text, tone: deltaTone(raw, effectiveDirection.value) }
})

// Only an explicit true/false earns a marker — null means "no valid test".
const marker = computed(() => significanceMarker(shown.value?.isSignificant))

const drillTo = computed(() => {
  // A previewed metric is rolled back with its request — there is no list
  // behind it to open.
  if (isPreview.value || !props.drill?.route) return null
  return drillLocation({ drillRoute: props.drill.route, drillFilters: props.drill.filters })
})

// In preview the error IS the message: the compiler's own sentence, or the
// timeout / permission wording useAnalytics maps them to.
const errorText = computed(() => (isPreview.value ? error.value?.message : null) || "Couldn't load")
// Preview only — see AnalyticsQuestionTile's canRetryBody for why a dashboard's
// FORBIDDEN must keep its Retry.
const canRetry = computed(() => !(isPreview.value && isPreviewTerminalError(error.value)))

const previewComputedAt = computed(() => {
  const raw = previewMeta.value?.computedAt
  if (!raw) return null
  const dt = DateTime.fromISO(String(raw))
  return dt.isValid ? dt.formatDate('datetime') : null
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
    data-testid="analytics-kpi-card"
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
              {{ errorText }}
            </BaseText>
            <BaseButton v-if="canRetry" size="sm" variant="text" @click.stop.prevent="retryMetric">
              <IconRefresh :size="13" aria-hidden="true" />
              Retry
            </BaseButton>
          </div>

          <BaseText v-else-if="noData" variant="caption" color="secondary">
            {{ isPreview ? 'Nothing matches right now' : 'No data for this period' }}
          </BaseText>

          <BaseTooltip v-if="marker" :content="marker.help">
            <BaseText variant="caption" color="secondary">{{ marker.label }}</BaseText>
          </BaseTooltip>

          <!-- The note comes from the catalog, so it can still be explained
               when the VALUE call failed and there is no provenance to state. -->
          <template v-if="isPreview">
            <BaseText
              v-if="previewMeta?.driftWarning"
              variant="caption"
              color="inherit"
              class="tw:inline-flex tw:items-start tw:gap-1 tw:text-warn"
            >
              <IconAlertTriangle :size="13" class="tw:mt-0.5 tw:shrink-0" aria-hidden="true" />
              {{ previewMeta.driftWarning }}
            </BaseText>
            <BaseText variant="caption" color="secondary">
              Preview — computed live from current records, not saved<template
                v-if="previewComputedAt"
              >
                · {{ previewComputedAt }}</template
              >
            </BaseText>
          </template>

          <AnalyticsMetaLine
            v-else-if="metric || calculationNote"
            :scope="metric?.effectiveScope"
            :tier="metric?.tier"
            :computedAt="metric?.computedAt"
            :calculationNote="calculationNote"
          />
        </div>
      </template>
    </BaseStatCard>
  </component>
</template>
