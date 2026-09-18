<script setup>
defineProps({
  status: { type: Object, required: true },
  showDot: { type: Boolean, default: false },
  hideLabel: { type: Boolean, default: false },
})

const SCHEME_MAP = {
  APPROVED: { class: 'tw:bg-green-100 tw:text-green-700' },
  IN_PROGRESS: { class: 'tw:bg-blue-100 tw:text-blue-700' },
  REJECTED: { class: 'tw:bg-red-100 tw:text-red-700' },
  CHANGES_REQUESTED: { class: 'tw:bg-orange-100 tw:text-orange-700' },
  PENDING: { class: 'tw:bg-gray-100 tw:text-gray-600' },
  SCHEDULED: { class: 'tw:bg-indigo-100 tw:text-indigo-700' },
  SKIPPED: { class: 'tw:bg-gray-100 tw:text-gray-500' },
  ASSIGNED: { class: 'tw:bg-indigo-100 tw:text-indigo-700' },
  CANCELLED: { class: 'tw:bg-gray-100 tw:text-gray-600' },
}

const scheme = (id) => SCHEME_MAP[id] || { class: 'tw:bg-gray-100 tw:text-gray-600' }
</script>

<template>
  <BaseBadge v-bind="$attrs" :class="scheme(status?.id).class" :showDot="showDot">
    <template v-if="!hideLabel">{{ status?.name || status?.id || '—' }}</template>
  </BaseBadge>
</template>
