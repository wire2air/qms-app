<script setup>
const props = defineProps({
  statusId: { type: String, default: undefined },
  showDot: { type: Boolean, default: false },
  hideLabel: { type: Boolean, default: false },
})

const status = useLiveQueryWithDeps(
  [() => props.statusId],
  async (db, [statusId]) => {
    if (!statusId) return null
    return db.WorkflowInstanceStepStatus.findByPk(statusId)
  },
  { models: ['WorkflowInstanceStepStatus'] },
)
</script>

<template>
  <WorkflowInstanceStepStatusBadge
    v-if="status"
    :status="status"
    :showDot="showDot"
    :hideLabel="hideLabel"
    v-bind="$attrs"
  />
</template>
