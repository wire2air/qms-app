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

const statuses = useLiveQuery((db) => db.FormStatus.where().orderBy('displayOrder').exec(), {
  models: ['FormStatus'],
  initial: [],
})
</script>

<template>
  <BaseSelect
    v-model="modelValue"
    :options="statuses"
    optionLabel="name"
    optionValue="id"
    :required="required"
    :multiple="multiple"
    :clearable="!required"
    nullLabel="— All statuses —"
  >
    <template #selected="{ options, remove }">
      <div class="tw:flex tw:flex-wrap tw:gap-1">
        <FormTemplateStatusBadgeById
          v-for="o in options"
          :key="o.value"
          :statusId="o.value"
          :clearable="multiple && (!required || options.length > 1)"
          @clear="() => remove(o)"
        />
      </div>
    </template>
  </BaseSelect>
</template>
