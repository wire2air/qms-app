<script setup>
/**
 * Status chip for a LogBookVersion. The status is a plain enum on the
 * row (not an IDB-resolved entity), so this is a single self-contained
 * badge taking `statusId` directly — SCHEME_MAP holds the per-status
 * styling, LABEL_MAP the display text.
 */
const props = defineProps({
  statusId: { type: String, default: null },
  showDot: { type: Boolean, default: false },
})

const SCHEME_MAP = {
  DRAFT: { class: 'tw:bg-gray-100 tw:text-gray-600' },
  UNDER_REVIEW: { class: 'tw:bg-amber-100 tw:text-amber-700' },
  EFFECTIVE: { class: 'tw:bg-green-100 tw:text-green-700' },
  REJECTED: { class: 'tw:bg-red-100 tw:text-red-700' },
  SUPERSEDED: { class: 'tw:bg-gray-100 tw:text-gray-400' },
}
const LABEL_MAP = {
  DRAFT: 'Draft',
  UNDER_REVIEW: 'Under review',
  EFFECTIVE: 'Effective',
  REJECTED: 'Rejected',
  SUPERSEDED: 'Superseded',
}

const scheme = computed(() => SCHEME_MAP[props.statusId] || { class: 'tw:bg-gray-100 tw:text-gray-600' })
const label = computed(() => LABEL_MAP[props.statusId] || props.statusId || '—')
</script>

<template>
  <BaseBadge v-bind="$attrs" :class="scheme.class" :showDot="showDot">{{ label }}</BaseBadge>
</template>
