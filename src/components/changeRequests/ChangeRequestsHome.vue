<script setup>
import {
  IconAlertCircle,
  IconClock,
  IconShieldCheck,
  IconCircleCheck,
  IconDownload,
} from '@tabler/icons-vue'
import { isAllowed, currentSession } from '@/utils/currentSession.js'
import { getCompanyPath } from '@/utils/routeHelpers.js'
import { matchesDateFilter } from '@/utils/dateRanges.js'
import { exportToCSV } from '@/utils/exportUtils.js'
import { DateTime } from 'luxon'

const router = useRouter()

const canCreate = computed(() => isAllowed(['changeRequests:create']))
const canUpdate = computed(() => isAllowed(['changeRequests:update']))

// Filters + resolved content state (URL-synced). Declared before the live query
// because `total`/`empty` are lazy getters that read `changeRequests`.
const list = useListLayout({
  filters: {
    search: '',
    // Multi-select dimensions (Linear-style filter menu) — arrays of ids.
    statusId: [],
    priorityId: [],
    changeTypeId: [],
    createdAt: null,
    activeFilter: 'all_open',
  },
  total: () => changeRequests.value.length,
  empty: () => changeRequests.value.length === 0,
  syncUrl: true,
})

function exportCsv() {
  exportToCSV(
    changeRequests.value,
    [
      { field: 'crNumber', label: 'CR #' },
      { field: 'title', label: 'Title' },
      { field: 'statusId', label: 'Status' },
      { field: 'priorityId', label: 'Priority' },
      { field: (r) => r.createdAt?.toFormat?.('yyyy-LL-dd') ?? '', label: 'Created' },
    ],
    'change-requests',
  )
}

const OPEN_STATUSES = [
  'DRAFT',
  'UNDER_REVIEW',
  'APPROVED',
  'IN_IMPLEMENTATION',
  'PENDING_EFFECTIVENESS',
  'ON_HOLD',
]
const CLOSED_STATUSES = ['CLOSED', 'REJECTED', 'CANCELLED']

function applyFilters(results, search, statusIds, priorityIds, changeTypeIds) {
  if (search) {
    const q = search.toLowerCase()
    results = results.filter(
      (r) => r.title?.toLowerCase().includes(q) || r.crNumber?.toLowerCase().includes(q),
    )
  }
  if (statusIds?.length) results = results.filter((r) => statusIds.includes(r.statusId))
  if (priorityIds?.length) results = results.filter((r) => priorityIds.includes(r.priorityId))
  if (changeTypeIds?.length)
    results = results.filter((r) => changeTypeIds.includes(r.changeTypeId))
  return results
}

function applyActiveFilter(results, af) {
  const userId = currentSession.value?.userId
  if (af === 'all_open') return results.filter((r) => OPEN_STATUSES.includes(r.statusId))
  if (af === 'mine')
    return results.filter((r) => r.ownerId === userId && OPEN_STATUSES.includes(r.statusId))
  if (af === 'awaiting_approval') return results.filter((r) => r.statusId === 'UNDER_REVIEW')
  if (af === 'urgent')
    return results.filter((r) => r.priorityId === 'URGENT' && OPEN_STATUSES.includes(r.statusId))
  if (af === 'closed') return results.filter((r) => CLOSED_STATUSES.includes(r.statusId))
  return results
}

const allCRs = useLiveQuery((db) => db.ChangeRequest.where().exec(), {
  models: ['ChangeRequest'],
  initial: [],
})

const changeRequests = useLiveQueryWithDeps(
  [
    () => list.filters.value.search,
    () => list.filters.value.statusId,
    () => list.filters.value.priorityId,
    () => list.filters.value.changeTypeId,
    () => list.filters.value.activeFilter,
    () => list.filters.value.createdAt,
  ],
  async (db, [search, statusIds, priorityIds, changeTypeIds, af, createdAt]) => {
    let results = await db.ChangeRequest.where().exec()
    results = applyFilters(results, search, statusIds, priorityIds, changeTypeIds)
    results = applyActiveFilter(results, af)
    if (createdAt)
      results = results.filter((r) => matchesDateFilter(r.createdAt, createdAt))
    return results.sort(
      (a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0),
    )
  },

  { models: ['ChangeRequest'], initial: [] },
)

const stats = computed(() => {
  const all = allCRs.value
  const now = DateTime.now()
  const startOfMonth = now.startOf('month')
  const open = all.filter((r) => OPEN_STATUSES.includes(r.statusId))
  const awaitingApproval = all.filter((r) => r.statusId === 'UNDER_REVIEW')
  const urgentOpen = open.filter((r) => r.priorityId === 'URGENT')
  const closedThisMonth = all.filter(
    (r) => r.statusId === 'CLOSED' && r.closedAt && r.closedAt >= startOfMonth,
  )
  return {
    open: open.length,
    awaitingApproval: awaitingApproval.length,
    urgentOpen: urgentOpen.length,
    closedThisMonth: closedThisMonth.length,
  }
})

// Compact KPI strip (list-page metrics bar) — matches the other QMS list pages.
const kpiItems = computed(() => [
  { key: 'open', label: 'Open CRs', value: stats.value.open, icon: IconAlertCircle, color: 'blue' },
  {
    key: 'awaiting',
    label: 'Awaiting approval',
    value: stats.value.awaitingApproval,
    icon: IconClock,
    color: 'amber',
  },
  {
    key: 'urgent',
    label: 'Urgent open',
    value: stats.value.urgentOpen,
    icon: IconShieldCheck,
    color: 'red',
    emphasize: stats.value.urgentOpen > 0,
  },
  {
    key: 'closed',
    label: 'Closed this month',
    value: stats.value.closedThisMonth,
    icon: IconCircleCheck,
    color: 'green',
  },
])

function onCreate() {
  router.push(getCompanyPath('/change-requests/create'))
}
</script>

<template>
  <BaseListLayout
    title="Change Requests"
    subtitle="Plan, approve, implement, and verify the effectiveness of controlled changes."
    :state="list.state.value"
    :emptyTitle="
      list.hasActiveFilters.value
        ? 'No change requests match your filters'
        : 'No change requests yet'
    "
  >
    <template #actions>
      <BaseButton variant="outline" :disabled="!changeRequests.length" @click="exportCsv">
        <IconDownload :size="16" class="tw:mr-1" />
        Export
      </BaseButton>
      <BaseButton v-if="canCreate" variant="primary" @click="onCreate">
        New Change Request
      </BaseButton>
    </template>

    <template #stats>
      <BaseStatStrip :items="kpiItems" />
    </template>

    <template #filters>
      <ChangeRequestsFilterToolbar
        v-model:filters="list.filters.value"
        v-model:activeFilter="list.filters.value.activeFilter"
      />
    </template>

    <ChangeRequestsTable
      :rows="changeRequests"
      :canUpdate="canUpdate"
      @edit="(row) => router.push(getCompanyPath(`/change-requests/${row.id}`))"
    />
  </BaseListLayout>
</template>
