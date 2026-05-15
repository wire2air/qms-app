<script setup>
const props = defineProps({
  statusId: { type: String, default: null },
  showDot: { type: Boolean, default: true },
})

const STATUS_MAP = {
  ASSIGNED: { id: 'ASSIGNED', name: 'Assigned' },
  IN_PROGRESS: { id: 'IN_PROGRESS', name: 'In Progress' },
  COMPLETED: { id: 'COMPLETED', name: 'Pending Verification' },
  VERIFIED: { id: 'VERIFIED', name: 'Verified' },
  RETRAIN_REQUIRED: { id: 'RETRAIN_REQUIRED', name: 'Retraining Required' },
  FAILED: { id: 'FAILED', name: 'Failed' },
  CANCELLED: { id: 'CANCELLED', name: 'Cancelled' },
  REMOVED: { id: 'REMOVED', name: 'Removed' },
}

const status = computed(
  () =>
    STATUS_MAP[props.statusId] ||
    (props.statusId ? { id: props.statusId, name: props.statusId } : null),
)
</script>

<template>
  <TrainingAssigneeStatusBadge v-if="status" :status="status" :showDot="showDot" v-bind="$attrs" />
</template>
