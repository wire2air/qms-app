<script setup>
const props = defineProps({
  sourceId: { type: String, default: null },
})

const source = useLiveQueryWithDeps([() => props.sourceId], async (db, [sourceId]) => {
  if (!sourceId) return null
  return db.CapaSource.findByPk(sourceId)
})
</script>

<template>
  <CapaSourceBadge v-if="source" :status="source" v-bind="$attrs" />
</template>
