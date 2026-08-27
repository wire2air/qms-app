<script setup>
/**
 * Object → display for an audit's execution PHASE (the detail the unified
 * parent status no longer carries): Scheduled → In Progress → Review →
 * Complete. Meaningful while the audit is OPEN; the parent status badge is
 * AuditInstanceStatusBadge.
 */
defineProps({
  phase: { type: Object, required: true },
  showDot: { type: Boolean, default: false },
})

const SCHEME_MAP = {
  SCHEDULED: { class: 'tw:bg-sky-100 tw:text-sky-700' },
  IN_PROGRESS: { class: 'tw:bg-amber-100 tw:text-amber-700' },
  REVIEW: { class: 'tw:bg-purple-100 tw:text-purple-700' },
  COMPLETE: { class: 'tw:bg-emerald-100 tw:text-emerald-700' },
}

const scheme = (id) => SCHEME_MAP[id] || { class: 'tw:bg-gray-100 tw:text-gray-600' }
</script>

<template>
  <BaseBadge v-bind="$attrs" :class="scheme(phase?.id).class" :showDot="showDot">
    {{ phase?.name || phase?.id || '—' }}
  </BaseBadge>
</template>
