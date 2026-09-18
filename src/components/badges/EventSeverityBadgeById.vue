<script setup>
const props = defineProps({
  severityId: { type: String, default: null },
  showDot: { type: Boolean, default: false },
})

const severity = useLiveQueryWithDeps(
  [() => props.severityId],
  async (db, [severityId]) => {
    if (!severityId) return null
    return db.EventSeverity.findByPk(severityId)
  },
  { models: ['EventSeverity'], initial: null },
)
</script>

<template>
  <EventSeverityBadge v-if="severity" :severity="severity" :showDot="showDot" v-bind="$attrs" />
</template>
