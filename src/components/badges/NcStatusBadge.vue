<script setup>
defineProps({
  status: {
    type: Object,
    required: true,
  },
})

const SCHEME_MAP = {
  DRAFT: { class: 'tw:bg-gray-100 tw:text-gray-600' },
  UNDER_REVIEW: { class: 'tw:bg-blue-100 tw:text-blue-700' },
  CLOSED: { class: 'tw:bg-green-100 tw:text-green-700' },
}

const scheme = (id) => SCHEME_MAP[id] || { class: 'tw:bg-gray-100 tw:text-gray-600' }
</script>

<template>
  <BaseBadge v-bind="$attrs" :class="scheme(status.id).class">
    {{ status.name || status.id || '—' }}
  </BaseBadge>
</template>
