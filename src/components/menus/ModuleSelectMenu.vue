<script setup>
const props = defineProps({
  required: {
    type: Boolean,
    default: false,
  },
  multiple: {
    type: Boolean,
    default: false,
  },
  // Optional predicate to narrow the offered modules — e.g. the workflow
  // create wizard shows only the modules whose workflows belong on the list
  // you launched it from. Receives the Module record, returns a boolean.
  filter: {
    type: Function,
    default: null,
  },
})

const modelValue = defineModel({
  type: [String, Array, null],
  default: null,
})

const allModules = useLiveQuery((db) => db.Module.where().orderBy('displayOrder').exec(), {
  models: ['Module'],
  initial: [],
})

const modules = computed(() =>
  props.filter ? allModules.value.filter((m) => props.filter(m)) : allModules.value,
)
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
