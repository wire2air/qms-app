<script setup>
const props = defineProps({
  statusId: { type: String, default: null },
  showDot: { type: Boolean, default: false },
})

const status = useLiveQueryWithDeps(
  [() => props.statusId],
  async (db, [statusId]) => {
    if (!statusId) return null
    return db.WorkflowInstanceStatus.findByPk(statusId)
  },
  { models: ['WorkflowInstanceStatus'] },
)
</script>

<template>
  <WorkflowInstanceStatusBadge v-if="status" :status="status" :showDot="showDot" v-bind="$attrs" />
</template>
