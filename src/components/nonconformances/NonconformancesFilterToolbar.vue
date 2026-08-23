<script setup>
import {
  IconX,
  IconCircleDot,
  IconAlertTriangle,
  IconTag,
  IconBuildingFactory2,
  IconCalendar,
} from '@tabler/icons-vue'

const filters = defineModel('filters', { type: Object, required: true })
const activeFilter = defineModel('activeFilter', { type: String, required: true })

const filterPills = [
  // 'All' means no lifecycle filter at all — closed and cancelled records
  // included. Every other pill narrows to some subset of open, so without
  // this there was no way to see the whole register in one list.
  { value: 'all', label: 'All' },
  { value: 'all_open', label: 'All open' },
  { value: 'mine', label: 'My NCs' },
  { value: 'critical', label: 'Critical' },
  { value: 'major', label: 'Major' },
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
  { id: 'createdAt', label: 'Created date', icon: IconCalendar, group: 'createdAt', type: 'date' },
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
    filters.value.createdAt,
)
const showClear = computed(() => hasChips.value)

function clearAll() {
  filters.value = {
    ...filters.value,
    statusId: [],
    severityId: [],
    typeId: [],
    supplierId: [],
    createdAt: null,
  }
}
</script>

<template>
  <!-- Sticky workspace toolbar: pins below the app bar while the list scrolls. -->
  <div
    class="tw:sticky tw:top-0 tw:z-sticky tw:flex tw:flex-col tw:gap-2.5 tw:bg-main tw:pt-1 tw:pb-2.5"
  >
    <!-- Row 1 — filter menu + date range (search lives in the table toolbar) -->
    <div class="tw:flex tw:flex-wrap tw:items-center tw:gap-2">
      <div class="tw:ms-auto tw:flex tw:flex-wrap tw:items-center tw:gap-2">
        <BaseFilterMenu v-model="filters" :items="filterItems" />
      </div>
    </div>

    <!-- Row 2 — quick views -->
    <BaseQuickFilterPills v-model="activeFilter" :pills="filterPills" ariaLabel="Quick views" />

    <!-- Row 3 — applied filters as removable tokens -->
    <div v-if="hasChips" class="tw:flex tw:flex-wrap tw:items-center tw:gap-1.5">
      <span
        class="tw:text-caption tw:font-semibold tw:uppercase tw:tracking-wider tw:text-secondary"
      >
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
        v-if="filters.createdAt"
        class="tw:inline-flex tw:items-center tw:gap-1 tw:rounded-md tw:border tw:border-divider tw:bg-card tw:py-0.5 tw:ps-2 tw:pe-1 tw:text-xs tw:text-secondary"
      >
        Created date
        <button
          type="button"
          aria-label="Clear date filter"
          class="tw:rounded tw:p-0.5 tw:hover:bg-main-hover"
          @click="filters.createdAt = null"
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
