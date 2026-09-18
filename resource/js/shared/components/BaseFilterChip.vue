<script setup>
/**
 * BaseFilterChip — a removable applied-filter token (cascading filter framework).
 * Generic (label + optional prefix/icon + remove ✕). For entity filters, the
 * triad's *BadgeById components can be used as tokens instead.
 */
import { IconX } from '@tabler/icons-vue'

defineProps({
  label: { type: String, required: true },
  prefix: { type: String, default: '' },
  icon: { type: [Object, Function], default: null },
  removable: { type: Boolean, default: true },
})
defineEmits(['remove'])
</script>

<template>
  <span
    class="tw:inline-flex tw:items-center tw:gap-1 tw:rounded-md tw:border tw:border-divider tw:bg-card tw:py-0.5 tw:ps-2 tw:pe-1 tw:text-xs tw:text-on-main"
  >
    <component :is="icon" v-if="icon" :size="13" class="tw:shrink-0 tw:text-secondary" aria-hidden="true" />
    <span v-if="prefix" class="tw:text-secondary">{{ prefix }}</span>
    <span class="tw:max-w-[12rem] tw:truncate tw:font-medium">{{ label }}</span>
    <button
      v-if="removable"
      type="button"
      :aria-label="`Remove ${label}`"
      class="tw:ml-0.5 tw:rounded tw:p-0.5 tw:text-secondary tw:hover:bg-main-hover tw:hover:text-on-main"
      @click="$emit('remove')"
    >
      <IconX :size="12" />
    </button>
  </span>
</template>
