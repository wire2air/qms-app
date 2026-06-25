<script setup>
import {
  IconHeadset,
  IconUserQuestion,
  IconClockPause,
  IconCircleCheck,
  IconChevronDown,
  IconChartBar,
} from '@tabler/icons-vue'
import { isAllowed, currentSession } from '@/utils/currentSession.js'
import { getCompanyPath } from '@/utils/routeHelpers.js'
// Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { post, get } from '@/api'
import { utils as xlsxUtils, writeFile as xlsxWriteFile } from 'xlsx'
import { DateTime } from 'luxon'
import { matchesDateFilter } from '@/utils/dateRanges.js'

const router = useRouter()
const toast = useToast()
const { confirm } = useConfirm()

const canCreate = computed(() => isAllowed(['customerComplaints:create']))
const canUpdate = computed(() => isAllowed(['customerComplaints:update']))
const canDelete = computed(() => isAllowed(['customerComplaints:delete']))
const canConvert = computed(
  () => isAllowed(['customerComplaints:update']) && isAllowed(['nonconformances:create']),
)

// Filters + resolved content state. Declared before the live query because
// `total`/`empty`/`loading` are lazy getters that read `complaints`.
// `activeFilter` (quick-filter view) stays a separate ref — it has its own
// v-model contract on the toolbar and feeds saved views independently.
const list = useListLayout({
  filters: {
    search: '',
    // Primary dimensions — multi-select (Linear-style filter menu) arrays of ids.
    statusId: [],
    priorityId: [],
    sourceId: [],
    assignedTo: [],
    // CC-specific single-select dimensions (folded into the filter menu).
    assignedTeamId: null,
    formId: null,
    sentiment: null,
    createdAt: null,
  },
  total: () => complaints.value.length,
  loading: () => complaints.value === undefined,
  empty: () => complaints.value.length === 0,
})
const filters = list.filters
const activeFilter = ref('all_open')

// ─── Saved views (per-user, localStorage — personal like column prefs) ──────
const viewsKey = computed(() => `cc-views:${currentSession.value?.userId ?? 'anon'}`)
const savedViews = ref([])
try {
  savedViews.value = JSON.parse(localStorage.getItem(viewsKey.value) || '[]')
} catch {
  savedViews.value = []
}

function persistViews() {
  localStorage.setItem(viewsKey.value, JSON.stringify(savedViews.value))
}

function saveCurrentView(name) {
  const view = {
    id: crypto.randomUUID(),
    name,
    activeFilter: activeFilter.value,
    // Token is a plain object — safe to JSON round-trip directly.
    filters: { ...filters.value },
  }
  savedViews.value = [...savedViews.value.filter((v) => v.name !== name), view]
  persistViews()
  toast.notify({ type: 'positive', message: `View "${name}" saved` })
}

function applySavedView(view) {
  activeFilter.value = view.activeFilter
  filters.value = { ...filters.value, ...view.filters }
}

function deleteSavedView(view) {
  savedViews.value = savedViews.value.filter((v) => v.id !== view.id)
  persistViews()
}

const OPEN_STATUSES = ['NEW', 'OPEN', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_CUSTOMER']

// Forms for the form filter (REST admin config, lightweight).
const formOptions = ref([])
onMounted(async () => {
  try {
    const data = await get('/v1/services/customerComplaints/forms', { showError: false })
    formOptions.value = (data.forms ?? []).map((f) => ({ id: f.id, name: f.name }))
  } catch {
    // filter stays hidden on failure
  }
})

function applyFilters(results, f) {
  if (f.search) {
    const q = f.search.toLowerCase()
    results = results.filter(
      (r) =>
        r.subject?.toLowerCase().includes(q) ||
        r.complaintNumber?.toLowerCase().includes(q) ||
        r.customerName?.toLowerCase().includes(q) ||
        r.customerEmail?.toLowerCase().includes(q),
    )
  }
  // Multi-select dims. Defensive: handles arrays (current) and bare strings
  // (legacy saved views persisted before multi-select).
  const matchesDim = (selected, value) => {
    if (Array.isArray(selected)) return selected.length === 0 || selected.includes(value)
    return !selected || value === selected
  }
  results = results.filter(
    (r) =>
      matchesDim(f.statusId, r.statusId) &&
      matchesDim(f.priorityId, r.priorityId) &&
      matchesDim(f.sourceId, r.sourceId) &&
      matchesDim(f.assignedTo, r.assignedTo),
  )
  if (f.assignedTeamId) results = results.filter((r) => r.assignedTeamId === f.assignedTeamId)
  if (f.formId) results = results.filter((r) => r.formId === f.formId)
  if (f.sentiment) results = results.filter((r) => r.sentiment === f.sentiment)
  if (f.createdAt) results = results.filter((r) => matchesDateFilter(r.createdAt, f.createdAt))
  return results
}

function applyActiveFilter(results, af) {
  const userId = currentSession.value?.userId
  // Spam is its own view — every other view excludes spam tickets.
  if (af === 'spam') return results.filter((r) => r.isSpam)
  results = results.filter((r) => !r.isSpam)
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

const allComplaints = useLiveQuery((db) => db.CustomerComplaint.where().exec(), {
  models: ['CustomerComplaint'],
  initial: [],
})

const complaints = useLiveQueryWithDeps(
  [() => JSON.stringify({ ...filters.value }), () => activeFilter.value],
  async (db, [_filtersJson, af]) => {
    const f = { ...filters.value }
    let results = await db.CustomerComplaint.where().exec()
    results = applyFilters(results, f)
    results = applyActiveFilter(results, af)
    return results.sort(
      (a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0),
    )
  },

  { models: ['CustomerComplaint'], initial: [] },
)

// Distinct custom-field keys across loaded tickets — feeds the
// custom-attribute filter and the optional table columns.
const customFieldKeys = computed(() => {
  const keys = new Set()
  for (const c of allComplaints.value) {
    for (const key of Object.keys(c.customFields ?? {})) keys.add(key)
  }
  return [...keys].sort()
})

const stats = computed(() => {
  const all = allComplaints.value.filter((r) => !r.isSpam)
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

// Compact KPI strip (list-page metrics bar) — matches the other QMS list pages.
const kpiItems = computed(() => [
  { key: 'open', label: 'Open tickets', value: stats.value.open, icon: IconHeadset, color: 'blue' },
  {
    key: 'unassigned',
    label: 'Unassigned',
    value: stats.value.unassigned,
    icon: IconUserQuestion,
    color: 'red',
    emphasize: stats.value.unassigned > 0,
  },
  {
    key: 'waiting',
    label: 'Waiting customer',
    value: stats.value.waiting,
    icon: IconClockPause,
    color: 'amber',
  },
  {
    key: 'resolved',
    label: 'Resolved this month',
    value: stats.value.resolvedThisMonth,
    icon: IconCircleCheck,
    color: 'green',
  },
])

// ─── Selection + bulk actions ────────────────────────────────────────────────
const selectedIds = ref([])
const showConvertDialog = ref(false)
const bulkBusy = ref(false)

const selectedComplaints = computed(() =>
  complaints.value.filter((c) => selectedIds.value.includes(c.id)),
)

async function runBulk(action, params = {}, confirmMessage = null) {
  if (confirmMessage && !(await confirm({ message: confirmMessage, danger: true }))) return
  bulkBusy.value = true
  try {
    const { updated, skipped } = await post('/v1/services/customerComplaints/bulk', {
      complaintIds: selectedIds.value,
      action,
      ...params,
    })
    toast.notify({
      type: 'positive',
      message: `${updated} ticket${updated === 1 ? '' : 's'} updated${skipped ? `, ${skipped} skipped` : ''}`,
    })
    selectedIds.value = []
  } catch (e) {
    toast.notify({ type: 'negative', message: e.message || 'Bulk action failed' })
  } finally {
    bulkBusy.value = false
  }
}

const bulkAssignUserId = ref(null)
const bulkAssignTeamId = ref(null)
const showBulkAssignDialog = ref(false)

async function handleBulkAssign() {
  if (bulkAssignUserId.value) {
    await runBulk('ASSIGN_USER', { userId: bulkAssignUserId.value })
  } else if (bulkAssignTeamId.value) {
    await runBulk('ASSIGN_TEAM', { teamId: bulkAssignTeamId.value })
  }
  showBulkAssignDialog.value = false
}

function bulkPriorityItems() {
  return ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((p) => ({
    name: p.charAt(0) + p.slice(1).toLowerCase(),
    click: () => runBulk('SET_PRIORITY', { priorityId: p }),
  }))
}

function onConverted(ncId) {
  showConvertDialog.value = false
  selectedIds.value = []
  router.push(getCompanyPath(`/nonconformances/${ncId}`))
}

// ─── Export ──────────────────────────────────────────────────────────────
// Field universe for the DataTable's advanced export manager: the system fields
// + every custom field. The user picks which to include (and format / row scope)
// in the dialog; we generate the file + write the audit trail here (the table
// stays decoupled from the audit endpoint — see the export-manager design doc).
const exportColumns = computed(() => {
  const system = [
    { key: 'Ticket', label: 'Ticket', value: (c) => c.complaintNumber },
    { key: 'Subject', label: 'Subject', value: (c) => c.subject },
    { key: 'Status', label: 'Status', value: (c) => c.statusId },
    { key: 'Priority', label: 'Priority', value: (c) => c.priorityId ?? '' },
    { key: 'Source', label: 'Source', value: (c) => c.sourceId },
    { key: 'Sentiment', label: 'Sentiment', value: (c) => c.sentiment ?? '' },
    { key: 'Customer', label: 'Customer', value: (c) => c.customerName ?? '' },
    { key: 'Customer Email', label: 'Customer Email', value: (c) => c.customerEmail ?? '' },
    { key: 'Customer Company', label: 'Customer Company', value: (c) => c.customerCompany ?? '' },
    { key: 'Created', label: 'Created', value: (c) => c.createdAt?.formatDate?.('datetime') ?? '' },
    { key: 'Resolved', label: 'Resolved', value: (c) => c.resolvedAt?.formatDate?.('datetime') ?? '' },
    { key: 'Closed', label: 'Closed', value: (c) => c.closedAt?.formatDate?.('datetime') ?? '' },
    { key: 'Spam', label: 'Spam', value: (c) => (c.isSpam ? 'Yes' : '') },
  ].map((f) => ({ ...f, group: 'system' }))
  const custom = customFieldKeys.value.map((key) => ({
    key: `custom:${key}`,
    label: `Custom: ${key}`,
    value: (c) => (c.customFields?.[key] != null ? String(c.customFields[key]) : ''),
    group: 'custom',
  }))
  return [...system, ...custom]
})

function handleExport({ format, fields, scope, rows }) {
  if (!rows.length) {
    toast.notify({ type: 'warning', message: 'Nothing to export — the current view is empty' })
    return
  }
  const data = rows.map((row) => Object.fromEntries(fields.map((f) => [f.label, f.value(row)])))
  const sheet = xlsxUtils.json_to_sheet(data)
  const book = xlsxUtils.book_new()
  xlsxUtils.book_append_sheet(book, sheet, 'Tickets')
  const stamp = DateTime.now().toFormat('yyyyLLdd-HHmm')
  // xlsx writes CSV too (bookType 'csv'), so one path covers both formats.
  xlsxWriteFile(book, `tickets-${stamp}.${format}`, { bookType: format })
  // Exports leave the system — record who took what (21 CFR Part 11 trail).
  post('/v1/services/customerComplaints/auditExport', {
    format,
    rowCount: rows.length,
    columns: fields.length,
    scope,
    view: activeFilter.value,
  }).catch(() => {})
}

function onNewComplaint() {
  router.push(getCompanyPath('/customer-complaints/create'))
}
</script>

<template>
  <BaseListLayout
    title="Customer Complaints"
    :icon="IconHeadset"
    subtitle="Manage customer complaint tickets from web, forms and email intake."
    :state="list.state.value"
    :emptyIcon="IconHeadset"
    :emptyTitle="list.hasActiveFilters.value ? 'No complaints match your filters' : 'No complaints yet'"
    :selectedCount="selectedIds.length"
  >
    <template #actions>
      <BaseButton
        variant="secondary"
        @click="router.push(getCompanyPath('/customer-complaints/reports'))"
      >
        <IconChartBar :size="18" class="tw:mr-1" />
        Reports
      </BaseButton>
      <BaseButton v-if="canCreate" variant="primary" @click="onNewComplaint">
        New Complaint
      </BaseButton>
    </template>

    <template #stats>
      <BaseStatStrip :items="kpiItems" />
    </template>

    <template #filters>
      <CustomerComplaintsFilterToolbar
        v-model:filters="filters"
        v-model:activeFilter="activeFilter"
        :formOptions="formOptions"
        :savedViews="savedViews"
        @saveView="saveCurrentView"
        @applyView="applySavedView"
        @deleteView="deleteSavedView"
      />
    </template>

    <!-- Bulk action bar -->
    <template #bulk-actions>
      <BaseButton
        v-if="canConvert && activeFilter !== 'spam'"
        variant="primary"
        size="sm"
        :disabled="bulkBusy"
        @click="showConvertDialog = true"
      >
        Create NC
      </BaseButton>
      <BaseButton
        v-if="canUpdate"
        variant="outline"
        size="sm"
        :disabled="bulkBusy"
        @click="showBulkAssignDialog = true"
      >
        Assign
      </BaseButton>
      <BaseMenu v-if="canUpdate" :items="bulkPriorityItems()">
        <template #trigger>
          <BaseButton variant="outline" size="sm" :disabled="bulkBusy">
            Priority <IconChevronDown :size="14" class="tw:ml-1" />
          </BaseButton>
        </template>
      </BaseMenu>
      <BaseButton
        v-if="canUpdate"
        variant="outline"
        size="sm"
        :disabled="bulkBusy"
        @click="runBulk('CLOSE', {}, `Close ${selectedIds.length} ticket(s)?`)"
      >
        Close
      </BaseButton>
      <BaseButton
        v-if="canUpdate && activeFilter !== 'spam'"
        variant="outline"
        size="sm"
        :disabled="bulkBusy"
        @click="runBulk('SPAM', {}, `Flag ${selectedIds.length} ticket(s) as spam?`)"
      >
        Flag Spam
      </BaseButton>
      <BaseButton
        v-if="canUpdate && activeFilter === 'spam'"
        variant="outline"
        size="sm"
        :disabled="bulkBusy"
        @click="runBulk('UNSPAM')"
      >
        Restore
      </BaseButton>
      <BaseButton
        v-if="canDelete"
        variant="danger"
        size="sm"
        :disabled="bulkBusy"
        @click="
          runBulk('DELETE', {}, `Delete ${selectedIds.length} ticket(s)? This soft-deletes them.`)
        "
      >
        Delete
      </BaseButton>
    </template>

    <CustomerComplaintsTable
      v-model:selected="selectedIds"
      :rows="complaints"
      :selectable="canUpdate || canConvert"
      :customFieldKeys="customFieldKeys"
      :exportColumns="exportColumns"
      :exportFormats="['csv', 'xlsx']"
      @open="(row) => router.push(getCompanyPath(`/customer-complaints/${row.id}`))"
      @export="handleExport"
    />

    <CustomerComplaintConvertToNcDialog
      v-model="showConvertDialog"
      :complaints="selectedComplaints"
      @converted="onConverted"
    />

    <!-- Bulk assign dialog -->
    <BaseDialog v-model="showBulkAssignDialog" title="Assign Tickets" maxWidth="md">
      <div class="tw:flex tw:flex-col tw:gap-3 tw:p-1">
        <BaseField label="Assign to agent">
          <UserSelectMenu v-model="bulkAssignUserId" />
        </BaseField>
        <div class="tw:text-center tw:text-xs tw:text-secondary">— or —</div>
        <BaseField label="Assign to group">
          <GroupSelectMenu v-model="bulkAssignTeamId" />
        </BaseField>
      </div>
      <template #footer="{ close }">
        <BaseDialogFooter
          submitLabel="Assign"
          :loading="bulkBusy"
          :disabled="!bulkAssignUserId && !bulkAssignTeamId"
          @cancel="close"
          @submit="handleBulkAssign"
        />
      </template>
    </BaseDialog>
  </BaseListLayout>
</template>
