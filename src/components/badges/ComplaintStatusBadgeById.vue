<script setup>
// Enum-flavor: the 6 QMS complaint statuses are fixed, so resolve from a static
// map (no ComplaintStatus IDB query needed).
const props = defineProps({
  statusId: { type: String, default: null },
})

const STATUS_MAP = {
  NEW: { id: 'NEW', name: 'New' },
  IN_PROGRESS: { id: 'IN_PROGRESS', name: 'In Progress' },
  UNDER_REVIEW: { id: 'UNDER_REVIEW', name: 'Under Review' },
  RESOLVED: { id: 'RESOLVED', name: 'Resolved' },
  CLOSED: { id: 'CLOSED', name: 'Closed' },
  CONVERTED_TO_NC: { id: 'CONVERTED_TO_NC', name: 'Converted to NC' },
}

const status = computed(
  () => STATUS_MAP[props.statusId] || (props.statusId ? { id: props.statusId, name: props.statusId } : null),
)
</script>

<template>
  <ComplaintStatusBadge v-if="status" :status="status" v-bind="$attrs" />
</template>
