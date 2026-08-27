<script setup>
/**
 * Quick inline "add event severity" — reached from the "+ Add New Severity"
 * footer of EventSeveritySelectMenu. Full management (rank/color/order) lives in
 * Lookups → Event Severities; new severities get a default rank you can refine
 * there.
 */
import { post } from '@/api' // Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.

const emit = defineEmits(['created'])
const show = defineModel({ type: Boolean, default: false })
const toast = useToast()

const name = ref('')
const nameError = ref('')
const color = ref('#f59e0b')
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
    const res = await post('/v1/services/eventSeverities', {
      code: slugify(trimmed),
      name: trimmed,
      description: null,
      color: color.value || null,
      rank: 100,
      displayOrder: 1000,
    })
    toast.success('Severity created')
    emit('created', res?.eventSeverity ?? res)
    show.value = false
    name.value = ''
    color.value = '#f59e0b'
  } catch (e) {
    toast.error(e.message || 'Failed to create severity')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <BaseDialog v-model="show" title="New event severity" maxWidth="sm">
    <div class="tw:flex tw:flex-col tw:gap-3">
      <div class="tw:flex tw:flex-col tw:gap-1">
        <BaseText as="div" variant="overline">Name</BaseText>
        <BaseTextInput v-model="name" placeholder="e.g. Critical" autofocus @input="nameError = ''" @keyup.enter="submit" />
        <p v-if="nameError" class="tw:text-xs tw:text-bad">{{ nameError }}</p>
      </div>
      <div class="tw:flex tw:flex-col tw:gap-1">
        <BaseText as="div" variant="overline">Color</BaseText>
        <BaseColorPicker v-model="color" />
      </div>
      <p class="tw:text-xs tw:text-secondary">
        Ordering (rank) can be adjusted in Lookups → Event Severities.
      </p>
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
