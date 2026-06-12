<script setup>
// Enum flavor — complaint priority is an id field on the parent row,
// not a DB lookup model.
const props = defineProps({
  priorityId: { type: String, default: null },
})

const PRIORITY_MAP = {
  LOW: { id: 'LOW', name: 'Low' },
  MEDIUM: { id: 'MEDIUM', name: 'Medium' },
  HIGH: { id: 'HIGH', name: 'High' },
  CRITICAL: { id: 'CRITICAL', name: 'Critical' },
}

const priority = computed(
  () =>
    PRIORITY_MAP[props.priorityId] ||
    (props.priorityId ? { id: props.priorityId, name: props.priorityId } : null),
)
</script>

<template>
  <CustomerComplaintPriorityBadge v-if="priority" :priority="priority" v-bind="$attrs" />
</template>
