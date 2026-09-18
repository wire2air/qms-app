<script setup>
/**
 * BaseFilterItem — one row in a cascading filter flyout. Renders icon + label +
 * trailing affordance (submenu chevron, check/radio box, count, loading). A
 * keyboard-operable <button> with the right WAI-ARIA menuitem role.
 */
import { IconChevronRight, IconCheck } from '@tabler/icons-vue'

const props = defineProps({
  node: { type: Object, required: true },
  checked: { type: Boolean, default: false },
  hasSub: { type: Boolean, default: false },
  loading: { type: Boolean, default: false },
})
defineEmits(['select', 'hover'])

const role = computed(() => {
  if (props.hasSub) return 'menuitem'
  if (props.node.select === 'radio') return 'menuitemradio'
  if (props.node.group) return 'menuitemcheckbox'
  return 'menuitem'
})
const isRadio = computed(() => props.node.select === 'radio')
const selectable = computed(() => !!props.node.group && !props.hasSub)
</script>

<template>
  <button
    type="button"
    data-row
    :role="role"
    :tabindex="-1"
    :disabled="node.disabled"
    :aria-checked="node.group ? checked : undefined"
    :aria-haspopup="hasSub ? 'menu' : undefined"
    class="tw:flex tw:w-full tw:items-center tw:gap-2 tw:rounded-md tw:px-2 tw:py-1.5 tw:text-left tw:text-sm tw:text-on-main tw:outline-none tw:transition-colors tw:hover:bg-main-hover tw:focus:bg-main-hover tw:disabled:cursor-not-allowed tw:disabled:opacity-50"
    @click="$emit('select', $event)"
    @mouseenter="$emit('hover', $event)"
  >
    <span
      v-if="selectable"
      class="tw:flex tw:size-4 tw:shrink-0 tw:items-center tw:justify-center tw:border"
      :class="[
        isRadio ? 'tw:rounded-full' : 'tw:rounded',
        checked ? 'tw:border-primary tw:bg-primary tw:text-on-primary' : 'tw:border-divider',
      ]"
    >
      <IconCheck v-if="checked && !isRadio" :size="12" />
      <span v-else-if="checked" class="tw:size-1.5 tw:rounded-full tw:bg-on-primary" />
    </span>
    <component :is="node.icon" v-if="node.icon" :size="16" class="tw:shrink-0 tw:text-secondary" aria-hidden="true" />
    <span class="tw:min-w-0 tw:flex-1 tw:truncate">{{ node.label }}</span>
    <span v-if="node.count != null" class="tw:shrink-0 tw:text-xs tw:text-secondary tw:tabular-nums">
      {{ node.count }}
    </span>
    <BaseSpinner v-if="loading" size="sm" class="tw:shrink-0" />
    <IconChevronRight v-else-if="hasSub" :size="14" class="tw:shrink-0 tw:text-secondary" />
  </button>
</template>
