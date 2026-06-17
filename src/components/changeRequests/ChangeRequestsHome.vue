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
import { dateInRange } from '@/utils/listFilters.js'
import { exportToCSV } from '@/utils/exportUtils.js'
import { DateTime } from 'luxon'

const router = useRouter()

const canCreate = computed(() => isAllowed(['changeRequests:create']))
const canUpdate = computed(() => isAllowed(['changeRequests:update']))

const filters = ref({
  search: '',
  statusId: null,
  priorityId: null,
  changeTypeId: null,
  dateFrom: '',
  dateTo: '',
})
const activeFilter = ref('all_open')

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

function applyFilters(results, search, statusId, priorityId, changeTypeId) {
  if (search) {
    const q = search.toLowerCase()
    results = results.filter(
      (r) => r.title?.toLowerCase().includes(q) || r.crNumber?.toLowerCase().includes(q),
    )
  }
  if (statusId) results = results.filter((r) => r.statusId === statusId)
  if (priorityId) results = results.filter((r) => r.priorityId === priorityId)
  if (changeTypeId) results = results.filter((r) => r.changeTypeId === changeTypeId)
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
    () => filters.value.search,
    () => filters.value.statusId,
    () => filters.value.priorityId,
    () => filters.value.changeTypeId,
    () => activeFilter.value,
    () => filters.value.dateFrom,
    () => filters.value.dateTo,
  ],
  async (db, [search, statusId, priorityId, changeTypeId, af, dateFrom, dateTo]) => {
    let results = await db.ChangeRequest.where().exec()
    results = applyFilters(results, search, statusId, priorityId, changeTypeId)
    results = applyActiveFilter(results, af)
    if (dateFrom || dateTo)
      results = results.filter((r) => dateInRange(r.createdAt, dateFrom, dateTo))
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

function onCreate() {
  router.push(getCompanyPath('/change-requests/create'))
}
</script>

<template>
  <BasePage width="standard" density="compact">
    <PageHeader title="Change Requests" />

    <SafeTeleport to="#main-header-actions">
      <BaseButton variant="outline" :disabled="!changeRequests.length" @click="exportCsv">
        <IconDownload :size="16" class="tw:mr-1" />
        Export
      </BaseButton>
      <BaseButton v-if="canCreate" variant="primary" @click="onCreate">
        New Change Request
      </BaseButton>
    </SafeTeleport>

    <div class="tw:flex tw:flex-col tw:gap-1">
      <div class="tw:text-3xl tw:font-bold tw:text-on-sidebar">Change Requests</div>
      <div class="tw:text-sm tw:text-secondary">
        Plan, approve, implement, and verify the effectiveness of controlled changes.
      </div>
    </div>

    <div class="tw:grid tw:grid-cols-2 tw:md:grid-cols-4 tw:gap-3">
      <div
        class="tw:bg-white tw:rounded-lg tw:border tw:border-divider tw:p-4 tw:flex tw:items-center tw:gap-4"
      >
        <div
          class="tw:w-10 tw:h-10 tw:rounded-lg tw:bg-blue-50 tw:text-blue-600 tw:flex tw:items-center tw:justify-center tw:shrink-0"
        >
          <IconAlertCircle :size="20" />
        </div>
        <div>
          <div class="tw:text-xs tw:uppercase tw:tracking-tight tw:font-bold tw:text-secondary">
            Open CRs
          </div>
          <div class="tw:text-2xl tw:font-black tw:text-on-sidebar">{{ stats.open }}</div>
        </div>
      </div>
      <div
        class="tw:bg-white tw:rounded-lg tw:border tw:border-divider tw:p-4 tw:flex tw:items-center tw:gap-4"
      >
        <div
          class="tw:w-10 tw:h-10 tw:rounded-lg tw:bg-amber-50 tw:text-amber-600 tw:flex tw:items-center tw:justify-center tw:shrink-0"
        >
          <IconClock :size="20" />
        </div>
        <div>
          <div class="tw:text-xs tw:uppercase tw:tracking-tight tw:font-bold tw:text-secondary">
            Awaiting approval
          </div>
          <div class="tw:text-2xl tw:font-black tw:text-on-sidebar">
            {{ stats.awaitingApproval }}
          </div>
        </div>
      </div>
      <div
        class="tw:bg-white tw:rounded-lg tw:border tw:border-divider tw:p-4 tw:flex tw:items-center tw:gap-4"
      >
        <div
          class="tw:w-10 tw:h-10 tw:rounded-lg tw:bg-red-50 tw:text-red-600 tw:flex tw:items-center tw:justify-center tw:shrink-0"
        >
          <IconShieldCheck :size="20" />
        </div>
        <div>
          <div class="tw:text-xs tw:uppercase tw:tracking-tight tw:font-bold tw:text-secondary">
            Urgent open
          </div>
          <div
            class="tw:text-2xl tw:font-black"
            :class="stats.urgentOpen > 0 ? 'tw:text-red-600' : 'tw:text-on-sidebar'"
          >
            {{ stats.urgentOpen }}
          </div>
        </div>
      </div>
      <div
        class="tw:bg-white tw:rounded-lg tw:border tw:border-divider tw:p-4 tw:flex tw:items-center tw:gap-4"
      >
        <div
          class="tw:w-10 tw:h-10 tw:rounded-lg tw:bg-green-50 tw:text-green-600 tw:flex tw:items-center tw:justify-center tw:shrink-0"
        >
          <IconCircleCheck :size="20" />
        </div>
        <div>
          <div class="tw:text-xs tw:uppercase tw:tracking-tight tw:font-bold tw:text-secondary">
            Closed this month
          </div>
          <div class="tw:text-2xl tw:font-black tw:text-on-sidebar">
            {{ stats.closedThisMonth }}
          </div>
        </div>
      </div>
    </div>

    <ChangeRequestsFilterToolbar v-model:filters="filters" v-model:activeFilter="activeFilter" />

    <ChangeRequestsTable
      :rows="changeRequests"
      :canUpdate="canUpdate"
      @edit="(row) => router.push(getCompanyPath(`/change-requests/${row.id}`))"
    />
  </BasePage>
</template>
