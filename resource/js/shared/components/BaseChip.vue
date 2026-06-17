<script setup>
import { IconX } from '@tabler/icons-vue'

defineProps({
  /**
   * The text/label to display in the chip
   */
  label: {
    type: String,
    required: true,
  },
  /**
   * Whether to show the close/remove button
   */
  removable: {
    type: Boolean,
    default: false,
  },
  /**
   * Size variant: 'sm' or 'md'
   */
  size: {
    type: String,
    validator: (val) => ['sm', 'md'].includes(val),
    default: 'md',
  },
  /**
   * Optional custom class for the chip container
   */
  chipClass: {
    type: String,
    default: '',
  },
})

defineEmits(['remove'])
</script>

<template>
  <div
    :class="[
      'tw:flex tw:items-center tw:gap-2 tw:bg-main-hover tw:border tw:border-divider tw:rounded-full tw:transition-colors tw:duration-150',
      size === 'sm' ? 'tw:px-2 tw:py-1' : 'tw:px-3 tw:py-1.5',
      chipClass,
    ]"
  >
    <span :class="['tw:font-medium tw:text-on-main', size === 'sm' ? 'tw:text-xs' : 'tw:text-sm']">
      <slot>{{ label }}</slot>
    </span>

    <button
      v-if="removable"
      class="tw:flex tw:items-center tw:justify-center tw:text-secondary tw:hover:text-bad tw:transition-colors tw:duration-150"
      :class="size === 'sm' ? 'tw:-mr-0.5' : 'tw:-mr-1'"
      @click="$emit('remove')"
    >
      <IconX :size="size === 'sm' ? 12 : 14" />
    </button>
  </div>
</template>
