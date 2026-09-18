<script setup>
const props = defineProps({
  recordId: {
    type: String,
    required: true,
  },
})

const emit = defineEmits(['close'])

const record = useLiveQueryWithDeps(
  [() => props.recordId],
  async (db, [id]) => db.Record.findByPk(id),
  { models: ['Record'] },
)

const template = useLiveQueryWithDeps(
  [() => record.value?.templateId],

  async (db, [templateId]) => {
    if (!templateId) return null
    return db.FormTemplate.findByPk(templateId)
  },
  { models: ['FormTemplate'] },
)

const loading = computed(() => record.value === undefined || template.value === undefined)

const recordTitle = computed(() => {
  if (!record.value) return 'Record Preview'
  return `${template.value?.title || 'Record'} - ${record.value.recordNumber}`
})

const schema = computed(() => template.value?.schema || [])

const payload = computed(() => record.value?.payload || {})

function handleClose() {
  emit('close')
}
</script>

<template>
  <div class="tw:w-full tw:h-full tw:bg-sidebar">
    <FormTemplatePreview
      :schema="schema"
      :modelValue="payload"
      :title="recordTitle"
      :loading="loading"
      readonly
      maxWidth="4xl"
      @close="handleClose"
    />
  </div>
</template>

<style lang="scss" scoped>
// Removed custom style as overflow and width are handled by parent components/Tailwind
</style>
