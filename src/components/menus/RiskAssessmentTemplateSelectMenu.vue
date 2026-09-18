<script setup>
defineProps({
  required: { type: Boolean, default: false },
  multiple: { type: Boolean, default: false },
})

const modelValue = defineModel({ type: [String, Array, null], default: null })

const templates = useLiveQuery((db) => db.RiskAssessmentTemplate.where().exec(), {
  models: ['RiskAssessmentTemplate'],
  initial: [],
})
</script>

<template>
  <BaseSelect
    v-model="modelValue"
    :options="templates"
    optionLabel="name"
    optionValue="id"
    :required="required"
    :multiple="multiple"
    :clearable="!required"
    nullLabel="All"
  >
    <template #selected="{ options, remove }">
      <div class="tw:flex tw:flex-wrap tw:gap-1">
        <RiskAssessmentTemplateBadgeById
          v-for="o in options"
          :key="o.value"
          :templateId="o.value"
          :clearable="multiple && (!required || options.length > 1)"
          @clear="() => remove(o)"
        />
      </div>
    </template>
  </BaseSelect>
</template>
