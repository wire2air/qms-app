<script setup>
/**
 * Standardized bulk-action bar shown when rows are selected. Config-driven via an
 * `actions` array so every module gets the same affordance instead of hand-rolling
 * a `#bulk-actions` slot. Each action:
 *   { key, label, icon?, variant?, disabled?(selected), visible?(selected), run(selected) }
 */
import { IconX } from '@tabler/icons-vue'

const props = defineProps({
  count: { type: Number, required: true },
  selected: { type: Array, default: () => [] },
  actions: { type: Array, default: () => [] },
})
const emit = defineEmits(['clear'])

const visibleActions = computed(() =>
  props.actions.filter((a) => (typeof a.visible === 'function' ? a.visible(props.selected) : true)),
)
function isDisabled(a) {
  return typeof a.disabled === 'function' ? a.disabled(props.selected) : !!a.disabled
}
function run(a) {
  if (isDisabled(a)) return
  a.run?.(props.selected)
}
</script>

<template>
  <div class="tw:flex tw:flex-wrap tw:items-center tw:gap-2">
    <span class="tw:text-sm tw:font-semibold tw:text-on-main">{{ count }} selected</span>
    <button
      type="button"
      aria-label="Clear selection"
      class="tw:flex tw:size-6 tw:items-center tw:justify-center tw:rounded tw:text-secondary tw:transition-colors tw:hover:bg-main-hover tw:hover:text-on-main"
      @click="emit('clear')"
    >
      <IconX :size="14" />
    </button>

    <div v-if="visibleActions.length" class="tw:mx-1 tw:h-4 tw:w-px tw:bg-divider" />

    <BaseButton
      v-for="a in visibleActions"
      :key="a.key"
      :variant="a.variant || 'outline'"
      size="sm"
      :disabled="isDisabled(a)"
      @click="run(a)"
    >
      <template v-if="a.icon" #icon><component :is="a.icon" :size="14" /></template>
      {{ a.label }}
    </BaseButton>
  </div>
</template>
