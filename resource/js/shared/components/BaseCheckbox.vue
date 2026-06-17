<script setup>
import { IconCheck, IconMinus } from '@tabler/icons-vue'

defineProps({
  disabled: {
    type: Boolean,
    default: false,
  },
  indeterminate: {
    type: Boolean,
    default: false,
  },
  label: {
    type: String,
    default: '',
  },
})

const checked = defineModel({
  type: Boolean,
  default: false,
})
</script>

<template>
  <label
    class="tw:relative tw:inline-flex tw:items-center tw:gap-2 tw:cursor-pointer tw:select-none"
    :class="disabled ? 'tw:opacity-60 tw:cursor-not-allowed tw:pointer-events-none' : ''"
  >
    <input
      v-model="checked"
      type="checkbox"
      class="tw:peer tw:sr-only"
      :disabled="disabled"
      :indeterminate="indeterminate"
    />
    <span
      :class="[
        'tw:inline-flex tw:items-center tw:justify-center tw:h-4 tw:w-4 tw:shrink-0 tw:rounded tw:border tw:transition-colors tw:duration-150 tw:peer-focus-visible:ring-2 tw:peer-focus-visible:ring-primary/40 tw:peer-focus-visible:ring-offset-1',
        checked || indeterminate
          ? 'tw:bg-primary tw:border-primary'
          : 'tw:bg-sidebar tw:border-divider',
      ]"
    >
      <IconMinus v-if="indeterminate" :size="10" class="tw:text-white" :stroke-width="3" />
      <IconCheck v-else-if="checked" :size="10" class="tw:text-white" :stroke-width="3" />
    </span>
    <span class="tw:text-sm tw:text-on-main">
      <slot>{{ label }}</slot>
    </span>
  </label>
</template>
