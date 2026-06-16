<script setup>
const props = defineProps({
  statusId: { type: String, default: null },
  showDot: { type: Boolean, default: false },
  hideLabel: { type: Boolean, default: false },
})

const status = useLiveQueryWithDeps(
  [() => props.statusId],
  async (db, [statusId]) => {
    if (!statusId) return null
    return db.TaskInstanceStatus.findByPk(statusId)
  },
  { models: ['TaskInstanceStatus'] },
)
</script>

<template>
  <TaskInstanceStatusBadge
    v-if="status"
    :status="status"
    :showDot="showDot"
    :hideLabel="hideLabel"
    v-bind="$attrs"
  />
</template>
