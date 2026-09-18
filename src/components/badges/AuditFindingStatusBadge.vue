<script setup>
/**
 * Finding lifecycle status chip — OPEN / IN_REVIEW / IN_REMEDIATION /
 * VERIFIED / CLOSED / CANCELLED. Static enum (audit_finding_statuses
 * is BE-fixed).
 */
defineProps({
  status: { type: Object, required: true },
  showDot: { type: Boolean, default: false },
})

const SCHEME_MAP = {
  OPEN: { class: 'tw:bg-amber-100 tw:text-amber-700' },
  IN_REVIEW: { class: 'tw:bg-blue-100 tw:text-blue-700' },
  IN_REMEDIATION: { class: 'tw:bg-purple-100 tw:text-purple-700' },
  VERIFIED: { class: 'tw:bg-green-100 tw:text-green-700' },
  CLOSED: { class: 'tw:bg-emerald-100 tw:text-emerald-700' },
  CANCELLED: { class: 'tw:bg-red-100 tw:text-red-700' },
}
const scheme = (id) => SCHEME_MAP[id] || { class: 'tw:bg-gray-100 tw:text-gray-600' }
</script>

<template>
  <BaseBadge v-bind="$attrs" :class="scheme(status?.id).class" :showDot="showDot">
    {{ status?.name || status?.id || '—' }}
  </BaseBadge>
</template>
