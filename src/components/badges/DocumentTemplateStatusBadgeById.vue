<script setup>
const props = defineProps({
  statusId: { type: String, default: null },
  showDot: { type: Boolean, default: true },
})

const status = useLiveQueryWithDeps(
  [() => props.statusId],
  async (db, [statusId]) => {
    if (!statusId) return null
    return db.DocumentTemplateStatus.findByPk(statusId)
  },
  { models: ['DocumentTemplateStatus'] },
)
</script>

<template>
  <DocumentTemplateStatusBadge v-if="status" :status="status" :showDot="showDot" v-bind="$attrs" />
</template>
