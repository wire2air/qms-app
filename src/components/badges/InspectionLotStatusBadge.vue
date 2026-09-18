<script setup>
defineProps({
  status: { type: Object, required: true },
  showDot: { type: Boolean, default: false },
})
const SCHEME_MAP = {
  DRAFT: { class: 'tw:bg-gray-100 tw:text-gray-600' },
  OPEN: { class: 'tw:bg-blue-100 tw:text-blue-700' },
  CLOSED: { class: 'tw:bg-emerald-100 tw:text-emerald-700' },
  CANCELLED: { class: 'tw:bg-red-100 tw:text-red-700' },
}
const scheme = (id) => SCHEME_MAP[id] || { class: 'tw:bg-gray-100 tw:text-gray-600' }
</script>

<template>
  <BaseBadge v-bind="$attrs" :class="scheme(status?.id).class" :showDot="showDot">
    {{ status?.name || status?.id || '—' }}
  </BaseBadge>
</template>
