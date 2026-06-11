<script setup>
defineProps({
  status: { type: Object, required: true },
})

// Same colour vocabulary used by CAPA + NC status badges so the
// product feels coherent across modules.
const SCHEME_MAP = {
  DRAFT: { class: 'tw:bg-gray-100 tw:text-gray-700' },
  UNDER_REVIEW: { class: 'tw:bg-blue-100 tw:text-blue-700' },
  APPROVED: { class: 'tw:bg-emerald-100 tw:text-emerald-700' },
  IN_IMPLEMENTATION: { class: 'tw:bg-indigo-100 tw:text-indigo-700' },
  PENDING_EFFECTIVENESS: { class: 'tw:bg-amber-100 tw:text-amber-700' },
  CLOSED: { class: 'tw:bg-green-100 tw:text-green-700' },
  REJECTED: { class: 'tw:bg-red-100 tw:text-red-700' },
  CANCELLED: { class: 'tw:bg-red-100 tw:text-red-700' },
  ON_HOLD: { class: 'tw:bg-orange-100 tw:text-orange-700' },
}

const scheme = (id) => SCHEME_MAP[id] || { class: 'tw:bg-gray-100 tw:text-gray-600' }
</script>

<template>
  <BaseBadge v-bind="$attrs" :class="scheme(status.id).class">
    {{ status.name || status.id || '—' }}
  </BaseBadge>
</template>
