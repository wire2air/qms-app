<script setup>
import { humanizeFilter } from '@/composables/useListPrint.js'
/**
 * Audit Instances list — the "in-flight + history" tab on the Audits
 * landing page. Lists every audit the user can see (RLS: audits:read
 * or team membership). Most instances are minted server-side by the
 * daily generator (Phase B-5) off a program; the row reflects who's
 * leading, what state it's in, and when it was scheduled. Rendered via
 * the shared DataTable — search, advanced filter, density, column
 * manager and export all live in the table toolbar.
 */
import { IconPlus } from '@tabler/icons-vue'
import { isAllowed, currentSession } from '@/utils/currentSession.js'
import { DateTime } from 'luxon'
import { getCompanyPath } from '@/utils/routeHelpers.js'

// No FE canRead gate — RLS is the single source of truth for row
// visibility (supplier users without audits:read can still see audits
// they're on the team for via the audit_team_members membership
// branch). 'New Audit' stays gated on audits:create so users without
// it don't see a button they can't use.
const canCreate = computed(() => isAllowed(['audit_management:create']))

const showCreateDialog = ref(false)

// ── Quick views ───────────────────────────────────────────────────────────────
// This page renders a bare DataTable rather than BaseListLayout, so there is no
// useListLayout to hang the pill state on. A plain ref synced to ?view= gives
// the same deep-linkable behaviour without restructuring the page.
const route = useRoute()
const router = useRouter()

const AUDIT_PILLS = [
  { value: 'all', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'mine', label: 'Led by me' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'closed', label: 'Closed' },
]
const PILL_VALUES = new Set(AUDIT_PILLS.map((p) => p.value))
// Anything not yet finished. Mirrors STATUS_FILTER_OPTIONS minus the terminals.
const OPEN_STATUSES = ['DRAFT', 'SCHEDULED', 'IN_PROGRESS', 'REVIEW', 'REJECTED']
const CLOSED_STATUSES = ['COMPLETED', 'CLOSED', 'CANCELLED']

const activeFilter = ref(PILL_VALUES.has(route.query.view) ? route.query.view : 'all')
watch(
  () => route.query.view,
  (v) => {
    if (v && PILL_VALUES.has(v)) activeFilter.value = v
  },
)
watch(activeFilter, (v) => {
  if (route.query.view !== v) router.replace({ query: { ...route.query, view: v } })
})

function applyActiveFilter(rows, af) {
  const userId = currentSession.value?.userId
  const now = DateTime.now()
  if (af === 'open') return rows.filter((r) => OPEN_STATUSES.includes(r.statusId))
  if (af === 'scheduled') return rows.filter((r) => r.statusId === 'SCHEDULED')
  if (af === 'in_progress') return rows.filter((r) => r.statusId === 'IN_PROGRESS')
  if (af === 'mine') return rows.filter((r) => r.leadAuditorUserId === userId)
  // Overdue = scheduled in the past and still not finished. A completed audit
  // that ran late is not outstanding work and must not show here.
  if (af === 'overdue')
    return rows.filter(
      (r) => r.scheduledDate && r.scheduledDate < now && OPEN_STATUSES.includes(r.statusId),
    )
  if (af === 'closed') return rows.filter((r) => CLOSED_STATUSES.includes(r.statusId))
  return rows // 'all'
}

const STATUS_FILTER_OPTIONS = [
  { value: 'DRAFT', label: 'Draft' },
  { value: 'SCHEDULED', label: 'Scheduled' },
  { value: 'IN_PROGRESS', label: 'In Progress' },
  { value: 'REVIEW', label: 'In Review' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'CLOSED', label: 'Closed' },
  { value: 'CANCELLED', label: 'Cancelled' },
]

const TYPE_LABELS = {
  INTERNAL: 'Internal',
  EXTERNAL: 'External',
  SUPPLIER: 'Supplier',
}
const TYPE_OPTIONS = Object.entries(TYPE_LABELS).map(([value, label]) => ({ value, label }))

function typeBadgeClass(typeId) {
  switch (typeId) {
    case 'INTERNAL':
      return 'tw:bg-blue-100 tw:text-blue-700'
    case 'EXTERNAL':
      return 'tw:bg-purple-100 tw:text-purple-700'
    case 'SUPPLIER':
      return 'tw:bg-amber-100 tw:text-amber-700'
    default:
      return 'tw:bg-gray-100 tw:text-gray-700'
  }
}

const columns = [
  {
    name: 'number',
    label: 'Number',
    field: (r) => r.auditNumber || r.id.slice(0, 8),
    align: 'left',
    sortable: true,
  },
  { name: 'standard', label: 'Standard', field: 'auditStandardId', align: 'left' },
  {
    name: 'type',
    label: 'Type',
    field: 'programTypeId',
    align: 'left',
    filterType: 'select',
    filterOptions: TYPE_OPTIONS,
  },
  { name: 'lead', label: 'Lead', field: 'leadAuditorUserId', align: 'left' },
  {
    name: 'scheduled',
    label: 'Scheduled',
    field: 'scheduledDate',
    align: 'left',
    sortable: true,
    filterType: 'date',
  },
  {
    name: 'status',
    label: 'Status',
    field: 'statusId',
    align: 'left',
    filterType: 'select',
    filterOptions: STATUS_FILTER_OPTIONS,
  },
  {
    name: 'createdAt',
    label: 'Created',
    field: 'createdAt',
    align: 'left',
    sortable: true,
    filterType: 'date',
  },
]

const allInstances = useLiveQuery(
  async (db) => {
    const results = await db.AuditInstance.where().exec()
    // Certification (EXTERNAL) audits belong to the Auditee module — the
    // auditor's list is internal + supplier work.
    return results
      .filter((a) => a.programTypeId !== 'EXTERNAL')
      .sort(
        (a, b) =>
          (b.scheduledDate?.toMillis?.() ?? b.createdAt?.toMillis?.() ?? 0) -
          (a.scheduledDate?.toMillis?.() ?? a.createdAt?.toMillis?.() ?? 0),
      )
  },
  { models: ['AuditInstance'], initial: [] },
)

const instances = computed(() => applyActiveFilter(allInstances.value, activeFilter.value))
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-3">
    <BaseQuickFilterPills
      v-model="activeFilter"
      :pills="AUDIT_PILLS"
      ariaLabel="Audit quick views"
    />

    <DataTable
      :rows="instances"
      :columns="columns"
      rowKey="id"
      :mobileCards="false"
      searchable
      filterable
      exportManager
      exportFilename="audits.csv"
      persistKey="audits:instances"
      noDataLabel="No audits yet. Audits are minted by the daily generator from active programs — create a program with a next-due date to see your first audit."
    >
      <template #toolbar-left>
        <span class="tw:text-sm tw:text-secondary">
          {{ instances.length }} audit{{ instances.length === 1 ? '' : 's' }}
        </span>
        <ListPrintButton
          entity="AuditInstance"
          title="Audit Register"
          :rows="instances"
          :filterLabel="humanizeFilter(activeFilter)"
          size="sm"
        />
        <!-- New Audit = ad-hoc create (one-off, no program). The daily
           generator handles program-driven audits automatically. -->
        <BaseButton v-if="canCreate" variant="primary" size="sm" @click="showCreateDialog = true">
          <template #icon><IconPlus :size="16" /></template>
          New Audit
        </BaseButton>
      </template>

      <template #body-cell-number="{ row }">
        <RouterLink
          :to="getCompanyPath(`/audits/instances/${row.id}`)"
          class="tw:text-xs tw:text-on-main tw:hover:text-primary"
        >
          {{ row.auditNumber || row.id.slice(0, 8) }}
        </RouterLink>
      </template>

      <template #body-cell-standard="{ row }">
        <AuditStandardBadgeById v-if="row.auditStandardId" :standardId="row.auditStandardId" />
        <span v-else class="tw:text-xs tw:text-secondary">—</span>
      </template>

      <template #body-cell-type="{ row }">
        <span
          class="tw:text-micro tw:font-semibold tw:uppercase tw:tracking-wide tw:rounded tw:px-2 tw:py-0.5"
          :class="typeBadgeClass(row.programTypeId)"
        >
          {{ TYPE_LABELS[row.programTypeId] || row.programTypeId }}
        </span>
      </template>

      <template #body-cell-lead="{ row }">
        <UserBadgeById v-if="row.leadAuditorUserId" :userId="row.leadAuditorUserId" />
        <span v-else class="tw:text-xs tw:text-secondary">—</span>
      </template>

      <template #body-cell-scheduled="{ row }">
        <span class="tw:text-xs">{{
          row.scheduledDate ? row.scheduledDate.formatDate('date') : '—'
        }}</span>
      </template>

      <template #body-cell-status="{ row }">
        <AuditInstanceStatusBadgeById :statusId="row.statusId" />
      </template>

      <template #body-cell-createdAt="{ row }">
        <span class="tw:text-xs tw:text-secondary">{{
          row.createdAt ? row.createdAt.formatDate('date') : '—'
        }}</span>
      </template>
    </DataTable>

    <AuditInstanceCreateDialog v-model="showCreateDialog" />
  </div>
</template>
