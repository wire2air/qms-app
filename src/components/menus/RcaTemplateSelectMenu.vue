<script setup>
defineProps({
  required: { type: Boolean, default: false },
  multiple: { type: Boolean, default: false },
})

const modelValue = defineModel({ type: [String, Array, null], default: null })

const templates = useLiveQuery((db) => db.RcaTemplate.where().exec(), {
  models: ['RcaTemplate'],
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
    nullLabel="— All RCA templates —"
  >
    <template #selected="{ options, remove }">
      <div class="tw:flex tw:flex-wrap tw:gap-1">
        <RcaTemplateBadgeById
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
