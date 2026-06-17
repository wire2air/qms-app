<script setup>
import { required, helpers } from '@vuelidate/validators'
import { useValidator } from '@shared/composables/validator.js'
import { IconHeading, IconNotes, IconPaperclip } from '@tabler/icons-vue'

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

// Form state
const newSection = ref({ title: '', sectionType: 'text' })

const sectionRules = computed(() => ({
  title: { required: helpers.withMessage('Title is required', required) },
}))

const sectionValidator = useValidator(sectionRules, newSection)

// Reset form when dialog closes
watch(open, (val) => {
  if (!val) {
    newSection.value = { title: '', sectionType: 'text' }
  }
})

async function handleAddSection() {
  const valid = await sectionValidator.value.$validate()
  if (!valid) return

  const create = useLiveMutation(async (db) => {
    const section = db.DocumentSection.create({
      documentVersionId: props.documentVersionId,
      documentId: props.documentId,
      title: newSection.value.title,
      sectionType: newSection.value.sectionType,
      content: newSection.value.sectionType === 'text' ? '' : null,
      attachments: newSection.value.sectionType === 'attachment' ? [] : null,
      order: props.currentSectionCount,
      isAddOn: true,
    })
    await section.save()
    return section
  })

  const section = await create()

  toast.success('Section added successfully')
  emit('sectionAdded', section)
  open.value = false
}
</script>

<template>
  <BaseDialog v-model="open" title="Add New Section" maxWidth="sm" persistent>
    <div class="tw:space-y-4">
      <!-- Section Title -->
      <BaseTextInput
        v-model="newSection.title"
        name="title"
        label="Section Title"
        :errorMsg="
          sectionValidator.title?.$error ? sectionValidator.title.$errors[0]?.$message : ''
        "
        autofocus
      >
        <template #icon>
          <IconHeading class="tw:text-secondary" :size="16" />
        </template>
      </BaseTextInput>

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
        </div>
      </BaseField>
    </div>

    <template #footer="{ close }">
      <div class="tw:flex tw:justify-end tw:gap-2">
        <BaseButton variant="text" @click="close">Cancel</BaseButton>
        <BaseButton variant="primary" @click="handleAddSection">Add Section</BaseButton>
      </div>
    </template>
  </BaseDialog>
</template>
