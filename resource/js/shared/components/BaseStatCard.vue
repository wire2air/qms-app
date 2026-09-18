<script setup>
/**
 * BaseStatCard — a dashboard KPI tile (Open NCs / Overdue / Effective / …).
 * Replaces the copy-pasted stat tiles in the NC / Complaints / Documents /
 * Dashboard *StatsCards components (icon box + big value + label). Pair with
 * ContentGrid to lay several out responsively.
 *
 *   <ContentGrid min="14rem">
 *     <BaseStatCard label="Open NCs" :value="open" :icon="IconAlertTriangle" iconColor="amber" />
 *     <BaseStatCard label="Overdue" :value="overdue" :icon="IconClock" iconColor="red"
 *                   :trend="{ direction: 'down', value: '-2 vs last wk' }" />
 *   </ContentGrid>
 *
 * Optional `#footer` slot for a provenance/context line under the tile (used by
 * the analytics KPI strip to state the scope, freshness and tier the number was
 * computed under).
 *
 * Icons are NOT auto-imported — pass the imported component.
 */
import { IconTrendingUp, IconTrendingDown } from '@tabler/icons-vue'

const props = defineProps({
  label: { type: String, default: '' },
  value: { type: [String, Number], default: null },
  // A @tabler/icons-vue component, imported by the consumer.
  icon: { type: [Object, Function], default: null },
  iconColor: {
    type: String,
    default: 'primary',
    validator: (v) => ['primary', 'blue', 'green', 'amber', 'red', 'purple', 'gray'].includes(v),
  },
  // Optional change indicator: { direction: 'up' | 'down', value: string,
  //                              tone?: 'good' | 'bad' | 'neutral' }.
  // `tone` decouples the ARROW from the COLOR: for a metric where lower is
  // better (overdue %, closure days) a downward move is good, and for a purely
  // volumetric metric neither direction is. Omit it and the legacy
  // up = good / down = bad reading applies.
  trend: { type: Object, default: null },
  loading: { type: Boolean, default: false },
})

// bg + text per tint (mirrors BaseSectionHeader's ICON_COLOR). Static map so
// Tailwind emits the classes.
const ICON_COLOR = {
  primary: { box: 'tw:bg-primary/10', text: 'tw:text-primary' },
  blue: { box: 'tw:bg-blue-50', text: 'tw:text-blue-600' },
  green: { box: 'tw:bg-green-50', text: 'tw:text-green-600' },
  amber: { box: 'tw:bg-amber-50', text: 'tw:text-amber-600' },
  red: { box: 'tw:bg-red-50', text: 'tw:text-red-600' },
  purple: { box: 'tw:bg-purple-50', text: 'tw:text-purple-600' },
  gray: { box: 'tw:bg-gray-100', text: 'tw:text-gray-600' },
}

const tint = computed(() => ICON_COLOR[props.iconColor] || ICON_COLOR.primary)
const trendUp = computed(() => props.trend?.direction === 'up')

const TREND_TONE = {
  good: 'tw:text-good',
  bad: 'tw:text-bad',
  neutral: 'tw:text-secondary',
}
const trendToneClass = computed(
  () => TREND_TONE[props.trend?.tone] ?? (trendUp.value ? TREND_TONE.good : TREND_TONE.bad),
)
</script>

<template>
  <BaseCard>
    <div class="tw:flex tw:items-center tw:gap-3">
      <div
        v-if="icon"
        class="tw:flex tw:size-11 tw:shrink-0 tw:items-center tw:justify-center tw:rounded-lg"
        :class="tint.box"
      >
        <component :is="icon" :size="24" :class="tint.text" aria-hidden="true" />
      </div>
      <div class="tw:min-w-0">
        <BaseSkeleton v-if="loading" variant="text" width="3rem" height="1.5rem" />
        <div v-else class="tw:text-2xl tw:font-bold tw:text-on-main tw:leading-tight">
          {{ value ?? '—' }}
        </div>
        <div class="tw:text-xs tw:text-secondary tw:truncate">{{ label }}</div>
        <div
          v-if="trend"
          class="tw:mt-0.5 tw:inline-flex tw:items-center tw:gap-0.5 tw:text-xs tw:font-medium"
          :class="trendToneClass"
        >
          <component :is="trendUp ? IconTrendingUp : IconTrendingDown" :size="14" aria-hidden="true" />
          {{ trend.value }}
        </div>
      </div>
    </div>
    <!-- Provenance line — full card width (scope / freshness / tier on
         analytics tiles), so it never squeezes the value beside the icon. -->
    <div v-if="$slots.footer" class="tw:mt-3">
      <slot name="footer" />
    </div>
  </BaseCard>
</template>
