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

const SCHEME_MAP = {
  APPROVED: { class: 'tw:bg-green-100 tw:text-green-700', dot: 'tw:bg-green-600' },
  PENDING: { class: 'tw:bg-amber-100 tw:text-amber-700', dot: 'tw:bg-amber-600' },
  REJECTED: { class: 'tw:bg-red-100 tw:text-red-700', dot: 'tw:bg-red-600' },
  BLOCKED: { class: 'tw:bg-gray-100 tw:text-gray-600', dot: 'tw:bg-gray-500' },
}

const scheme = (id) =>
  SCHEME_MAP[id] || { class: 'tw:bg-gray-100 tw:text-gray-600', dot: 'tw:bg-gray-500' }
</script>

<template>
  <BaseBadge v-bind="$attrs" :class="scheme(status.id).class" :showDot="showDot">
    {{ status.name || status.id || '—' }}
  </BaseBadge>
</template>
