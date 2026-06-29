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

const documentTypes = useLiveQuery((db) => db.DocumentType.where().orderBy('displayOrder').exec(), {
  models: ['DocumentType'],
  initial: [],
})
</script>

<template>
  <BaseSelect
    v-model="modelValue"
    :options="documentTypes"
    optionLabel="name"
    optionValue="id"
    :required="required"
    :multiple="multiple"
    :clearable="!required"
    nullLabel="— All types —"
  >
    <template #selected="{ options, remove }">
      <div class="tw:flex tw:flex-wrap tw:gap-1">
        <DocumentTypeBadgeById
          v-for="o in options"
          :key="o.value"
          :documentTypeId="o.value"
          :iconOnly="false"
          :clearable="multiple && (!required || options.length > 1)"
          @clear="() => remove(o)"
        />
      </div>
    </template>
  </BaseSelect>
</template>
