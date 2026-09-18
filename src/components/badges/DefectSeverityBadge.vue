<script setup>
defineProps({
  status: { type: Object, required: true },
})

// Z1.4 defect classes.
const SCHEME_MAP = {
  MINOR: { class: 'tw:bg-green-100 tw:text-green-700' },
  MAJOR: { class: 'tw:bg-amber-100 tw:text-amber-700' },
  CRITICAL: { class: 'tw:bg-red-100 tw:text-red-700' },
}
const scheme = (id) => SCHEME_MAP[id] || { class: 'tw:bg-gray-100 tw:text-gray-600' }
</script>

<template>
  <BaseBadge v-bind="$attrs" :class="scheme(status?.id).class">
    {{ status?.name || status?.id || '—' }}
  </BaseBadge>
</template>
