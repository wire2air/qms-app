<script setup>
defineProps({ status: { type: Object, required: true } })
const SCHEME_MAP = {
  PASS: { class: 'tw:bg-green-100 tw:text-green-700' },
  FAIL: { class: 'tw:bg-red-100 tw:text-red-700' },
  NA: { class: 'tw:bg-gray-100 tw:text-gray-500' },
}
const scheme = (id) => SCHEME_MAP[id] || { class: 'tw:bg-gray-100 tw:text-gray-600' }
</script>

<template>
  <BaseBadge v-bind="$attrs" :class="scheme(status?.id).class">
    {{ status?.name || status?.id || '—' }}
  </BaseBadge>
</template>
