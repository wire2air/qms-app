<script setup>
defineProps({
  status: { type: Object, required: true },
  showDot: { type: Boolean, default: true },
})

const SCHEME_MAP = {
  ASSIGNED: { class: 'tw:bg-blue-100 tw:text-blue-700' },
  IN_PROGRESS: { class: 'tw:bg-indigo-100 tw:text-indigo-700' },
  COMPLETED: { class: 'tw:bg-amber-100 tw:text-amber-700' },
  VERIFIED: { class: 'tw:bg-green-100 tw:text-green-700' },
  RETRAIN_REQUIRED: { class: 'tw:bg-orange-100 tw:text-orange-700' },
  FAILED: { class: 'tw:bg-red-100 tw:text-red-700' },
  CANCELLED: { class: 'tw:bg-gray-100 tw:text-gray-600' },
  REMOVED: { class: 'tw:bg-gray-200 tw:text-gray-600' },
}

const scheme = (id) => SCHEME_MAP[id] || { class: 'tw:bg-gray-100 tw:text-gray-600' }
</script>

<template>
  <BaseBadge v-bind="$attrs" :class="scheme(status.id).class" :showDot="showDot">
    {{ status.name || status.id || '—' }}
  </BaseBadge>
</template>
