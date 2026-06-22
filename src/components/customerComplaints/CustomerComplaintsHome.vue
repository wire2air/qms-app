<script setup>
import {
  IconHeadset,
  IconUserQuestion,
  IconClockPause,
  IconCircleCheck,
  IconDownload,
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
    statusId: null,
    priorityId: null,
    sourceId: null,
    assignedTo: null,
    assignedTeamId: null,
    formId: null,
    sentiment: null,
    createdAt: null,
    customKey: null,
    customValue: '',
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
  if (f.statusId) results = results.filter((r) => r.statusId === f.statusId)
  if (f.priorityId) results = results.filter((r) => r.priorityId === f.priorityId)
  if (f.sourceId) results = results.filter((r) => r.sourceId === f.sourceId)
  if (f.assignedTo) results = results.filter((r) => r.assignedTo === f.assignedTo)
  if (f.assignedTeamId) results = results.filter((r) => r.assignedTeamId === f.assignedTeamId)
  if (f.formId) results = results.filter((r) => r.formId === f.formId)
  if (f.sentiment) results = results.filter((r) => r.sentiment === f.sentiment)
  if (f.createdAt) results = results.filter((r) => matchesDateFilter(r.createdAt, f.createdAt))
  if (f.customKey && f.customValue?.trim()) {
    const v = f.customValue.trim().toLowerCase()
    results = results.filter((r) =>
      String(r.customFields?.[f.customKey] ?? '')
        .toLowerCase()
        .includes(v),
    )
  }
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

// ─── Export (current filtered view, system + custom fields) ─────────────────
function exportRows() {
  return complaints.value.map((c) => ({
    Ticket: c.complaintNumber,
    Subject: c.subject,
    Status: c.statusId,
    Priority: c.priorityId ?? '',
    Source: c.sourceId,
    Sentiment: c.sentiment ?? '',
    Customer: c.customerName ?? '',
    'Customer Email': c.customerEmail ?? '',
    'Customer Company': c.customerCompany ?? '',
    Created: c.createdAt?.formatDate?.('datetime') ?? '',
    Resolved: c.resolvedAt?.formatDate?.('datetime') ?? '',
    Closed: c.closedAt?.formatDate?.('datetime') ?? '',
    Spam: c.isSpam ? 'Yes' : '',
    ...Object.fromEntries(
      customFieldKeys.value.map((key) => [
        `Custom: ${key}`,
        c.customFields?.[key] != null ? String(c.customFields[key]) : '',
      ]),
    ),
  }))
}

function exportTickets(format) {
  const rows = exportRows()
  if (!rows.length) {
    toast.notify({ type: 'warning', message: 'Nothing to export — the current view is empty' })
    return
  }
  const sheet = xlsxUtils.json_to_sheet(rows)
  const book = xlsxUtils.book_new()
  xlsxUtils.book_append_sheet(book, sheet, 'Tickets')
  const stamp = DateTime.now().toFormat('yyyyLLdd-HHmm')
  xlsxWriteFile(book, `tickets-${stamp}.${format}`, { bookType: format })
  // Exports leave the system — record who took what (21 CFR Part 11 trail).
  post('/v1/services/customerComplaints/auditExport', {
    format,
    rowCount: rows.length,
    view: activeFilter.value,
  }).catch(() => {})
}

const exportMenuItems = [
  { name: 'Export CSV', click: () => exportTickets('csv') },
  { name: 'Export Excel', click: () => exportTickets('xlsx') },
]

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
      <BaseMenu :items="exportMenuItems">
        <template #trigger>
          <BaseButton variant="secondary">
            <IconDownload :size="18" class="tw:mr-1" />
            Export
            <IconChevronDown :size="14" class="tw:ml-1" />
          </BaseButton>
        </template>
      </BaseMenu>
      <BaseButton v-if="canCreate" variant="primary" @click="onNewComplaint">
        New Complaint
      </BaseButton>
    </template>

    <!-- Stat Cards -->
    <template #stats>
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
    </template>

    <template #filters>
      <CustomerComplaintsFilterToolbar
        v-model:filters="filters"
        v-model:activeFilter="activeFilter"
        :formOptions="formOptions"
        :customFieldKeys="customFieldKeys"
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
      :canUpdate="canUpdate"
      :customFieldKeys="customFieldKeys"
      @open="(row) => router.push(getCompanyPath(`/customer-complaints/${row.id}`))"
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
