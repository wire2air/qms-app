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

// Reads the SupplierOption projection (view `supplier_options`), not Supplier:
// a picker only needs id + name, and every user in the tenant can resolve that
// without holding supplier_management:read. The full record stays gated.
const suppliers = useLiveQuery(
  (db) =>
    props.allStatuses
      ? db.SupplierOption.where().exec()
      : db.SupplierOption.where('statusId', 'APPROVED').exec(),
  {
    models: ['SupplierOption'],
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
