<script setup>
const props = defineProps({
  priorityId: { type: String, default: null },
})

const priority = useLiveQueryWithDeps([() => props.priorityId], async (db, [id]) => {
  if (!id) return null
  return db.ChangeRequestPriority.findByPk(id)
})
</script>

<template>
  <ChangeRequestPriorityBadge v-if="priority" :priority="priority" v-bind="$attrs" />
</template>
