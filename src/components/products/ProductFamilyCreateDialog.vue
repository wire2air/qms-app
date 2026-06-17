<script setup>
import { post } from '@/api' // Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.

const emit = defineEmits(['created'])
const open = defineModel({ type: Boolean, default: false })
const toast = useToast()

const form = ref({ name: '', code: '', description: '' })
const saving = ref(false)
const codeDirty = ref(false)
const codeEditable = ref(false)

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
  }
})

async function handleSave() {
  if (!form.value.name.trim()) { toast.warning('Name is required'); return }
  if (!form.value.code.trim()) { toast.warning('Code is required'); return }
  saving.value = true
  try {
    const { productFamily } = await post('/v1/services/productFamilies', {
      code: form.value.code.trim().toUpperCase(),
      name: form.value.name.trim(),
      description: form.value.description?.trim() || null,
    })
    emit('created', productFamily)
    open.value = false
    toast.success('Product family created')
  } catch (e) {
    toast.error(e.message || 'Failed to create product family')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <BaseDialog v-model="open" title="Add Product Family" maxWidth="sm">
    <div class="tw:flex tw:flex-col tw:gap-3 tw:p-1">
      <div>
        <p class="tw:text-xs tw:uppercase tw:font-bold tw:text-secondary tw:mb-1">
          Name <span class="tw:text-red-500">*</span>
        </p>
        <BaseTextInput v-model="form.name" placeholder="e.g. Skincare" />
      </div>

      <div>
        <div class="tw:flex tw:items-center tw:justify-between tw:mb-1">
          <p class="tw:text-xs tw:uppercase tw:font-bold tw:text-secondary">
            Code <span class="tw:text-red-500">*</span>
            <span class="tw:font-normal tw:normal-case tw:ml-1">(auto-derived)</span>
          </p>
          <button
            type="button"
            class="tw:text-[11px] tw:text-primary tw:hover:underline"
            @click="codeEditable = !codeEditable"
          >
            {{ codeEditable ? 'Lock' : 'Edit' }}
          </button>
        </div>
        <BaseTextInput
          v-model="form.code"
          placeholder="SKINCARE"
          :disabled="!codeEditable"
          @input="codeDirty = true"
        />
      </div>

      <div>
        <p class="tw:text-xs tw:uppercase tw:font-bold tw:text-secondary tw:mb-1">Description</p>
        <BaseTextarea v-model="form.description" :rows="2" placeholder="Optional" />
      </div>
    </div>

    <template #footer="{ close }">
      <BaseButton variant="outline" :disabled="saving" @click="close">Cancel</BaseButton>
      <BaseButton variant="primary" :loading="saving" :disabled="saving" @click="handleSave">
        Add Family
      </BaseButton>
    </template>
  </BaseDialog>
</template>
