<script setup>
const props = defineProps({
  typeId: { type: String, default: null },
})

const type = useLiveQueryWithDeps(
  [() => props.typeId],
  async (db, [typeId]) => {
    if (!typeId) return null
    return db.AssetRequestType.findByPk(typeId)
  },
  { models: ['AssetRequestType'] },
)
</script>

<template>
  <AssetRequestTypeBadge v-if="type" :type="type" v-bind="$attrs" />
</template>
