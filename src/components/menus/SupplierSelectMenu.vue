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
  isFilter: {
    type: Boolean,
    default: false,
  },
  nullLabel: {
    type: String,
    default: null,
  },
})

const modelValue = defineModel({
  type: [String, Array, null],
  default: null,
})

const suppliers = useLiveQuery((db) => db.Supplier.where('statusId', 'APPROVED').exec(), {
  models: ['Supplier'],
  initial: [],
})

const resolvedNullLabel = computed(
  () => props.nullLabel ?? (props.isFilter ? '— All suppliers —' : '— Select supplier —'),
)
</script>

<template>
  <BaseSelect
    v-model="modelValue"
    :options="suppliers"
    optionLabel="name"
    optionValue="id"
    :required="props.required"
    :multiple="props.multiple"
    :clearable="!props.required"
    :nullLabel="resolvedNullLabel"
  >
    <template #selected="{ options, remove }">
      <div class="tw:flex tw:flex-wrap tw:gap-1">
        <SupplierBadgeById
          v-for="o in options"
          :key="o.value"
          :supplierId="o.value"
          :clearable="props.multiple && (!props.required || options.length > 1)"
          @clear="() => remove(o)"
        />
      </div>
    </template>
  </BaseSelect>
</template>
