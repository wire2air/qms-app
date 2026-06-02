<script setup>
const props = defineProps({
  priorityId: { type: String, default: null },
})

const priority = useLiveQueryWithDeps([() => props.priorityId], async (db, [priorityId]) => {
  if (!priorityId) return null
  return db.CustomerComplaintPriority.findByPk(priorityId)
})
</script>

<template>
  <CustomerComplaintPriorityBadge v-if="priority" :priority="priority" v-bind="$attrs" />
</template>
