<script setup>
// Phone field: a country/dial-code selector + a national-number input that
// formats against a mask (e.g. ###-###-####). The model value is a single
// string with the dial code, e.g. "+1 555-123-4567", so it stays a scalar for
// the form payload / automation conditions. Validation (built-in length or a
// custom regex set on the field) is supplied by the form layer; the error is
// read from the provided validator by `name`, like every other field.
import { COUNTRIES, DEFAULT_COUNTRY, countryForValue } from './phone/countries.js'
import { useValidation } from '@shared/composables/validator.js'

defineOptions({ inheritAttrs: false })

const props = defineProps({
  name: { type: String, default: '' },
  label: { type: String, default: '' },
  required: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  readonly: { type: Boolean, default: false },
  placeholder: { type: String, default: '' },
  defaultCountry: { type: String, default: DEFAULT_COUNTRY },
  mask: { type: String, default: '###-###-####' },
  // External error override (when used outside a DynamicForm validator).
  error: { type: [Boolean, String], default: false },
  errorMessage: { type: String, default: '' },
})

const model = defineModel({ type: [String, null], default: '' })
const { error: vError, errorMessage: vErrorMessage } = useValidation(props)

const countryOptions = COUNTRIES.map((c) => ({ value: c.code, label: `${c.dial} ${c.name}` }))
const dialByCode = Object.fromEntries(COUNTRIES.map((c) => [c.code, c.dial]))

const country = ref(props.defaultCountry || DEFAULT_COUNTRY)
const digits = ref('') // national-number digits only

function maskDigits(d, mask) {
  if (!mask) return d
  let out = ''
  let i = 0
  for (const ch of mask) {
    if (i >= d.length) break
    if (ch === '#') out += d[i++]
    else out += ch
  }
  return out
}

const display = computed(() => maskDigits(digits.value, props.mask))
const combined = computed(() => {
  if (!digits.value) return ''
  return `${dialByCode[country.value] || ''} ${display.value}`.trim()
})

function parseInto(value) {
  const v = String(value || '').trim()
  if (!v) {
    digits.value = ''
    return
  }
  const c = countryForValue(v)
  if (c) {
    country.value = c.code
    digits.value = v.slice(c.dial.length).replace(/\D/g, '')
  } else {
    digits.value = v.replace(/\D/g, '')
  }
}

// Initial value + external changes — skip our own echo to avoid a feedback loop.
watch(model, (v) => v !== combined.value && parseInto(v), { immediate: true })
// Push edits (country / number) back to the model.
watch(combined, (v) => v !== model.value && (model.value = v))

function onNumberInput(v) {
  digits.value = String(v ?? '').replace(/\D/g, '')
}

const errMsg = computed(() => (props.error ? props.errorMessage : vError.value ? vErrorMessage.value : ''))
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-1">
    <div v-if="label" class="tw:text-sm tw:font-medium tw:text-secondary">
      {{ label }}<span v-if="required" class="tw:text-red"> *</span>
    </div>
    <div class="tw:flex tw:items-start tw:gap-2">
      <div class="tw:w-40 tw:shrink-0">
        <BaseSelect
          v-model="country"
          :options="countryOptions"
          :required="true"
          :disabled="disabled || readonly"
        />
      </div>
      <BaseTextInput
        :modelValue="display"
        type="tel"
        :placeholder="placeholder || mask.replace(/#/g, '0')"
        :disabled="disabled"
        :readonly="readonly"
        :errorMsg="errMsg"
        class="tw:flex-1"
        @update:modelValue="onNumberInput"
      />
    </div>
  </div>
</template>
