<script setup>
/**
 * BaseFilterMenu — root of the cascading filter framework (Linear / VS Code feel).
 * A "Filter" trigger opens a recursive flyout menu built from a descriptor tree
 * (`items`); submenu rows open child panels beside them (unlimited nesting). The
 * selection v-model is a flat object `{ [group]: value[] | value }`. Pairs with
 * BaseFilterChip / entity badges for the applied-filter token bar.
 *
 *   <BaseFilterMenu v-model="filters" :items="[
 *     { id: 'status', label: 'Status', icon: IconCircleDot, group: 'statusId',
 *       options: [{ value: 'OPEN', label: 'Open', count: 12 }] },
 *     { id: 'date', label: 'Date', icon: IconCalendar, children: [
 *       { id: 'created', label: 'Created', group: 'createdRange', options: […] },
 *     ] },
 *   ]" />
 *
 * See docs/filter-framework-plan.md for the full FilterNode shape.
 */
import { IconFilter } from '@tabler/icons-vue'
import {
  isChecked as checkedFn,
  toggleSelection,
  countActiveGroups,
} from '../composables/filterMenuHelpers.js'

defineProps({
  items: { type: Array, default: () => [] },
  label: { type: String, default: 'Filter' },
})
const model = defineModel({ type: Object, default: () => ({}) })

const open = ref(false)
const triggerEl = ref(null)
const activeCount = computed(() => countActiveGroups(model.value))

provide('filterMenuCtx', {
  isChecked: (node) => checkedFn(model.value, node.group, node.value, node.select),
  toggle: (node) => {
    model.value = toggleSelection(model.value, node)
  },
  requestClose: () => {
    open.value = false
  },
})

function toggleOpen() {
  open.value = !open.value
}
function close() {
  open.value = false
}
function onDocMouseDown(e) {
  if (!open.value) return
  if (triggerEl.value?.contains(e.target)) return
  if (e.target.closest?.('[role="menu"]')) return
  close()
}
onMounted(() => document.addEventListener('mousedown', onDocMouseDown))
onBeforeUnmount(() => document.removeEventListener('mousedown', onDocMouseDown))
</script>

<template>
  <div ref="triggerEl" class="tw:inline-block">
    <button
      type="button"
      aria-haspopup="menu"
      :aria-expanded="open"
      class="tw:inline-flex tw:min-h-9 tw:items-center tw:gap-1.5 tw:rounded-lg tw:border tw:px-3 tw:py-1.5 tw:text-sm tw:font-medium tw:transition-colors"
      :class="
        activeCount || open
          ? 'tw:border-primary/40 tw:bg-main-selected tw:text-primary'
          : 'tw:border-divider tw:bg-card tw:text-on-main tw:hover:bg-main-hover'
      "
      @click="toggleOpen"
    >
      <IconFilter :size="16" />
      {{ label }}
      <span
        v-if="activeCount"
        class="tw:rounded-full tw:bg-primary tw:px-1.5 tw:text-micro tw:font-bold tw:text-on-primary tw:tabular-nums"
      >
        {{ activeCount }}
      </span>
    </button>

    <BaseFilterFlyout
      v-if="open"
      :nodes="items"
      :anchorEl="triggerEl"
      placement="bottom-start"
      @close="close"
    />
  </div>
</template>
