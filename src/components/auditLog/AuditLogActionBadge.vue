<script setup>
import { ACTION_COLORS, ACTION_ICONS } from '@/utils/auditConstants.js'
import * as TablerIcons from '@tabler/icons-vue'

const props = defineProps({
  action: {
    type: String,
    required: true,
  },
})

const colorClass = computed(
  () => ACTION_COLORS[props.action] || 'tw:bg-gray-100 tw:text-gray-700',
)
const iconName = computed(() => ACTION_ICONS[props.action] || 'IconHistory')
const iconComponent = computed(() => TablerIcons[iconName.value] || TablerIcons.IconHistory)
const label = computed(() => props.action.replace(/_/g, ' '))
</script>

<template>
  <span
    :class="[
      'tw:inline-flex tw:items-center tw:gap-1 tw:px-2 tw:py-0.5 tw:rounded tw:text-xs tw:font-semibold',
      colorClass,
    ]"
  >
    <component :is="iconComponent" :size="12" />
    {{ label }}
  </span>
</template>
