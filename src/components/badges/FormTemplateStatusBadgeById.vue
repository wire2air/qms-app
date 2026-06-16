<script setup>
const props = defineProps({
  statusId: { type: String, default: null },
  showDot: { type: Boolean, default: true },
})

const status = useLiveQueryWithDeps(
  [() => props.statusId],
  async (db, [statusId]) => {
    if (!statusId) return null
    return db.FormStatus.findByPk(statusId)
  },
  { models: ['FormStatus'] },
)
</script>

<template>
  <FormTemplateStatusBadge v-if="status" :status="status" :showDot="showDot" v-bind="$attrs" />
</template>
