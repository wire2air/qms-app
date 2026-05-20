<script setup>
import { IconEdit, IconCircleCheck, IconTrash } from '@tabler/icons-vue'

const props = defineProps({
  status: {
    type: [Object, Function],
    required: true,
  },
})

const statusConfig = {
  DRAFT: {
    class: 'tw:bg-gray-100 tw:text-gray-700',
    icon: IconEdit,
  },
  APPROVED: {
    class: 'tw:bg-green-100 tw:text-green-700',
    icon: IconCircleCheck,
  },
  DELETED: {
    class: 'tw:bg-red-100 tw:text-red-700',
    icon: IconTrash,
  },
}

const config = computed(() => statusConfig[props.status?.id] || statusConfig.DRAFT)
</script>

<template>
  <span
    :class="config.class"
    class="tw:py-1.5 tw:px-2 tw:rounded-2xl tw:inline-flex tw:items-center tw:gap-1 tw:text-xs tw:font-medium"
  >
    <component :is="config.icon" :size="14" />
    <span>{{ status.name || status.id }}</span>
  </span>
</template>
