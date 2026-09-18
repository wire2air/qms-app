<script setup>
const props = defineProps({
  statusId: { type: String, default: null },
})

const status = useLiveQueryWithDeps(
  [() => props.statusId],
  async (db, [statusId]) => {
    if (!statusId) return null
    return db.CapaEffectivenessCheckStatus.findByPk(statusId)
  },
  { models: ['CapaEffectivenessCheckStatus'] },
)
</script>

<template>
  <CapaEffectivenessCheckStatusBadge v-if="status" :status="status" v-bind="$attrs" />
</template>
