<script setup>
import { required } from '@shared/components/form/validators.js'

const emit = defineEmits(['created'])
const open = defineModel({ type: Boolean, default: false })
const toast = useToast()

const form = ref({ name: '', code: '', description: '' })
const formRef = ref(null)
const saving = ref(false)
const saveError = ref('')
const codeDirty = ref(false)
const codeEditable = ref(false)

const createProductFamily = useLiveMutation(async (db, payload) => {
  const pf = db.ProductFamily.create(payload)
  await pf.save()
  return pf
})

function slugify(text) {
  return (text || '')
    .toString()
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_')
    .toUpperCase()
}

watch(
  () => form.value.name,
  (newName) => {
    if (codeDirty.value) return
    form.value.code = slugify(newName)
  },
)

watch(open, (val) => {
  if (val) {
    form.value = { name: '', code: '', description: '' }
    codeDirty.value = false
    codeEditable.value = false
    saveError.value = ''
  }
})

async function onValidSubmit() {
  saving.value = true
  saveError.value = ''
  try {
    const pf = await createProductFamily({
      code: form.value.code.trim().toUpperCase(),
      name: form.value.name.trim(),
      description: form.value.description?.trim() || null,
    })
    emit('created', pf)
    open.value = false
    toast.success('Product family created')
  } catch (e) {
    saveError.value = e.message || 'Failed to create product family'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <BaseDialog v-model="open" title="Add Product Family" maxWidth="sm">
    <BaseForm ref="formRef" hideFooter @submit="onValidSubmit">
      <div class="tw:flex tw:flex-col tw:gap-4">
        <BaseField label="Name" required :value="form.name" :rules="[required()]">
          <template #default="field">
            <BaseTextInput v-bind="field" v-model="form.name" placeholder="e.g. Skincare" />
          </template>
        </BaseField>

        <BaseField label="Code" required :value="form.code" :rules="[required()]">
          <template #label>
            <span
              >Code <span class="tw:font-normal tw:normal-case tw:ml-1">(auto-derived)</span></span
            >
          </template>
          <template #default="field">
            <div class="tw:flex tw:flex-col tw:gap-1">
              <div class="tw:flex tw:justify-end">
                <button
                  type="button"
                  class="tw:text-caption tw:text-primary tw:hover:underline"
                  @click="codeEditable = !codeEditable"
                >
                  {{ codeEditable ? 'Lock' : 'Edit' }}
                </button>
              </div>
              <BaseTextInput
                v-bind="field"
                v-model="form.code"
                placeholder="SKINCARE"
                :disabled="!codeEditable"
                @input="codeDirty = true"
              />
            </div>
          </template>
        </BaseField>

        <BaseField label="Description" :value="form.description">
          <template #default="field">
            <BaseTextarea
              v-bind="field"
              v-model="form.description"
              :rows="2"
              placeholder="Optional"
            />
          </template>
        </BaseField>
      </div>
    </BaseForm>

    <template #footer="{ close }">
      <BaseDialogFooter
        submitLabel="Add Family"
        :loading="saving"
        :error="saveError"
        @cancel="close"
        @submit="formRef.submit()"
      />
    </template>
  </BaseDialog>
</template>
