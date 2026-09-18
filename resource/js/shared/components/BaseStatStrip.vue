<script setup>
/**
 * BaseStatStrip — a compact, single-surface KPI strip for list pages (Enterprise
 * Page Framework). Unlike the larger BaseStatCard grid (for dashboards), this is
 * a low-profile ~56px metrics bar so the data table stays the primary content.
 *
 *   <BaseStatStrip :items="[
 *     { key: 'open', label: 'Open', value: 51, icon: IconAlertCircle, color: 'blue' },
 *     { key: 'overdue', label: 'Overdue', value: 4, icon: IconClock, color: 'red', emphasize: true },
 *   ]" />
 *
 * Item: { key, label, value, icon?, color?('primary'|'blue'|'red'|'amber'|'green'|'secondary'), emphasize? }.
 * `emphasize` tints the value with the item color (e.g. a non-zero overdue count).
 * Segments divide on one row at desktop width and wrap (2-up) on narrow screens.
 */
const props = defineProps({
  items: { type: Array, default: () => [] },
})

const COLOR = {
  primary: 'tw:text-primary',
  blue: 'tw:text-blue-600',
  red: 'tw:text-red-600',
  amber: 'tw:text-amber-600',
  green: 'tw:text-green-600',
  secondary: 'tw:text-secondary',
}
function tint(c) {
  return COLOR[c] || COLOR.secondary
}
const valueTint = (item) => (item.emphasize ? tint(item.color) : 'tw:text-on-main')
</script>

<template>
  <div
    class="tw:flex tw:flex-wrap tw:divide-x tw:divide-divider tw:overflow-hidden tw:rounded-xl tw:border tw:border-divider tw:bg-card"
  >
    <div
      v-for="item in props.items"
      :key="item.key"
      class="tw:flex tw:min-w-[7.5rem] tw:flex-1 tw:items-center tw:gap-2.5 tw:px-4 tw:py-2.5"
    >
      <component
        :is="item.icon"
        v-if="item.icon"
        :size="16"
        class="tw:shrink-0"
        :class="tint(item.color)"
        aria-hidden="true"
      />
      <div class="tw:min-w-0">
        <div class="tw:text-caption tw:font-semibold tw:uppercase tw:tracking-wider tw:text-secondary tw:truncate">
          {{ item.label }}
        </div>
        <div class="tw:text-lg tw:font-bold tw:leading-tight" :class="valueTint(item)">
          {{ item.value ?? '—' }}
        </div>
      </div>
    </div>
  </div>
</template>
