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

function getArray() {
  return Array.isArray(modelValue.value) ? modelValue.value : []
}

const resolvedNullLabel = computed(
  () => props.nullLabel ?? (props.isFilter ? '— All suppliers —' : '— Select supplier —'),
)
</script>

<template>
  <BaseSelectMenu
    v-model="modelValue"
    :items="suppliers"
    :required="props.required"
    :multiple="props.multiple"
    :nullLabel="resolvedNullLabel"
  >
    <template #button="scope">
      <slot name="button" v-bind="scope">
        <!-- MULTIPLE MODE -->
        <template v-if="props.multiple">
          <div v-if="getArray().length" class="tw:flex tw:flex-wrap tw:gap-1">
            <SupplierBadgeById
              v-for="supplierId in getArray()"
              :key="supplierId"
              :supplierId="supplierId"
              :clearable="!props.required || getArray().length > 1"
              @clear="() => scope.clear(supplierId)"
            />
          </div>
          <span v-else class="tw:text-sm tw:font-medium tw:text-placeholder">
            Select Suppliers
          </span>
        </template>

        <!-- SINGLE MODE -->
        <template v-else>
          <SupplierBadgeById
            v-if="modelValue"
            :supplierId="modelValue"
            :clearable="!props.required"
            selectable
            @clear="() => scope.clear(modelValue)"
          />
          <span v-else class="tw:text-sm tw:font-medium tw:text-placeholder">
            Select Supplier
          </span>
        </template>
      </slot>
    </template>
  </BaseSelectMenu>
</template>
