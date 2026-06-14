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

const suppliers = useLiveQuery((db) => db.Supplier.where().exec(), { initial: [] })

function getArray() {
  return Array.isArray(modelValue.value) ? modelValue.value : []
}
</script>

<template>
  <BaseSelectMenu v-model="modelValue" :items="suppliers" :required="required" :multiple="multiple" nullLabel="— All suppliers —">
    <template #button="scope">
      <slot name="button" v-bind="scope">
        <!-- MULTIPLE MODE -->
        <template v-if="multiple">
          <div v-if="getArray().length" class="tw:flex tw:flex-wrap tw:gap-1">
            <SupplierBadgeById
              v-for="supplierId in getArray()"
              :key="supplierId"
              :supplierId="supplierId"
              :clearable="!required || getArray().length > 1"
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
            :clearable="!required"
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
