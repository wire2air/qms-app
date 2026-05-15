<script setup>
defineProps({
  status: { type: Object, required: true },
})

const SCHEME_MAP = {
  PENDING: { class: 'tw:bg-amber-100 tw:text-amber-700' },
  IN_PROGRESS: { class: 'tw:bg-blue-100 tw:text-blue-700' },
  COMPLETED: { class: 'tw:bg-green-100 tw:text-green-700' },
  RENEWED: { class: 'tw:bg-purple-100 tw:text-purple-700' },
  CANCELLED: { class: 'tw:bg-gray-100 tw:text-gray-600' },
}

const scheme = (id) => SCHEME_MAP[id] || { class: 'tw:bg-gray-100 tw:text-gray-600' }
</script>

<template>
  <BaseBadge v-bind="$attrs" :class="scheme(status.id).class">
    {{ status.name || status.id || '—' }}
  </BaseBadge>
</template>
