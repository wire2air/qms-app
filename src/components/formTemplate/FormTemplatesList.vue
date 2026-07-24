<script setup>
defineProps({
  templates: {
    type: Array,
    default: () => [],
  },
  canUpdate: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['archive'])

const showPreviewDialog = ref(false)
const previewTemplate = ref(null)

function handlePreview(template) {
  previewTemplate.value = template
  showPreviewDialog.value = true
}

const previewSchema = computed(() => {
  if (!previewTemplate.value?.schema) return []
  return Array.isArray(previewTemplate.value.schema) ? previewTemplate.value.schema : []
})

const previewTitle = computed(() => {
  if (!previewTemplate.value) return 'Form Preview'
  return `Preview: ${previewTemplate.value.title} (v${previewTemplate.value.version})`
})
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-2">
    <!-- Empty State -->
    <BaseEmptyState v-if="templates.length === 0" title="No templates found" />

    <!-- Template Cards -->
    <FormTemplateListingRow
      v-for="template in templates"
      :key="template.id"
      :template="template"
      :canUpdate="canUpdate"
      @preview="handlePreview"
      @archive="(t) => emit('archive', t)"
    />
  </div>

  <!-- Preview Dialog -->
  <BaseDialog v-model="showPreviewDialog" maxWidth="full">
    <FormTemplatePreview
      :title="previewTitle"
      :schema="previewSchema"
      @submit="showPreviewDialog = false"
      @close="showPreviewDialog = false"
    />
  </BaseDialog>
</template>
