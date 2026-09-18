<script setup>
const props = defineProps({
  standardTypeId: { type: String, default: null },
})

const standardType = useLiveQueryWithDeps(
  [() => props.standardTypeId],
  async (db, [id]) => {
    if (!id) return null
    return db.AuditStandardType.findByPk(id)
  },

  { models: ['AuditStandardType'], initial: null },
)
</script>

<template>
  <AuditStandardTypeBadge v-if="standardType" :standardType="standardType" v-bind="$attrs" />
</template>
