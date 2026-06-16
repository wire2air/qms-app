<script setup>
const props = defineProps({
  documentTemplateId: {
    type: String,
    default: null,
  },
})

const documentTemplate = useLiveQueryWithDeps(
  [() => props.documentTemplateId],
  async (db, [documentTemplateId]) => {
    if (!documentTemplateId) return null
    return db.DocumentTemplate.findByPk(documentTemplateId)
  },

  { models: ['DocumentTemplate'], initial: null },
)
</script>

<template>
  <DocumentTemplateBadge v-if="documentTemplate" :documentTemplate="documentTemplate" />
</template>
