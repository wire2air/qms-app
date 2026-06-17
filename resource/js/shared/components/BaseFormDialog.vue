<script setup>
/**
 * BaseFormDialog — a BaseDialog preset for the create/edit dialog pattern:
 * title + body slot + a standardized BaseDialogFooter (Cancel / Submit) with
 * busy + inline-error state. Collapses the ~50–60 hand-rolled form dialogs to:
 *
 *   <BaseFormDialog v-model="open" title="New product"
 *     submitLabel="Create" :loading="saving" :disabled="!valid" :error="saveError"
 *     @submit="onSubmit">
 *     <BaseField label="Name"><BaseTextInput v-model="form.name" /></BaseField>
 *   </BaseFormDialog>
 *
 * Cancel closes the dialog automatically (and emits `cancel`); Submit emits
 * `submit` — the consumer closes on success (set v-model false) so a failed
 * save keeps the dialog open with the data intact.
 */
defineProps({
  title: { type: String, default: '' },
  size: { type: String, default: 'md' },
  persistent: { type: Boolean, default: false },
  submitLabel: { type: String, default: 'Save' },
  cancelLabel: { type: String, default: 'Cancel' },
  submitVariant: { type: String, default: 'primary' },
  loading: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  error: { type: String, default: '' },
})

const emit = defineEmits(['submit', 'cancel'])
const open = defineModel({ type: Boolean, default: false })

function handleCancel() {
  emit('cancel')
  open.value = false
}
</script>

<template>
  <BaseDialog v-model="open" :title="title" :size="size" :persistent="persistent">
    <template v-if="$slots.title" #title><slot name="title" /></template>

    <slot />

    <template #footer>
      <BaseDialogFooter
        :submitLabel="submitLabel"
        :cancelLabel="cancelLabel"
        :submitVariant="submitVariant"
        :loading="loading"
        :disabled="disabled"
        :error="error"
        @cancel="handleCancel"
        @submit="$emit('submit')"
      />
    </template>
  </BaseDialog>
</template>
