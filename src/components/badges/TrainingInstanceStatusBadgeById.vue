<script setup>
const props = defineProps({
  statusId: { type: String, default: null },
  showDot: { type: Boolean, default: true },
})

const STATUS_MAP = {
  ACTIVE: { id: 'ACTIVE', name: 'Active' },
  PENDING_VERIFICATION: { id: 'PENDING_VERIFICATION', name: 'Pending Verification' },
  COMPLETED: { id: 'COMPLETED', name: 'Completed' },
  CANCELLED: { id: 'CANCELLED', name: 'Cancelled' },
}

const status = computed(
  () =>
    STATUS_MAP[props.statusId] ||
    (props.statusId ? { id: props.statusId, name: props.statusId } : null),
)
</script>

<template>
  <TrainingInstanceStatusBadge v-if="status" :status="status" :showDot="showDot" v-bind="$attrs" />
</template>
