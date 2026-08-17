<script setup>
/**
 * The provenance line every analytics surface carries: the SCOPE the number was
 * computed under, the TIER it came from, and how FRESH it is.
 *
 * This is a hard requirement of the analytics design, not chrome. Scope tiers
 * are cumulative and NULL site/department rows are invisible to scoped viewers,
 * so two colleagues comparing "the same KPI" will legitimately see different
 * totals; and a 15-minute-old rollup number is visually identical to a live one.
 * Stating both is what stops either reading as a bug.
 */
import { IconClock } from '@tabler/icons-vue'
import { formatFreshness, formatPeriod } from '@/utils/analyticsFormat.js'

const props = defineProps({
  scope: { type: String, default: null },
  tier: { type: String, default: null },
  // ISO timestamp from the metric row (`computedAt`).
  computedAt: { type: String, default: null },
  // Optional resolved window, shown when the tile is not on the page default.
  periodStart: { type: String, default: null },
  periodEnd: { type: String, default: null },
  showPeriod: { type: Boolean, default: false },
})

const freshness = computed(() => formatFreshness(props.computedAt))
const period = computed(() =>
  props.showPeriod ? formatPeriod(props.periodStart, props.periodEnd) : null,
)
</script>

<template>
  <div class="tw:flex tw:flex-wrap tw:items-center tw:gap-x-2 tw:gap-y-1">
    <AnalyticsScopeBadgeById v-if="scope" :scopeId="scope" />
    <AnalyticsTierBadgeById v-if="tier" :tierId="tier" />

    <BaseTooltip v-if="freshness" :content="`Computed ${freshness.exact}`">
      <span class="tw:inline-flex tw:items-center tw:gap-1 tw:text-xs tw:text-secondary">
        <IconClock :size="13" aria-hidden="true" />
        {{ freshness.relative }}
      </span>
    </BaseTooltip>

    <BaseText v-if="period" variant="caption" color="secondary">{{ period }}</BaseText>
  </div>
</template>
