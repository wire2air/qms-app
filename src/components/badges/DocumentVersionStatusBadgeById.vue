<script setup>
const props = defineProps({
  statusId: { type: String, default: null },
  showDot: { type: Boolean, default: false },
})

const status = useLiveQueryWithDeps(
  [() => props.statusId],
  async (db, [statusId]) => {
    if (!statusId) return null
    return db.DocumentVersionStatus.findByPk(statusId)
  },

  {
    models: ['DocumentVersionStatus'],
    initial: () => (props.statusId ? { id: props.statusId } : null),
  },
)
</script>

<template>
  <DocumentVersionStatusBadge v-if="status" :status="status" :showDot="showDot" v-bind="$attrs" />
</template>
