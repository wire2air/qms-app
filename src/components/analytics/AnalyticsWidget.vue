<script setup>
/**
 * AnalyticsWidget — the reusable tile shell for every analytics visualisation:
 * title, the chart (passed in through the default slot), a filter affordance,
 * export, and drill-through, plus the provenance line every number must carry.
 *
 * It is deliberately DATA-AGNOSTIC and owns no request. The consumer fetches
 * (via `useServerQuery`/`useAnalytics`) and passes the chart in, so the chart
 * component stays free to evolve — nothing here reaches into BaseChart.
 *
 *   <AnalyticsWidget title="Open CAPAs by site" :loading :error :empty
 *                    :scope="row.effectiveScope" :tier="row.tier"
 *                    :computedAt="row.computedAt" :suppressedCount="n"
 *                    :drillTo="drillTo" @retry="refresh">
 *     <template #filters><BaseSelect … /></template>
 *     <BaseChart type="bar" :series="series" :options="options" />
 *   </AnalyticsWidget>
 *
 * Semantics it enforces so consumers cannot get them wrong:
 *  - SUPPRESSED cells are announced ("2 withheld to protect small groups")
 *    rather than silently drawn as zero or as a gap. Zero is itself
 *    information, so a withheld cell may never look like one.
 *  - `isSignificant === null` renders NO significance marker at all — that
 *    value means "no valid statistical test applies", not "not significant".
 *  - scope / freshness / tier always render when supplied.
 *
 * **Do not double-print the metadata.** `BaseChart` can render its own
 * scope / freshness / withheld-count footnote from equivalent props. THE TILE
 * OWNS THAT PRESENTATION, because a KPI tile has no chart in it at all and one
 * component has to own it for every tile type. So a consumer that puts a
 * BaseChart in this slot must NOT pass `scope` / `computedAt` /
 * `suppressedCount` to the chart (or must blank its strip with the chart's
 * `#footnote` slot). BaseChart still owns the CHART-AREA content states
 * (loading / error / empty / all-values-withheld), which are sized to the plot;
 * pass this component's `loading` / `error` / `empty` only for non-chart bodies.
 */
import {
  IconAlertTriangle,
  IconArrowRight,
  IconDownload,
  IconEyeOff,
  IconFilter,
  IconRefresh,
} from '@tabler/icons-vue'
import { isAllowed } from '@/utils/currentSession'
import { exportTableData } from '@/utils/exportUtils'
import { significanceMarker, SUPPRESSED_HELP } from '@/utils/analyticsFormat.js'

const props = defineProps({
  title: { type: String, default: '' },
  subtitle: { type: String, default: '' },
  // A @tabler/icons-vue component, imported by the consumer.
  icon: { type: [Object, Function], default: null },

  // ── provenance (analytics plan §11: every tile states these) ──
  scope: { type: String, default: null },
  tier: { type: String, default: null },
  computedAt: { type: String, default: null },
  periodStart: { type: String, default: null },
  periodEnd: { type: String, default: null },
  showPeriod: { type: Boolean, default: true },

  // ── content state ──
  loading: { type: Boolean, default: false },
  error: { type: [Object, String], default: null },
  empty: { type: Boolean, default: false },
  emptyTitle: { type: String, default: 'No data for this period' },
  emptyDescription: { type: String, default: null },

  // ── privacy / statistics ──
  // How many cells the server withheld for small-cell protection.
  suppressedCount: { type: Number, default: 0 },
  // Optional detail (e.g. which buckets) appended to the suppression tooltip.
  suppressedDetail: { type: String, default: null },
  // Tri-state. null = no valid test applies → no marker is drawn.
  isSignificant: { type: Boolean, default: null },

  // ── export ──
  // Rows + column defs in the shape src/utils/exportUtils.js expects.
  exportRows: { type: Array, default: () => [] },
  exportColumns: { type: Array, default: () => [] },
  exportName: { type: String, default: 'analytics-export' },

  // ── drill ──
  // Router location for "see the records behind this number".
  drillTo: { type: Object, default: null },
  drillLabel: { type: String, default: 'View records' },

  height: { type: [Number, String], default: 280 },
})

const emit = defineEmits(['retry'])

// Downloading a metric is a separate grant from reading one (the module carries
// read / export / manage), so the affordance follows the permission.
const canExport = computed(
  () => isAllowed(['reports_dashboards:export']) && props.exportRows.length > 0,
)

const marker = computed(() => significanceMarker(props.isSignificant))

const suppressionHelp = computed(() =>
  props.suppressedDetail ? `${SUPPRESSED_HELP} ${props.suppressedDetail}` : SUPPRESSED_HELP,
)

const errorMessage = computed(() => {
  if (!props.error) return null
  return typeof props.error === 'string'
    ? props.error
    : props.error.message || 'Something went wrong.'
})

const exportItems = computed(() => [
  { name: 'Download CSV', click: () => runExport('csv') },
  { name: 'Download Excel', click: () => runExport('excel') },
])

const toast = useToast()

async function runExport(format) {
  try {
    await exportTableData(format, props.exportRows, props.exportColumns, props.exportName, {
      title: props.title,
      sheetName: 'Metric',
    })
  } catch {
    toast.notify({ message: 'Export failed. Please try again.', type: 'error' })
  }
}
</script>

<template>
  <BaseCard class="tw:flex tw:flex-col tw:gap-3">
    <!-- Header: identity + affordances -->
    <div class="tw:flex tw:flex-wrap tw:items-start tw:justify-between tw:gap-2">
      <div class="tw:flex tw:min-w-0 tw:items-start tw:gap-2">
        <component
          :is="icon"
          v-if="icon"
          :size="18"
          class="tw:mt-0.5 tw:shrink-0 tw:text-primary"
          aria-hidden="true"
        />
        <div class="tw:min-w-0">
          <BaseHeading :level="3" class="tw:truncate">{{ title }}</BaseHeading>
          <BaseText v-if="subtitle" variant="caption" color="secondary">{{ subtitle }}</BaseText>
        </div>
      </div>

      <div class="tw:flex tw:shrink-0 tw:items-center tw:gap-1">
        <!-- Filter affordance: the consumer supplies the controls; the tile
             owns the trigger so every widget filters the same way. -->
        <BasePopover v-if="$slots.filters" placement="bottom-end" :arrow="false" :offset="8">
          <template #button>
            <BaseButton size="sm" variant="outline" :aria-label="`Filter ${title}`">
              <IconFilter :size="14" aria-hidden="true" />
              Filter
            </BaseButton>
          </template>
          <template #content>
            <div class="tw:flex tw:min-w-56 tw:flex-col tw:gap-3 tw:p-3">
              <slot name="filters" />
            </div>
          </template>
        </BasePopover>

        <BaseMenu v-if="canExport" :items="exportItems">
          <template #trigger>
            <BaseButton size="sm" variant="outline" :aria-label="`Export ${title}`">
              <IconDownload :size="14" aria-hidden="true" />
              Export
            </BaseButton>
          </template>
        </BaseMenu>

        <!-- BaseButton renders a RouterLink automatically when `to` is set. -->
        <BaseButton v-if="drillTo" :to="drillTo" size="sm" variant="text">
          {{ drillLabel }}
          <IconArrowRight :size="14" aria-hidden="true" />
        </BaseButton>

        <slot name="actions" />
      </div>
    </div>

    <!-- Body: loading > error > empty > content (same precedence the list
         framework uses, so a widget behaves like every other surface). -->
    <div>
      <BaseSkeleton v-if="loading" variant="rect" :height="`${height}px`" />

      <div v-else-if="errorMessage" class="tw:flex tw:flex-col tw:items-center tw:gap-2 tw:py-8">
        <IconAlertTriangle :size="28" class="tw:text-bad" aria-hidden="true" />
        <BaseText variant="caption" color="secondary">{{ errorMessage }}</BaseText>
        <BaseButton size="sm" variant="outline" @click="emit('retry')">
          <IconRefresh :size="14" aria-hidden="true" />
          Retry
        </BaseButton>
      </div>

      <BaseEmptyState
        v-else-if="empty"
        :icon="icon"
        :title="emptyTitle"
        :description="emptyDescription"
        dense
      />

      <slot v-else />
    </div>

    <slot name="body" />

    <!-- Footer: privacy + statistics + provenance -->
    <div class="tw:flex tw:flex-col tw:gap-1.5">
      <BaseTooltip v-if="suppressedCount > 0" :content="suppressionHelp">
        <span class="tw:inline-flex tw:items-center tw:gap-1 tw:text-xs tw:text-secondary">
          <IconEyeOff :size="13" aria-hidden="true" />
          {{ suppressedCount }} withheld to protect small groups — not zero
        </span>
      </BaseTooltip>

      <BaseTooltip v-if="marker" :content="marker.help">
        <BaseText variant="caption" color="secondary">{{ marker.label }}</BaseText>
      </BaseTooltip>

      <AnalyticsMetaLine
        v-if="scope || tier || computedAt"
        :scope="scope"
        :tier="tier"
        :computedAt="computedAt"
        :periodStart="periodStart"
        :periodEnd="periodEnd"
        :showPeriod="showPeriod"
      />

      <slot name="footer" />
    </div>
  </BaseCard>
</template>
