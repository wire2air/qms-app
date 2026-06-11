<script setup>
import {
  IconHeadset,
  IconUserQuestion,
  IconClockPause,
  IconCircleCheck,
} from '@tabler/icons-vue'
import { isAllowed, currentSession } from '@/utils/currentSession.js'
import { getCompanyPath } from '@/utils/routeHelpers.js'
import { DateTime } from 'luxon'

const router = useRouter()

const canCreate = computed(() => isAllowed(['customerComplaints:create']))
const canUpdate = computed(() => isAllowed(['customerComplaints:update']))
const canConvert = computed(
  () => isAllowed(['customerComplaints:update']) && isAllowed(['nonconformances:create']),
)

const filters = ref({
  search: '',
  statusId: null,
  priorityId: null,
  sourceId: null,
  assignedTo: null,
})
const activeFilter = ref('all_open')

const OPEN_STATUSES = ['NEW', 'OPEN', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_CUSTOMER']

function applyFilters(results, { search, statusId, priorityId, sourceId, assignedTo }) {
  if (search) {
    const q = search.toLowerCase()
    results = results.filter(
      (r) =>
        r.subject?.toLowerCase().includes(q) ||
        r.complaintNumber?.toLowerCase().includes(q) ||
        r.customerName?.toLowerCase().includes(q) ||
        r.customerEmail?.toLowerCase().includes(q),
    )
  }
  if (statusId) results = results.filter((r) => r.statusId === statusId)
  if (priorityId) results = results.filter((r) => r.priorityId === priorityId)
  if (sourceId) results = results.filter((r) => r.sourceId === sourceId)
  if (assignedTo) results = results.filter((r) => r.assignedTo === assignedTo)
  return results
}

function applyActiveFilter(results, af) {
  const userId = currentSession.value?.userId
  if (af === 'all_open') return results.filter((r) => OPEN_STATUSES.includes(r.statusId))
  if (af === 'mine')
    return results.filter((r) => r.assignedTo === userId && OPEN_STATUSES.includes(r.statusId))
  if (af === 'unassigned')
    return results.filter((r) => !r.assignedTo && OPEN_STATUSES.includes(r.statusId))
  if (af === 'waiting') return results.filter((r) => r.statusId === 'WAITING_CUSTOMER')
  if (af === 'resolved') return results.filter((r) => r.statusId === 'RESOLVED')
  if (af === 'closed')
    return results.filter((r) => ['CLOSED', 'CONVERTED_TO_NC'].includes(r.statusId))
  return results
}

const allComplaints = useLiveQuery((db) => db.CustomerComplaint.where().exec(), { initial: [] })

const complaints = useLiveQueryWithDeps(
  [
    () => filters.value.search,
    () => filters.value.statusId,
    () => filters.value.priorityId,
    () => filters.value.sourceId,
    () => filters.value.assignedTo,
    () => activeFilter.value,
  ],
  async (db, [search, statusId, priorityId, sourceId, assignedTo, af]) => {
    let results = await db.CustomerComplaint.where().exec()
    results = applyFilters(results, { search, statusId, priorityId, sourceId, assignedTo })
    results = applyActiveFilter(results, af)
    return results.sort(
      (a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0),
    )
  },
  { initial: [] },
)

const stats = computed(() => {
  const all = allComplaints.value
  const startOfMonth = DateTime.now().startOf('month')
  const open = all.filter((r) => OPEN_STATUSES.includes(r.statusId))
  const unassigned = open.filter((r) => !r.assignedTo)
  const waiting = all.filter((r) => r.statusId === 'WAITING_CUSTOMER')
  const resolvedThisMonth = all.filter(
    (r) =>
      ['RESOLVED', 'CLOSED'].includes(r.statusId) && r.resolvedAt && r.resolvedAt >= startOfMonth,
  )
  return {
    open: open.length,
    unassigned: unassigned.length,
    waiting: waiting.length,
    resolvedThisMonth: resolvedThisMonth.length,
  }
})

// ─── Bulk Convert to NC ─────────────────────────────────────────────────────
// One NC can be raised from several selected complaints (spec: CC-001 +
// CC-002 + CC-003 → NC-001). Already-converted rows can't be selected.
const selectedIds = ref([])
const showConvertDialog = ref(false)

const selectedComplaints = computed(() =>
  complaints.value.filter((c) => selectedIds.value.includes(c.id)),
)

function onConverted(ncId) {
  showConvertDialog.value = false
  selectedIds.value = []
  router.push(getCompanyPath(`/nonconformances/${ncId}`))
}

function onNewComplaint() {
  router.push(getCompanyPath('/customer-complaints/create'))
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
        <BaseButton
          v-if="canConvert && selectedIds.length"
          variant="outline"
          @click="showConvertDialog = true"
        >
          Convert {{ selectedIds.length }} to NC
        </BaseButton>
        <BaseButton v-if="canCreate" variant="primary" @click="onNewComplaint">
          New Complaint
        </BaseButton>
      </div>
    </SafeTeleport>

    <!-- Page Header -->
    <div class="tw:flex tw:flex-col tw:gap-1">
      <div class="tw:text-3xl tw:font-bold tw:text-on-sidebar">Customer Complaints</div>
      <div class="tw:text-sm tw:text-secondary">
        Manage customer complaint tickets from web and email intake.
      </div>
    </div>

    <!-- Stat Cards -->
    <div class="tw:grid tw:grid-cols-2 tw:md:grid-cols-4 tw:gap-3">
      <div
        class="tw:bg-white tw:rounded-lg tw:border tw:border-divider tw:p-4 tw:flex tw:items-center tw:gap-4"
      >
        <div
          class="tw:w-10 tw:h-10 tw:rounded-lg tw:bg-blue-50 tw:text-blue-600 tw:flex tw:items-center tw:justify-center tw:shrink-0"
        >
          <IconHeadset :size="20" />
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
          class="tw:w-10 tw:h-10 tw:rounded-lg tw:bg-red-50 tw:text-red-600 tw:flex tw:items-center tw:justify-center tw:shrink-0"
        >
          <IconUserQuestion :size="20" />
        </div>
        <div>
          <div class="tw:text-xs tw:uppercase tw:tracking-tight tw:font-bold tw:text-secondary">
            Unassigned
          </div>
          <div
            class="tw:text-2xl tw:font-black"
            :class="stats.unassigned > 0 ? 'tw:text-red-600' : 'tw:text-on-sidebar'"
          >
            {{ stats.unassigned }}
          </div>
        </div>
      </div>
      <div
        class="tw:bg-white tw:rounded-lg tw:border tw:border-divider tw:p-4 tw:flex tw:items-center tw:gap-4"
      >
        <div
          class="tw:w-10 tw:h-10 tw:rounded-lg tw:bg-amber-50 tw:text-amber-600 tw:flex tw:items-center tw:justify-center tw:shrink-0"
        >
          <IconClockPause :size="20" />
        </div>
        <div>
          <div class="tw:text-xs tw:uppercase tw:tracking-tight tw:font-bold tw:text-secondary">
            Waiting customer
          </div>
          <div class="tw:text-2xl tw:font-black tw:text-on-sidebar">{{ stats.waiting }}</div>
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
            Resolved this month
          </div>
          <div class="tw:text-2xl tw:font-black tw:text-on-sidebar">
            {{ stats.resolvedThisMonth }}
          </div>
        </div>
      </div>
    </div>

    <CustomerComplaintsFilterToolbar
      v-model:filters="filters"
      v-model:activeFilter="activeFilter"
    />

    <CustomerComplaintsTable
      v-model:selected="selectedIds"
      :rows="complaints"
      :selectable="canConvert"
      :canUpdate="canUpdate"
      @open="(row) => router.push(getCompanyPath(`/customer-complaints/${row.id}`))"
    />

    <CustomerComplaintConvertToNcDialog
      v-model="showConvertDialog"
      :complaints="selectedComplaints"
      @converted="onConverted"
    />
  </div>
</template>
