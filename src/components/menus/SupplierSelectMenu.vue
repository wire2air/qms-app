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
  // By default only APPROVED suppliers are selectable. Set true to include every
  // supplier (e.g. linking suppliers to an Item, where a link can predate
  // approval and must not be silently dropped).
  allStatuses: {
    type: Boolean,
    default: false,
  },
})

const modelValue = defineModel({
  type: [String, Array, null],
  default: null,
})

const suppliers = useLiveQuery(
  (db) => (props.allStatuses ? db.Supplier.where().exec() : db.Supplier.where('statusId', 'APPROVED').exec()),
  {
    models: ['Supplier'],
    initial: [],
  },
)

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
    :clearable="!props.required && !props.multiple"
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
