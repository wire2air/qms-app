<script setup>
defineProps({
  status: { type: Object, required: true },
  showDot: { type: Boolean, default: true },
})

const SCHEME_MAP = {
  ACTIVE: { class: 'tw:bg-blue-100 tw:text-blue-700' },
  PENDING_VERIFICATION: { class: 'tw:bg-amber-100 tw:text-amber-700' },
  COMPLETED: { class: 'tw:bg-green-100 tw:text-green-700' },
  CANCELLED: { class: 'tw:bg-gray-100 tw:text-gray-600' },
}

const scheme = (id) => SCHEME_MAP[id] || { class: 'tw:bg-gray-100 tw:text-gray-600' }
</script>

<template>
  <BaseBadge v-bind="$attrs" :class="scheme(status.id).class" :showDot="showDot">
    {{ status.name || status.id || '—' }}
  </BaseBadge>
</template>
