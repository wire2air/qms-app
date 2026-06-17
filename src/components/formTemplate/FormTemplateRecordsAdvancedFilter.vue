<script setup>
import { IconPlus, IconX } from '@tabler/icons-vue'

const props = defineProps({
  columns: {
    type: Array,
    required: true,
  },
})

const modelValue = defineModel({
  type: Array,
  default: () => [],
})

const filterSections = ref(
  modelValue.value?.length > 0
    ? modelValue.value.map((filter) => ({ ...filter, id: Date.now() + Math.random() }))
    : [{ id: Date.now(), column: null, operator: 'includes', value: '' }],
)

const operatorOptions = [
  { id: 'includes', name: 'Includes' },
  { id: 'equals', name: 'Equals' },
  { id: 'not-equals', name: 'Not Equals' },
]

const columnOptions = computed(() => {
  return props.columns
    .filter((col) => !col.required || col.name === 'statusId')
    .map((col) => ({ id: col.name, name: col.label }))
})

function addFilterSection() {
  filterSections.value.push({ id: Date.now(), column: null, operator: 'includes', value: '' })
}

function removeFilterSection(index) {
  if (filterSections.value.length > 1) {
    filterSections.value.splice(index, 1)
  }
}

function applyFilters() {
  const validFilters = filterSections.value.filter(
    (section) => section.column && section.value.trim() !== '',
  )
  modelValue.value = validFilters
}

function resetFilters() {
  filterSections.value = [{ id: Date.now(), column: null, operator: 'includes', value: '' }]
  modelValue.value = []
}
</script>

<template>
  <div class="tw:p-4 tw:min-w-160">
    <BaseText as="h3" variant="subheading" class="tw:block tw:mb-4">Advanced Filters</BaseText>

    <div class="tw:flex tw:flex-col tw:gap-3 tw:mb-4">
      <div
        v-for="(section, index) in filterSections"
        :key="section.id"
        class="tw:flex tw:items-start tw:gap-2"
      >
        <div class="tw:grid tw:grid-cols-3 tw:gap-2 tw:flex-1">
          <BaseField label="Column">
            <BaseSelectMenu v-model="section.column" :items="columnOptions" required />
          </BaseField>
          <BaseField label="Operator">
            <BaseSelectMenu v-model="section.operator" :items="operatorOptions" required />
          </BaseField>
          <BaseField v-slot="{ id: fieldId }" label="Value">
            <BaseTextInput :id="fieldId" v-model="section.value" size="sm" />
          </BaseField>
        </div>
        <button
          v-if="filterSections.length > 1"
          class="tw:mt-5 tw:p-1 tw:rounded tw:text-bad tw:hover:bg-main-hover"
          title="Remove filter"
          @click="removeFilterSection(index)"
        >
          <IconX :size="16" />
        </button>
      </div>
    </div>

    <div class="tw:flex tw:items-center tw:gap-2 tw:mb-4">
      <BaseButton variant="text" size="sm" @click="addFilterSection">
        <IconPlus :size="14" class="tw:mr-1" /> Add Filter
      </BaseButton>
    </div>

    <div class="tw:flex tw:justify-end tw:gap-2 tw:border-t tw:pt-3 tw:border-divider">
      <BaseButton variant="text" @click="resetFilters">Reset</BaseButton>
      <BaseButton @click="applyFilters">Apply Filters</BaseButton>
    </div>
  </div>
</template>
