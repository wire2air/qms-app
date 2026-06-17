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
  { id: 'Low', name: 'Low' },
  { id: 'Medium', name: 'Medium' },
  { id: 'High', name: 'High' },
]

function getArray() {
  return Array.isArray(modelValue.value) ? modelValue.value : []
}
</script>

<template>
  <BaseSelectMenu
    v-model="modelValue"
    :items="items"
    nullLabel="— All risk levels —"
    :required="required"
    :multiple="multiple"
  >
    <template #button="scope">
      <slot name="button" v-bind="scope">
        <template v-if="multiple">
          <div v-if="getArray().length" class="tw:flex tw:flex-wrap tw:gap-1">
            <SupplierRiskLevelBadge
              v-for="levelId in getArray()"
              :key="levelId"
              :riskLevelId="levelId"
              :clearable="!required || getArray().length > 1"
              @clear="() => scope.clear(levelId)"
            />
          </div>
          <span v-else class="tw:text-sm tw:font-medium tw:text-placeholder"
            >Select Risk Level</span
          >
        </template>
        <template v-else>
          <SupplierRiskLevelBadge
            v-if="modelValue"
            :riskLevelId="modelValue"
            :clearable="!required"
            selectable
            @clear="() => scope.clear(modelValue)"
          />
          <span v-else class="tw:text-sm tw:font-medium tw:text-placeholder"
            >Select Risk Level</span
          >
        </template>
      </slot>
    </template>
  </BaseSelectMenu>
</template>
