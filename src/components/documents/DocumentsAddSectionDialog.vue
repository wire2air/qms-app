<script setup>
import { required } from '@shared/components/form/validators.js'
import { IconHeading, IconNotes, IconPaperclip, IconFileText } from '@tabler/icons-vue'

const props = defineProps({
  documentVersionId: {
    type: String,
    required: true,
  },
  documentId: {
    type: String,
    required: true,
  },
  currentSectionCount: {
    type: Number,
    default: 1,
  },
})

const emit = defineEmits(['sectionAdded'])

const open = defineModel({
  type: Boolean,
  default: false,
})

const toast = useToast()

const formRef = ref(null)
const isSubmitting = ref(false)
const saveError = ref('')

// Form state
const newSection = ref({ title: '', sectionType: 'text' })

// Reset form when dialog closes
watch(open, (val) => {
  if (!val) {
    newSection.value = { title: '', sectionType: 'text' }
    saveError.value = ''
  }
})

const createSection = useLiveMutation(async (db) => {
  const section = db.DocumentSection.create({
    documentVersionId: props.documentVersionId,
    documentId: props.documentId,
    title: newSection.value.title,
    sectionType: newSection.value.sectionType,
    // 'textAttachment' needs BOTH initialised — a null half renders as an
    // empty branch the author can't fill.
    content: newSection.value.sectionType === 'attachment' ? null : '',
    attachments: newSection.value.sectionType === 'text' ? null : [],
    order: props.currentSectionCount,
    isAddOn: true,
  })
  await section.save()
  return section
})

async function onSubmit() {
  if (isSubmitting.value) return
  isSubmitting.value = true
  saveError.value = ''
  try {
    const section = await createSection()
    // useLiveMutation surfaces its own error toast and returns undefined on
    // failure — don't claim success (or close the dialog) unless it was created.
    if (!section) return
    toast.success('Section added successfully')
    emit('sectionAdded', section)
    open.value = false
  } catch (err) {
    saveError.value = err?.message || 'Failed to add section'
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <BaseDialog v-model="open" title="Add New Section" maxWidth="sm" persistent>
    <BaseForm ref="formRef" hideFooter @submit="onSubmit">
      <!-- Section Title -->
      <BaseField
        label="Section Title"
        required
        :value="newSection.title"
        :rules="[required('Title is required')]"
      >
        <template #default="field">
          <BaseTextInput v-bind="field" v-model="newSection.title" autofocus>
            <template #icon>
              <IconHeading class="tw:text-secondary" :size="16" />
            </template>
          </BaseTextInput>
        </template>
      </BaseField>

      <!-- Section Type -->
      <BaseField label="Section Type">
        <div class="tw:flex tw:gap-3">
          <button
            type="button"
            class="tw:flex tw:items-center tw:gap-2 tw:flex-1 tw:rounded-lg tw:border tw:px-4 tw:py-3 tw:text-sm tw:font-medium tw:transition-colors"
            :class="
              newSection.sectionType === 'text'
                ? 'tw:border-primary tw:bg-primary/10 tw:text-primary'
                : 'tw:border-divider tw:text-secondary tw:hover:border-primary/50'
            "
            @click="newSection.sectionType = 'text'"
          >
            <IconNotes :size="16" />
            Text Content
          </button>
          <button
            type="button"
            class="tw:flex tw:items-center tw:gap-2 tw:flex-1 tw:rounded-lg tw:border tw:px-4 tw:py-3 tw:text-sm tw:font-medium tw:transition-colors"
            :class="
              newSection.sectionType === 'attachment'
                ? 'tw:border-primary tw:bg-primary/10 tw:text-primary'
                : 'tw:border-divider tw:text-secondary tw:hover:border-primary/50'
            "
            @click="newSection.sectionType = 'attachment'"
          >
            <IconPaperclip :size="16" />
            Attachments
          </button>
          <button
            type="button"
            class="tw:flex tw:items-center tw:gap-2 tw:flex-1 tw:rounded-lg tw:border tw:px-4 tw:py-3 tw:text-sm tw:font-medium tw:transition-colors"
            :class="
              newSection.sectionType === 'textAttachment'
                ? 'tw:border-primary tw:bg-primary/10 tw:text-primary'
                : 'tw:border-divider tw:text-secondary tw:hover:border-primary/50'
            "
            @click="newSection.sectionType = 'textAttachment'"
          >
            <IconFileText :size="16" />
            Text + Attachment
          </button>
        </div>
      </BaseField>
    </BaseForm>

    <template #footer>
      <BaseDialogFooter
        submitLabel="Add Section"
        cancelVariant="text"
        :loading="isSubmitting"
        :error="saveError"
        @cancel="open = false"
        @submit="formRef?.submit()"
      />
    </template>
  </BaseDialog>
</template>
