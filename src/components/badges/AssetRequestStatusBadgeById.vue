<script setup>
const props = defineProps({
  statusId: { type: String, default: null },
  showDot: { type: Boolean, default: true },
})

const status = useLiveQueryWithDeps(
  [() => props.statusId],
  async (db, [statusId]) => {
    if (!statusId) return null
    return db.AssetRequestStatus.findByPk(statusId)
  },
  { models: ['AssetRequestStatus'] },
)
</script>

<template>
  <AssetRequestStatusBadge v-if="status" :status="status" :showDot="showDot" v-bind="$attrs" />
</template>
