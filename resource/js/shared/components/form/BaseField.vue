<script setup>
/**
 * BaseField — the form-field wrapper and the place form chrome lives.
 *
 * Composes BaseLabel + BaseHelperText + BaseErrorText and owns the
 * accessibility wiring: it generates a stable id, binds it to the label's
 * `for`, and hands the control `id` + `aria-describedby` + `aria-invalid`
 * (and `disabled`) via the default slot. Error replaces hint when present.
 *
 * @example
 *   <BaseField label="Email" required hint="We never share it." :error="emailError">
 *     <template #default="field">
 *       <BaseTextInput v-bind="field" v-model="email" />
 *     </template>
 *   </BaseField>
 */
const props = defineProps({
  label: { type: String, default: '' },
  // Help text below the control (hidden while an error is showing).
  hint: { type: String, default: '' },
  // Error message; when set, renders BaseErrorText + sets aria-invalid.
  error: { type: String, default: '' },
  required: { type: Boolean, default: false },
  optional: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  // Label size (xs|sm|md|lg) — forwarded to BaseLabel. Form fields default to
  // md (14px), the canonical form-label size.
  size: { type: String, default: 'md' },
  // Help-icon tooltip text on the label.
  help: { type: String, default: '' },
  // Label subtitle/description.
  description: { type: String, default: '' },
  // Override the auto-generated control id.
  id: { type: String, default: undefined },
})

const autoId = useId()
const fieldId = computed(() => props.id || autoId)
const hintId = computed(() => `${fieldId.value}-hint`)
const errorId = computed(() => `${fieldId.value}-error`)

// Describe the control by whichever message is currently visible.
const describedBy = computed(() => {
  if (props.error) return errorId.value
  if (props.hint) return hintId.value
  return undefined
})

// Payload the slotted control spreads onto itself: id + a11y wiring.
const control = computed(() => ({
  id: fieldId.value,
  'aria-describedby': describedBy.value,
  'aria-invalid': props.error ? 'true' : undefined,
  disabled: props.disabled || undefined,
}))
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-1">
    <BaseLabel
      v-if="label || $slots.label"
      :for="fieldId"
      :required="required"
      :optional="optional"
      :disabled="disabled"
      :error="!!error"
      :size="size"
      :help="help"
      :description="description"
    >
      <slot name="label">{{ label }}</slot>
    </BaseLabel>

    <slot v-bind="control" />

    <BaseErrorText v-if="error" :id="errorId">{{ error }}</BaseErrorText>
    <BaseHelperText v-else-if="hint" :id="hintId">{{ hint }}</BaseHelperText>
  </div>
</template>
