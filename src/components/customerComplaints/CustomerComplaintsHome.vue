<script setup>
import {
  IconMessageCircle,
  IconUserOff,
  IconAlertTriangle,
  IconCircleCheck,
  IconLink,
  IconCode,
} from '@tabler/icons-vue'
import { isAllowed, currentSession } from '@/utils/currentSession.js'
import { getCompanyPath } from '@/utils/routeHelpers.js'
import { DateTime } from 'luxon'

const router = useRouter()
const toast = useToast()

const canCreate = computed(() => isAllowed(['customerComplaints:create']))
const canDelete = computed(() => isAllowed(['customerComplaints:delete']))

const filters = ref({ search: '', statusId: null, priorityId: null, sourceId: null })
const activeFilter = ref('all_open')

const OPEN_STATUSES = ['NEW', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_ON_CUSTOMER', 'RESOLVED']
const CLOSED_STATUSES = ['CLOSED']

function applyFilters(results, search, statusId, priorityId, sourceId) {
  if (search) {
    const q = search.toLowerCase()
    results = results.filter(
      (r) =>
        r.subject?.toLowerCase().includes(q) ||
        r.complaintNumber?.toLowerCase().includes(q) ||
        r.customerEmail?.toLowerCase().includes(q) ||
        r.customerName?.toLowerCase().includes(q),
    )
  }
  if (statusId) results = results.filter((r) => r.statusId === statusId)
  if (priorityId) results = results.filter((r) => r.priorityId === priorityId)
  if (sourceId) results = results.filter((r) => r.sourceId === sourceId)
  return results
}

function applyActiveFilter(results, af) {
  const userId = currentSession.value?.userId
  if (af === 'all_open') return results.filter((r) => OPEN_STATUSES.includes(r.statusId))
  if (af === 'mine')
    return results.filter(
      (r) => r.assignedToUserId === userId && OPEN_STATUSES.includes(r.statusId),
    )
  if (af === 'unassigned')
    return results.filter((r) => !r.assignedToUserId && OPEN_STATUSES.includes(r.statusId))
  if (af === 'urgent')
    return results.filter((r) => r.priorityId === 'URGENT' && OPEN_STATUSES.includes(r.statusId))
  if (af === 'closed') return results.filter((r) => CLOSED_STATUSES.includes(r.statusId))
  return results
}

const allComplaints = useLiveQuery((db) => db.CustomerComplaint.where().exec(), { initial: [] })

const complaints = useLiveQueryWithDeps(
  [
    () => filters.value.search,
    () => filters.value.statusId,
    () => filters.value.priorityId,
    () => filters.value.sourceId,
    () => activeFilter.value,
  ],
  async (db, [search, statusId, priorityId, sourceId, af]) => {
    let results = await db.CustomerComplaint.where().exec()
    results = applyFilters(results, search, statusId, priorityId, sourceId)
    results = applyActiveFilter(results, af)
    return results.sort(
      (a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0),
    )
  },
  { initial: [] },
)

const stats = computed(() => {
  const all = allComplaints.value
  const now = DateTime.now()
  const startOfMonth = now.startOf('month')
  const openComplaints = all.filter((r) => OPEN_STATUSES.includes(r.statusId))
  const unassigned = openComplaints.filter((r) => !r.assignedToUserId)
  const urgentOpen = openComplaints.filter((r) => r.priorityId === 'URGENT')
  const closedThisMonth = all.filter(
    (r) => CLOSED_STATUSES.includes(r.statusId) && r.closedAt && r.closedAt >= startOfMonth,
  )
  return {
    open: openComplaints.length,
    unassigned: unassigned.length,
    urgent: urgentOpen.length,
    closedThisMonth: closedThisMonth.length,
  }
})

const showPublicLinkDialog = ref(false)
const showWidgetDialog = ref(false)

function onNewComplaint() {
  router.push(getCompanyPath('/customer-complaints/create'))
}

async function onDelete(row) {
  try {
    await row.delete()
    toast.notify({ type: 'positive', message: `Ticket ${row.complaintNumber} deleted` })
  } catch (err) {
    toast.notify({ type: 'negative', message: err.message || 'Failed to delete' })
  }
}
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-3 tw:h-full tw:p-5">
    <SafeTeleport to="#main-header-title">
      <div class="tw:flex tw:items-center tw:gap-2 tw:text-on-sidebar">
        <h2 class="tw:text-lg tw:font-bold tw:tracking-tight tw:text-nowrap">
          Customer Complaints
        </h2>
      </div>
    </SafeTeleport>

    <SafeTeleport to="#main-header-actions">
      <div class="tw:flex tw:items-center tw:gap-2">
        <BaseButton variant="outline" @click="showWidgetDialog = true">
          <template #icon><IconCode :size="16" /></template>
          Widget
        </BaseButton>
        <BaseButton variant="outline" @click="showPublicLinkDialog = true">
          <template #icon><IconLink :size="16" /></template>
          Public link
        </BaseButton>
        <BaseButton v-if="canCreate" variant="primary" @click="onNewComplaint">
          New ticket
        </BaseButton>
      </div>
    </SafeTeleport>

    <div class="tw:flex tw:flex-col tw:gap-1">
      <div class="tw:text-3xl tw:font-bold tw:text-on-sidebar">Customer Complaints</div>
      <div class="tw:text-sm tw:text-secondary">
        Intake, triage and respond to customer-reported issues. Escalate to a Nonconformance when
        an investigation is required.
      </div>
    </div>

    <div class="tw:grid tw:grid-cols-2 tw:md:grid-cols-4 tw:gap-3">
      <div
        class="tw:bg-white tw:rounded-lg tw:border tw:border-divider tw:p-4 tw:flex tw:items-center tw:gap-4"
      >
        <div
          class="tw:w-10 tw:h-10 tw:rounded-lg tw:bg-blue-50 tw:text-blue-600 tw:flex tw:items-center tw:justify-center tw:shrink-0"
        >
          <IconMessageCircle :size="20" />
        </div>
        <div>
          <div class="tw:text-xs tw:uppercase tw:tracking-tight tw:font-bold tw:text-secondary">
            Open tickets
          </div>
          <div class="tw:text-2xl tw:font-black tw:text-on-sidebar">{{ stats.open }}</div>
        </div>
      </div>
      <div
        class="tw:bg-white tw:rounded-lg tw:border tw:border-divider tw:p-4 tw:flex tw:items-center tw:gap-4"
      >
        <div
          class="tw:w-10 tw:h-10 tw:rounded-lg tw:bg-indigo-50 tw:text-indigo-600 tw:flex tw:items-center tw:justify-center tw:shrink-0"
        >
          <IconUserOff :size="20" />
        </div>
        <div>
          <div class="tw:text-xs tw:uppercase tw:tracking-tight tw:font-bold tw:text-secondary">
            Unassigned
          </div>
          <div
            class="tw:text-2xl tw:font-black"
            :class="stats.unassigned > 0 ? 'tw:text-indigo-600' : 'tw:text-on-sidebar'"
          >
            {{ stats.unassigned }}
          </div>
        </div>
      </div>
      <div
        class="tw:bg-white tw:rounded-lg tw:border tw:border-divider tw:p-4 tw:flex tw:items-center tw:gap-4"
      >
        <div
          class="tw:w-10 tw:h-10 tw:rounded-lg tw:bg-red-50 tw:text-red-600 tw:flex tw:items-center tw:justify-center tw:shrink-0"
        >
          <IconAlertTriangle :size="20" />
        </div>
        <div>
          <div class="tw:text-xs tw:uppercase tw:tracking-tight tw:font-bold tw:text-secondary">
            Urgent open
          </div>
          <div
            class="tw:text-2xl tw:font-black"
            :class="stats.urgent > 0 ? 'tw:text-red-600' : 'tw:text-on-sidebar'"
          >
            {{ stats.urgent }}
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

    <CustomerComplaintsFilterToolbar
      v-model:filters="filters"
      v-model:activeFilter="activeFilter"
    />

    <CustomerComplaintsTable :rows="complaints" :canDelete="canDelete" @delete="onDelete" />

    <PublicLinkDialog v-model="showPublicLinkDialog" />
    <WidgetEmbedDialog v-model="showWidgetDialog" />
  </div>
</template>
