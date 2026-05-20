<script setup>
const props = defineProps({
  documentId: { type: String, default: null },
})

const document = useLiveQueryWithDeps(
  [() => props.documentId],
  async (db, [documentId]) => {
    if (!documentId) return null
    return db.Document.findByPk(documentId)
  },
  { initial: null },
)
</script>

<template>
  <DocumentBadge v-if="document" :document="document" v-bind="$attrs" />
</template>
