<script setup>
import {
  IconSearch,
  IconX,
  IconCircleDot,
  IconAlertTriangle,
  IconTag,
  IconBuildingFactory2,
} from '@tabler/icons-vue'

const filters = defineModel('filters', { type: Object, required: true })
const activeFilter = defineModel('activeFilter', { type: String, required: true })

const filterPills = [
  { value: 'all_open', label: 'All open' },
  { value: 'mine', label: 'My NCs' },
  { value: 'critical', label: 'Critical' },
  { value: 'major', label: 'Major' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'closed', label: 'Closed' },
]

// Dimension option sources for the Linear-style filter menu.
const ncStatuses = useLiveQuery((db) => db.NcStatus.where().orderBy('displayOrder').exec(), {
  models: ['NcStatus'],
  initial: [],
})
const ncSeverities = useLiveQuery((db) => db.NcSeverity.where().orderBy('displayOrder').exec(), {
  models: ['NcSeverity'],
  initial: [],
})
const ncTypes = useLiveQuery((db) => db.NcType.where().orderBy('displayOrder').exec(), {
  models: ['NcType'],
  initial: [],
})
const suppliers = useLiveQuery((db) => db.Supplier.where('statusId', 'APPROVED').exec(), {
  models: ['Supplier'],
  initial: [],
})

// Descriptor tree for the cascading BaseFilterMenu (each dimension → a submenu
// of its values; `group` is the selection bucket key on the filter model).
const filterItems = computed(() => [
  {
    id: 'statusId',
    label: 'Status',
    icon: IconCircleDot,
    group: 'statusId',
    options: ncStatuses.value.map((s) => ({ value: s.id, label: s.name })),
  },
  {
    id: 'severityId',
    label: 'Severity',
    icon: IconAlertTriangle,
    group: 'severityId',
    options: ncSeverities.value.map((s) => ({ value: s.id, label: s.name })),
  },
  {
    id: 'typeId',
    label: 'Type',
    icon: IconTag,
    group: 'typeId',
    options: ncTypes.value.map((t) => ({ value: t.id, label: t.name })),
  },
  {
    id: 'supplierId',
    label: 'Supplier',
    icon: IconBuildingFactory2,
    group: 'supplierId',
    searchable: true,
    options: suppliers.value.map((s) => ({ value: s.id, label: s.name })),
  },
])

function arr(key) {
  return Array.isArray(filters.value[key]) ? filters.value[key] : []
}
function removeValue(key, value) {
  filters.value = { ...filters.value, [key]: arr(key).filter((v) => v !== value) }
}
const hasChips = computed(
  () =>
    arr('statusId').length ||
    arr('severityId').length ||
    arr('typeId').length ||
    arr('supplierId').length ||
    filters.value.dateFrom ||
    filters.value.dateTo,
)
const showClear = computed(() => hasChips.value || !!filters.value.search)

function clearDates() {
  filters.value.dateFrom = ''
  filters.value.dateTo = ''
}
function clearAll() {
  filters.value = {
    ...filters.value,
    search: '',
    statusId: [],
    severityId: [],
    typeId: [],
    supplierId: [],
    dateFrom: '',
    dateTo: '',
  }
}
</script>

<template>
  <!-- Sticky workspace toolbar: pins below the app bar while the list scrolls. -->
  <div class="tw:sticky tw:top-0 tw:z-sticky tw:flex tw:flex-col tw:gap-2.5 tw:bg-main tw:pt-1 tw:pb-2.5">
    <!-- Row 1 — search + filter menu + date range -->
    <div class="tw:flex tw:flex-wrap tw:items-center tw:gap-2">
      <div class="tw:relative tw:min-w-[12rem] tw:flex-1 tw:max-w-sm">
        <IconSearch
          :size="16"
          class="tw:pointer-events-none tw:absolute tw:left-2.5 tw:top-1/2 tw:-translate-y-1/2 tw:text-secondary"
        />
        <input
          v-model="filters.search"
          type="text"
          placeholder="Search NC number, title…"
          class="tw:w-full tw:rounded-lg tw:border tw:border-divider tw:bg-card tw:py-1.5 tw:ps-8 tw:pe-3 tw:text-sm tw:text-on-main tw:outline-none tw:transition-colors tw:focus:border-primary"
        />
      </div>

      <div class="tw:ms-auto tw:flex tw:flex-wrap tw:items-center tw:gap-2">
        <BaseFilterMenu v-model="filters" :items="filterItems" />
        <DateRangeFilter v-model:from="filters.dateFrom" v-model:to="filters.dateTo" />
      </div>
    </div>

    <!-- Row 2 — quick views -->
    <BaseQuickFilterPills v-model="activeFilter" :pills="filterPills" ariaLabel="Quick views" />

    <!-- Row 3 — applied filters as removable tokens -->
    <div v-if="hasChips" class="tw:flex tw:flex-wrap tw:items-center tw:gap-1.5">
      <span class="tw:text-micro tw:font-semibold tw:uppercase tw:tracking-wide tw:text-secondary">
        Filters
      </span>
      <NcStatusBadgeById
        v-for="id in arr('statusId')"
        :key="`st-${id}`"
        :statusId="id"
        clearable
        @clear="removeValue('statusId', id)"
      />
      <NcSeverityBadgeById
        v-for="id in arr('severityId')"
        :key="`sv-${id}`"
        :severityId="id"
        clearable
        @clear="removeValue('severityId', id)"
      />
      <NcTypeBadgeById
        v-for="id in arr('typeId')"
        :key="`ty-${id}`"
        :typeId="id"
        clearable
        @clear="removeValue('typeId', id)"
      />
      <SupplierBadgeById
        v-for="id in arr('supplierId')"
        :key="`sp-${id}`"
        :supplierId="id"
        clearable
        @clear="removeValue('supplierId', id)"
      />
      <span
        v-if="filters.dateFrom || filters.dateTo"
        class="tw:inline-flex tw:items-center tw:gap-1 tw:rounded-md tw:border tw:border-divider tw:bg-card tw:py-0.5 tw:ps-2 tw:pe-1 tw:text-xs tw:text-secondary"
      >
        Date range
        <button
          type="button"
          aria-label="Clear date range"
          class="tw:rounded tw:p-0.5 tw:hover:bg-main-hover"
          @click="clearDates"
        >
          <IconX class="tw:size-3" />
        </button>
      </span>
      <button
        v-if="showClear"
        type="button"
        class="tw:ms-1 tw:text-xs tw:font-medium tw:text-primary tw:hover:underline"
        @click="clearAll"
      >
        Clear all
      </button>
    </div>
  </div>
</template>
