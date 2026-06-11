<script setup>
const props = defineProps({
  statusId: { type: String, default: null },
})

const status = useLiveQueryWithDeps(
  [() => props.statusId],
  async (db, [statusId]) => {
    if (!statusId) return null
    return db.CustomerComplaintStatus.findByPk(statusId)
  },
  { initial: () => (props.statusId ? { id: props.statusId } : null) },
)
</script>

<template>
  <CustomerComplaintStatusBadge v-if="status" :status="status" v-bind="$attrs" />
</template>
