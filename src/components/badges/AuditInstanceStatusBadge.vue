<script setup>
/**
 * Object → display. Global-enum status, so SCHEME_MAP holds styling
 * keyed by the stable status id. Status text comes from the object's
 * `name` (or falls back to the id).
 *
 * Used by AuditInstanceStatusBadgeById (which resolves status from a
 * static STATUS_MAP — see qms-app/CLAUDE.md "Enum pattern").
 */
defineProps({
  status: { type: Object, required: true },
  showDot: { type: Boolean, default: false },
})

const SCHEME_MAP = {
  DRAFT:       { class: 'tw:bg-gray-100 tw:text-gray-700' },
  SCHEDULED:   { class: 'tw:bg-blue-100 tw:text-blue-700' },
  IN_PROGRESS: { class: 'tw:bg-amber-100 tw:text-amber-700' },
  REVIEW:      { class: 'tw:bg-purple-100 tw:text-purple-700' },
  REJECTED:    { class: 'tw:bg-red-100 tw:text-red-700' },
  COMPLETED:   { class: 'tw:bg-green-100 tw:text-green-700' },
  CLOSED:      { class: 'tw:bg-emerald-100 tw:text-emerald-700' },
  CANCELLED:   { class: 'tw:bg-red-100 tw:text-red-700' },
}

const scheme = (id) => SCHEME_MAP[id] || { class: 'tw:bg-gray-100 tw:text-gray-600' }
</script>

<template>
  <BaseBadge v-bind="$attrs" :class="scheme(status?.id).class" :showDot="showDot">
    {{ status?.name || status?.id || '—' }}
  </BaseBadge>
</template>
