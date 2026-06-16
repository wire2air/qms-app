<script setup>
const props = defineProps({
  typeId: { type: String, default: null },
})

const type = useLiveQueryWithDeps(
  [() => props.typeId],
  async (db, [typeId]) => {
    if (!typeId) return null
    return db.NcType.findByPk(typeId)
  },
  { models: ['NcType'] },
)
</script>

<template>
  <NcTypeBadge v-if="type" :type="type" v-bind="$attrs" />
</template>
