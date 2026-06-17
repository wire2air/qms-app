<script setup>
/**
 * BaseDialogFooter — the standardized Cancel + Submit action row for dialogs.
 * Replaces the copy-pasted footer found in ~118 BaseDialog consumers:
 *   <template #footer="{ close }">
 *     <BaseButton variant="outline" @click="close">Cancel</BaseButton>
 *     <BaseButton :isLoading="saving" @click="onSubmit">Save</BaseButton>
 *   </template>
 *
 * Drop it inside a BaseDialog `#footer` slot and wire @cancel to the slot's
 * `close`:
 *   <template #footer="{ close }">
 *     <BaseDialogFooter :loading="saving" :error="saveError"
 *       @cancel="close" @submit="onSubmit" />
 *   </template>
 *
 * When an `error` is present it sits on the left while the buttons stay right.
 * Pass a `#submitIcon` slot to render a leading icon inside the submit button.
 */
defineProps({
  cancelLabel: { type: String, default: 'Cancel' },
  submitLabel: { type: String, default: 'Save' },
  cancelVariant: { type: String, default: 'outline' },
  submitVariant: { type: String, default: 'primary' },
  // Spinner + disable on the submit button; also disables cancel.
  loading: { type: Boolean, default: false },
  // Disable the submit button (e.g. invalid form) without a spinner.
  disabled: { type: Boolean, default: false },
  // Native tooltip on the submit button — typically the reason it's disabled.
  submitTitle: { type: String, default: undefined },
  // Inline error message shown to the left of the buttons.
  error: { type: String, default: '' },
  // Hide the cancel button (rare — confirm-only flows).
  hideCancel: { type: Boolean, default: false },
})

defineEmits(['cancel', 'submit'])
</script>

<template>
  <div
    class="tw:flex tw:w-full tw:items-center tw:gap-3"
    :class="error ? 'tw:justify-between' : 'tw:justify-end'"
  >
    <BaseErrorText v-if="error" class="tw:mr-auto">{{ error }}</BaseErrorText>
    <div class="tw:flex tw:items-center tw:gap-3">
      <BaseButton
        v-if="!hideCancel"
        :variant="cancelVariant"
        :disabled="loading"
        @click="$emit('cancel')"
      >
        {{ cancelLabel }}
      </BaseButton>
      <BaseButton
        :variant="submitVariant"
        :isLoading="loading"
        :disabled="disabled"
        :title="submitTitle"
        @click="$emit('submit')"
      >
        <template v-if="$slots.submitIcon" #icon><slot name="submitIcon" /></template>
        {{ submitLabel }}
      </BaseButton>
    </div>
  </div>
</template>
