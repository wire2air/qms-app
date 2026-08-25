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

const props = defineProps({
  items: { type: Array, default: () => [] },
  label: { type: String, default: 'Filter' },
  // Compact, borderless icon trigger for use inside a table toolbar (matches the
  // sibling filter/export icon buttons). `label` becomes the tooltip + a11y name.
  iconOnly: { type: Boolean, default: false },
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
  getValue: (group) => model.value?.[group] ?? null,
  setValue: (group, value) => {
    model.value = { ...model.value, [group]: value }
  },
  requestClose: () => {
    open.value = false
  },
})

// Two trigger skins: a standalone bordered button, or the borderless icon button
// used inside a table toolbar.
const triggerClass = computed(() => {
  const active = activeCount.value || open.value
  if (props.iconOnly) {
    return [
      'tw:flex tw:items-center tw:gap-1 tw:rounded-md tw:px-2 tw:py-1.5 tw:text-xs tw:font-medium tw:transition-colors tw:hover:bg-main-hover tw:hover:text-on-main',
      active ? 'tw:text-primary' : 'tw:text-secondary',
    ]
  }
  return [
    'tw:inline-flex tw:min-h-9 tw:items-center tw:gap-1.5 tw:rounded-lg tw:border tw:px-3 tw:py-1.5 tw:text-sm tw:font-medium tw:transition-colors',
    active
      ? 'tw:border-primary/40 tw:bg-main-selected tw:text-primary'
      : 'tw:border-divider tw:bg-card tw:text-on-main tw:hover:bg-main-hover',
  ]
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
      :title="iconOnly ? label : undefined"
      :class="triggerClass"
      @click="toggleOpen"
    >
      <IconFilter :size="16" />
      <!-- Icon-only keeps the label in the accessible tree (screen readers, and
           name-based test locators) rather than swapping it for an aria-label. -->
      <span :class="iconOnly ? 'tw:sr-only' : ''">{{ label }}</span>
      <span
        v-if="activeCount"
        :class="
          iconOnly
            ? 'tw:rounded tw:bg-primary/15 tw:px-1 tw:text-micro tw:font-semibold tw:text-primary tw:tabular-nums'
            : 'tw:rounded-full tw:bg-primary tw:px-1.5 tw:text-micro tw:font-bold tw:text-on-primary tw:tabular-nums'
        "
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
