<script setup>
/**
 * Id → AuditRequirementResultBadge. Enum lookup (audit_finding_results
 * is BE-static — no SyncEngine model). STATUS_MAP carries the display
 * labels; SCHEME_MAP (styling only) lives in the underlying badge.
 */
const props = defineProps({
  resultId: { type: String, default: null },
})

const STATUS_MAP = {
  CONFORMING: { id: 'CONFORMING', name: 'Conforming' },
  MINOR_NC: { id: 'MINOR_NC', name: 'Minor NC' },
  MAJOR_NC: { id: 'MAJOR_NC', name: 'Major NC' },
  OBSERVATION: { id: 'OBSERVATION', name: 'Observation' },
  OFI: { id: 'OFI', name: 'OFI' },
  NA: { id: 'NA', name: 'N/A' },
}

const result = computed(
  () =>
    STATUS_MAP[props.resultId] ||
    (props.resultId ? { id: props.resultId, name: props.resultId } : null),
)
</script>

<template>
  <AuditRequirementResultBadge v-if="result" :result="result" v-bind="$attrs" />
</template>
