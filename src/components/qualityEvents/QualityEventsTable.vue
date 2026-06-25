<script setup>
import { IconTrash, IconArrowUpRight } from '@tabler/icons-vue'
import { getCompanyPath } from '@/utils/routeHelpers'
import { DateTime } from 'luxon'
import { QUALITY_EVENT_STATUSES } from '@/utils/qualityEventStatuses'

const props = defineProps({
  rows: { type: Array, default: () => [] },
  escalatedIds: { type: Object, default: () => new Set() },
  canDelete: { type: Boolean, default: false },
})

const emit = defineEmits(['delete'])

// Option sources for the advanced filter's entity-column dropdowns.
const eventCategories = useLiveQuery((db) => db.EventCategory.where().exec(), {
  models: ['EventCategory'],
  initial: [],
})
const eventSeverities = useLiveQuery((db) => db.EventSeverity.where().exec(), {
  models: ['EventSeverity'],
  initial: [],
})
const users = useLiveQuery((db) => db.User.where().exec(), { models: ['User'], initial: [] })
function selectOpts(list) {
  return list.map((x) => ({ value: x.id, label: x.name }))
}
function userLabel(u) {
  return `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email
}

const columns = computed(() => {
  const filterCfg = {
    category: { filterType: 'select', filterOptions: selectOpts(eventCategories.value) },
    severity: { filterType: 'select', filterOptions: selectOpts(eventSeverities.value) },
    status: { filterType: 'select', filterOptions: selectOpts(QUALITY_EVENT_STATUSES) },
    assignee: {
      filterType: 'select',
      filterOptions: users.value.map((u) => ({ value: u.id, label: userLabel(u) })),
    },
    reporter: {
      filterType: 'select',
      filterOptions: users.value.map((u) => ({ value: u.id, label: userLabel(u) })),
    },
    reportedDate: { filterType: 'date' },
    daysOpen: { filterType: 'number' },
  }
  return [
    { name: 'eventNumber', label: 'EVENT #', field: 'eventNumber', align: 'left', sortable: true, hideable: false },
    { name: 'title', label: 'TITLE', field: 'title', align: 'left', sortable: true },
    { name: 'category', label: 'CATEGORY', field: 'categoryId', align: 'left', sortable: false },
    { name: 'severity', label: 'SEVERITY', field: 'severityId', align: 'left', sortable: false },
    { name: 'status', label: 'STATUS', field: 'statusId', align: 'left', sortable: false },
    { name: 'assignee', label: 'ASSIGNED TO', field: 'assignedToUserId', align: 'left', sortable: false },
    { name: 'reporter', label: 'REPORTED BY', field: 'reportedByUserId', align: 'left', sortable: false },
    { name: 'reportedDate', label: 'REPORTED', field: 'reportedDate', align: 'left', sortable: true },
    { name: 'daysOpen', label: 'DAYS OPEN', field: 'daysOpen', align: 'right', sortable: false },
    { name: 'escalated', label: 'ESCALATED', field: 'escalated', align: 'center', sortable: false },
    { name: 'actions', label: '', field: 'actions', align: 'right' },
  ].map((c) => ({ ...c, ...(filterCfg[c.name] || {}) }))
})

function daysOpen(row) {
  const start = row.reportedDate || row.createdAt
  if (!start) return '—'
  const end = ['CLOSED', 'CANCELLED'].includes(row.statusId) ? row.decisionDate || DateTime.now() : DateTime.now()
  const d = Math.max(0, Math.floor(end.diff(start, 'days').days))
  return d
}

const pagination = ref({ page: 1, pageSize: 50 })
const sort = ref([{ id: 'reportedDate', desc: true }])

function rowMenuItems(row) {
  const items = []
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
    :rows="rows"
    :columns="columns"
    rowKey="id"
    :mobileCards="false"
    searchable
    columnManager
    densitySelector
    filterable
    exportManager
    exportFilename="quality-events.csv"
    persistKey="qualityEvents"
  >
    <template #body-cell-eventNumber="{ row }">
      <RouterLink
        :to="getCompanyPath(`/qualityEvents/${row.id}`)"
        class="tw:font-mono tw:text-xs tw:text-secondary tw:hover:text-primary"
      >
        {{ row.eventNumber || '—' }}
      </RouterLink>
    </template>

    <template #body-cell-title="{ row }">
      <RouterLink
        :to="getCompanyPath(`/qualityEvents/${row.id}`)"
        class="tw:font-medium tw:text-on-main tw:hover:text-primary"
      >
        {{ row.title }}
      </RouterLink>
    </template>

    <template #body-cell-category="{ row }">
      <EventCategoryBadgeById v-if="row.categoryId" :categoryId="row.categoryId" />
      <span v-else class="tw:text-secondary">—</span>
    </template>

    <template #body-cell-severity="{ row }">
      <EventSeverityBadgeById v-if="row.severityId" :severityId="row.severityId" />
      <span v-else class="tw:text-secondary">—</span>
    </template>

    <template #body-cell-status="{ row }">
      <QualityEventStatusBadgeById :statusId="row.statusId" />
    </template>

    <template #body-cell-assignee="{ row }">
      <UserBadgeById v-if="row.assignedToUserId" :userId="row.assignedToUserId" />
      <span v-else class="tw:text-secondary">—</span>
    </template>

    <template #body-cell-reporter="{ row }">
      <UserBadgeById v-if="row.reportedByUserId" :userId="row.reportedByUserId" />
      <span v-else class="tw:text-secondary">—</span>
    </template>

    <template #body-cell-reportedDate="{ row }">
      <span class="tw:text-sm tw:text-secondary">{{ row.reportedDate?.formatDate('date') || '—' }}</span>
    </template>

    <template #body-cell-daysOpen="{ row }">
      <span class="tw:text-sm tw:text-secondary">{{ daysOpen(row) }}</span>
    </template>

    <template #body-cell-escalated="{ row }">
      <IconArrowUpRight v-if="escalatedIds.has(row.id)" :size="16" class="tw:text-orange-600 tw:inline" />
      <span v-else class="tw:text-secondary">—</span>
    </template>

    <template #body-cell-actions="{ row }">
      <div v-if="rowMenuItems(row).length" class="tw:flex tw:justify-end">
        <BaseMenu :items="rowMenuItems(row)" />
      </div>
    </template>
  </DataTable>
</template>
