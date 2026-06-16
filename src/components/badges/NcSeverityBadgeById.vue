<script setup>
const props = defineProps({
  severityId: { type: String, default: null },
})

const severity = useLiveQueryWithDeps(
  [() => props.severityId],
  async (db, [severityId]) => {
    if (!severityId) return null
    return db.NcSeverity.findByPk(severityId)
  },
  { models: ['NcSeverity'] },
)
</script>

<template>
  <NcSeverityBadge v-if="severity" :status="severity" v-bind="$attrs" />
</template>
