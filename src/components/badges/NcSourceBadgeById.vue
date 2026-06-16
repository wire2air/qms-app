<script setup>
const props = defineProps({
  sourceId: { type: String, default: null },
})

const source = useLiveQueryWithDeps(
  [() => props.sourceId],
  async (db, [sourceId]) => {
    if (!sourceId) return null
    return db.NcSource.findByPk(sourceId)
  },
  { models: ['NcSource'] },
)
</script>

<template>
  <NcSourceBadge v-if="source" :source="source" v-bind="$attrs" />
</template>
