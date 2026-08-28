<script setup>
/**
 * Enum-pattern resolver for lot execution phases (fixed vocabulary on
 * inspection_lots.inspection_phase since the 2026-08-28 unification).
 */
const props = defineProps({
  phase: { type: String, default: null },
  showDot: { type: Boolean, default: false },
})

const PHASE_MAP = {
  PENDING: { id: 'PENDING', name: 'Pending' },
  IN_PROGRESS: { id: 'IN_PROGRESS', name: 'In Progress' },
  COMPLETED: { id: 'COMPLETED', name: 'Completed' },
  UNDER_REVIEW: { id: 'UNDER_REVIEW', name: 'Under Review' },
  DISPOSED: { id: 'DISPOSED', name: 'Disposed' },
  HOLD: { id: 'HOLD', name: 'On Hold' },
}

const resolved = computed(
  () => PHASE_MAP[props.phase] || (props.phase ? { id: props.phase, name: props.phase } : null),
)
</script>

<template>
  <InspectionLotPhaseBadge v-if="resolved" :phase="resolved" :showDot="showDot" v-bind="$attrs" />
</template>
