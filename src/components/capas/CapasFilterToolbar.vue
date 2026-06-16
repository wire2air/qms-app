<script setup>
const filters = defineModel('filters', { type: Object, required: true })
const activeFilter = defineModel('activeFilter', { type: String, required: true })

const filterPills = [
  { value: 'all_open', label: 'All open' },
  { value: 'mine', label: 'My CAPAs' },
  { value: 'critical', label: 'Critical' },
  { value: 'high', label: 'High' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'closed', label: 'Closed' },
  { value: 'cancelled', label: 'Cancelled' },
]

const showClear = computed(
  () =>
    !!(
      filters.value.search ||
      filters.value.statusId ||
      filters.value.priorityId ||
      filters.value.typeId ||
      filters.value.supplierId ||
      filters.value.dateFrom ||
      filters.value.dateTo
    ),
)

function clearAll() {
  filters.value.search = ''
  filters.value.statusId = null
  filters.value.priorityId = null
  filters.value.typeId = null
  filters.value.supplierId = null
  filters.value.dateFrom = null
  filters.value.dateTo = null
}
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-2">
    <BaseFilterBar
      v-model:search="filters.search"
      searchPlaceholder="Search CAPA number, title…"
      :showClear="showClear"
      @clear="clearAll"
    >
      <template #filters>
        <CapaStatusSelectMenu v-model="filters.statusId" />
        <CapaPrioritySelectMenu v-model="filters.priorityId" />
        <CapaTypeSelectMenu v-model="filters.typeId" />
        <SupplierSelectMenu v-model="filters.supplierId" />
        <DateRangeFilter
          :from="filters.dateFrom"
          :to="filters.dateTo"
          @update:from="(v) => (filters.dateFrom = v)"
          @update:to="(v) => (filters.dateTo = v)"
        />
      </template>
    </BaseFilterBar>

    <div class="tw:flex tw:gap-2 tw:flex-wrap tw:items-center">
      <button
        v-for="pill in filterPills"
        :key="pill.value"
        class="tw:px-3 tw:py-1 tw:rounded-full tw:text-xs tw:font-medium tw:border tw:transition-colors"
        :class="
          activeFilter === pill.value
            ? 'tw:bg-blue-50 tw:text-blue-700 tw:border-blue-300'
            : 'tw:bg-white tw:text-secondary tw:border-divider tw:hover:bg-main-hover'
        "
        @click="activeFilter = pill.value"
      >
        {{ pill.label }}
      </button>
    </div>
  </div>
</template>
