<script setup>
const props = defineProps({ statusId: { type: String, default: null } })
const STATUS_MAP = {
  DRAFT: { id: 'DRAFT', name: 'Draft' },
  PENDING: { id: 'PENDING', name: 'Pending' },
  IN_PROGRESS: { id: 'IN_PROGRESS', name: 'In Progress' },
  COMPLETED: { id: 'COMPLETED', name: 'Completed' },
  UNDER_REVIEW: { id: 'UNDER_REVIEW', name: 'Under Review' },
  // Terminal disposition outcomes
  RELEASED: { id: 'RELEASED', name: 'Released' },
  USE_AS_IS: { id: 'USE_AS_IS', name: 'Use as-is' },
  REGRADE: { id: 'REGRADE', name: 'Regrade' },
  REWORK: { id: 'REWORK', name: 'Rework' },
  RETURN_TO_SUPPLIER: { id: 'RETURN_TO_SUPPLIER', name: 'Return to Supplier' },
  REJECTED: { id: 'REJECTED', name: 'Rejected' },
  HOLD: { id: 'HOLD', name: 'On Hold' },
  APPROVED: { id: 'APPROVED', name: 'Approved' },
  CLOSED: { id: 'CLOSED', name: 'Closed' },
}
const status = computed(
  () => STATUS_MAP[props.statusId] || (props.statusId ? { id: props.statusId, name: props.statusId } : null),
)
</script>

<template>
  <InspectionLotStatusBadge v-if="status" :status="status" v-bind="$attrs" />
</template>
