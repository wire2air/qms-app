<script setup>
/**
 * Private ↔ shared picker. Two states only, and each option carries the
 * sentence that explains what it actually does — "shared" in particular does
 * NOT mean "shares my numbers", and that is the one thing a user needs to know
 * before flipping the switch on a board built from their own scope.
 */
import { VISIBILITY_META } from '@/utils/analyticsDashboardAccess.js'

defineProps({
  required: { type: Boolean, default: true },
  disabled: { type: Boolean, default: false },
  label: { type: String, default: '' },
})

const modelValue = defineModel({ type: String, default: 'private' })

const options = Object.values(VISIBILITY_META).map((v) => ({
  value: v.id,
  label: v.name,
  description: v.help,
}))
</script>

<template>
  <BaseSelect
    v-model="modelValue"
    :options="options"
    optionDescription="description"
    :label="label"
    :required="required"
    :disabled="disabled"
    :clearable="false"
    :searchable="false"
  >
    <template #selected="{ options: selected }">
      <DashboardVisibilityBadgeById
        v-for="o in selected"
        :key="o.value"
        :visibilityId="o.value"
        :showIcon="true"
      />
    </template>
  </BaseSelect>
</template>
