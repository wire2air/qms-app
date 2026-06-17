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

const items = [
  { id: 'Raw Materials', name: 'Raw Materials' },
  { id: 'Component', name: 'Component' },
  { id: 'Service', name: 'Service' },
  { id: 'Software', name: 'Software' },
]

function getArray() {
  return Array.isArray(modelValue.value) ? modelValue.value : []
}
</script>

<template>
  <BaseSelectMenu
    v-model="modelValue"
    :items="items"
    nullLabel="— All categories —"
    :required="required"
    :multiple="multiple"
  >
    <template #button="scope">
      <slot name="button" v-bind="scope">
        <template v-if="multiple">
          <div v-if="getArray().length" class="tw:flex tw:flex-wrap tw:gap-1">
            <SupplierCategoryBadge
              v-for="catId in getArray()"
              :key="catId"
              :categoryId="catId"
              :clearable="!required || getArray().length > 1"
              @clear="() => scope.clear(catId)"
            />
          </div>
          <span v-else class="tw:text-sm tw:font-medium tw:text-placeholder">Select Category</span>
        </template>
        <template v-else>
          <SupplierCategoryBadge
            v-if="modelValue"
            :categoryId="modelValue"
            :clearable="!required"
            selectable
            @clear="() => scope.clear(modelValue)"
          />
          <span v-else class="tw:text-sm tw:font-medium tw:text-placeholder">Select Category</span>
        </template>
      </slot>
    </template>
  </BaseSelectMenu>
</template>
