<script setup>
/**
 * Enum-pattern resolver for audit execution phases (no DB model — a fixed
 * vocabulary on audit_instances.execution_phase since the 2026-08-28 status
 * unification). Unknown values render verbatim rather than blank.
 */
const props = defineProps({
  phase: { type: String, default: null },
  showDot: { type: Boolean, default: false },
})

const PHASE_MAP = {
  SCHEDULED: { id: 'SCHEDULED', name: 'Scheduled' },
  IN_PROGRESS: { id: 'IN_PROGRESS', name: 'In Progress' },
  REVIEW: { id: 'REVIEW', name: 'In Review' },
  COMPLETE: { id: 'COMPLETE', name: 'Complete' },
}

const resolved = computed(
  () => PHASE_MAP[props.phase] || (props.phase ? { id: props.phase, name: props.phase } : null),
)
</script>

<template>
  <AuditPhaseBadge v-if="resolved" :phase="resolved" :showDot="showDot" v-bind="$attrs" />
</template>
