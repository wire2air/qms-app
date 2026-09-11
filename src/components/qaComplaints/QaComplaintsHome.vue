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
import { utils as xlsxUtils, writeFile as xlsxWriteFile } from 'xlsx'
import { DateTime } from 'luxon'

/**
 * QA Complaints list — every customer complaint in the system (however it
 * arrived: manual entry, CSV import, or the Zendesk integration), framed for
 * quality review. Rows open the QA investigation page, NOT the support
 * conversation page. Reuses the support CustomerComplaintsTable + the
 * shared convert-to-NC dialog.
 */
const router = useRouter()
const toast = useToast()

const canCreate = computed(() => isAllowed(['complaints:create']))
const canUpdate = computed(() => isAllowed(['complaints:update']))
const canConvert = computed(() => isAllowed(['complaints:update']) && isAllowed(['ncr:create']))

const list = useListLayout({
  total: () => complaints.value.length,
  loading: () => complaints.value === undefined,
  empty: () => complaints.value.length === 0,
})

// QA quick-views, rendered in the table toolbar's #tabs slot. "QA Review" =
// complaints assigned to me or a team I'm on and still active — the queue a QA
// reviewer works from.
const activeFilter = ref('all')
const VIEWS = [
  { value: 'all', label: 'All' },
  { value: 'qa_review', label: 'QA Review' },
  { value: 'open', label: 'Open' },
  { value: 'closed', label: 'Closed' },
]
// Unified parent statuses (2026-08-28): active vs finished. Workflow phases
// live on the steps, and conversion-to-NC is a record LINK, not a status.
const OPEN_STATUSES = ['DRAFT', 'OPEN']
const CLOSED_STATUSES = ['CLOSED', 'CANCELLED']

// Team ids the current user belongs to — drives the "QA Review" view.
const myTeamIds = useLiveQuery(
  async (db) => {
    const uid = currentSession.value?.userId
    if (!uid) return []
    return (await db.UserOnTeam.where().exec()).filter((r) => r.userId === uid).map((r) => r.teamId)
  },
  { models: ['UserOnTeam'], initial: [] },
)

const allComplaints = useLiveQuery((db) => db.Complaint.where().exec(), {
  models: ['Complaint'],
  initial: [],
})

const complaints = useLiveQueryWithDeps(
  [() => activeFilter.value, () => myTeamIds.value.join(',')],
  async (db, [af]) => {
    const uid = currentSession.value?.userId
    const teamSet = new Set(myTeamIds.value)
    let results = (await db.Complaint.where().exec()).filter((r) => !r.isSpam)

    if (af === 'qa_review') {
      // My QA queue: complaints I own (the workflow's responsible party — e.g.
      // an OPEN complaint sitting on the owner for final review) or that
      // are assigned to me / my team, and not yet closed.
      results = results.filter(
        (r) =>
          (r.ownerId === uid ||
            r.assignedTo === uid ||
            (r.assignedTeamId && teamSet.has(r.assignedTeamId))) &&
          !CLOSED_STATUSES.includes(r.statusId),
      )
    } else if (af === 'open') {
      results = results.filter((r) => OPEN_STATUSES.includes(r.statusId))
    } else if (af === 'closed') {
      results = results.filter((r) => CLOSED_STATUSES.includes(r.statusId))
    }

    return results.sort(
      (a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0),
    )
  },
  { models: ['Complaint'], initial: [] },
)

// Conversion lineage lives in record_links (Complaint→Nonconformance).
const convertedIds = useLiveQuery(
  async (db) => {
    const links = await db.RecordLink.where('fromType', 'Complaint').exec()
    return new Set(links.filter((l) => l.toType === 'Nonconformance').map((l) => l.fromId))
  },
  { models: ['RecordLink'], initial: new Set() },
)

const stats = computed(() => {
  const all = allComplaints.value.filter((r) => !r.isSpam)
  const open = all.filter((r) => OPEN_STATUSES.includes(r.statusId))
  const unassigned = open.filter((r) => !r.assignedTo)
  const converted = all.filter((r) => convertedIds.value.has(r.id))
  return {
    total: all.length,
    open: open.length,
    unassigned: unassigned.length,
    converted: converted.length,
  }
})

const kpiItems = computed(() => [
  {
    key: 'total',
    label: 'Total complaints',
    value: stats.value.total,
    icon: IconMessageReport,
    color: 'blue',
  },
  { key: 'open', label: 'Open', value: stats.value.open, icon: IconProgressCheck, color: 'amber' },
  {
    key: 'unassigned',
    label: 'Unassigned',
    value: stats.value.unassigned,
    icon: IconUserQuestion,
    color: 'red',
    emphasize: stats.value.unassigned > 0,
  },
  {
    key: 'converted',
    label: 'Escalated to NC',
    value: stats.value.converted,
    icon: IconTransform,
    color: 'green',
  },
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

// ─── Export ──────────────────────────────────────────────────────────────
// Field universe for the table's export manager — mirrors CustomerComplaintsHome's
// export so the QA complaints list gets a real CSV/Excel file instead of relying
// on DataTable's generic column-based fallback.
//
// NOTE: the `Complaint` model (QMS `complaints` table) is NOT the same shape as
// `CustomerComplaint` (support `customer_complaints` table) that this table/export
// pattern was copied from. `Complaint` has no priorityId/sentiment/assignedTo/
// assignedTeamId fields, and its statusId/sourceId are foreign keys into the
// separate ComplaintStatus / ComplaintSourceType lookups (not the customer-complaint
// ones) — so those ids must be resolved to labels here, not read off *Status/*Source
// filter option lists built for the other module.
const complaintStatuses = useLiveQuery((db) => db.ComplaintStatus.where().exec(), {
  models: ['ComplaintStatus'],
  initial: [],
})
const complaintSources = useLiveQuery((db) => db.ComplaintSourceType.where().exec(), {
  models: ['ComplaintSourceType'],
  initial: [],
})
const allUsers = useLiveQuery((db) => db.User.where().exec(), { models: ['User'], initial: [] })

function statusLabel(id) {
  return complaintStatuses.value.find((s) => s.id === id)?.name ?? id ?? ''
}
function sourceLabel(id) {
  return complaintSources.value.find((s) => s.id === id)?.name ?? id ?? ''
}
function userLabel(id) {
  const user = allUsers.value.find((u) => u.id === id)
  if (!user) return id ?? ''
  return `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email
}

const exportColumns = computed(() => [
  { key: 'Ticket', label: 'Ticket', value: (c) => c.complaintNumber ?? '' },
  { key: 'Subject', label: 'Subject', value: (c) => c.subject ?? '' },
  { key: 'Status', label: 'Status', value: (c) => statusLabel(c.statusId) },
  { key: 'Source', label: 'Source', value: (c) => sourceLabel(c.sourceId) },
  { key: 'Customer', label: 'Customer', value: (c) => c.customerName ?? '' },
  { key: 'Customer Email', label: 'Customer Email', value: (c) => c.customerEmail ?? '' },
  { key: 'Customer Company', label: 'Customer Company', value: (c) => c.customerCompany ?? '' },
  { key: 'Owner', label: 'Owner', value: (c) => userLabel(c.ownerId) },
  { key: 'Created', label: 'Created', value: (c) => c.createdAt?.formatDate?.('datetime') ?? '' },
  {
    key: 'Resolved',
    label: 'Resolved',
    value: (c) => c.resolvedAt?.formatDate?.('datetime') ?? '',
  },
  { key: 'Closed', label: 'Closed', value: (c) => c.closedAt?.formatDate?.('datetime') ?? '' },
])

function handleExport({ format, fields, rows }) {
  if (!rows.length) {
    toast.notify({ type: 'warning', message: 'Nothing to export — the current view is empty' })
    return
  }
  const data = rows.map((row) => Object.fromEntries(fields.map((f) => [f.label, f.value(row)])))
  const sheet = xlsxUtils.json_to_sheet(data)
  const book = xlsxUtils.book_new()
  xlsxUtils.book_append_sheet(book, sheet, 'Complaints')
  const stamp = DateTime.now().toFormat('yyyyLLdd-HHmm')
  xlsxWriteFile(book, `complaints-${stamp}.${format}`, { bookType: format })
}
</script>

<template>
  <BaseListLayout
    helpSlug="KB/quality/complaints"
    title="Complaints"
    :icon="IconMessageReport"
    subtitle="Review, investigate and escalate customer complaints — sourced from manual entry, CSV import or the Zendesk integration."
    :state="list.state.value"
    contentOwnsEmpty
  >
    <template #actions>
      <BaseButton variant="secondary" @click="router.push(getCompanyPath('/complaints/reports'))">
        <IconChartBar :size="18" class="tw:mr-1" />
        Reports
      </BaseButton>
      <BaseButton
        v-if="canCreate"
        variant="primary"
        @click="router.push(getCompanyPath('/complaints/create'))"
      >
        New Complaint
      </BaseButton>
    </template>

    <template #stats>
      <BaseStatStrip :items="kpiItems" />
    </template>

    <CustomerComplaintsTable
      v-model:selected="selectedIds"
      :rows="complaints"
      :selectable="canConvert || canUpdate"
      detailBasePath="/complaints"
      :ownerAsAssignee="true"
      :emptyLabel="activeFilter === 'all' ? 'No complaints yet' : 'No complaints match this view'"
      :exportColumns="exportColumns"
      :exportFormats="['csv', 'xlsx']"
      @export="handleExport"
    >
      <!-- Quick views -->
      <template #tabs>
        <BaseQuickFilterPills v-model="activeFilter" :pills="VIEWS" ariaLabel="Quick views" />
      </template>

      <!-- Bulk escalate — the table's toolbar becomes the action bar on selection -->
      <template #bulk-actions>
        <BaseButton v-if="canConvert" variant="primary" size="sm" @click="showConvertDialog = true">
          Create NC
        </BaseButton>
      </template>
    </CustomerComplaintsTable>

    <CustomerComplaintConvertToNcDialog
      v-model="showConvertDialog"
      :complaints="selectedComplaints"
      apiPath="complaints"
      @converted="onConverted"
    />
  </BaseListLayout>
</template>
