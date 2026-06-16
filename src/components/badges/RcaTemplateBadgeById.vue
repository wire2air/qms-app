<script setup>
const props = defineProps({
  templateId: { type: String, default: null },
})

const template = useLiveQueryWithDeps(
  [() => props.templateId],
  async (db, [id]) => {
    if (!id) return null
    return db.RcaTemplate.findByPk(id)
  },

  { models: ['RcaTemplate'], initial: () => (props.templateId ? { id: props.templateId } : null) },
)
</script>

<template>
  <RcaTemplateBadge v-if="template" :template="template" v-bind="$attrs" />
</template>
