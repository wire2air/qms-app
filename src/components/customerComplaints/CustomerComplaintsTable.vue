<script setup>
import { getCompanyPath } from '@/utils/routeHelpers'
import { useComplaintFilterOptions } from './useComplaintFilterOptions.js'

const props = defineProps({
  rows: { type: Array, default: () => [] },
  selectable: { type: Boolean, default: false },
  customFieldKeys: { type: Array, default: () => [] },
})

defineEmits(['open'])

// Multi-select feeds the bulk actions. DataTable owns the checkbox column +
// select-all (page-scoped) and writes the selected ids back through this model.
const selected = defineModel('selected', { type: Array, default: () => [] })

// Columns. Visibility, order and pinning are managed by DataTable's built-in
// column manager and persisted per-user to the synced settings bag (persistKey).
// Columns outside DEFAULT_VISIBLE (incl. custom fields) start hidden but are
// toggleable in the manager.
const ALL_COLUMNS = [
  { name: 'complaintNumber', label: 'TICKET', field: 'complaintNumber', sortable: true },
  { name: 'subject', label: 'SUBJECT', field: 'subject', sortable: true },
  { name: 'customer', label: 'CUSTOMER', field: 'customerName', sortable: true },
  { name: 'source', label: 'SOURCE', field: 'sourceId' },
  { name: 'priority', label: 'PRIORITY', field: 'priorityId' },
  { name: 'sentiment', label: 'SENTIMENT', field: 'sentiment' },
  { name: 'assignedTo', label: 'ASSIGNED', field: 'assignedTo' },
  { name: 'assignedTeam', label: 'GROUP', field: 'assignedTeamId' },
  { name: 'status', label: 'STATUS', field: 'statusId' },
  { name: 'createdAt', label: 'CREATED', field: 'createdAt', sortable: true },
]
const DEFAULT_VISIBLE = new Set([
  'complaintNumber',
  'subject',
  'customer',
  'source',
  'priority',
  'assignedTo',
  'status',
  'createdAt',
])

// Entity option sources (shared with the page quick-filter toolbar) so the table's
// advanced filter offers proper labelled dropdowns (not raw ids) for badge columns.
const { PRIORITIES, SENTIMENTS, statuses, sources, users, teams, userLabel } =
  useComplaintFilterOptions()

function toOptions(list, mapLabel = (x) => x.name) {
  return list.map((x) => ({ value: x.id, label: mapLabel(x) }))
}

const columns = computed(() => {
  const filterCfg = {
    source: { filterType: 'select', filterOptions: toOptions(sources.value) },
    status: { filterType: 'select', filterOptions: toOptions(statuses.value) },
    priority: { filterType: 'select', filterOptions: toOptions(PRIORITIES) },
    sentiment: { filterType: 'select', filterOptions: toOptions(SENTIMENTS) },
    assignedTo: { filterType: 'select', filterOptions: toOptions(users.value, userLabel) },
    assignedTeam: { filterType: 'select', filterOptions: toOptions(teams.value) },
    createdAt: { filterType: 'date' },
  }
  return [
    ...ALL_COLUMNS,
    ...props.customFieldKeys.map((key) => ({
      name: `custom:${key}`,
      label: key.toUpperCase(),
      // Accessor (not a 'custom:key' field string) so export/sort/search/filter
      // read the real value; the display slot formats it via customValue().
      field: (row) => row.customFields?.[key] ?? null,
    })),
  ].map((c) => ({
    ...c,
    align: 'left',
    hidden: !DEFAULT_VISIBLE.has(c.name),
    ...(filterCfg[c.name] || {}),
  }))
})

function customValue(row, columnName) {
  const key = columnName.slice('custom:'.length)
  const value = row.customFields?.[key]
  if (value == null) return '—'
  return typeof value === 'object' ? JSON.stringify(value) : String(value)
}

const pagination = ref({ page: 1, pageSize: 50 })
const sort = ref([{ id: 'createdAt', desc: true }])
</script>

<template>
  <DataTable
    v-model:pagination="pagination"
    v-model:sort="sort"
    v-model:selected="selected"
    :rows="rows"
    :columns="columns"
    :selectable="selectable"
    rowKey="id"
    searchable
    filterable
    densitySelector
    columnManager
    persistKey="customerComplaints"
  >
    <template #body-cell-complaintNumber="{ row }">
      <RouterLink
        :to="getCompanyPath(`/customer-complaints/${row.id}`)"
        class="tw:font-mono tw:text-xs tw:text-secondary tw:hover:text-primary"
      >
        {{ row.complaintNumber || '—' }}
      </RouterLink>
    </template>

    <template #body-cell-subject="{ row }">
      <RouterLink
        :to="getCompanyPath(`/customer-complaints/${row.id}`)"
        class="tw:flex tw:items-center tw:gap-2 tw:text-on-main tw:hover:text-primary"
      >
        <span class="tw:font-medium">{{ row.subject }}</span>
        <BaseBadge v-if="row.isSpam" class="tw:bg-red-100 tw:text-red-700 tw:text-micro">
          Spam
        </BaseBadge>
      </RouterLink>
    </template>

    <template #body-cell-customer="{ row }">
      <div class="tw:flex tw:flex-col">
        <span class="tw:text-sm tw:font-medium">{{ row.customerName || '—' }}</span>
        <span v-if="row.customerEmail" class="tw:text-xs tw:text-secondary">
          {{ row.customerEmail }}
        </span>
      </div>
    </template>

    <template #body-cell-source="{ row }">
      <CustomerComplaintSourceBadgeById :sourceId="row.sourceId" />
    </template>

    <template #body-cell-priority="{ row }">
      <CustomerComplaintPriorityBadgeById v-if="row.priorityId" :priorityId="row.priorityId" />
      <span v-else class="tw:text-sm tw:text-secondary">—</span>
    </template>

    <template #body-cell-sentiment="{ row }">
      <CustomerComplaintSentimentBadgeById v-if="row.sentiment" :sentiment="row.sentiment" />
      <span v-else class="tw:text-sm tw:text-secondary">—</span>
    </template>

    <template #body-cell-assignedTo="{ row }">
      <UserBadgeById v-if="row.assignedTo" :userId="row.assignedTo" />
      <span v-else class="tw:text-sm tw:text-secondary tw:italic">Unassigned</span>
    </template>

    <template #body-cell-assignedTeam="{ row }">
      <GroupBadgeById v-if="row.assignedTeamId" :teamId="row.assignedTeamId" />
      <span v-else class="tw:text-sm tw:text-secondary">—</span>
    </template>

    <template #body-cell-status="{ row }">
      <CustomerComplaintStatusBadgeById :statusId="row.statusId" />
    </template>

    <template #body-cell-createdAt="{ row }">
      <span class="tw:text-sm tw:text-secondary">{{ row.createdAt?.formatDate('date') }}</span>
    </template>

    <!-- Custom field columns -->
    <template v-for="key in customFieldKeys" :key="key" #[`body-cell-custom:${key}`]="{ row }">
      <span class="tw:text-sm">{{ customValue(row, `custom:${key}`) }}</span>
    </template>
  </DataTable>
</template>
