<script setup>
const props = defineProps({ statusId: { type: String, default: null } })
const STATUS_MAP = {
  DRAFT: { id: 'DRAFT', name: 'Draft' },
  PENDING: { id: 'PENDING', name: 'Pending' },
  IN_PROGRESS: { id: 'IN_PROGRESS', name: 'In Progress' },
  COMPLETED: { id: 'COMPLETED', name: 'Completed' },
  UNDER_REVIEW: { id: 'UNDER_REVIEW', name: 'Under Review' },
  APPROVED: { id: 'APPROVED', name: 'Approved' },
  REJECTED: { id: 'REJECTED', name: 'Rejected' },
  CLOSED: { id: 'CLOSED', name: 'Closed' },
}
const status = computed(
  () => STATUS_MAP[props.statusId] || (props.statusId ? { id: props.statusId, name: props.statusId } : null),
)
</script>

<template>
  <InspectionLotStatusBadge v-if="status" :status="status" v-bind="$attrs" />
</template>
