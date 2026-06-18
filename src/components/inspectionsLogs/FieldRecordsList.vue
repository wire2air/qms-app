<script setup>
import {
  IconFileText,
  IconLock,
  IconAlertCircle,
  IconShieldCheck,
  IconPrinter,
  IconDownload,
  IconColumns,
  IconCircleCheck,
  IconCircleX,
  IconFlag,
} from '@tabler/icons-vue'
import { isAllowed, currentSession } from '@/utils/currentSession.js'
import { getCompanyPath } from '@/utils/routeHelpers.js'
import { refetchSyncRecord } from '@/utils/syncEngineRefresh.js'
import { post } from '@/api'
import { DateTime } from 'luxon'
import {
  flattenScalarFields,
  formatCellValue,
  defaultVisibleColumnKeys,
  fieldRecordStatusLabel,
} from '@/utils/logBookSchemaUtils.js'

/**
 * Logs table — the body-only version (no SafeTeleport / page
 * header). Used by:
 *   - FieldRecordsHome (the dedicated /inspections-logs/records page,
 *     branded "Logs")
 *   - RecordsHome (the legacy /records page, as a second section so
 *     users see standalone + logs together)
 *
 * Each row is a single log entry; the parent template it was filed
 * against is the "log book". Filter state is local to this component
 * so each page mounts a separate, independent table.
 */
defineProps({
  // When true the component renders compact (no filter chrome, fewer
  // columns). Used by RecordsHome to keep the secondary section tight.
  compact: { type: Boolean, default: false },
})

// State for the inline preview overlay. Clicking a row sets this; the
// FieldRecordPreview component handles its own dismissal + emits
// `changed` after a successful review action so we can refresh.
const selectedRecordId = ref(null)
function openRecord(id) {
  selectedRecordId.value = id
}
function closeRecord() {
  selectedRecordId.value = null
}

const userId = computed(() => currentSession.value?.id ?? currentSession.value?.userId)
const canReadAll = computed(() => isAllowed(['fieldRecords:read_all']))
const canReview = computed(() => isAllowed(['fieldRecords:review']))
const toast = useToast()

// Log books the current user supervises — drives the "Needs my review"
// scope filter (and constrains which rows expose the bulk-review
// checkbox).
const supervisedLogBooks = useLiveQueryWithDeps(
  [() => userId.value],
  async (db, [uid]) => {
    if (!uid) return []
    return db.LogBook.where('supervisorUserId', uid).exec()
  },

  { models: ['LogBook'], initial: [] },
)
const supervisedIds = computed(() => new Set(supervisedLogBooks.value.map((lb) => lb.id)))

// Seed scope from ?scope= so deep links can open the supervisor inbox
// directly (e.g. the "Awaiting your review" tile on the I&L Home page
// links here with `?scope=needs_review`).
const ALLOWED_SCOPES = ['mine', 'all', 'needs_review', 'needs_review_all']
const route = useRoute()
const initialScope =
  typeof route.query?.scope === 'string' && ALLOWED_SCOPES.includes(route.query.scope)
    ? route.query.scope
    : 'mine'
const scope = ref(initialScope)

// Deep-link: ?recordId=… (e.g. from a flagged-log task) auto-opens that
// entry's preview panel. FieldRecordPreview loads the record by id, so
// it works regardless of the list's current filter.
onMounted(() => {
  if (typeof route.query?.recordId === 'string' && route.query.recordId) {
    openRecord(route.query.recordId)
  }
})

// Single object so the new BaseDateRangeInput can drive both bounds
// from one v-model. Empty strings = unbounded on that side, matching
// the previous fromDate/toDate semantics.
const dateRange = ref({ from: '', to: '' })
// Filter toggle — when true, only rows with at least one OPEN flag
// (resolvedAt IS NULL) stay in view.
const flaggedOnly = ref(false)

// Open-flag count per record. Used both for the chip rendering and
// the "Flagged only" filter. We pull all flags once and group by
// fieldRecordId — at the scale of one tenant's flags this is cheap.
const openFlagsByRecordId = useLiveQuery(
  async (db) => {
    const flags = await db.FieldRecordFlag.where().exec()
    const out = new Map()
    for (const f of flags) {
      if (f.resolvedAt) continue
      out.set(f.fieldRecordId, (out.get(f.fieldRecordId) ?? 0) + 1)
    }
    return out
  },

  { models: ['FieldRecordFlag'], initial: new Map() },
)

function openFlagCount(recordId) {
  return openFlagsByRecordId.value?.get?.(recordId) ?? 0
}
const statusFilter = ref('all')
const formTemplateFilter = ref('all') // 'all' | <logBookId> (var name kept for template binding stability)

// Column-picker state for the "log book selected" rendering. Keyed by
// templateId so flipping between log books remembers each one's pick.
// Initialised lazily from defaultVisibleColumnKeys() the first time a
// log book is selected.
const visibleColumnsByTemplate = ref({}) // { [templateId]: string[] }
const showColumnPicker = ref(false)

const records = useLiveQueryWithDeps(
  [
    () => userId.value,
    () => scope.value,
    () => statusFilter.value,
    () => formTemplateFilter.value,
    () => dateRange.value.from,
    () => dateRange.value.to,
    () => supervisedIds.value,
    () => flaggedOnly.value,
    () => openFlagsByRecordId.value,
  ],
  async (db, [uid, scopeVal, status, logBookId, from, to, supIds, flaggedOnlyVal, flagMap]) => {
    let rows = await db.FieldRecord.where().exec()
    if (scopeVal === 'mine' && uid) {
      rows = rows.filter((r) => r.submittedByUserId === uid)
    } else if (scopeVal === 'needs_review') {
      // Supervisor's inbox — UNDER_REVIEW on log books they supervise.
      rows = rows.filter((r) => r.statusId === 'UNDER_REVIEW' && supIds.has(r.logBookId))
    } else if (scopeVal === 'needs_review_all') {
      // Admin view — every UNDER_REVIEW entry across the tenant.
      rows = rows.filter((r) => r.statusId === 'UNDER_REVIEW')
    }
    if (status !== 'all') {
      rows = rows.filter((r) => r.statusId === status)
    }
    if (logBookId !== 'all') {
      rows = rows.filter((r) => r.logBookId === logBookId)
    }
    if (from) {
      const fromMs = DateTime.fromISO(from).startOf('day').toMillis()
      rows = rows.filter((r) => (r.submittedAt?.toMillis?.() ?? 0) >= fromMs)
    }
    if (to) {
      const toMs = DateTime.fromISO(to).endOf('day').toMillis()
      rows = rows.filter((r) => (r.submittedAt?.toMillis?.() ?? 0) <= toMs)
    }
    if (flaggedOnlyVal) {
      rows = rows.filter((r) => (flagMap?.get?.(r.id) ?? 0) > 0)
    }
    return rows.sort(
      (a, b) => (b.submittedAt?.toMillis?.() ?? 0) - (a.submittedAt?.toMillis?.() ?? 0),
    )
  },

  { models: ['FieldRecord'], initial: [] },
)

// ─── Bulk-select state for supervisor review ───────────────────────
// Checkboxes only render on UNDER_REVIEW rows (the only state that
// bulk/review accepts); selecting any of them surfaces the sticky
// action bar with Approve / Reject / Return-for-info.
const selectedIds = ref(new Set())
const selectableRecords = computed(() => records.value.filter((r) => r.statusId === 'UNDER_REVIEW'))
const showBulkColumn = computed(() => canReview.value && selectableRecords.value.length > 0)

function toggleSelected(id) {
  const next = new Set(selectedIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selectedIds.value = next
}
function clearSelection() {
  selectedIds.value = new Set()
}
const allSelectableSelected = computed(() => {
  const reviewable = selectableRecords.value
  return reviewable.length > 0 && reviewable.every((r) => selectedIds.value.has(r.id))
})
function toggleSelectAll() {
  if (allSelectableSelected.value) {
    selectedIds.value = new Set()
  } else {
    selectedIds.value = new Set(selectableRecords.value.map((r) => r.id))
  }
}

// Drop selections that leave the current view (filter change, row
// approved underneath us, etc).
watch(records, (rows) => {
  if (!selectedIds.value.size) return
  const visibleReviewable = new Set(
    rows.filter((r) => r.statusId === 'UNDER_REVIEW').map((r) => r.id),
  )
  const next = new Set([...selectedIds.value].filter((id) => visibleReviewable.has(id)))
  if (next.size !== selectedIds.value.size) selectedIds.value = next
})

// ─── Bulk action handlers ─────────────────────────────────────────
// One comment dialog → one e-sig capture → one POST that fans out per
// record on the backend. Mirrors the single-record review flow inside
// FieldRecordPreview for visual + behavioural consistency.
const bulkOutcome = ref(null) // 'APPROVED' | 'REJECTED'
const bulkComment = ref('')
const showBulkCommentDialog = ref(false)
const showBulkEsignDialog = ref(false)
const isSubmittingBulk = ref(false)

function buildEsignFromVerified(v) {
  if (!v) return null
  if (v.method === 'PASSWORD') return { password: v.token }
  if (v.method === 'PIN') return { strategy: 'pin', token: v.token }
  if (v.method === 'OAUTH' && v.provider === 'MICROSOFT') {
    return { strategy: 'microsoft', token: v.token }
  }
  if (v.method === 'OAUTH' && v.provider === 'GOOGLE') {
    return { strategy: 'google', code: v.token, token: v.token }
  }
  return v
}

function startBulk(outcome) {
  if (selectedIds.value.size === 0) return
  bulkOutcome.value = outcome
  bulkComment.value = ''
  showBulkCommentDialog.value = true
}

function confirmBulkComment() {
  if (!bulkOutcome.value) return
  showBulkCommentDialog.value = false
  // APPROVED + REJECTED both require an e-signature.
  showBulkEsignDialog.value = true
}

async function onBulkEsignVerified(verified) {
  showBulkEsignDialog.value = false
  await submitBulk(buildEsignFromVerified(verified))
}

async function submitBulk(esign) {
  if (!bulkOutcome.value) return
  isSubmittingBulk.value = true
  const ids = [...selectedIds.value]
  try {
    const res = await post('/v1/services/fieldRecords/bulk/review', {
      recordIds: ids,
      outcome: bulkOutcome.value,
      comment: bulkComment.value?.trim() || null,
      esign,
    })
    // REST bypass — refetch each record so live queries drop them
    // from the visible list immediately.
    await Promise.all(ids.map((id) => refetchSyncRecord('FieldRecord', id)))
    const ok = res?.succeeded?.length ?? 0
    const failed = res?.failed?.length ?? 0
    if (failed === 0) {
      toast.success(`${ok} entries ${bulkOutcome.value.toLowerCase().replace('_', ' ')}`)
    } else {
      toast.error(`${ok} ok, ${failed} failed — see console for details`)
      console.warn('Bulk review failures:', res?.failed)
    }
    clearSelection()
    bulkOutcome.value = null
  } catch (e) {
    toast.error(e?.message ?? 'Bulk review failed')
  } finally {
    isSubmittingBulk.value = false
  }
}

// Round 0: log books live in db.LogBook. Variable name preserved at
// the template binding level for stability.
const formTemplates = useLiveQuery((db) => db.LogBook.where().exec(), {
  models: ['LogBook'],
  initial: [],
})
const templateById = computed(() => new Map(formTemplates.value.map((t) => [t.id, t])))

/**
 * The actual field values live on FieldRecordRevision, not on
 * FieldRecord itself — each record points to its active revision via
 * `currentRevisionId`. Pull the matching revision rows for every
 * record currently in view and index by record id so the table cells,
 * CSV export, and print HTML all see the right payload in one place.
 *
 * Loads only the in-view records' current revisions (not the full
 * history) — cheap even on tenants with thousands of log entries.
 */
const currentPayloadByRecordId = useLiveQueryWithDeps(
  [() => records.value],
  async (db, [recs]) => {
    const out = new Map()
    if (!recs?.length) return out
    const revIds = new Set(recs.map((r) => r.currentRevisionId).filter(Boolean))
    if (revIds.size === 0) return out
    // Single full scan + filter — Map lookup is O(1) per row at render
    // time. Avoids one IDB get per row, which would thrash on large
    // log books.
    const allRevs = await db.FieldRecordRevision.where().exec()
    const revsById = new Map()
    for (const rev of allRevs) {
      if (revIds.has(rev.id)) revsById.set(rev.id, rev)
    }
    for (const r of recs) {
      const rev = r.currentRevisionId ? revsById.get(r.currentRevisionId) : null
      out.set(r.id, rev?.payload ?? {})
    }
    return out
  },

  { models: ['FieldRecordRevision'], initial: new Map() },
)

function payloadFor(record) {
  return currentPayloadByRecordId.value.get(record.id) ?? {}
}

// db.LogBook only ever holds OPERATIONAL_LOG / CONTROLLED_RECORD rows
// by construction (Round 0 refactor) so no classification filter
// needed here. Show whatever's referenced by at least one record OR
// is currently ACTIVE so admins can pre-filter even for empty books.
const filterableTemplates = computed(() => {
  const referenced = new Set(records.value.map((r) => r.logBookId))
  return formTemplates.value
    .filter((t) => t.statusId === 'ACTIVE' || referenced.has(t.id))
    .sort((a, b) => (a.title ?? '').localeCompare(b.title ?? ''))
})

function templateTitle(record) {
  return templateById.value.get(record.logBookId)?.title ?? record.logBookId
}

function statusBadgeClass(statusId) {
  switch (statusId) {
    case 'SUBMITTED':
      return 'tw:bg-blue-100 tw:text-blue-700'
    case 'LOCKED':
      return 'tw:bg-gray-200 tw:text-gray-800'
    case 'UNDER_REVIEW':
      return 'tw:bg-amber-100 tw:text-amber-700'
    case 'APPROVED':
      return 'tw:bg-green-100 tw:text-green-700'
    case 'REJECTED':
      return 'tw:bg-red-100 tw:text-red-700'
    case 'VOIDED':
      return 'tw:bg-purple-100 tw:text-purple-700'
    default:
      return 'tw:bg-gray-100 tw:text-gray-700'
  }
}

function classificationBadgeClass(cls) {
  if (cls === 'CONTROLLED_RECORD') return 'tw:bg-red-50 tw:text-red-700 tw:border-red-200'
  if (cls === 'OPERATIONAL_LOG') return 'tw:bg-amber-50 tw:text-amber-700 tw:border-amber-200'
  return 'tw:bg-gray-50 tw:text-gray-600 tw:border-gray-200'
}

function fmtDate(dt) {
  if (!dt) return '—'
  if (dt.toFormat) return dt.toFormat('LLL d, yyyy HH:mm')
  const d = new Date(dt)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString()
}

function lockCountdown(dt) {
  if (!dt) return null
  const ms = dt.toMillis() - DateTime.now().toMillis()
  if (ms <= 0) return null
  const minutes = Math.round(ms / 60_000)
  if (minutes > 60 * 24) return `${Math.round(minutes / (60 * 24))}d`
  if (minutes > 60) return `${Math.round(minutes / 60)}h`
  return `${minutes}m`
}

// ─── Dynamic columns when a single log book is selected ────────────
// When formTemplateFilter is a real template id (not 'all'), we
// surface scalar fields from that template's schema as additional
// columns. The user can toggle which extras to show via a column
// picker; defaults to the first 4 scalar fields.

const selectedTemplate = computed(() => {
  if (formTemplateFilter.value === 'all') return null
  return templateById.value.get(formTemplateFilter.value) ?? null
})

const isLogBookMode = computed(() => selectedTemplate.value != null)

const scalarFields = computed(() =>
  selectedTemplate.value ? flattenScalarFields(selectedTemplate.value.schema) : [],
)

// Visible columns for the current template — initialises to a sensible
// default the first time we encounter the template, then sticks with
// whatever the user toggled.
const visibleColumnKeys = computed({
  get() {
    if (!isLogBookMode.value) return []
    const tid = selectedTemplate.value.id
    return visibleColumnsByTemplate.value[tid] ?? defaultVisibleColumnKeys(scalarFields.value)
  },
  set(keys) {
    if (!isLogBookMode.value) return
    visibleColumnsByTemplate.value = {
      ...visibleColumnsByTemplate.value,
      [selectedTemplate.value.id]: keys,
    }
  },
})

const visibleColumns = computed(() =>
  scalarFields.value.filter((f) => visibleColumnKeys.value.includes(f.name)),
)

function toggleColumn(name) {
  const set = new Set(visibleColumnKeys.value)
  if (set.has(name)) set.delete(name)
  else set.add(name)
  // Preserve schema order in the visible list.
  visibleColumnKeys.value = scalarFields.value.map((f) => f.name).filter((n) => set.has(n))
}

// ─── Print / Export ─────────────────────────────────────────────────
// Only available when a single log book is selected. Exporting a mixed
// view would produce columns that don't apply to every row.

function exportCsv() {
  if (!isLogBookMode.value) return
  const cols = visibleColumns.value
  const header = [
    'Log Entry ID',
    'Submitted At',
    'Submitted By',
    'Status',
    ...cols.map((c) => c.label || c.name),
  ]
  const csvEscape = (v) => {
    const s = v == null ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const rows = records.value.map((r) => {
    const payload = payloadFor(r)
    return [
      r.recordNumber ?? r.id,
      r.submittedAt?.toISO ? r.submittedAt.toISO() : (r.submittedAt ?? ''),
      r.submittedByUserId ?? '',
      r.statusId ?? '',
      ...cols.map((c) => formatCellValue(c, payload[c.name], { maxLength: 1000 })),
    ]
      .map(csvEscape)
      .join(',')
  })
  const csv = [header.map(csvEscape).join(','), ...rows].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  const stamp = DateTime.now().toFormat('yyyy-LL-dd')
  const slug = selectedTemplate.value.code?.toLowerCase() ?? 'log-book'
  a.download = `${slug}-${stamp}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function printList() {
  if (!isLogBookMode.value) return
  // Routes to the centralised print shell so the log book inherits the
  // company-branded header / footer / page numbering every other QMS
  // printout uses. Rendering lives in
  // components/print/modules/LogBookPrint.vue. We pass the date range
  // + chosen columns so the new tab renders exactly what the user was
  // looking at when they clicked Print.
  const params = new URLSearchParams({
    module: 'LogBook',
    templateId: selectedTemplate.value.id,
  })
  if (dateRange.value.from) params.set('from', dateRange.value.from)
  if (dateRange.value.to) params.set('to', dateRange.value.to)
  const cols = visibleColumns.value.map((c) => c.name).join(',')
  if (cols) params.set('cols', cols)
  const url = getCompanyPath(`/print?${params.toString()}`)
  window.open(url, '_blank', 'noopener,noreferrer')
}
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-3">
    <!-- Filters (hidden in compact mode) -->
    <div v-if="!compact" class="tw:flex tw:items-center tw:gap-3 tw:flex-wrap">
      <div v-if="canReadAll || canReview" class="tw:flex tw:items-center tw:gap-2">
        <span class="tw:text-xs tw:text-secondary">Scope</span>
        <select
          v-model="scope"
          class="tw:rounded tw:border tw:border-divider tw:bg-card tw:px-2 tw:py-1 tw:text-sm"
        >
          <option value="mine">My entries only</option>
          <option v-if="canReadAll" value="all">All in tenant</option>
          <option v-if="canReview" value="needs_review">Needs my review</option>
          <option v-if="canReview && canReadAll" value="needs_review_all">
            Needs review (all log books)
          </option>
        </select>
      </div>
      <div class="tw:flex tw:items-center tw:gap-2">
        <span class="tw:text-xs tw:text-secondary">Form</span>
        <select
          v-model="formTemplateFilter"
          class="tw:rounded tw:border tw:border-divider tw:bg-card tw:px-2 tw:py-1 tw:text-sm tw:max-w-xs"
        >
          <option value="all">All log books</option>
          <option v-for="t in filterableTemplates" :key="t.id" :value="t.id">
            {{ t.title }}
          </option>
        </select>
      </div>
      <div class="tw:flex tw:items-center tw:gap-2">
        <span class="tw:text-xs tw:text-secondary">Status</span>
        <select
          v-model="statusFilter"
          class="tw:rounded tw:border tw:border-divider tw:bg-card tw:px-2 tw:py-1 tw:text-sm"
        >
          <option value="all">All</option>
          <option value="SUBMITTED">Submitted (in window)</option>
          <option value="LOCKED">Completed</option>
          <option value="UNDER_REVIEW">Under review</option>
          <option value="APPROVED">Approved</option>
          <option value="REJECTED">Rejected</option>
          <option value="VOIDED">Voided</option>
        </select>
      </div>
      <!-- Quick toggle: show only entries with at least one open flag.
           Resolved flags still show their chip on the row but don't
           count for this filter. -->
      <button
        type="button"
        class="tw:flex tw:items-center tw:gap-1 tw:text-xs tw:rounded tw:border tw:px-2 tw:py-1 tw:transition"
        :class="
          flaggedOnly
            ? 'tw:bg-orange-100 tw:text-orange-700 tw:border-orange-300'
            : 'tw:bg-card tw:text-secondary tw:border-divider tw:hover:bg-main-hover'
        "
        @click="flaggedOnly = !flaggedOnly"
      >
        <IconFlag :size="14" />
        Flagged only
      </button>
      <div class="tw:flex tw:items-center tw:gap-2">
        <span class="tw:text-xs tw:text-secondary">Submitted</span>
        <BaseDateRangeInput v-model="dateRange" />
      </div>

      <!-- Right-aligned actions: column picker + print + export.
           Only meaningful when a single log book is selected — mixed
           log books can't share columns, so the buttons are gated. -->
      <div class="tw:flex-1" />
      <div v-if="isLogBookMode" class="tw:flex tw:items-center tw:gap-2 tw:relative">
        <button
          type="button"
          class="tw:px-2 tw:py-1 tw:text-xs tw:rounded tw:bg-main tw:border tw:border-divider tw:text-on-main tw:flex tw:items-center tw:gap-1 tw:hover:bg-main-hover"
          @click="showColumnPicker = !showColumnPicker"
        >
          <IconColumns :size="14" />
          Columns ({{ visibleColumns.length }})
        </button>
        <button
          type="button"
          class="tw:px-2 tw:py-1 tw:text-xs tw:rounded tw:bg-main tw:border tw:border-divider tw:text-on-main tw:flex tw:items-center tw:gap-1 tw:hover:bg-main-hover"
          :disabled="records.length === 0"
          @click="printList"
        >
          <IconPrinter :size="14" />
          Print
        </button>
        <button
          type="button"
          class="tw:px-2 tw:py-1 tw:text-xs tw:rounded tw:bg-main tw:border tw:border-divider tw:text-on-main tw:flex tw:items-center tw:gap-1 tw:hover:bg-main-hover"
          :disabled="records.length === 0"
          @click="exportCsv"
        >
          <IconDownload :size="14" />
          Export CSV
        </button>

        <!-- Column picker dropdown — checkbox list of scalar fields.
             Closed by clicking the toggle button again or outside. -->
        <div
          v-if="showColumnPicker"
          class="tw:absolute tw:top-full tw:right-0 tw:mt-1 tw:z-dropdown tw:bg-white tw:border tw:border-divider tw:rounded-lg tw:shadow-lg tw:p-3 tw:min-w-64 tw:max-h-80 tw:overflow-y-auto"
        >
          <BaseText variant="overline" class="tw:block tw:mb-2">Columns</BaseText>
          <div v-if="scalarFields.length === 0" class="tw:text-xs tw:text-secondary">
            No scalar fields in this log book's schema.
          </div>
          <label
            v-for="f in scalarFields"
            :key="f.name"
            class="tw:flex tw:items-center tw:gap-2 tw:py-1 tw:text-sm tw:cursor-pointer"
          >
            <input
              type="checkbox"
              :checked="visibleColumnKeys.includes(f.name)"
              @change="toggleColumn(f.name)"
            />
            <span class="tw:text-on-main">{{ f.label || f.name }}</span>
            <span class="tw:text-[10px] tw:text-secondary tw:ml-auto tw:uppercase">
              {{ f.type }}
            </span>
          </label>
        </div>
      </div>
    </div>

    <div
      v-if="records.length === 0"
      class="tw:flex tw:flex-col tw:items-center tw:justify-center tw:gap-3 tw:py-10 tw:text-secondary"
    >
      <IconFileText :size="40" class="tw:opacity-60" />
      <div class="tw:text-sm">No logs yet.</div>
    </div>

    <div v-else>
      <!-- Mobile / portrait-tablet: card list (the wide table doesn't fit
           a phone held in the hand on the floor). Tap a card to open the
           same preview the table rows open. Bulk-review stays desktop. -->
      <div class="tw:md:hidden tw:flex tw:flex-col tw:gap-2">
        <button
          v-for="row in records"
          :key="row.id"
          type="button"
          class="tw:w-full tw:text-left tw:bg-white tw:rounded-xl tw:border tw:border-divider tw:p-3 tw:active:bg-main-hover tw:transition"
          :class="selectedIds.has(row.id) ? 'tw:border-primary tw:bg-primary/5' : ''"
          @click="openRecord(row.id)"
        >
          <div class="tw:flex tw:items-start tw:justify-between tw:gap-2">
            <div class="tw:min-w-0 tw:flex-1">
              <div class="tw:font-medium tw:text-on-main tw:truncate">
                {{ isLogBookMode ? row.recordNumber || row.id : templateTitle(row) }}
              </div>
              <div class="tw:text-[11px] tw:text-secondary tw:mt-0.5">
                {{ fmtDate(row.submittedAt) }}
              </div>
            </div>
            <div class="tw:flex tw:items-center tw:gap-1 tw:flex-wrap tw:justify-end tw:shrink-0">
              <span
                class="tw:inline-flex tw:items-center tw:gap-1 tw:text-xs tw:font-bold tw:rounded tw:px-2 tw:py-0.5"
                :class="statusBadgeClass(row.statusId)"
              >
                <IconLock v-if="row.statusId === 'LOCKED'" :size="10" />
                <IconAlertCircle v-if="row.statusId === 'UNDER_REVIEW'" :size="10" />
                {{ fieldRecordStatusLabel(row.statusId) }}
              </span>
              <span
                v-if="openFlagCount(row.id) > 0"
                class="tw:inline-flex tw:items-center tw:gap-1 tw:text-[10px] tw:font-bold tw:uppercase tw:rounded tw:px-2 tw:py-0.5 tw:bg-orange-100 tw:text-orange-700 tw:border tw:border-orange-300"
              >
                <IconFlag :size="10" />
                {{ openFlagCount(row.id) }}
              </span>
            </div>
          </div>
          <div
            v-if="visibleColumns.length"
            class="tw:mt-2 tw:grid tw:grid-cols-2 tw:gap-x-3 tw:gap-y-1"
          >
            <div
              v-for="col in visibleColumns"
              :key="col.name"
              class="tw:text-xs tw:min-w-0 tw:truncate"
            >
              <span class="tw:text-secondary">{{ col.label || col.name }}:</span>
              <span class="tw:text-on-main tw:ml-1">{{
                formatCellValue(col, payloadFor(row)[col.name])
              }}</span>
            </div>
          </div>
        </button>
      </div>

      <!-- Desktop / landscape: full table -->
      <div
        class="tw:hidden tw:md:block tw:bg-white tw:rounded-lg tw:border tw:border-divider tw:overflow-hidden"
      >
        <table class="tw:w-full tw:text-sm">
          <thead class="tw:bg-main">
            <tr class="tw:text-left">
              <!-- Bulk-review checkbox column — only rendered when the
                 viewer can review AND there's at least one UNDER_REVIEW
                 row in the current filter. Header checkbox toggles all
                 reviewable rows (non-reviewable rows stay untouched). -->
              <th v-if="showBulkColumn" class="tw:px-3 tw:py-2 tw:w-8">
                <input
                  type="checkbox"
                  :checked="allSelectableSelected"
                  :indeterminate.prop="selectedIds.size > 0 && !allSelectableSelected"
                  @change="toggleSelectAll"
                />
              </th>
              <!-- "Form" column is replaced by the Entry ID in log-book
                 mode (the form is the same for every row, so showing
                 it on each row is wasted space). -->
              <th class="tw:px-3 tw:py-2 tw:font-semibold tw:text-secondary">
                {{ isLogBookMode ? 'Entry ID' : 'Form' }}
              </th>
              <!-- Classification column hidden in log-book mode (all rows
                 share the same classification — visible in the header). -->
              <th v-if="!isLogBookMode" class="tw:px-3 tw:py-2 tw:font-semibold tw:text-secondary">
                Classification
              </th>
              <th class="tw:px-3 tw:py-2 tw:font-semibold tw:text-secondary">Status</th>
              <th class="tw:px-3 tw:py-2 tw:font-semibold tw:text-secondary">Submitted</th>
              <!-- Schema-derived dynamic columns. Only render when a
                 single log book is selected. -->
              <th
                v-for="col in visibleColumns"
                :key="col.name"
                class="tw:px-3 tw:py-2 tw:font-semibold tw:text-secondary"
              >
                {{ col.label || col.name }}
              </th>
              <th v-if="!compact" class="tw:px-3 tw:py-2 tw:font-semibold tw:text-secondary">
                Lock
              </th>
            </tr>
          </thead>
          <tbody>
            <BaseClickableRow
              v-for="row in records"
              :key="row.id"
              tag="tr"
              class="tw:border-t tw:border-divider tw:hover:bg-main-hover"
              :class="selectedIds.has(row.id) ? 'tw:bg-primary/5' : ''"
              :aria-label="`Open log entry ${row.recordNumber || row.id}`"
              @click="openRecord(row.id)"
            >
              <!-- Per-row bulk checkbox. Only reviewable rows
                 (UNDER_REVIEW) get an interactive checkbox; others
                 render an empty cell so column alignment stays clean. -->
              <td v-if="showBulkColumn" class="tw:px-3 tw:py-2 tw:w-8" @click.stop>
                <input
                  v-if="row.statusId === 'UNDER_REVIEW'"
                  type="checkbox"
                  :checked="selectedIds.has(row.id)"
                  @change="toggleSelected(row.id)"
                />
              </td>
              <td class="tw:px-3 tw:py-2">
                <template v-if="isLogBookMode">
                  <div class="tw:font-mono tw:text-on-main tw:text-xs">
                    {{ row.recordNumber || row.id }}
                  </div>
                </template>
                <template v-else>
                  <div class="tw:font-medium tw:text-on-main">{{ templateTitle(row) }}</div>
                  <div class="tw:text-xs tw:text-secondary tw:truncate">{{ row.id }}</div>
                </template>
              </td>
              <td v-if="!isLogBookMode" class="tw:px-3 tw:py-2">
                <span
                  class="tw:inline-flex tw:items-center tw:gap-1 tw:text-[10px] tw:font-bold tw:uppercase tw:rounded tw:px-2 tw:py-0.5 tw:border"
                  :class="classificationBadgeClass(row.recordClassification)"
                >
                  <IconShieldCheck
                    v-if="row.recordClassification === 'CONTROLLED_RECORD'"
                    :size="10"
                  />
                  {{ row.recordClassification?.replace('_', ' ') }}
                </span>
              </td>
              <td class="tw:px-3 tw:py-2">
                <div class="tw:flex tw:items-center tw:gap-1 tw:flex-wrap">
                  <span
                    class="tw:inline-flex tw:items-center tw:gap-1 tw:text-xs tw:font-bold tw:rounded tw:px-2 tw:py-0.5"
                    :class="statusBadgeClass(row.statusId)"
                  >
                    <IconLock v-if="row.statusId === 'LOCKED'" :size="10" />
                    <IconAlertCircle v-if="row.statusId === 'UNDER_REVIEW'" :size="10" />
                    {{ fieldRecordStatusLabel(row.statusId) }}
                  </span>
                  <!-- Open-flag chip — only shown when the record has at
                     least one unresolved flag. Click-through still
                     opens the preview so the supervisor can read the
                     flag notes / resolve. -->
                  <span
                    v-if="openFlagCount(row.id) > 0"
                    class="tw:inline-flex tw:items-center tw:gap-1 tw:text-[10px] tw:font-bold tw:uppercase tw:rounded tw:px-2 tw:py-0.5 tw:bg-orange-100 tw:text-orange-700 tw:border tw:border-orange-300"
                    :title="`${openFlagCount(row.id)} open flag${openFlagCount(row.id) === 1 ? '' : 's'}`"
                  >
                    <IconFlag :size="10" />
                    {{ openFlagCount(row.id) }}
                  </span>
                </div>
              </td>
              <td class="tw:px-3 tw:py-2 tw:text-secondary tw:text-xs">
                {{ fmtDate(row.submittedAt) }}
              </td>
              <!-- Schema-derived dynamic cells. The actual values live
                 on the current revision, not on the FieldRecord row —
                 payloadFor() resolves the lookup. formatCellValue
                 handles primitives, dates, arrays uniformly. -->
              <td
                v-for="col in visibleColumns"
                :key="col.name"
                class="tw:px-3 tw:py-2 tw:text-on-main tw:text-xs"
              >
                {{ formatCellValue(col, payloadFor(row)[col.name]) }}
              </td>
              <td v-if="!compact" class="tw:px-3 tw:py-2 tw:text-xs">
                <template v-if="row.statusId === 'LOCKED'">
                  <span class="tw:text-gray-700">
                    completed
                    <span v-if="row.lockReason" class="tw:text-secondary">
                      ({{ row.lockReason.toLowerCase() }})
                    </span>
                  </span>
                </template>
                <template v-else-if="row.lockAt && lockCountdown(row.lockAt)">
                  <span class="tw:text-amber-700">
                    editable for {{ lockCountdown(row.lockAt) }}
                  </span>
                </template>
                <template v-else-if="row.lockAt">
                  <span class="tw:text-secondary">expires {{ fmtDate(row.lockAt) }}</span>
                </template>
                <template v-else>
                  <!-- No lockAt — either NONE/UNTIL_NEXT_ENTRY/UNTIL_REVIEW
                     edit-window mode, or status is non-editable already
                     (UNDER_REVIEW / APPROVED / REJECTED / VOIDED). Show
                     a hint so supervisors aren't left wondering. -->
                  <span v-if="row.statusId === 'SUBMITTED'" class="tw:text-amber-700">
                    editable (until next entry or review)
                  </span>
                  <span v-else class="tw:text-secondary">—</span>
                </template>
              </td>
            </BaseClickableRow>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Detail panel — mounted into body so it overlays everything;
         live queries inside auto-refresh when the row is updated. -->
    <Teleport to="body">
      <FieldRecordPreview
        v-if="selectedRecordId"
        :recordId="selectedRecordId"
        @close="closeRecord"
        @changed="closeRecord"
      />
    </Teleport>

    <!-- Bulk action bar — sticky at bottom whenever the supervisor has
         selected any UNDER_REVIEW rows. One comment dialog → one esign
         → one POST fans out to /bulk/review. -->
    <Teleport to="body">
      <div
        v-if="canReview && selectedIds.size > 0"
        class="tw:fixed tw:bottom-0 tw:left-0 tw:right-0 tw:bg-white tw:border-t tw:border-divider tw:shadow-lg tw:px-5 tw:py-3 tw:flex tw:items-center tw:gap-3 tw:z-overlay"
      >
        <div class="tw:text-sm tw:text-on-main tw:font-medium">{{ selectedIds.size }} selected</div>
        <button
          type="button"
          class="tw:text-xs tw:text-secondary tw:underline tw:hover:text-on-main"
          @click="clearSelection"
        >
          clear
        </button>
        <div class="tw:flex-1" />
        <button
          type="button"
          class="tw:px-3 tw:py-2 tw:text-sm tw:rounded tw:bg-red-600 tw:text-white tw:font-medium tw:hover:bg-red-700 tw:transition tw:flex tw:items-center tw:gap-1.5"
          :disabled="isSubmittingBulk"
          @click="startBulk('REJECTED')"
        >
          <IconCircleX :size="16" />
          Reject selected
        </button>
        <button
          type="button"
          class="tw:px-3 tw:py-2 tw:text-sm tw:rounded tw:bg-green-600 tw:text-white tw:font-medium tw:hover:bg-green-700 tw:transition tw:flex tw:items-center tw:gap-1.5"
          :disabled="isSubmittingBulk"
          @click="startBulk('APPROVED')"
        >
          <IconCircleCheck :size="16" />
          Approve selected
        </button>
      </div>
    </Teleport>

    <!-- Comment dialog for the bulk action. Comment is optional; one
         e-signature confirms the whole batch. -->
    <Teleport to="body">
      <div
        v-if="showBulkCommentDialog"
        class="tw:fixed tw:inset-0 tw:z-popover tw:flex tw:items-center tw:justify-center tw:bg-black/40"
      >
        <div class="tw:bg-white tw:rounded-lg tw:max-w-md tw:w-full tw:p-5 tw:m-3">
          <h3 class="tw:text-base tw:font-bold tw:text-on-main tw:mb-2">
            {{
              bulkOutcome === 'APPROVED'
                ? `Approve ${selectedIds.size} entries`
                : `Reject ${selectedIds.size} entries`
            }}
          </h3>
          <p class="tw:text-xs tw:text-secondary tw:mb-3">
            Comment is optional. One e-signature confirms the whole batch.
          </p>
          <textarea
            v-model="bulkComment"
            rows="4"
            class="tw:w-full tw:rounded tw:border tw:border-divider tw:bg-card tw:text-on-main tw:px-3 tw:py-2 tw:text-sm"
            placeholder="Comment applied to every record in this batch"
          ></textarea>
          <div class="tw:flex tw:justify-end tw:gap-2 tw:mt-3">
            <button
              type="button"
              class="tw:px-3 tw:py-1.5 tw:text-sm tw:rounded tw:bg-transparent tw:text-secondary tw:hover:bg-main-hover tw:transition tw:border-0"
              @click="showBulkCommentDialog = false"
            >
              Cancel
            </button>
            <button
              type="button"
              class="tw:px-3 tw:py-1.5 tw:text-sm tw:rounded tw:bg-primary tw:text-white tw:font-medium tw:hover:bg-primary/90 tw:transition tw:border-0"
              @click="confirmBulkComment"
            >
              Continue to sign
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Shared e-sig dialog. Same component used by the single-record
         review flow; backend writes one Signature row per affected
         record, all tied to the same batch_session_id. -->
    <WorkflowInstanceEsignAuthDialog
      v-model="showBulkEsignDialog"
      @verified="onBulkEsignVerified"
    />
  </div>
</template>
