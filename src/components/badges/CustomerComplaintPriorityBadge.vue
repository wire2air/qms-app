<script setup>
defineProps({
  priority: {
    type: Object,
    required: true,
  },
})

const SCHEME_MAP = {
  LOW: { class: 'tw:bg-emerald-100 tw:text-emerald-700' },
  MEDIUM: { class: 'tw:bg-amber-100 tw:text-amber-700' },
  HIGH: { class: 'tw:bg-orange-100 tw:text-orange-700' },
  CRITICAL: { class: 'tw:bg-rose-100 tw:text-rose-700' },
}

const scheme = (id) => SCHEME_MAP[id] || { class: 'tw:bg-gray-100 tw:text-gray-600' }
</script>

<template>
  <BaseBadge v-bind="$attrs" :class="scheme(priority.id).class">
    {{ priority.name || priority.id || '—' }}
  </BaseBadge>
</template>
