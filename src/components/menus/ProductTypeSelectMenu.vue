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

const types = useLiveQuery((db) => db.ProductType.where().orderBy('displayOrder').exec(), {
  models: ['ProductType'],
  initial: [],
})
</script>

<template>
  <BaseSelect
    v-model="modelValue"
    :options="types"
    optionLabel="name"
    optionValue="id"
    :required="required"
    :multiple="multiple"
    :clearable="!required"
    nullLabel="— All types —"
  >
    <template #selected="{ options, remove }">
      <div class="tw:flex tw:flex-wrap tw:gap-1">
        <ProductTypeBadgeById
          v-for="o in options"
          :key="o.value"
          :productTypeId="o.value"
          :clearable="multiple && (!required || options.length > 1)"
          @clear="() => remove(o)"
        />
      </div>
    </template>
  </BaseSelect>
</template>
