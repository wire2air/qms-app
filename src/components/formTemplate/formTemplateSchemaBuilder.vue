<script setup>
import { IconEdit, IconFileDescription } from '@tabler/icons-vue'

const props = defineProps({
  id: {
    type: String,
    required: true,
  },
})

const toast = useToast()
const router = useRouter()

const template = useLiveQueryWithDeps(
  [() => props.id],
  async (db, [id]) => {
    if (!id) return null
    return db.FormTemplate.findByPk(id)
  },
  { models: ['FormTemplate'] },
)

const loading = computed(() => template.value === undefined)
const isSaving = ref(false)

const isEditingTitle = ref(false)
const editTitleValue = ref('')

async function saveSchema(schemaData) {
  if (!template.value) return
  isSaving.value = true
  try {
    template.value.schema = schemaData
    await template.value.save()
    toast.success('Form template saved successfully')
    handleCancel()
  } catch (e) {
    console.error('Error saving form template:', e)
    toast.error('Failed to save template')
  } finally {
    isSaving.value = false
  }
}

function handleCancel() {
  router.push({
    path: router.currentRoute.value.path,
    query: { ...router.currentRoute.value.query, mode: undefined },
  })
}

const initialSchema = computed(() => {
  if (!template.value?.schema) return []
  return Array.isArray(template.value.schema) ? template.value.schema : []
})

const builderTitle = computed(() => {
  if (!template.value) return 'Schema Builder'
  return `Edit Schema: ${template.value.title}`
})

function startEditTitle() {
  if (!template.value) return
  editTitleValue.value = template.value.title
  isEditingTitle.value = true
}

async function saveTitle() {
  if (!isEditingTitle.value || !template.value) return
  template.value.title = editTitleValue.value
  try {
    await template.value.save()
  } catch {
    toast.error('Failed to update title')
  }
  cancelEditTitle()
}

function cancelEditTitle() {
  isEditingTitle.value = false
  editTitleValue.value = ''
}
</script>

<template>
  <div class="tw:relative tw:h-full">
    <!-- Loading State -->
    <div
      v-if="loading"
      class="tw:flex tw:flex-col tw:items-center tw:justify-center tw:h-full tw:p-5"
    >
      <BaseSpinner size="lg" />
      <div class="tw:text-sm tw:text-secondary tw:mt-3">Loading template...</div>
    </div>

    <!-- Form Builder -->
    <template v-else-if="template">
      <!-- showReporting DORMANT 2026-08-28: the per-field "Report on this
           field" toggle (analytics projection) confused authors next to the
           Configure View flow that owns the record-list columns. Machinery
           intact — flip to true to resurface metric authoring. -->
      <FormBuilder
        :title="builderTitle"
        :initialSchema="initialSchema"
        :showScoring="!!template.isModule"
        :showReporting="false"
        @save="saveSchema"
      >
        <template #title>
          <div
            v-if="isEditingTitle"
            class="tw:flex tw:flex-nowrap tw:items-center tw:gap-2 tw:max-w-100"
          >
            <BaseTextInput
              v-model="editTitleValue"
              autofocus
              size="sm"
              @keyup.enter="saveTitle"
              @keyup.esc="cancelEditTitle"
              @blur="saveTitle"
            />
          </div>
          <BaseClickableRow
            v-else
            class="tw:flex tw:items-center tw:gap-2 tw:hover:text-primary tw:transition-colors"
            aria-label="Edit schema title"
            @click="startEditTitle"
          >
            <span class="tw:text-secondary">Edit Schema:</span>
            <span class="tw:font-bold">{{ template.title }}</span>
            <IconEdit :size="14" class="tw:text-secondary" />
          </BaseClickableRow>
        </template>
      </FormBuilder>

      <!-- Saving Overlay -->
      <div
        v-if="isSaving"
        class="tw:absolute tw:inset-0 tw:bg-main/60 tw:flex tw:flex-col tw:items-center tw:justify-center tw:z-raised"
      >
        <BaseSpinner size="lg" />
        <div class="tw:text-sm tw:text-secondary tw:mt-4">Saving...</div>
      </div>
    </template>

    <!-- Empty State -->
    <div v-else class="tw:flex tw:flex-col tw:items-center tw:justify-center tw:h-full tw:p-5">
      <IconFileDescription :size="48" class="tw:text-secondary/40" />
      <div class="tw:text-base tw:text-secondary tw:mt-4">No template selected</div>
    </div>
  </div>
</template>
