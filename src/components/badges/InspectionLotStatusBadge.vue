<script setup>
defineProps({
  status: { type: Object, required: true },
  showDot: { type: Boolean, default: false },
})
const SCHEME_MAP = {
  DRAFT: { class: 'tw:bg-gray-100 tw:text-gray-600' },
  PENDING: { class: 'tw:bg-amber-100 tw:text-amber-700' },
  IN_PROGRESS: { class: 'tw:bg-blue-100 tw:text-blue-700' },
  COMPLETED: { class: 'tw:bg-indigo-100 tw:text-indigo-700' },
  UNDER_REVIEW: { class: 'tw:bg-purple-100 tw:text-purple-700' },
  APPROVED: { class: 'tw:bg-green-100 tw:text-green-700' },
  REJECTED: { class: 'tw:bg-red-100 tw:text-red-700' },
  CLOSED: { class: 'tw:bg-gray-200 tw:text-gray-700' },
}
const scheme = (id) => SCHEME_MAP[id] || { class: 'tw:bg-gray-100 tw:text-gray-600' }
</script>

<template>
  <BaseBadge v-bind="$attrs" :class="scheme(status?.id).class" :showDot="showDot">
    {{ status?.name || status?.id || '—' }}
  </BaseBadge>
</template>
