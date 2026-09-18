<script setup>
const props = defineProps({
  statusId: { type: String, default: null },
  showDot: { type: Boolean, default: true },
})

const status = useLiveQueryWithDeps(
  [() => props.statusId],
  async (db, [statusId]) => {
    if (!statusId) return null
    return db.SupplierStatus.findByPk(statusId)
  },
  { models: ['SupplierStatus'] },
)
</script>

<template>
  <SupplierStatusBadge v-if="status" :status="status" :showDot="showDot" v-bind="$attrs" />
</template>
