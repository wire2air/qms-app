<script setup>
/**
 * Audit Instances list — the "in-flight + history" tab on the Audits
 * landing page. Lists every audit the user can see (RLS: audits:read
 * or team membership). Most instances are minted server-side by the
 * daily generator (Phase B-5) off a program; the row reflects who's
 * leading, what state it's in, and when it was scheduled.
 */
import { IconChecklist, IconPlus, IconDownload } from '@tabler/icons-vue'
import { isAllowed } from '@/utils/currentSession.js'
import { getCompanyPath } from '@/utils/routeHelpers.js'
import { dateInRange } from '@/utils/listFilters.js'
import { exportToCSV } from '@/utils/exportUtils.js'

const router = useRouter()

// No FE canRead gate — RLS is the single source of truth for row
// visibility (supplier users without audits:read can still see audits
// they're on the team for via the audit_team_members membership
// branch). 'New Audit' stays gated on audits:create so users without
// it don't see a button they can't use.
const canCreate = computed(() => isAllowed(['audits:create']))

const showCreateDialog = ref(false)

function openDetail(row) {
  router.push(getCompanyPath(`/audits/instances/${row.id}`))
}

const search = ref('')
const statusFilter = ref(null)
const supplierFilter = ref(null)
const dateFrom = ref('')
const dateTo = ref('')

function exportCsv() {
  exportToCSV(
    instances.value,
    [
      { field: 'auditNumber', label: 'Audit #' },
      { field: 'programTypeId', label: 'Type' },
      { field: (r) => r.displayMeta?.standardName ?? '', label: 'Standard' },
      { field: 'statusId', label: 'Status' },
      { field: (r) => r.scheduledDate?.toFormat?.('yyyy-LL-dd') ?? '', label: 'Scheduled' },
      { field: (r) => r.createdAt?.toFormat?.('yyyy-LL-dd') ?? '', label: 'Created' },
    ],
    'audits',
  )
}

const STATUS_FILTER_OPTIONS = [
  { id: 'DRAFT', name: 'Draft' },
  { id: 'SCHEDULED', name: 'Scheduled' },
  { id: 'IN_PROGRESS', name: 'In Progress' },
  { id: 'REVIEW', name: 'In Review' },
  { id: 'REJECTED', name: 'Rejected' },
  { id: 'COMPLETED', name: 'Completed' },
  { id: 'CLOSED', name: 'Closed' },
  { id: 'CANCELLED', name: 'Cancelled' },
]

const TYPE_LABELS = {
  INTERNAL: 'Internal',
  EXTERNAL: 'External',
  SUPPLIER: 'Supplier',
}
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

const instances = useLiveQueryWithDeps(
  [
    () => search.value,
    () => statusFilter.value,
    () => supplierFilter.value,
    () => dateFrom.value,
    () => dateTo.value,
  ],
  async (db, [q, status, supplierId, df, dt]) => {
    const results = await db.AuditInstance.where().exec()
    const filtered = results.filter(
      (i) =>
        (status ? i.statusId === status : true) &&
        (supplierId ? i.supplierId === supplierId : true) &&
        (df || dt ? dateInRange(i.createdAt, df, dt) : true),
    )
    const sorted = filtered.sort(
      (a, b) =>
        (b.scheduledDate?.toMillis?.() ?? b.createdAt?.toMillis?.() ?? 0) -
        (a.scheduledDate?.toMillis?.() ?? a.createdAt?.toMillis?.() ?? 0),
    )
    if (!q) return sorted
    const lower = q.toLowerCase()
    return sorted.filter(
      (i) =>
        (i.auditNumber || '').toLowerCase().includes(lower) ||
        (i.scope || '').toLowerCase().includes(lower),
    )
  },
  { initial: [] },
)
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-3">
    <div class="tw:flex tw:items-center tw:justify-between tw:gap-3">
      <div class="tw:flex tw:items-center tw:gap-3">
        <BaseTextInput v-model="search" placeholder="Search audits…" class="tw:w-72" />
        <BaseInlineSelect
          v-model="statusFilter"
          :items="STATUS_FILTER_OPTIONS"
          nullLabel="— All statuses —"
          class="tw:w-44"
        />
        <SupplierSelectMenu v-model="supplierFilter" class="tw:w-48" />
        <DateRangeFilter
          :from="dateFrom"
          :to="dateTo"
          @update:from="(v) => (dateFrom = v)"
          @update:to="(v) => (dateTo = v)"
        />
        <div class="tw:text-xs tw:text-secondary">
          {{ instances.length }} audit{{ instances.length === 1 ? '' : 's' }}
        </div>
      </div>
      <div class="tw:flex tw:items-center tw:gap-2">
        <BaseButton variant="outline" size="sm" :disabled="!instances.length" @click="exportCsv">
          <template #icon><IconDownload :size="16" /></template>
          Export
        </BaseButton>
        <!-- New Audit = ad-hoc create (one-off, no program). The daily
             generator handles program-driven audits automatically. -->
        <BaseButton v-if="canCreate" variant="primary" size="sm" @click="showCreateDialog = true">
          <template #icon><IconPlus :size="16" /></template>
          New Audit
        </BaseButton>
      </div>
    </div>

    <div
      v-if="!instances.length"
      class="tw:flex tw:flex-col tw:items-center tw:gap-2 tw:py-16 tw:text-secondary"
    >
      <IconChecklist :size="40" class="tw:opacity-50" />
      <div class="tw:text-base tw:font-semibold">No audits yet</div>
      <div class="tw:text-sm tw:text-center tw:max-w-md">
        Audits are minted by the daily generator from active programs.
        Create a program with a next-due date to see your first audit.
      </div>
    </div>

    <div v-else class="tw:bg-white tw:border tw:border-divider tw:rounded-lg tw:overflow-hidden">
      <table class="tw:w-full tw:text-sm">
        <thead>
          <tr
            class="tw:text-left tw:text-xs tw:font-bold tw:text-secondary tw:uppercase tw:tracking-wider tw:border-b tw:border-divider tw:bg-main-hover"
          >
            <th class="tw:px-4 tw:py-3">Number</th>
            <th class="tw:px-4 tw:py-3">Standard</th>
            <th class="tw:px-4 tw:py-3">Type</th>
            <th class="tw:px-4 tw:py-3">Lead</th>
            <th class="tw:px-4 tw:py-3">Scheduled</th>
            <th class="tw:px-4 tw:py-3">Status</th>
          </tr>
        </thead>
        <tbody>
          <BaseClickableRow
            v-for="row in instances"
            :key="row.id"
            tag="tr"
            class="tw:border-b tw:border-divider tw:hover:bg-main-hover/40"
            :aria-label="`Open audit ${row.auditNumber || row.id.slice(0, 8)}`"
            @click="openDetail(row)"
          >
            <td class="tw:px-4 tw:py-3 tw:font-mono tw:text-xs">
              {{ row.auditNumber || row.id.slice(0, 8) }}
            </td>
            <td class="tw:px-4 tw:py-3">
              <AuditStandardBadgeById
                v-if="row.auditStandardId"
                :standardId="row.auditStandardId"
              />
              <span v-else class="tw:text-xs tw:text-secondary">—</span>
            </td>
            <td class="tw:px-4 tw:py-3">
              <span
                class="tw:text-[10px] tw:font-semibold tw:uppercase tw:tracking-wide tw:rounded tw:px-2 tw:py-0.5"
                :class="typeBadgeClass(row.programTypeId)"
              >
                {{ TYPE_LABELS[row.programTypeId] || row.programTypeId }}
              </span>
            </td>
            <td class="tw:px-4 tw:py-3">
              <UserBadgeById v-if="row.leadAuditorUserId" :userId="row.leadAuditorUserId" />
              <span v-else class="tw:text-xs tw:text-secondary">—</span>
            </td>
            <td class="tw:px-4 tw:py-3 tw:text-xs">
              {{ row.scheduledDate ? row.scheduledDate.formatDate('date') : '—' }}
            </td>
            <td class="tw:px-4 tw:py-3">
              <AuditInstanceStatusBadgeById :statusId="row.statusId" />
            </td>
          </BaseClickableRow>
        </tbody>
      </table>
    </div>

    <AuditInstanceCreateDialog v-model="showCreateDialog" />
  </div>
</template>
