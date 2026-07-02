<script setup>
/**
 * BaseQuickFilterPills — a single-select row of toggle pills for quick filters
 * (e.g. "All open / My NCs / Critical / Overdue / Closed"). Replaces the
 * hand-rolled `v-for` button rows in the NC / CAPA / Customer-Complaints filter
 * toolbars, which had zero keyboard/ARIA semantics and a hardcoded `bg-white`
 * (broke dark mode).
 *
 * Each pill is a real <button aria-pressed> inside a role="group", so keyboard
 * operation and toggle state come for free.
 *
 *   <BaseQuickFilterPills
 *     v-model="activeFilter"
 *     ariaLabel="Nonconformance quick filters"
 *     :pills="[
 *       { value: 'all_open', label: 'All open' },
 *       { value: 'overdue',  label: 'Overdue', count: overdueCount },
 *       { value: 'spam',     label: 'Spam', color: 'red' },
 *     ]"
 *   />
 */
defineProps({
  // [{ value, label, count?, color? }] — color is a PILL_COLOR key (default 'blue').
  pills: { type: Array, required: true },
  // Accessible name for the toggle-button group (WCAG).
  ariaLabel: { type: String, default: undefined },
})

const model = defineModel({ type: [String, Number, null], default: null })

// Active-pill color schemes. Static map so Tailwind emits the classes; mirrors
// the fixed tints the existing toolbars used (default blue, red for 'spam').
const PILL_COLOR = {
  blue: 'tw:bg-blue-50 tw:text-blue-700 tw:border-blue-300',
  primary: 'tw:bg-primary/10 tw:text-primary tw:border-primary/30',
  red: 'tw:bg-red-50 tw:text-red-700 tw:border-red-300',
  green: 'tw:bg-green-50 tw:text-green-700 tw:border-green-300',
  amber: 'tw:bg-amber-50 tw:text-amber-700 tw:border-amber-300',
}
// Theme-aware inactive scheme (bg-card, not the old bg-white).
const INACTIVE = 'tw:bg-card tw:text-secondary tw:border-divider tw:hover:bg-main-hover'

function isActive(pill) {
  return model.value === pill.value
}

function pillClass(pill) {
  return isActive(pill) ? PILL_COLOR[pill.color] || PILL_COLOR.blue : INACTIVE
}

function select(pill) {
  model.value = pill.value
}
</script>

<template>
  <div role="group" :aria-label="ariaLabel" class="tw:flex tw:flex-wrap tw:items-center tw:gap-2">
    <button
      v-for="pill in pills"
      :key="pill.value"
      type="button"
      :aria-pressed="isActive(pill)"
      class="tw:inline-flex tw:items-center tw:gap-1.5 tw:rounded-full tw:border tw:px-3 tw:py-1 tw:text-xs tw:font-medium tw:transition-colors tw:focus-visible:outline-none tw:focus-visible:ring-2 tw:focus-visible:ring-primary/30"
      :class="pillClass(pill)"
      @click="select(pill)"
    >
      {{ pill.label }}
      <span
        v-if="pill.count != null && pill.count !== ''"
        class="tw:inline-flex tw:items-center tw:justify-center tw:rounded-full tw:bg-main-hover tw:px-1.5 tw:text-micro tw:font-semibold"
        :class="isActive(pill) ? 'tw:bg-black/5' : 'tw:text-secondary'"
      >
        {{ pill.count }}
      </span>
    </button>
  </div>
</template>
