<script setup>
import { computed } from 'vue'
import { NO_STATE_TYPES } from '@/constants/formBuilderConfig'

const field = defineModel('field', {
  type: Object,
  required: true,
})

const hasState = computed(() => !NO_STATE_TYPES.has(field.value.type))
</script>

<template>
  <div v-if="hasState" class="tw:mb-4 tw:last:mb-0">
    <BaseText variant="overline" class="tw:block tw:mb-2 tw:pb-2 tw:border-b tw:border-divider">
      State
    </BaseText>

    <div class="tw:grid tw:grid-cols-1 tw:sm:grid-cols-3 tw:gap-2">
      <BaseCheckbox v-model="field.required">Required</BaseCheckbox>
      <BaseCheckbox v-model="field.readonly">Readonly</BaseCheckbox>
      <BaseCheckbox v-model="field.disabled">Disabled</BaseCheckbox>
    </div>
  </div>
</template>
