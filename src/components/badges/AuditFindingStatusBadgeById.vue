<script setup>
const props = defineProps({
  statusId: { type: String, default: null },
})

const STATUS_MAP = {
  OPEN: { id: 'OPEN', name: 'Open' },
  IN_REVIEW: { id: 'IN_REVIEW', name: 'In Review' },
  IN_REMEDIATION: { id: 'IN_REMEDIATION', name: 'In Remediation' },
  VERIFIED: { id: 'VERIFIED', name: 'Verified' },
  CLOSED: { id: 'CLOSED', name: 'Closed' },
  CANCELLED: { id: 'CANCELLED', name: 'Cancelled' },
}

const status = computed(
  () =>
    STATUS_MAP[props.statusId] ||
    (props.statusId ? { id: props.statusId, name: props.statusId } : null),
)
</script>

<template>
  <AuditFindingStatusBadge v-if="status" :status="status" v-bind="$attrs" />
</template>
