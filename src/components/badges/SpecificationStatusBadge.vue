<script setup>
defineProps({ status: { type: Object, required: true } })
const SCHEME_MAP = {
  DRAFT: { class: 'tw:bg-amber-100 tw:text-amber-700' },
  EFFECTIVE: { class: 'tw:bg-green-100 tw:text-green-700' },
  SUPERSEDED: { class: 'tw:bg-gray-200 tw:text-gray-600' },
}
const scheme = (id) => SCHEME_MAP[id] || { class: 'tw:bg-gray-100 tw:text-gray-600' }
</script>

<template>
  <BaseBadge v-bind="$attrs" :class="scheme(status?.id).class">
    {{ status?.name || status?.id || '—' }}
  </BaseBadge>
</template>
