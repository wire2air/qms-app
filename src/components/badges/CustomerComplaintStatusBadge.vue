<script setup>
defineProps({
  status: { type: Object, required: true },
})

const SCHEME_MAP = {
  NEW: { class: 'tw:bg-blue-100 tw:text-blue-700' },
  ASSIGNED: { class: 'tw:bg-indigo-100 tw:text-indigo-700' },
  IN_PROGRESS: { class: 'tw:bg-amber-100 tw:text-amber-700' },
  WAITING_ON_CUSTOMER: { class: 'tw:bg-purple-100 tw:text-purple-700' },
  RESOLVED: { class: 'tw:bg-emerald-100 tw:text-emerald-700' },
  CLOSED: { class: 'tw:bg-gray-200 tw:text-gray-700' },
}

const scheme = (id) => SCHEME_MAP[id] || { class: 'tw:bg-gray-100 tw:text-gray-600' }
</script>

<template>
  <BaseBadge v-bind="$attrs" :class="scheme(status.id).class">
    {{ status.name || status.id || '—' }}
  </BaseBadge>
</template>
