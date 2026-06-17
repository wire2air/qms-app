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

function getArray() {
  return Array.isArray(modelValue.value) ? modelValue.value : []
}
</script>

<template>
  <BaseSelectMenu
    v-model="modelValue"
    :items="types"
    nullLabel="— All types —"
    :required="required"
    :multiple="multiple"
  >
    <template #button="scope">
      <slot name="button" v-bind="scope">
        <!-- MULTIPLE MODE -->
        <template v-if="multiple">
          <div v-if="getArray().length" class="tw:flex tw:flex-wrap tw:gap-1">
            <ProductTypeBadgeById
              v-for="productTypeId in getArray()"
              :key="productTypeId"
              :productTypeId="productTypeId"
              :clearable="!required || getArray().length > 1"
              @clear="() => scope.clear(productTypeId)"
            />
          </div>
          <span v-else class="tw:text-sm tw:font-medium tw:text-placeholder">
            Select Product Types
          </span>
        </template>

        <!-- SINGLE MODE -->
        <template v-else>
          <ProductTypeBadgeById
            v-if="modelValue"
            :productTypeId="modelValue"
            :clearable="!required"
            selectable
            @clear="() => scope.clear(modelValue)"
          />
          <span v-else class="tw:text-sm tw:font-medium tw:text-placeholder">
            Select Product Type
          </span>
        </template>
      </slot>
    </template>
  </BaseSelectMenu>
</template>
