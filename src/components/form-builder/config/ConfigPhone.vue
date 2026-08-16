<script setup>
import { COUNTRIES } from '@shared/components/phone/countries.js'

// Phone field settings: default country (pre-selects the dial code), an input
// mask (# = a digit), and an optional custom format regex that overrides the
// mask's digit-count check for validation.
const field = defineModel('field', { type: Object, required: true })

const countryOptions = COUNTRIES.map((c) => ({ value: c.code, label: `${c.dial} ${c.name}` }))
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-3">
    <BaseField label="Default country">
      <BaseSelect v-model="field.defaultCountry" :options="countryOptions" :required="true" />
    </BaseField>
    <BaseField
      label="Format mask"
      hint="Use # for a digit. Example: ###-###-#### or (###) ###-####"
    >
      <BaseTextInput v-model="field.mask" placeholder="###-###-####" />
    </BaseField>
    <BaseField
      label="Custom format (regex)"
      hint="Optional — overrides the mask's digit-count check for validation."
    >
      <BaseTextInput v-model="field.formatRegex" placeholder="validate by mask digit count" />
    </BaseField>
  </div>
</template>
