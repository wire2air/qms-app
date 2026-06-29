<script setup>
defineProps({
  required: {
    type: Boolean,
    default: false,
  },
  multiple: {
    type: Boolean,
    default: false,
  },
})

const modelValue = defineModel({
  type: [String, Array, null],
  default: null,
})

const modules = useLiveQuery((db) => db.Module.where().orderBy('displayOrder').exec(), {
  models: ['Module'],
  initial: [],
})
</script>

<template>
  <BaseSelect
    v-model="modelValue"
    :options="modules"
    optionLabel="name"
    optionValue="id"
    :required="required"
    :multiple="multiple"
    :clearable="!required"
    nullLabel="— All modules —"
  >
    <template #selected="{ options, remove }">
      <div class="tw:flex tw:flex-wrap tw:gap-1">
        <ModuleBadgeById
          v-for="o in options"
          :key="o.value"
          :moduleId="o.value"
          :clearable="multiple && (!required || options.length > 1)"
          @clear="() => remove(o)"
        />
      </div>
    </template>
  </BaseSelect>
</template>
