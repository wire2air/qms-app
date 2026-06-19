<script setup>
/**
 * Compact From–To date-range filter. v-model:from / v-model:to are ISO date
 * strings ('yyyy-mm-dd', empty = unset). Reusable across list toolbars; pairs
 * with the dateInRange() helper to filter rows by created date.
 *
 * Renders the design-system BaseDatePicker (v-calendar popover) rather than the
 * browser's native date input, so it matches the rest of the controls. The
 * public string contract is preserved — DateTime ↔ ISO conversion happens here.
 */
import { DateTime } from 'luxon'
import { IconX } from '@tabler/icons-vue'

const from = defineModel('from', { type: String, default: '' })
const to = defineModel('to', { type: String, default: '' })

const fromDt = computed({
  get: () => (from.value ? DateTime.fromISO(from.value) : null),
  set: (dt) => (from.value = dt ? dt.toISODate() : ''),
})
const toDt = computed({
  get: () => (to.value ? DateTime.fromISO(to.value) : null),
  set: (dt) => (to.value = dt ? dt.toISODate() : ''),
})

function clear() {
  from.value = ''
  to.value = ''
}
</script>

<template>
  <div class="tw:flex tw:items-center tw:gap-1.5">
    <div class="tw:min-w-0 tw:flex-1">
      <BaseDatePicker v-model="fromDt" :showShortcuts="false" />
    </div>
    <span class="tw:shrink-0 tw:text-xs tw:text-secondary">–</span>
    <div class="tw:min-w-0 tw:flex-1">
      <BaseDatePicker v-model="toDt" :showShortcuts="false" />
    </div>
    <button
      v-if="from || to"
      type="button"
      title="Clear dates"
      aria-label="Clear dates"
      class="tw:shrink-0 tw:cursor-pointer tw:rounded tw:border-0 tw:bg-transparent tw:p-1 tw:text-secondary tw:hover:text-on-main"
      @click="clear"
    >
      <IconX :size="14" />
    </button>
  </div>
</template>
