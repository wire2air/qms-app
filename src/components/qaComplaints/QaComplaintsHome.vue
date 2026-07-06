<script setup>
import {
  IconMessageReport,
  IconProgressCheck,
  IconUserQuestion,
  IconTransform,
  IconChartBar,
} from '@tabler/icons-vue'
import { isAllowed, currentSession } from '@/utils/currentSession.js'
import { getCompanyPath } from '@/utils/routeHelpers.js'

/**
 * QA Complaints list — every customer complaint in the system (however it
 * arrived: manual entry, CSV import, or the Zendesk integration), framed for
 * quality review. Rows open the QA investigation page, NOT the support
 * conversation page. Reuses the support CustomerComplaintsTable + the
 * shared convert-to-NC dialog.
 */
const router = useRouter()

const canCreate = computed(() => isAllowed(['customerComplaints:create']))
const canUpdate = computed(() => isAllowed(['customerComplaints:update']))
const canConvert = computed(
  () => isAllowed(['customerComplaints:update']) && isAllowed(['nonconformances:create']),
)

const list = useListLayout({
  filters: { search: '' },
  total: () => complaints.value.length,
  loading: () => complaints.value === undefined,
  empty: () => complaints.value.length === 0,
})
const filters = list.filters

// QA quick-views. "QA Review" = complaints assigned to me or a team I'm on and
// still active — the queue a QA reviewer works from.
const activeFilter = ref('all')
const VIEWS = [
  { value: 'all', label: 'All' },
  { value: 'qa_review', label: 'QA Review' },
  { value: 'open', label: 'Open' },
  { value: 'closed', label: 'Closed' },
]
const OPEN_STATUSES = ['NEW', 'OPEN', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_CUSTOMER', 'ON_HOLD']
const CLOSED_STATUSES = ['CLOSED', 'CONVERTED_TO_NC']

// Team ids the current user belongs to — drives the "QA Review" view.
const myTeamIds = useLiveQuery(
  async (db) => {
    const uid = currentSession.value?.userId
    if (!uid) return []
    return (await db.UserOnTeam.where().exec()).filter((r) => r.userId === uid).map((r) => r.teamId)
  },
  { models: ['UserOnTeam'], initial: [] },
)

const allComplaints = useLiveQuery((db) => db.CustomerComplaint.where().exec(), {
  models: ['CustomerComplaint'],
  initial: [],
})

const complaints = useLiveQueryWithDeps(
  [() => filters.value.search, () => activeFilter.value, () => myTeamIds.value.join(',')],
  async (db, [search, af]) => {
    const uid = currentSession.value?.userId
    const teamSet = new Set(myTeamIds.value)
    let results = (await db.CustomerComplaint.where().exec()).filter((r) => !r.isSpam)

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

    if (af === 'qa_review') {
      results = results.filter(
        (r) =>
          (r.assignedTo === uid || (r.assignedTeamId && teamSet.has(r.assignedTeamId))) &&
          !CLOSED_STATUSES.includes(r.statusId),
      )
    } else if (af === 'open') {
      results = results.filter((r) => OPEN_STATUSES.includes(r.statusId))
    } else if (af === 'closed') {
      results = results.filter((r) => CLOSED_STATUSES.includes(r.statusId))
    }

    return results.sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))
  },
  { models: ['CustomerComplaint'], initial: [] },
)

const stats = computed(() => {
  const all = allComplaints.value.filter((r) => !r.isSpam)
  const open = all.filter((r) => OPEN_STATUSES.includes(r.statusId))
  const unassigned = open.filter((r) => !r.assignedTo)
  const converted = all.filter((r) => r.statusId === 'CONVERTED_TO_NC')
  return { total: all.length, open: open.length, unassigned: unassigned.length, converted: converted.length }
})

const kpiItems = computed(() => [
  { key: 'total', label: 'Total complaints', value: stats.value.total, icon: IconMessageReport, color: 'blue' },
  { key: 'open', label: 'Open', value: stats.value.open, icon: IconProgressCheck, color: 'amber' },
  {
    key: 'unassigned',
    label: 'Unassigned',
    value: stats.value.unassigned,
    icon: IconUserQuestion,
    color: 'red',
    emphasize: stats.value.unassigned > 0,
  },
  { key: 'converted', label: 'Escalated to NC', value: stats.value.converted, icon: IconTransform, color: 'green' },
])

// ─── Selection + bulk escalate to NC (reuses the shared convert dialog) ──────
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
</script>

<template>
  <BaseListLayout
    title="Complaints"
    :icon="IconMessageReport"
    subtitle="Review, investigate and escalate customer complaints — sourced from manual entry, CSV import or the Zendesk integration."
    :state="list.state.value"
    :emptyIcon="IconMessageReport"
    :emptyTitle="filters.search || activeFilter !== 'all' ? 'No complaints match your filters' : 'No complaints yet'"
    :selectedCount="selectedIds.length"
  >
    <template #actions>
      <BaseButton variant="secondary" @click="router.push(getCompanyPath('/complaints/reports'))">
        <IconChartBar :size="18" class="tw:mr-1" />
        Reports
      </BaseButton>
      <BaseButton v-if="canCreate" variant="primary" @click="router.push(getCompanyPath('/complaints/create'))">
        New Complaint
      </BaseButton>
    </template>

    <template #stats>
      <BaseStatStrip :items="kpiItems" />
    </template>

    <template #filters>
      <BaseFilterBar v-model:search="filters.search" searchPlaceholder="Search complaints…">
        <template #filters>
          <div class="tw:flex tw:items-center tw:gap-1">
            <BaseButton
              v-for="v in VIEWS"
              :key="v.value"
              size="sm"
              :variant="activeFilter === v.value ? 'primary' : 'outline'"
              @click="activeFilter = v.value"
            >
              {{ v.label }}
            </BaseButton>
          </div>
        </template>
      </BaseFilterBar>
    </template>

    <template #bulk-actions>
      <BaseButton
        v-if="canConvert"
        variant="primary"
        size="sm"
        @click="showConvertDialog = true"
      >
        Create NC
      </BaseButton>
    </template>

    <CustomerComplaintsTable
      v-model:selected="selectedIds"
      :rows="complaints"
      :selectable="canConvert || canUpdate"
      detailBasePath="/complaints"
    />

    <CustomerComplaintConvertToNcDialog
      v-model="showConvertDialog"
      :complaints="selectedComplaints"
      @converted="onConverted"
    />
  </BaseListLayout>
</template>
