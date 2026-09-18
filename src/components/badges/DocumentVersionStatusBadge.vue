<script setup>
defineProps({
  status: { type: [Object, Function], required: true },
  showDot: { type: Boolean, default: false },
})

const SCHEME_MAP = {
  DRAFT: { class: 'tw:bg-gray-100 tw:text-gray-600' },
  IN_REVIEW: { class: 'tw:bg-blue-100 tw:text-blue-700' },
  APPROVED: { class: 'tw:bg-green-100 tw:text-green-700' },
  REJECTED: { class: 'tw:bg-red-100 tw:text-red-700' },
  CHANGES_REQUESTED: { class: 'tw:bg-orange-100 tw:text-orange-700' },
  // EFFECTIVE is the released, in-force version — the strongest state here, so
  // it gets its own colour rather than sharing APPROVED's green.
  EFFECTIVE: { class: 'tw:bg-emerald-100 tw:text-emerald-700' },
  SUPERSEDED: { class: 'tw:bg-gray-200 tw:text-gray-600' },
  ARCHIVED: { class: 'tw:bg-gray-100 tw:text-gray-500' },
}

const scheme = (id) => SCHEME_MAP[id] || { class: 'tw:bg-gray-100 tw:text-gray-600' }
</script>

<template>
  <BaseBadge v-bind="$attrs" :class="scheme(status?.id).class" :showDot="showDot">
    {{ status?.name || status?.id || '—' }}
  </BaseBadge>
</template>
