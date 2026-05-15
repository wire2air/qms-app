<script setup>
defineProps({
  status: { type: Object, required: true },
})

const SCHEME_MAP = {
  CORRECTIVE: { class: 'tw:bg-blue-100 tw:text-blue-700' },
  PREVENTIVE: { class: 'tw:bg-purple-100 tw:text-purple-700' },
  BOTH: { class: 'tw:bg-indigo-100 tw:text-indigo-700' },
}

const scheme = (id) => SCHEME_MAP[id] || { class: 'tw:bg-gray-100 tw:text-gray-600' }
</script>

<template>
  <BaseBadge v-bind="$attrs" :class="scheme(status.id).class">
    {{ status.name || status.id || '—' }}
  </BaseBadge>
</template>
