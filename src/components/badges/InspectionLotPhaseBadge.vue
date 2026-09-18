<script setup>
/**
 * Object → display for a lot's execution PHASE (the detail the unified parent
 * status no longer carries): Pending → In Progress → Completed → Under
 * Review → Disposed, with Hold as the quarantine parking state. The parent
 * status badge is InspectionLotStatusBadge; the disposition OUTCOME renders
 * via its disposition type.
 */
defineProps({
  phase: { type: Object, required: true },
  showDot: { type: Boolean, default: false },
})

const SCHEME_MAP = {
  PENDING: { class: 'tw:bg-amber-100 tw:text-amber-700' },
  IN_PROGRESS: { class: 'tw:bg-blue-100 tw:text-blue-700' },
  COMPLETED: { class: 'tw:bg-indigo-100 tw:text-indigo-700' },
  UNDER_REVIEW: { class: 'tw:bg-purple-100 tw:text-purple-700' },
  DISPOSED: { class: 'tw:bg-emerald-100 tw:text-emerald-700' },
  HOLD: { class: 'tw:bg-yellow-100 tw:text-yellow-800' },
}

const scheme = (id) => SCHEME_MAP[id] || { class: 'tw:bg-gray-100 tw:text-gray-600' }
</script>

<template>
  <BaseBadge v-bind="$attrs" :class="scheme(phase?.id).class" :showDot="showDot">
    {{ phase?.name || phase?.id || '—' }}
  </BaseBadge>
</template>
