<script setup>
defineProps({
  status: { type: Object, required: true },
})

const SCHEME_MAP = {
  LOW: { class: 'tw:bg-green-100 tw:text-green-700' },
  MEDIUM: { class: 'tw:bg-blue-100 tw:text-blue-700' },
  HIGH: { class: 'tw:bg-amber-100 tw:text-amber-700' },
  CRITICAL: { class: 'tw:bg-red-100 tw:text-red-700' },
}

const scheme = (id) => SCHEME_MAP[id] || { class: 'tw:bg-gray-100 tw:text-gray-600' }
</script>

<template>
  <BaseBadge v-bind="$attrs" :class="scheme(status.id).class">
    {{ status.name || status.id || '—' }}
  </BaseBadge>
</template>
