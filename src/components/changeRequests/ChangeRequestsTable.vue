<script setup>
import {
  IconEdit,
  IconExternalLink,
  IconCircleDot,
  IconAlertTriangle,
  IconTag,
  IconCalendar,
} from '@tabler/icons-vue'
import { getCompanyPath } from '@/utils/routeHelpers.js'

defineProps({
  rows: { type: Array, required: true },
  canUpdate: { type: Boolean, default: false },
  // Copy for the in-card empty state (the page's filters produced no rows).
  // The table stays mounted when empty so its filter controls remain reachable.
  emptyLabel: { type: String, default: null },
})

const emit = defineEmits(['edit'])

// Quick views, rendered in the table toolbar's #tabs slot.
const activeFilter = defineModel('activeFilter', { type: String, default: 'all_open' })
// Query-level filters (applied upstream in ChangeRequestsHome, before the rows
// reach this table) — the cascading menu lives in the toolbar's
// #toolbar-filters slot, beside DataTable's own column-filter trigger.
const filters = defineModel('filters', { type: Object, default: () => ({}) })

const filterPills = [
  // 'All' means no lifecycle filter at all — closed and cancelled records
  // included. Every other pill narrows to some subset of open, so without
  // this there was no way to see the whole register in one list.
  { value: 'all', label: 'All' },
  { value: 'all_open', label: 'All open' },
  { value: 'mine', label: 'Mine' },
  { value: 'awaiting_approval', label: 'Awaiting approval' },
  { value: 'urgent', label: 'Urgent' },
  { value: 'closed', label: 'Closed' },
]

// The menu is bound to ONLY its own groups: BaseFilterMenu's count badge counts
// every non-empty value in the object it's given, so handing it the whole filter
// bag made it report the quick view (`activeFilter`) as an active filter.
const MENU_GROUPS = ['statusId', 'priorityId', 'changeTypeId', 'createdAt']
const menuFilters = computed(() =>
  Object.fromEntries(MENU_GROUPS.map((k) => [k, filters.value?.[k] ?? null])),
)
function onMenuFilters(next) {
  filters.value = { ...filters.value, ...next }
}

// Option sources, shared by the filter menu and the advanced filter's
// entity-column dropdowns (ordered so both read in the configured order).
const changeTypes = useLiveQuery((db) => db.ChangeType.where().orderBy('displayOrder').exec(), {
  models: ['ChangeType'],
  initial: [],
})
const priorities = useLiveQuery(
  (db) => db.ChangeRequestPriority.where().orderBy('displayOrder').exec(),
  { models: ['ChangeRequestPriority'], initial: [] },
)
const statuses = useLiveQuery(
  (db) => db.ChangeRequestStatus.where().orderBy('displayOrder').exec(),
  { models: ['ChangeRequestStatus'], initial: [] },
)
const users = useLiveQuery((db) => db.User.where().exec(), { models: ['User'], initial: [] })
function selectOpts(list) {
  return list.map((x) => ({ value: x.id, label: x.name }))
}
function userOpts(list) {
  return list.map((u) => ({ value: u.id, label: `${u.firstName} ${u.lastName}`.trim() || u.email }))
}

// Descriptor tree for the cascading filter menu (each dimension → a submenu of
// its values; `group` is the selection bucket key on the filter model).
const filterItems = computed(() => [
  {
    id: 'statusId',
    label: 'Status',
    icon: IconCircleDot,
    group: 'statusId',
    options: selectOpts(statuses.value),
  },
  {
    id: 'priorityId',
    label: 'Priority',
    icon: IconAlertTriangle,
    group: 'priorityId',
    options: selectOpts(priorities.value),
  },
  {
    id: 'changeTypeId',
    label: 'Type',
    icon: IconTag,
    group: 'changeTypeId',
    options: selectOpts(changeTypes.value),
  },
  { id: 'createdAt', label: 'Created date', icon: IconCalendar, group: 'createdAt', type: 'date' },
])

const columns = computed(() => {
  const filterCfg = {
    changeType: { filterType: 'select', filterOptions: selectOpts(changeTypes.value) },
    priority: { filterType: 'select', filterOptions: selectOpts(priorities.value) },
    status: { filterType: 'select', filterOptions: selectOpts(statuses.value) },
    owner: { filterType: 'select', filterOptions: userOpts(users.value) },
    targetImplementationDate: { filterType: 'date' },
  }
  return [
    { name: 'crNumber', label: 'CR #', field: 'crNumber', align: 'left' },
    { name: 'title', label: 'Title', field: 'title', align: 'left' },
    { name: 'changeType', label: 'Type', align: 'left' },
    { name: 'priority', label: 'Priority', align: 'left' },
    { name: 'status', label: 'Status', align: 'left' },
    { name: 'owner', label: 'Owner', align: 'left' },
    { name: 'targetImplementationDate', label: 'Target Date', align: 'left' },
    { name: 'actions', label: '', align: 'right' },
  ].map((c) => ({ ...c, ...(filterCfg[c.name] || {}) }))
})
</script>

<template>
  <DataTable
    :rows="rows"
    :columns="columns"
    rowKey="id"
    :noDataLabel="emptyLabel"
    :mobileCards="false"
    searchable
    exportManager
    exportFilename="change-requests.csv"
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

    <template #body-cell-crNumber="{ row }">
      <RouterLink
        :to="getCompanyPath(`/change-requests/${row.id}`)"
        class="tw:text-xs tw:font-medium tw:text-primary tw:hover:underline"
      >
        {{ row.crNumber || 'Draft' }}
      </RouterLink>
    </template>

    <template #body-cell-title="{ row }">
      <RouterLink
        :to="getCompanyPath(`/change-requests/${row.id}`)"
        class="tw:text-sm tw:font-semibold tw:text-on-main tw:hover:text-primary"
      >
        {{ row.title }}
      </RouterLink>
    </template>

    <template #body-cell-changeType="{ row }">
      <ChangeTypeBadgeById :changeTypeId="row.changeTypeId" />
    </template>

    <template #body-cell-priority="{ row }">
      <ChangeRequestPriorityBadgeById :priorityId="row.priorityId" />
    </template>

    <template #body-cell-status="{ row }">
      <ChangeRequestStatusBadgeById :statusId="row.statusId" />
    </template>

    <template #body-cell-owner="{ row }">
      <UserBadgeById :userId="row.ownerId" />
    </template>

    <template #body-cell-targetImplementationDate="{ row }">
      <span class="tw:text-sm tw:text-on-main">
        {{ row.targetImplementationDate ? row.targetImplementationDate.formatDate('date') : '—' }}
      </span>
    </template>

    <template #body-cell-actions="{ row }">
      <div class="tw:flex tw:items-center tw:gap-2 tw:justify-end">
        <button
          v-if="canUpdate"
          class="tw:text-secondary tw:hover:text-primary tw:cursor-pointer"
          @click="emit('edit', row)"
        >
          <IconEdit :size="16" />
        </button>
        <RouterLink
          :to="getCompanyPath(`/change-requests/${row.id}`)"
          class="tw:text-secondary tw:hover:text-primary"
        >
          <IconExternalLink :size="16" />
        </RouterLink>
      </div>
    </template>
  </DataTable>
</template>
