<script setup>
/**
 * Log book lifecycle badge (supersede model): the BOOK carries the whole
 * approval lifecycle — no separate versions.
 */
defineProps({ statusId: { type: String, default: null } })

const SCHEME_MAP = {
  DRAFT: { class: 'tw:bg-amber-100 tw:text-amber-700' },
  UNDER_REVIEW: { class: 'tw:bg-blue-100 tw:text-blue-700' },
  REJECTED: { class: 'tw:bg-red-100 tw:text-red-700' },
  ACTIVE: { class: 'tw:bg-green-100 tw:text-green-700' },
  INACTIVE: { class: 'tw:bg-gray-100 tw:text-gray-600' },
  OBSOLETE: { class: 'tw:bg-gray-200 tw:text-gray-500' },
}
const LABEL_MAP = {
  DRAFT: 'Draft',
  UNDER_REVIEW: 'Under review',
  REJECTED: 'Rejected',
  ACTIVE: 'Active',
  INACTIVE: 'Inactive',
  OBSOLETE: 'Obsolete',
}
function scheme(id) {
  return SCHEME_MAP[id] || { class: 'tw:bg-gray-100 tw:text-gray-600' }
}
</script>

<template>
  <BaseBadge v-bind="$attrs" :class="scheme(statusId).class">
    {{ LABEL_MAP[statusId] || statusId || '—' }}
  </BaseBadge>
</template>
