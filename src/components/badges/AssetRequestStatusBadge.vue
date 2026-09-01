<script setup>
defineProps({
  status: {
    type: Object,
    required: true,
  },
  showDot: {
    type: Boolean,
    default: true,
  },
})

// Keyed on asset_request_statuses: PENDING / RECEIVED / ACCEPTED / REJECTED /
// OVERDUE / CANCELLED.
const SCHEME_MAP = {
  PENDING: { class: 'tw:bg-amber-100 tw:text-amber-700' },
  RECEIVED: { class: 'tw:bg-indigo-100 tw:text-indigo-700' },
  ACCEPTED: { class: 'tw:bg-green-100 tw:text-green-700' },
  REJECTED: { class: 'tw:bg-red-100 tw:text-red-700' },
  OVERDUE: { class: 'tw:bg-orange-100 tw:text-orange-700' },
  CANCELLED: { class: 'tw:bg-gray-100 tw:text-gray-600' },
}

const scheme = (id) => SCHEME_MAP[id] || { class: 'tw:bg-gray-100 tw:text-gray-600' }
</script>

<template>
  <BaseBadge v-bind="$attrs" :class="scheme(status.id).class" :showDot="showDot">
    {{ status.name || status.id || '—' }}
  </BaseBadge>
</template>
