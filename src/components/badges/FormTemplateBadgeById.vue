<script setup>
const props = defineProps({
  formTemplateId: { type: String, default: null },
})

const formTemplate = useLiveQueryWithDeps(
  [() => props.formTemplateId],
  async (db, [id]) => {
    if (!id) return null
    return db.FormTemplate.findByPk(id)
  },

  {
    models: ['FormTemplate'],
    initial: () => (props.formTemplateId ? { id: props.formTemplateId } : null),
  },
)
</script>

<template>
  <FormTemplateBadge v-if="formTemplate" :formTemplate="formTemplate" v-bind="$attrs" />
</template>
