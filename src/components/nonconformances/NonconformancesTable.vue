<script setup>
import {
  IconEdit,
  IconTrash,
  IconCircleDot,
  IconAlertTriangle,
  IconTag,
  IconBuildingFactory2,
  IconCalendar,
} from '@tabler/icons-vue'
import { getCompanyPath } from '@/utils/routeHelpers'

const props = defineProps({
  rows: { type: Array, default: () => [] },
  canUpdate: { type: Boolean, default: false },
  canDelete: { type: Boolean, default: false },
  // Copy for the in-card empty state (the page's filters produced no rows).
  // The table stays mounted when empty so its filter controls remain reachable.
  emptyLabel: { type: String, default: null },
})

const emit = defineEmits(['delete', 'edit'])

// Quick views, rendered in the table toolbar's #tabs slot.
const activeFilter = defineModel('activeFilter', { type: String, default: 'all_open' })
// Query-level filters (applied upstream in NonconformancesHome, before the rows
// reach this table) — the cascading menu lives in the toolbar's
// #toolbar-filters slot, beside DataTable's own column-filter trigger.
const filters = defineModel('filters', { type: Object, default: () => ({}) })

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

// The menu is bound to ONLY its own groups: BaseFilterMenu's count badge counts
// every non-empty value in the object it's given, so handing it the whole filter
// bag made it report the quick view (`activeFilter`) as an active filter.
const MENU_GROUPS = ['statusId', 'severityId', 'typeId', 'supplierId', 'createdAt']
const menuFilters = computed(() =>
  Object.fromEntries(MENU_GROUPS.map((k) => [k, filters.value?.[k] ?? null])),
)
function onMenuFilters(next) {
  filters.value = { ...filters.value, ...next }
}

const severityDotClass = {
  CRITICAL: 'tw:bg-red-500',
  MAJOR: 'tw:bg-amber-500',
  MINOR: 'tw:bg-green-500',
}

// Option sources, shared by the filter menu and the advanced filter's
// entity-column dropdowns (ordered so both read in the configured order).
const ncStatuses = useLiveQuery((db) => db.NcStatus.where().orderBy('displayOrder').exec(), {
  models: ['NcStatus'],
  initial: [],
})
const ncTypes = useLiveQuery((db) => db.NcType.where().orderBy('displayOrder').exec(), {
  models: ['NcType'],
  initial: [],
})
const ncSeverities = useLiveQuery((db) => db.NcSeverity.where().orderBy('displayOrder').exec(), {
  models: ['NcSeverity'],
  initial: [],
})
const suppliers = useLiveQuery((db) => db.Supplier.where('statusId', 'APPROVED').exec(), {
  models: ['Supplier'],
  initial: [],
})
function selectOpts(list) {
  return list.map((x) => ({ value: x.id, label: x.name }))
}

// Descriptor tree for the cascading filter menu (each dimension → a submenu of
// its values; `group` is the selection bucket key on the filter model).
const filterItems = computed(() => [
  {
    id: 'statusId',
    label: 'Status',
    icon: IconCircleDot,
    group: 'statusId',
    options: selectOpts(ncStatuses.value),
  },
  {
    id: 'severityId',
    label: 'Severity',
    icon: IconAlertTriangle,
    group: 'severityId',
    options: selectOpts(ncSeverities.value),
  },
  {
    id: 'typeId',
    label: 'Type',
    icon: IconTag,
    group: 'typeId',
    options: selectOpts(ncTypes.value),
  },
  {
    id: 'supplierId',
    label: 'Supplier',
    icon: IconBuildingFactory2,
    group: 'supplierId',
    searchable: true,
    options: selectOpts(suppliers.value),
  },
  { id: 'createdAt', label: 'Created date', icon: IconCalendar, group: 'createdAt', type: 'date' },
])

const columns = computed(() => {
  // Severity is shown as the accent dot on the title (no separate colored pill
  // column); Created is dropped to keep the table readable without overflow.
  const filterCfg = {
    status: { filterType: 'select', filterOptions: selectOpts(ncStatuses.value) },
    type: { filterType: 'select', filterOptions: selectOpts(ncTypes.value) },
  }
  return [
    {
      name: 'ncNumber',
      label: 'NC #',
      field: 'ncNumber',
      align: 'left',
      sortable: true,
      hideable: false,
    },
    { name: 'title', label: 'Title', field: 'title', align: 'left', sortable: true },
    { name: 'status', label: 'Status', field: 'statusId', align: 'left', sortable: false },
    { name: 'type', label: 'Type', field: 'typeId', align: 'left', sortable: false },
    { name: 'actions', label: '', field: 'actions', align: 'right' },
  ].map((c) => ({ ...c, ...(filterCfg[c.name] || {}) }))
})

const pagination = ref({ page: 1, pageSize: 50 })
// rows arrive pre-sorted (newest first) from the query
const sort = ref([])
// Dense by default — this is a high-volume work list, not a dashboard.
const density = ref('compact')

function rowMenuItems(row) {
  const items = []
  if (props.canUpdate) {
    items.push({ name: 'Edit', icon: IconEdit, click: () => emit('edit', row) })
  }
  if (props.canDelete) {
    items.push({ name: 'Delete', icon: IconTrash, click: () => emit('delete', row) })
  }
  return items
}
</script>

<template>
  <DataTable
    v-model:pagination="pagination"
    v-model:sort="sort"
    v-model:density="density"
    :rows="rows"
    :columns="columns"
    rowKey="id"
    :noDataLabel="emptyLabel"
    searchable
    exportManager
    exportFilename="nonconformances.csv"
    persistKey="nonconformances"
  >
    <!-- Query-level filter menu -->
    <template #toolbar-filters>
      <BaseFilterMenu
        :modelValue="menuFilters"
        :items="filterItems"
        iconOnly
        @update:modelValue="onMenuFilters"
      />
    </template>

    <!-- Quick views -->
    <template #tabs>
      <BaseQuickFilterPills v-model="activeFilter" :pills="filterPills" ariaLabel="Quick views" />
    </template>

    <template #body-cell-ncNumber="{ row }">
      <RouterLink
        :to="getCompanyPath(`/nonconformances/${row.id}`)"
        class="tw:text-xs tw:text-secondary tw:hover:text-primary"
      >
        {{ row.ncNumber || '—' }}
      </RouterLink>
    </template>

    <template #body-cell-title="{ row }">
      <RouterLink
        :to="getCompanyPath(`/nonconformances/${row.id}`)"
        class="tw:flex tw:items-center tw:gap-2 tw:text-on-main tw:hover:text-primary"
      >
        <span
          class="tw:inline-block tw:w-2 tw:h-2 tw:rounded-full tw:shrink-0"
          :class="severityDotClass[row.severityId] || 'tw:bg-gray-400'"
        />
        <span class="tw:font-medium">{{ row.title }}</span>
      </RouterLink>
    </template>

    <template #body-cell-status="{ row }">
      <NcStatusBadgeById :statusId="row.statusId" />
    </template>

    <template #body-cell-type="{ row }">
      <NcTypeBadgeById :typeId="row.typeId" />
    </template>

    <template #body-cell-actions="{ row }">
      <div v-if="rowMenuItems(row).length" class="tw:flex tw:justify-end">
        <BaseMenu :items="rowMenuItems(row)" />
      </div>
    </template>
  </DataTable>
</template>
