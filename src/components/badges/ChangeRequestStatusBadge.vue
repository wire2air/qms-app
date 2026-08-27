<script setup>
defineProps({
  status: { type: Object, required: true },
})

// Same colour vocabulary used by CAPA + NC status badges so the
// product feels coherent across modules.
// Unified parent vocabulary (2026-08-26): Draft / Open / Closed / Cancelled.
const SCHEME_MAP = {
  DRAFT: { class: 'tw:bg-gray-100 tw:text-gray-700' },
  OPEN: { class: 'tw:bg-blue-100 tw:text-blue-700' },
  CLOSED: { class: 'tw:bg-green-100 tw:text-green-700' },
  CANCELLED: { class: 'tw:bg-red-100 tw:text-red-700' },
}

const scheme = (id) => SCHEME_MAP[id] || { class: 'tw:bg-gray-100 tw:text-gray-600' }
</script>

<template>
  <BaseBadge v-bind="$attrs" :class="scheme(status.id).class">
    {{ status.name || status.id || '—' }}
  </BaseBadge>
</template>
