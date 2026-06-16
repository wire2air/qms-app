<script setup>
const props = defineProps({
  templateId: { type: String, default: null },
})

const template = useLiveQueryWithDeps(
  [() => props.templateId],
  async (db, [id]) => {
    if (!id) return null
    return db.RiskAssessmentTemplate.findByPk(id)
  },

  {
    models: ['RiskAssessmentTemplate'],
    initial: () => (props.templateId ? { id: props.templateId } : null),
  },
)
</script>

<template>
  <RiskAssessmentTemplateBadge v-if="template" :template="template" v-bind="$attrs" />
</template>
