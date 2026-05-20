<script setup>
defineProps({
  status: { type: Object, required: true },
  showDot: { type: Boolean, default: true },
})

const SCHEME_MAP = {
  DRAFT: { class: 'tw:bg-gray-100 tw:text-gray-600' },
  ACTIVE: { class: 'tw:bg-green-100 tw:text-green-700' },
  ARCHIVED: { class: 'tw:bg-amber-100 tw:text-amber-700' },
}

const scheme = (id) => SCHEME_MAP[id] || { class: 'tw:bg-gray-100 tw:text-gray-600' }
</script>

<template>
  <BaseBadge v-bind="$attrs" :class="scheme(status.id).class" :showDot="showDot">
    {{ status.name || status.id || '—' }}
  </BaseBadge>
</template>
