<script setup>
const props = defineProps({
  changeTypeId: { type: String, default: null },
})

const changeType = useLiveQueryWithDeps([() => props.changeTypeId], async (db, [id]) => {
  if (!id) return null
  return db.ChangeType.findByPk(id)
})
</script>

<template>
  <ChangeTypeBadge v-if="changeType" :changeType="changeType" v-bind="$attrs" />
</template>
