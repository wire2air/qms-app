<script setup>
defineProps({
  status: { type: Object, required: true },
})

const SCHEME_MAP = {
  DRAFT: { class: 'tw:bg-gray-100 tw:text-gray-700' },
  PENDING: { class: 'tw:bg-amber-100 tw:text-amber-700' },
  REJECTED: { class: 'tw:bg-red-100 tw:text-red-700' },
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
