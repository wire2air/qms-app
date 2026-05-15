<script setup>
const props = defineProps({
  priorityId: { type: String, default: null },
})

const priority = useLiveQueryWithDeps([() => props.priorityId], async (db, [priorityId]) => {
  if (!priorityId) return null
  return db.CapaPriority.findByPk(priorityId)
})
</script>

<template>
  <CapaPriorityBadge v-if="priority" :status="priority" v-bind="$attrs" />
</template>
