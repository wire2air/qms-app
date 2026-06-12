<script setup>
defineProps({
  status: {
    type: Object,
    required: true,
  },
})

const SCHEME_MAP = {
  NEW: { class: 'tw:bg-blue-100 tw:text-blue-700' },
  OPEN: { class: 'tw:bg-sky-100 tw:text-sky-700' },
  ASSIGNED: { class: 'tw:bg-indigo-100 tw:text-indigo-700' },
  IN_PROGRESS: { class: 'tw:bg-amber-100 tw:text-amber-700' },
  WAITING_CUSTOMER: { class: 'tw:bg-orange-100 tw:text-orange-700' },
  ON_HOLD: { class: 'tw:bg-slate-200 tw:text-slate-700' },
  RESOLVED: { class: 'tw:bg-emerald-100 tw:text-emerald-700' },
  CLOSED: { class: 'tw:bg-green-100 tw:text-green-700' },
  CONVERTED_TO_NC: { class: 'tw:bg-purple-100 tw:text-purple-700' },
}

const scheme = (id) => SCHEME_MAP[id] || { class: 'tw:bg-gray-100 tw:text-gray-600' }
</script>

<template>
  <BaseBadge v-bind="$attrs" :class="scheme(status.id).class">
    {{ status.name || status.id || '—' }}
  </BaseBadge>
</template>
