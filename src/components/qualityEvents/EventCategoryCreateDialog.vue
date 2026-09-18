<script setup>
/**
 * Quick inline "add event category" — reached from the "+ Add New Category"
 * footer of EventCategorySelectMenu so a user can create a category without
 * leaving the form they're on. Full management (edit/color/order/deactivate)
 * still lives in Lookups → Event Categories.
 */
import { post } from '@/api' // Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.

const emit = defineEmits(['created'])
const show = defineModel({ type: Boolean, default: false })
const toast = useToast()

const name = ref('')
const nameError = ref('')
const color = ref('#64748b')
const saving = ref(false)

function slugify(text) {
  return (text || '')
    .toString()
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_')
    .toUpperCase()
}

async function submit() {
  const trimmed = name.value.trim()
  if (!trimmed) {
    nameError.value = 'Name is required'
    return
  }
  saving.value = true
  try {
    const res = await post('/v1/services/eventCategories', {
      code: slugify(trimmed),
      name: trimmed,
      description: null,
      color: color.value || null,
      displayOrder: 1000,
    })
    toast.success('Category created')
    emit('created', res?.eventCategory ?? res)
    show.value = false
    name.value = ''
    color.value = '#64748b'
  } catch (e) {
    toast.error(e.message || 'Failed to create category')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <BaseDialog v-model="show" title="New event category" maxWidth="sm">
    <div class="tw:flex tw:flex-col tw:gap-3">
      <div class="tw:flex tw:flex-col tw:gap-1">
        <BaseText as="div" variant="overline">Name</BaseText>
        <BaseTextInput
          v-model="name"
          placeholder="e.g. Process Deviation"
          autofocus
          @input="nameError = ''"
          @keyup.enter="submit"
        />
        <p v-if="nameError" class="tw:text-xs tw:text-bad">{{ nameError }}</p>
      </div>
      <div class="tw:flex tw:flex-col tw:gap-1">
        <BaseText as="div" variant="overline">Color</BaseText>
        <BaseColorPicker v-model="color" />
      </div>
    </div>
    <template #footer="{ close }">
      <BaseDialogFooter
        submitLabel="Create"
        :loading="saving"
        :disabled="!name.trim()"
        @cancel="close"
        @submit="submit"
      />
    </template>
  </BaseDialog>
</template>
