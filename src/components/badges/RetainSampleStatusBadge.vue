<script setup>
defineProps({
  status: { type: Object, required: true },
  showDot: { type: Boolean, default: false },
})
// RETAINED/DISPOSED are stored; DUE/OVERDUE are derived from retainUntil by
// RetainSampleStatusBadgeById so due-for-destruction states show without a cron.
const SCHEME_MAP = {
  RETAINED: { class: 'tw:bg-green-100 tw:text-green-700' },
  DUE: { class: 'tw:bg-amber-100 tw:text-amber-700' },
  OVERDUE: { class: 'tw:bg-red-100 tw:text-red-700' },
  DISPOSED: { class: 'tw:bg-gray-200 tw:text-gray-700' },
}
const scheme = (id) => SCHEME_MAP[id] || { class: 'tw:bg-gray-100 tw:text-gray-600' }
</script>

<template>
  <BaseBadge v-bind="$attrs" :class="scheme(status?.id).class" :showDot="showDot">
    {{ status?.name || status?.id || '—' }}
  </BaseBadge>
</template>
