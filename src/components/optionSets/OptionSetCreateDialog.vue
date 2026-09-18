<script setup>
import { IconChecklist } from '@tabler/icons-vue'
import { required } from '@shared/components/form/validators.js'

const props = defineProps({
  id: {
    type: [String, Number],
    default: null,
  },
})

const emit = defineEmits(['created'])

const open = defineModel({
  type: Boolean,
  default: false,
})

const formRef = ref(null)
const isSubmitting = ref(false)
const saveError = ref('')

const form = ref({
  name: '',
  description: '',
})

const isEdit = computed(() => !!props.id)

// Load existing option set if editing
const optionSet = useLiveQueryWithDeps(
  [() => props.id],
  async (db, [id]) => {
    if (!id) return null
    return db.OptionSet.findByPk(id)
  },
  { models: ['OptionSet'] },
)

// Populate form when option set loads in edit mode
watch(
  optionSet,
  (os) => {
    if (os) {
      form.value = {
        name: os.name,
        description: os.description || '',
      }
    }
  },
  { immediate: true },
)

// Reset form when dialog closes
watch(open, (val) => {
  if (!val) {
    form.value = { name: '', description: '' }
    saveError.value = ''
  }
})

const createOptionSet = useLiveMutation(async (db, data) => {
  const os = db.OptionSet.create(data)
  await os.save()
  return os
})

async function onSubmit() {
  if (isSubmitting.value) return
  isSubmitting.value = true
  saveError.value = ''
  try {
    if (!isEdit.value) {
      const newSet = await createOptionSet({
        name: form.value.name,
        description: form.value.description,
      })
      emit('created', newSet)
    } else {
      optionSet.value.name = form.value.name
      optionSet.value.description = form.value.description
      await optionSet.value.save()
    }
    open.value = false
  } catch (err) {
    saveError.value = err?.message || 'Failed to save option set'
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <BaseDialog v-model="open" maxWidth="md">
    <template #title>
      <div class="tw:flex tw:items-center tw:gap-3">
        <div
          class="tw:w-9 tw:h-9 tw:bg-primary/10 tw:text-primary tw:rounded-xl tw:flex tw:items-center tw:justify-center"
        >
          <IconChecklist class="tw:size-5 tw:text-primary" />
        </div>
        <span>{{ isEdit ? 'Edit Option Set' : 'Create Option Set' }}</span>
      </div>
    </template>

    <BaseForm ref="formRef" hideFooter @submit="onSubmit">
      <div class="tw:text-sm tw:text-secondary tw:leading-relaxed">
        Reusable option sets can be used across multiple forms for dropdowns, checkboxes, and radio
        groups.
      </div>

      <BaseField label="Name" required :value="form.name" :rules="[required('Required')]">
        <template #default="field">
          <BaseTextInput v-bind="field" v-model="form.name" placeholder="e.g., Priority Levels" />
        </template>
      </BaseField>

      <BaseTextarea
        v-model="form.description"
        label="Description"
        placeholder="Briefly describe what these options are for"
        :rows="2"
      />
    </BaseForm>

    <template #footer>
      <BaseDialogFooter
        :submitLabel="isEdit ? 'Update' : 'Create Set'"
        :loading="isSubmitting"
        :error="saveError"
        @cancel="open = false"
        @submit="formRef?.submit()"
      />
    </template>
  </BaseDialog>
</template>
