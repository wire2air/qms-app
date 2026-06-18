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
  // Optional change indicator: { direction: 'up' | 'down', value: string }.
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
          :class="trendUp ? 'tw:text-good' : 'tw:text-bad'"
        >
          <component :is="trendUp ? IconTrendingUp : IconTrendingDown" :size="14" aria-hidden="true" />
          {{ trend.value }}
        </div>
      </div>
    </div>
  </BaseCard>
</template>
