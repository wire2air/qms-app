<script setup>
const props = defineProps({
  statusId: { type: String, default: null },
  showDot: { type: Boolean, default: true },
})

const status = useLiveQueryWithDeps([() => props.statusId], async (db, [statusId]) => {
  if (!statusId) return null
  return db.DocumentTemplateStatus.findByPk(statusId)
})
</script>

<template>
  <DocumentTemplateStatusBadge
    v-if="status"
    data-testid="document-template-status-badge"
    :status="status"
    :showDot="showDot"
    v-bind="$attrs"
  />
</template>
