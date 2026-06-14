<script setup>
/**
 * Compact From–To date-range filter. v-model:from / v-model:to are ISO date
 * strings ('yyyy-mm-dd', empty = unset). Reusable across list toolbars; pairs
 * with the dateInRange() helper to filter rows by created date.
 */
import { IconX } from '@tabler/icons-vue'

const from = defineModel('from', { type: String, default: '' })
const to = defineModel('to', { type: String, default: '' })

function clear() {
  from.value = ''
  to.value = ''
}
</script>

<template>
  <div class="tw:flex tw:items-center tw:gap-1.5">
    <BaseTextInput v-model="from" type="date" size="sm" class="tw:w-40" />
    <span class="tw:text-secondary tw:text-xs">–</span>
    <BaseTextInput v-model="to" type="date" size="sm" class="tw:w-40" />
    <button
      v-if="from || to"
      type="button"
      title="Clear dates"
      class="tw:p-1 tw:rounded tw:text-secondary tw:hover:text-on-main tw:bg-transparent tw:border-0 tw:cursor-pointer"
      @click="clear"
    >
      <IconX :size="14" />
    </button>
  </div>
</template>
