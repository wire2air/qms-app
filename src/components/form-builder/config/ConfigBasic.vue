<script setup>
import { computed } from 'vue'
import { required, helpers } from '@vuelidate/validators'
import { useValidator } from '@shared/composables/validator.js'
import { PLACEHOLDER_TYPES, NO_HINT_TYPES, NO_LABEL_TYPES } from '@/constants/formBuilderConfig'

const field = defineModel('field', {
  type: Object,
  required: true,
})

const fieldRules = computed(() => ({
  name: { required: helpers.withMessage('Field name is required', required) },
}))

useValidator(fieldRules, field)

const hasLabel = computed(() => !NO_LABEL_TYPES.has(field.value.type))
const hasPlaceholder = computed(() => PLACEHOLDER_TYPES.has(field.value.type))
const hasHint = computed(() => !NO_HINT_TYPES.has(field.value.type))
</script>

<template>
  <div class="tw:mb-4 tw:last:mb-0">
    <BaseText
      variant="overline"
      class="tw:block tw:mb-3 tw:pb-2 tw:border-b tw:border-divider"
    >
      Basic Settings
    </BaseText>

    <div class="tw:flex tw:flex-col tw:gap-3">
      <BaseTextInput
        v-model="field.name"
        name="name"
        label="Field Name"
        placeholder="field_name"
        instructions="Unique identifier for the field"
      />

      <BaseTextInput
        v-if="hasLabel"
        v-model="field.label"
        label="Label"
        placeholder="Field Label"
      />

      <BaseTextInput v-if="hasPlaceholder" v-model="field.placeholder" label="Placeholder" />

      <BaseTextInput v-if="hasHint" v-model="field.hint" label="Hint Text" />
    </div>
  </div>
</template>
