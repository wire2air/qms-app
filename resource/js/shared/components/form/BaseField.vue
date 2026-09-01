<script setup>
/**
 * BaseField — the form-field wrapper and the place form chrome lives.
 *
 * Composes BaseLabel + BaseHelperText + BaseErrorText and owns the
 * accessibility wiring: it generates a stable id, binds it to the label's
 * `for`, and hands the control `id` + `aria-describedby` + `aria-invalid`
 * (and `disabled`) via the default slot. Error replaces hint when present.
 *
 * Validation: pass `:value` (what's bound to the control) + `:rules` (an array
 * of validators — see validators.js). The field registers with the enclosing
 * BaseForm, runs its rules on submit, and shows the first failure inline. Once
 * flagged, it re-validates live as the value changes. An explicitly-passed
 * `:error` (e.g. a server error) still wins and always shows.
 *
 * @example
 *   <BaseField label="Email" required :value="email" :rules="[required()]">
 *     <template #default="field">
 *       <BaseTextInput v-bind="field" v-model="email" />
 *     </template>
 *   </BaseField>
 */
import { resolveRuleMessage } from './validators.js'
import { BaseFormRegistryKey } from './formContext.js'

const props = defineProps({
  label: { type: String, default: '' },
  // Help text below the control (hidden while an error is showing).
  hint: { type: String, default: '' },
  // Externally-supplied error (e.g. server-side); when set it always shows and
  // overrides any rule error. Rule errors are managed internally via :rules.
  error: { type: String, default: '' },
  // The value to validate — typically the same ref bound to the inner control.
  // Any shape (string id, DateTime, array, boolean…), so the type stays open.
  value: { type: [String, Number, Boolean, Object, Array, Date], default: undefined },
  // Array of rules: (value) => true | string | ((label) => string). See validators.js.
  rules: { type: Array, default: () => [] },
  required: { type: Boolean, default: false },
  optional: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  // Label size (xs|sm|md|lg) — forwarded to BaseLabel. Form fields default to
  // md (14px), the canonical form-label size.
  size: { type: String, default: 'md' },
  // Help-icon tooltip text on the label.
  help: { type: String, default: '' },
  // Or pull that copy from the central registry by key (see tooltips.js).
  // `help` still wins when both are given.
  dataKey: { type: String, default: '' },
  // Label subtitle/description.
  description: { type: String, default: '' },
  // Override the auto-generated control id.
  id: { type: String, default: undefined },
})

const autoId = useId()
const fieldId = computed(() => props.id || autoId)
const hintId = computed(() => `${fieldId.value}-hint`)
const errorId = computed(() => `${fieldId.value}-error`)

// Rule-validation state. `ruleError` holds the active inline message from
// :rules; `touched` flips once the field has failed a submit, after which it
// re-validates live so the error clears the moment the value becomes valid.
const ruleError = ref('')
const touched = ref(false)

// Run :rules in order, stopping at the first failure. Sets the inline error and
// returns { id, label, message } for the form to aggregate, or null when valid.
function validate() {
  for (const rule of props.rules) {
    const result = rule(props.value)
    if (result !== true) {
      ruleError.value = resolveRuleMessage(result, props.label)
      touched.value = true
      return { id: fieldId.value, label: props.label, message: ruleError.value }
    }
  }
  ruleError.value = ''
  return null
}

watch(
  () => props.value,
  () => {
    if (touched.value) validate()
  },
)

// Server error (props.error) wins; otherwise show the active rule error.
const displayError = computed(() => props.error || ruleError.value)

// Register with the enclosing BaseForm (if any). Outside a form, rules still
// work for an explicitly-driven validate(), but nothing collects them.
const registry = inject(BaseFormRegistryKey, null)
const fieldEntry = {
  id: fieldId.value,
  label: props.label,
  getError: () => ruleError.value,
  validate,
}
onMounted(() => registry?.register(fieldEntry))
onBeforeUnmount(() => registry?.unregister(fieldEntry))

// Describe the control by whichever message is currently visible.
const describedBy = computed(() => {
  if (displayError.value) return errorId.value
  if (props.hint) return hintId.value
  return undefined
})

// Payload the slotted control spreads onto itself: id + a11y wiring.
const control = computed(() => ({
  id: fieldId.value,
  'aria-describedby': describedBy.value,
  'aria-invalid': displayError.value ? 'true' : undefined,
  disabled: props.disabled || undefined,
}))

defineExpose({ validate })
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-1">
    <BaseLabel
      v-if="label || $slots.label"
      :for="fieldId"
      :required="required"
      :optional="optional"
      :disabled="disabled"
      :error="!!displayError"
      :size="size"
      :help="help"
      :dataKey="dataKey"
      :description="description"
    >
      <slot name="label">{{ label }}</slot>
    </BaseLabel>

    <slot v-bind="control" />

    <BaseErrorText v-if="displayError" :id="errorId">{{ displayError }}</BaseErrorText>
    <BaseHelperText v-else-if="hint" :id="hintId">{{ hint }}</BaseHelperText>
  </div>
</template>
