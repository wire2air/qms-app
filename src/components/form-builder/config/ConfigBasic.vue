<script setup>
import { computed } from 'vue'
import { required, helpers } from '@vuelidate/validators'
import { useValidator } from '@shared/composables/validator.js'
import {
  PLACEHOLDER_TYPES,
  NO_HINT_TYPES,
  NO_LABEL_TYPES,
  FIELD_WIDTHS,
} from '@/constants/formBuilderConfig'

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

      <!-- Field width — fields with less than full width pack side-by-side
           into rows on the form (and in the builder canvas). -->
      <div>
        <label class="tw:block tw:text-sm tw:font-medium tw:text-on-main tw:mb-1.5">Width</label>
        <div class="tw:flex tw:gap-1 tw:p-1 tw:bg-main-hover tw:rounded-lg">
          <button
            v-for="w in FIELD_WIDTHS"
            :key="w.value"
            type="button"
            class="tw:flex-1 tw:py-1.5 tw:text-sm tw:font-medium tw:rounded-md tw:transition-colors"
            :class="
              (field.width || 'full') === w.value
                ? 'tw:bg-main tw:text-primary tw:shadow-sm'
                : 'tw:text-secondary tw:hover:text-on-main'
            "
            @click="field.width = w.value"
          >
            {{ w.label }}
          </button>
        </div>
      </div>

      <!-- Hide field — keep it in the builder but omit from the rendered form. -->
      <div class="tw:flex tw:items-center tw:justify-between">
        <div>
          <div class="tw:text-sm tw:font-medium tw:text-on-main">Hide field</div>
          <div class="tw:text-xs tw:text-secondary">
            Hidden on the live form; still editable here
          </div>
        </div>
        <BaseSwitch v-model="field.hidden" />
      </div>
    </div>
  </div>
</template>
