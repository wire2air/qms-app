<script setup>
import {
  IconEdit,
  IconCircleCheck,
  IconTrash,
  IconProgress,
  IconLock,
  IconClipboardCheck,
  IconCircleX,
} from '@tabler/icons-vue'

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
  // Generic-module lifecycle: Draft → Pending → Complete → Closed (+ Rejected)
  PENDING: {
    class: 'tw:bg-blue-100 tw:text-blue-700',
    icon: IconProgress,
  },
  OPEN: {
    class: 'tw:bg-blue-100 tw:text-blue-700',
    icon: IconProgress,
  },
  COMPLETE: {
    class: 'tw:bg-teal-100 tw:text-teal-700',
    icon: IconClipboardCheck,
  },
  REJECTED: {
    class: 'tw:bg-red-100 tw:text-red-700',
    icon: IconCircleX,
  },
  CLOSED: {
    class: 'tw:bg-green-100 tw:text-green-700',
    icon: IconLock,
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
