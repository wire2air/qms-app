<script setup>
const props = defineProps({
  typeId: { type: String, default: null },
})

const type = useLiveQueryWithDeps([() => props.typeId], async (db, [typeId]) => {
  if (!typeId) return null
  return db.CapaType.findByPk(typeId)
})
</script>

<template>
  <CapaTypeBadge v-if="type" :status="type" v-bind="$attrs" />
</template>
