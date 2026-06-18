<script setup>
import {
  IconX,
  IconShieldCheck,
  IconLock,
  IconCircleCheck,
  IconCircleX,
  IconPencil,
  IconEdit,
  IconTrash,
  IconPrinter,
  IconFlag,
  IconAlertTriangle,
} from '@tabler/icons-vue'
import FormSchemaReadonlyView from '@/components/form/FormSchemaReadonlyView.vue'
import DynamicForm from '@/components/form/DynamicForm.js'
import { fieldRecordStatusLabel } from '@/utils/logBookSchemaUtils.js'
import { isAllowed, currentSession } from '@/utils/currentSession.js'
import { refetchSyncRecord } from '@/utils/syncEngineRefresh.js'
import { getCompanyPath } from '@/utils/routeHelpers.js'
import { post, patch } from '@/api'
import { DateTime } from 'luxon'
import { freezeOptionLabels } from '@/utils/freezeFormPayloadLabels.js'
import { db } from '@models/index'

/**
 * Full-screen preview for a field record. Opens from the row click on
 * the FieldRecordsList. Shows the payload (read-only DynamicForm),
 * status / classification / signature metadata, and — when the record
 * is UNDER_REVIEW and the user has fieldRecords:review — exposes
 * Approve / Reject / Return-for-info actions that route through the
 * existing e-sig dialog.
 *
 * Edit / amend / void affordances are not in this commit. They'll
 * land as separate buttons gated by the matching permissions.
 */
const props = defineProps({
  recordId: { type: String, default: null },
})
const emit = defineEmits(['close', 'changed'])
const toast = useToast()

const canReview = computed(() => isAllowed(['fieldRecords:review']))
const canAmend = computed(() => isAllowed(['fieldRecords:amend']))
const canVoid = computed(() => isAllowed(['fieldRecords:void']))

// `currentSession.id` is NOT reliably the user id — the session object spreads
// `...activeCompany` over it, so it ends up as the membership/company id. The
// canonical user id is `userId` (what 50+ other components read).
const userId = computed(() => currentSession.value?.userId ?? currentSession.value?.id)
const isOwnRecord = computed(() => record.value?.submittedByUserId === userId.value)

/**
 * Mirror of the server-side `isLockedForEdit` check
 * (qms/backend/api/services/fieldRecordService.js). Once the record
 * is in a terminal/locked status, in-window edits are rejected even
 * if `lockAt` is still in the future. Server is the source of truth;
 * this is for hiding buttons we know will 400.
 */
const isLockedForEdit = computed(() => {
  const s = record.value?.statusId
  if (!s) return true
  if (['LOCKED', 'APPROVED', 'REJECTED', 'VOIDED'].includes(s)) return true
  const lockAt = record.value?.lockAt
  if (lockAt) {
    const ms = lockAt.toMillis ? lockAt.toMillis() : new Date(lockAt).getTime()
    if (ms <= DateTime.now().toMillis()) return true
  }
  return false
})

// Within-window edit (cheap, no esign). Server also enforces the
// submitter check, but we mirror it so the button only shows for the
// person it'll work for.
const canEdit = computed(() => isOwnRecord.value && !isLockedForEdit.value)
// Post-lock amendment (esign + comment required server-side). Permission
// gate matches `fieldRecords:amend`. Voided records can't be amended.
const canAmendNow = computed(
  () => canAmend.value && record.value?.statusId !== 'VOIDED' && isLockedForEdit.value,
)
// Void available unless already voided.
const canVoidNow = computed(() => canVoid.value && record.value?.statusId !== 'VOIDED')

const record = useLiveQueryWithDeps(
  [() => props.recordId],

  async (db, [id]) => {
    if (!id) return null
    return db.FieldRecord.findByPk(id)
  },
  { models: ['FieldRecord'] },
)

const currentRevision = useLiveQueryWithDeps(
  [() => record.value?.currentRevisionId],

  async (db, [rid]) => {
    if (!rid) return null
    return db.FieldRecordRevision.findByPk(rid)
  },
  { models: ['FieldRecordRevision'] },
)

/**
 * Full revision history for the audit-trail section. Ordered oldest
 * → newest so the reader can follow the entry from initial submit
 * through any edits / amendments / review outcomes / voids. The
 * append-only RLS policy on field_record_revisions means this list
 * is guaranteed not to be tampered with after the fact.
 */
const revisions = useLiveQueryWithDeps(
  [() => props.recordId],
  async (db, [id]) => {
    if (!id) return []
    const rows = await db.FieldRecordRevision.where('fieldRecordId', id).exec()
    return rows.sort((a, b) => (a.revisionNumber ?? 0) - (b.revisionNumber ?? 0))
  },

  { models: ['FieldRecordRevision'], initial: [] },
)

/**
 * Map the revision type to a human label + chip styling. Mirrors
 * the canonical set on the FieldRecordRevision model.
 */
function revisionTypeMeta(type) {
  switch (type) {
    case 'INITIAL_SUBMIT':
      return { label: 'Submitted', class: 'tw:bg-blue-100 tw:text-blue-700' }
    case 'USER_EDIT':
      return { label: 'Edited', class: 'tw:bg-amber-100 tw:text-amber-700' }
    case 'ADMIN_AMENDMENT':
      return { label: 'Amended', class: 'tw:bg-purple-100 tw:text-purple-700' }
    case 'VOID':
      return { label: 'Voided', class: 'tw:bg-red-100 tw:text-red-700' }
    case 'REVIEW_OUTCOME':
      return { label: 'Reviewed', class: 'tw:bg-emerald-100 tw:text-emerald-700' }
    default:
      return { label: type ?? '—', class: 'tw:bg-gray-100 tw:text-gray-700' }
  }
}

/**
 * Flag history feed — raise + resolve events for every flag on this
 * record (open and closed), oldest → newest. Rendered as a separate
 * section below Revision history so the auditor sees the full
 * exception trail without it polluting the content-revision feed.
 */
const flagHistory = computed(() => {
  const fmtMillis = (v) => v?.toMillis?.() ?? (v ? new Date(v).getTime() : 0)
  const items = []
  for (const f of flags.value) {
    items.push({
      id: `flag-raised:${f.id}`,
      kind: 'raised',
      flagId: f.id,
      at: f.flaggedAt,
      atMillis: fmtMillis(f.flaggedAt),
      actorUserId: f.flaggedByUserId,
      severity: f.severity,
      body: f.notes,
    })
    if (f.resolvedAt) {
      items.push({
        id: `flag-resolved:${f.id}`,
        kind: 'resolved',
        flagId: f.id,
        at: f.resolvedAt,
        atMillis: fmtMillis(f.resolvedAt),
        actorUserId: f.resolvedByUserId,
        severity: f.severity,
        body: f.resolutionNotes,
      })
    }
  }
  return items.sort((a, b) => a.atMillis - b.atMillis)
})

const template = useLiveQueryWithDeps(
  [() => record.value?.logBookId],

  async (db, [tid]) => {
    if (!tid) return null
    return db.LogBook.findByPk(tid)
  },
  { models: ['LogBook'] },
)

// Prefer the schema snapshot stored on the record (frozen at submit
// time). Fall back to the live template schema in two cases:
//   1. Record pre-dates the snapshot column (very old data).
//   2. Snapshot is present but EMPTY — happens when the EFFECTIVE
//      LogBookVersion was approved with no fields and the schema was
//      added afterwards on the live LogBook only. EFFECTIVE versions
//      are locked, so the mirror in logBookService.updateLogBook
//      (DRAFT/REJECTED only) doesn't propagate, and the snapshot at
//      submission time stays empty even though the live schema has
//      the field the user filled out.
//
// Bare `Array.isArray(snap)` was wrong because `[]` is truthy as
// "is an array" but useless as a schema — the fallback to the live
// template never fired.
const schemaFields = computed(() => {
  const snap = record.value?.logBookSchemaSnapshot
  if (Array.isArray(snap) && snap.length > 0) return snap
  if (Array.isArray(template.value?.schema)) return template.value.schema
  return []
})

const payload = computed(() => currentRevision.value?.payload ?? {})

const statusLabel = computed(() => fieldRecordStatusLabel(record.value?.statusId))
const classificationLabel = computed(
  () => record.value?.recordClassification?.replace('_', ' ') ?? '—',
)

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

function fmtDate(dt) {
  if (!dt) return '—'
  if (dt.toFormat) return dt.toFormat('LLL d, yyyy HH:mm')
  const d = new Date(dt)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString()
}

// ─── Flags (R2) ─────────────────────────────────────────────────────
// Show open flags inline; let any in-tenant user raise a new flag.
// Resolving requires fieldRecords:review and uses a separate endpoint.
const flags = useLiveQueryWithDeps(
  [() => props.recordId],
  async (db, [id]) => {
    if (!id) return []
    const rows = await db.FieldRecordFlag.where('fieldRecordId', id).exec()
    return rows.sort((a, b) => (b.flaggedAt?.toMillis?.() ?? 0) - (a.flaggedAt?.toMillis?.() ?? 0))
  },

  { models: ['FieldRecordFlag'], initial: [] },
)
const openFlags = computed(() => flags.value.filter((f) => !f.resolvedAt))

/**
 * Resolve every attachment id on every flag to the matching Asset row,
 * grouped by flag id. The Open flags + Flag history sections look up
 * thumbnails through this map — keeps the per-flag template simple and
 * lets one live query cover all the rows on screen.
 */
const flagAttachmentsByFlag = useLiveQueryWithDeps(
  [
    () =>
      flags.value
        .map((f) => f.attachmentIds || [])
        .flat()
        .join(','),
  ],
  async (db) => {
    const allIds = [...new Set(flags.value.flatMap((f) => f.attachmentIds || []))]
    if (allIds.length === 0) return {}
    const assets = await Promise.all(allIds.map((id) => db.Asset.findByPk(id)))
    const byId = new Map(assets.filter(Boolean).map((a) => [a.id, a]))
    const grouped = {}
    for (const f of flags.value) {
      grouped[f.id] = (f.attachmentIds || []).map((id) => byId.get(id)).filter(Boolean)
    }
    return grouped
  },

  { models: ['Asset'], initial: {} },
)

function attachmentsForFlag(flagId) {
  return flagAttachmentsByFlag.value?.[flagId] ?? []
}

const showFlagDialog = ref(false)
const flagSeverity = ref('WARN')
const flagNotes = ref('')
const flagPhoto = ref(null)
const isRaisingFlag = ref(false)

function startFlag() {
  flagSeverity.value = 'WARN'
  flagNotes.value = ''
  flagPhoto.value = null
  showFlagDialog.value = true
}

async function submitFlag() {
  if (!record.value?.id) return
  const notes = flagNotes.value?.trim()
  if (!notes) {
    toast.error('Notes are required when raising a flag')
    return
  }
  isRaisingFlag.value = true
  try {
    // BasePhoto stores the uploaded asset directly (id + url); the API
    // expects an array of asset ids, so we wrap-or-empty here.
    const attachmentIds = flagPhoto.value?.id ? [flagPhoto.value.id] : []
    await post(`/v1/services/fieldRecords/${record.value.id}/flag`, {
      notes,
      severity: flagSeverity.value,
      attachmentIds,
    })
    await refetchSyncRecord('FieldRecord', record.value.id)
    toast.success('Flag raised')
    showFlagDialog.value = false
    emit('changed')
  } catch (e) {
    toast.error(e?.message ?? 'Failed to raise flag')
  } finally {
    isRaisingFlag.value = false
  }
}

const showResolveDialog = ref(false)
const resolvingFlagId = ref(null)
const resolutionNotes = ref('')
const isResolvingFlag = ref(false)

function startResolveFlag(flagId) {
  resolvingFlagId.value = flagId
  resolutionNotes.value = ''
  showResolveDialog.value = true
}

async function submitResolveFlag() {
  if (!resolvingFlagId.value) return
  isResolvingFlag.value = true
  try {
    await patch(`/v1/services/fieldRecordFlags/${resolvingFlagId.value}/resolve`, {
      resolutionNotes: resolutionNotes.value?.trim() || null,
    })
    toast.success('Flag resolved')
    showResolveDialog.value = false
    resolvingFlagId.value = null
    emit('changed')
  } catch (e) {
    toast.error(e?.message ?? 'Failed to resolve flag')
  } finally {
    isResolvingFlag.value = false
  }
}

function flagSeverityClass(s) {
  if (s === 'CRITICAL') return 'tw:bg-red-100 tw:text-red-800 tw:border-red-300'
  if (s === 'WARN') return 'tw:bg-amber-100 tw:text-amber-800 tw:border-amber-300'
  return 'tw:bg-blue-50 tw:text-blue-700 tw:border-blue-200'
}

// ─── Review action handling ────────────────────────────────────────
// The e-sig dialog emits { method, provider, token } shapes; translate
// to the backend's flat { strategy, code, token, password } esign object.
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

const showEsignDialog = ref(false)
const pendingReview = ref(null) // { outcome, comment }
const reviewComment = ref('')
const showCommentDialog = ref(false)
const pendingOutcome = ref(null)
const isSubmittingReview = ref(false)

function startReview(outcome) {
  // APPROVED + REJECTED both require e-sig per the backend. We collect a
  // comment first so the reviewer has a chance to add context.
  pendingOutcome.value = outcome
  reviewComment.value = ''
  showCommentDialog.value = true
}

function confirmComment() {
  if (!pendingOutcome.value) return
  showCommentDialog.value = false
  pendingReview.value = { outcome: pendingOutcome.value, comment: reviewComment.value || null }
  pendingEsignAction.value = 'REVIEW'
  showEsignDialog.value = true
}

async function onEsignVerified(verified) {
  showEsignDialog.value = false
  const esign = buildEsignFromVerified(verified)
  // Route by which action staged itself before opening the dialog.
  // pendingEsignAction is set in startReview/confirmComment, confirmAmend,
  // and confirmVoid; cleared after the submit returns.
  const action = pendingEsignAction.value
  pendingEsignAction.value = null
  if (action === 'AMEND') {
    await submitAmend(esign)
    return
  }
  if (action === 'VOID') {
    await submitVoid(esign)
    return
  }
  // Default to review path for backwards-compat (any pre-existing
  // pendingReview not flagged by `action`).
  if (pendingReview.value) {
    await submitReview({ comment: pendingReview.value.comment, esign })
    pendingReview.value = null
  }
}

async function submitReview({ comment, esign }) {
  if (!record.value?.id || !pendingOutcome.value) return
  isSubmittingReview.value = true
  try {
    await post(`/v1/services/fieldRecords/${record.value.id}/review`, {
      outcome: pendingOutcome.value,
      comment,
      esign,
    })
    // REST endpoint doesn't go through SyncEngine, so the natural
    // socket.io push may not arrive before the user expects the UI to
    // update. Force a refetch + IDB write so the live query in this
    // panel reflects the new state immediately. The new
    // REVIEW_OUTCOME revision will be auto-fetched by findByPk the
    // first time the currentRevision live query asks for it.
    await refetchSyncRecord('FieldRecord', record.value.id)
    toast.success(`Record ${pendingOutcome.value.toLowerCase().replace('_', ' ')}`)
    pendingOutcome.value = null
    emit('changed')
  } catch (e) {
    toast.error(e?.message ?? 'Review action failed')
  } finally {
    isSubmittingReview.value = false
  }
}

// ─── Edit / Amend / Void state ─────────────────────────────────────
// Three modes, three endpoints. Edit is inline (no dialog) because the
// in-window edit is intentionally low-friction. Amend + Void each
// require comment/reason + esign, so they get their own dialogs that
// reuse the same WorkflowInstanceEsignAuthDialog the review flow uses.

const isEditing = ref(false)
const editDraft = ref({})
const isSavingEdit = ref(false)

function startEdit() {
  // Snapshot the current payload into a draft so cancel discards
  // changes cleanly. Deep clone to avoid mutating the IDB row.
  editDraft.value = JSON.parse(JSON.stringify(payload.value ?? {}))
  isEditing.value = true
}

function cancelEdit() {
  isEditing.value = false
  editDraft.value = {}
}

async function saveEdit() {
  if (!record.value?.id) return
  isSavingEdit.value = true
  try {
    // Re-freeze labels against the *current* OptionSet so the edit
    // records what the editor actually saw at this moment. See
    // utils/freezeFormPayloadLabels.js.
    const frozen = await freezeOptionLabels(db, schemaFields.value, editDraft.value)
    await patch(`/v1/services/fieldRecords/${record.value.id}`, {
      payload: frozen,
    })
    await refetchSyncRecord('FieldRecord', record.value.id)
    toast.success('Entry updated')
    isEditing.value = false
    editDraft.value = {}
    emit('changed')
  } catch (e) {
    toast.error(e?.message ?? 'Failed to save changes')
  } finally {
    isSavingEdit.value = false
  }
}

// Amend dialog state. Re-uses the form schema; collects comment +
// captures e-sig before POSTing to /amend.
const showAmendDialog = ref(false)
const amendDraft = ref({})
const amendComment = ref('')
const isSavingAmend = ref(false)
const pendingAmend = ref(null) // { payload, comment } waiting on esign

function startAmend() {
  amendDraft.value = JSON.parse(JSON.stringify(payload.value ?? {}))
  amendComment.value = ''
  showAmendDialog.value = true
}

function confirmAmend() {
  if (!amendComment.value.trim()) {
    toast.error('Reason for change is required')
    return
  }
  pendingAmend.value = {
    payload: amendDraft.value,
    comment: amendComment.value.trim(),
  }
  showAmendDialog.value = false
  showEsignDialog.value = true
  // Flag so the shared esign handler routes the result to amend, not review.
  pendingEsignAction.value = 'AMEND'
}

async function submitAmend(esign) {
  if (!record.value?.id || !pendingAmend.value) return
  isSavingAmend.value = true
  try {
    // Re-freeze labels for the amended payload (the OptionSet may have
    // drifted since the original submit — the amendment should carry
    // labels as they read *now*).
    const frozen = await freezeOptionLabels(db, schemaFields.value, pendingAmend.value.payload)
    await post(`/v1/services/fieldRecords/${record.value.id}/amend`, {
      ...pendingAmend.value,
      payload: frozen,
      esign,
    })
    await refetchSyncRecord('FieldRecord', record.value.id)
    toast.success('Entry amended')
    pendingAmend.value = null
    emit('changed')
  } catch (e) {
    toast.error(e?.message ?? 'Amendment failed')
  } finally {
    isSavingAmend.value = false
  }
}

// Void dialog state. Reason + esig.
const showVoidDialog = ref(false)
const voidReason = ref('')
const isSavingVoid = ref(false)
const pendingVoid = ref(null) // { reason } waiting on esign

function startVoid() {
  voidReason.value = ''
  showVoidDialog.value = true
}

function confirmVoid() {
  if (!voidReason.value.trim()) {
    toast.error('Reason for voiding is required')
    return
  }
  pendingVoid.value = { reason: voidReason.value.trim() }
  showVoidDialog.value = false
  showEsignDialog.value = true
  pendingEsignAction.value = 'VOID'
}

async function submitVoid(esign) {
  if (!record.value?.id || !pendingVoid.value) return
  isSavingVoid.value = true
  try {
    await post(`/v1/services/fieldRecords/${record.value.id}/void`, {
      reason: pendingVoid.value.reason,
      esign,
    })
    await refetchSyncRecord('FieldRecord', record.value.id)
    toast.success('Entry voided')
    pendingVoid.value = null
    emit('changed')
  } catch (e) {
    toast.error(e?.message ?? 'Void failed')
  } finally {
    isSavingVoid.value = false
  }
}

// The esign dialog is now shared by Review, Amend, and Void. This flag
// tells `onEsignVerified` which submit path to route to.
const pendingEsignAction = ref(null) // 'REVIEW' | 'AMEND' | 'VOID'

// ─── Print ──────────────────────────────────────────────────────────
// Routes to the centralised print shell so the entry inherits the
// company-branded header / footer / status badge / audit chrome every
// other QMS printout uses. The actual rendering lives in
// components/print/modules/FieldRecordPrint.vue.
function printRecord() {
  if (!record.value?.id) return
  const params = new URLSearchParams({ module: 'FieldRecord', id: record.value.id })
  const url = getCompanyPath(`/print?${params.toString()}`)
  window.open(url, '_blank', 'noopener,noreferrer')
}

function close() {
  emit('close')
}
</script>

<template>
  <div class="tw:fixed tw:inset-0 tw:z-50 tw:flex tw:flex-col tw:bg-main">
    <!-- Header -->
    <div class="tw:flex tw:items-center tw:gap-3 tw:px-5 tw:py-3 tw:border-b tw:border-divider">
      <button
        type="button"
        class="tw:p-1.5 tw:rounded tw:bg-transparent tw:border-0 tw:cursor-pointer tw:hover:bg-main-hover tw:text-secondary"
        @click="close"
      >
        <IconX :size="20" />
      </button>
      <div class="tw:flex-1 tw:min-w-0">
        <div class="tw:text-base tw:font-bold tw:text-on-main tw:truncate">
          {{ template?.title ?? 'Field Record' }}
        </div>
        <div class="tw:text-xs tw:text-secondary tw:truncate">{{ record?.id }}</div>
      </div>
      <button
        v-if="record"
        type="button"
        class="tw:p-1.5 tw:rounded tw:bg-transparent tw:border-0 tw:cursor-pointer tw:hover:bg-main-hover tw:text-secondary tw:flex tw:items-center tw:gap-1"
        title="Print this entry"
        @click="printRecord"
      >
        <IconPrinter :size="18" />
      </button>
      <span
        v-if="record?.recordClassification"
        class="tw:inline-flex tw:items-center tw:gap-1 tw:text-[10px] tw:font-bold tw:uppercase tw:rounded tw:px-2 tw:py-1 tw:border"
        :class="
          record.recordClassification === 'CONTROLLED_RECORD'
            ? 'tw:bg-red-50 tw:text-red-700 tw:border-red-200'
            : 'tw:bg-amber-50 tw:text-amber-700 tw:border-amber-200'
        "
      >
        <IconShieldCheck v-if="record.recordClassification === 'CONTROLLED_RECORD'" :size="12" />
        {{ classificationLabel }}
      </span>
      <span
        class="tw:inline-flex tw:items-center tw:gap-1 tw:text-xs tw:font-bold tw:rounded tw:px-2 tw:py-1"
        :class="statusBadgeClass(record?.statusId)"
      >
        <IconLock v-if="record?.statusId === 'LOCKED'" :size="12" />
        {{ statusLabel }}
      </span>
    </div>

    <!-- Body -->
    <div class="tw:flex-1 tw:overflow-y-auto tw:p-5">
      <div class="tw:max-w-3xl tw:mx-auto tw:flex tw:flex-col tw:gap-5">
        <!-- Metadata -->
        <div
          class="tw:bg-white tw:rounded-lg tw:border tw:border-divider tw:p-4 tw:grid tw:grid-cols-2 tw:md:grid-cols-4 tw:gap-3 tw:text-xs"
        >
          <div>
            <div class="tw:font-bold tw:uppercase tw:text-secondary">Submitted by</div>
            <UserBadgeById v-if="record?.submittedByUserId" :userId="record.submittedByUserId" />
            <span v-else class="tw:text-secondary">—</span>
          </div>
          <div>
            <div class="tw:font-bold tw:uppercase tw:text-secondary">Submitted at</div>
            <div class="tw:text-on-main">{{ fmtDate(record?.submittedAt) }}</div>
          </div>
          <div>
            <div class="tw:font-bold tw:uppercase tw:text-secondary">Effective at</div>
            <div class="tw:text-on-main">{{ fmtDate(record?.effectiveAt) }}</div>
          </div>
          <div>
            <div class="tw:font-bold tw:uppercase tw:text-secondary">Via</div>
            <div class="tw:text-on-main">{{ record?.submittedVia ?? '—' }}</div>
          </div>
          <div>
            <div class="tw:font-bold tw:uppercase tw:text-secondary">Lock at</div>
            <div class="tw:text-on-main">{{ fmtDate(record?.lockAt) }}</div>
          </div>
          <div>
            <div class="tw:font-bold tw:uppercase tw:text-secondary">Lock reason</div>
            <div class="tw:text-on-main">{{ record?.lockReason ?? '—' }}</div>
          </div>
          <div v-if="currentRevision">
            <div class="tw:font-bold tw:uppercase tw:text-secondary">Revision</div>
            <div class="tw:text-on-main">
              #{{ currentRevision.revisionNumber }} ({{ currentRevision.revisionType }})
            </div>
          </div>
          <div v-if="currentRevision?.signatureId">
            <div class="tw:font-bold tw:uppercase tw:text-secondary">Signature</div>
            <div class="tw:text-on-main tw:flex tw:items-center tw:gap-1">
              <IconShieldCheck :size="12" class="tw:text-green-600" />
              Signed
            </div>
          </div>
        </div>

        <!-- Payload — swaps to editable form when isEditing. We bind
             DynamicForm to editDraft (a deep clone) so Cancel can
             discard cleanly. -->
        <div class="tw:bg-white tw:rounded-lg tw:border tw:border-divider tw:p-4">
          <div class="tw:flex tw:items-center tw:justify-between tw:mb-3">
            <BaseText as="h3" class="tw:text-sm tw:font-bold tw:text-on-main">
              {{ isEditing ? 'Edit entry' : 'Record content' }}
            </BaseText>
            <div v-if="isEditing" class="tw:flex tw:items-center tw:gap-2">
              <button
                type="button"
                class="tw:px-3 tw:py-1.5 tw:text-xs tw:font-medium tw:text-secondary tw:bg-transparent tw:border-0 tw:cursor-pointer tw:hover:text-on-main"
                :disabled="isSavingEdit"
                @click="cancelEdit"
              >
                Cancel
              </button>
              <button
                type="button"
                class="tw:px-3 tw:py-1.5 tw:text-xs tw:font-bold tw:text-white tw:bg-primary tw:rounded tw:cursor-pointer tw:hover:bg-primary/90 tw:border-0 tw:disabled:opacity-50"
                :disabled="isSavingEdit"
                @click="saveEdit"
              >
                {{ isSavingEdit ? 'Saving…' : 'Save changes' }}
              </button>
            </div>
            <!-- All record actions live on the card header so they sit
                 together next to the content they act on. Edit = in-window
                 (cheap, no esign); Amend = post-lock (esign + reason); Flag
                 = any user; Void = permissioned; Reject/Approve = reviewer
                 while UNDER_REVIEW. -->
            <div v-else class="tw:flex tw:items-center tw:gap-2 tw:flex-wrap tw:justify-end">
              <button
                v-if="record && record.statusId !== 'VOIDED'"
                type="button"
                class="tw:px-3 tw:py-1.5 tw:text-xs tw:font-bold tw:text-amber-800 tw:bg-amber-50 tw:border tw:border-amber-200 tw:rounded tw:cursor-pointer tw:hover:bg-amber-100 tw:flex tw:items-center tw:gap-1.5"
                @click="startFlag"
              >
                <IconFlag :size="14" />
                Flag
              </button>
              <button
                v-if="canEdit"
                type="button"
                class="tw:px-3 tw:py-1.5 tw:text-xs tw:font-bold tw:text-primary tw:bg-primary/10 tw:border tw:border-primary/30 tw:rounded tw:cursor-pointer tw:hover:bg-primary/20 tw:flex tw:items-center tw:gap-1.5"
                @click="startEdit"
              >
                <IconPencil :size="14" />
                Edit
              </button>
              <button
                v-if="canAmendNow"
                type="button"
                class="tw:px-3 tw:py-1.5 tw:text-xs tw:font-bold tw:text-purple-800 tw:bg-purple-100 tw:border tw:border-purple-200 tw:rounded tw:cursor-pointer tw:hover:bg-purple-200 tw:flex tw:items-center tw:gap-1.5"
                @click="startAmend"
              >
                <IconEdit :size="14" />
                Amend
              </button>
              <button
                v-if="canVoidNow"
                type="button"
                class="tw:px-3 tw:py-1.5 tw:text-xs tw:font-bold tw:text-red-700 tw:bg-red-50 tw:border tw:border-red-200 tw:rounded tw:cursor-pointer tw:hover:bg-red-100 tw:flex tw:items-center tw:gap-1.5"
                @click="startVoid"
              >
                <IconTrash :size="14" />
                Void
              </button>
              <template v-if="record?.statusId === 'UNDER_REVIEW' && canReview">
                <button
                  type="button"
                  class="tw:px-3 tw:py-1.5 tw:text-xs tw:font-bold tw:text-white tw:bg-red-600 tw:border-0 tw:rounded tw:cursor-pointer tw:hover:bg-red-700 tw:flex tw:items-center tw:gap-1.5 tw:disabled:opacity-50"
                  :disabled="isSubmittingReview"
                  @click="startReview('REJECTED')"
                >
                  <IconCircleX :size="14" />
                  Reject
                </button>
                <button
                  type="button"
                  class="tw:px-3 tw:py-1.5 tw:text-xs tw:font-bold tw:text-white tw:bg-green-600 tw:border-0 tw:rounded tw:cursor-pointer tw:hover:bg-green-700 tw:flex tw:items-center tw:gap-1.5 tw:disabled:opacity-50"
                  :disabled="isSubmittingReview"
                  @click="startReview('APPROVED')"
                >
                  <IconCircleCheck :size="14" />
                  Approve
                </button>
              </template>
            </div>
          </div>
          <DynamicForm
            v-if="isEditing && schemaFields.length > 0"
            v-model="editDraft"
            :fields="schemaFields"
            :loading="isSavingEdit"
          />
          <FormSchemaReadonlyView
            v-else-if="schemaFields.length > 0"
            :fields="schemaFields"
            :values="payload"
          />
          <pre
            v-else
            class="tw:text-xs tw:bg-main tw:p-3 tw:rounded tw:overflow-x-auto"
          ><code>{{ JSON.stringify(payload, null, 2) }}</code></pre>
        </div>

        <!-- Open flags (R2). Renders only when there's at least one
             unresolved flag. Resolved flags are still in the revision
             trail conceptually but not loud here — the supervisor sees
             a counter once they're closed out. -->
        <div
          v-if="openFlags.length > 0"
          class="tw:bg-white tw:rounded-lg tw:border tw:border-amber-200 tw:p-4"
        >
          <div class="tw:flex tw:items-center tw:justify-between tw:mb-3">
            <h3
              class="tw:text-sm tw:font-bold tw:text-amber-900 tw:flex tw:items-center tw:gap-1.5"
            >
              <IconAlertTriangle :size="16" />
              Open flags ({{ openFlags.length }})
            </h3>
          </div>
          <ol class="tw:flex tw:flex-col tw:gap-3">
            <li
              v-for="f in openFlags"
              :key="f.id"
              class="tw:flex tw:items-start tw:gap-3 tw:pb-3 tw:border-b tw:border-divider tw:last:border-b-0 tw:last:pb-0"
            >
              <span
                class="tw:inline-flex tw:items-center tw:gap-1 tw:text-[10px] tw:font-bold tw:uppercase tw:rounded tw:px-2 tw:py-0.5 tw:border tw:shrink-0 tw:mt-0.5"
                :class="flagSeverityClass(f.severity)"
              >
                {{ f.severity }}
              </span>
              <div class="tw:flex-1 tw:min-w-0">
                <div
                  class="tw:text-xs tw:text-secondary tw:flex tw:items-center tw:gap-1 tw:flex-wrap"
                >
                  <span>by</span>
                  <UserBadgeById :userId="f.flaggedByUserId" />
                  <span>·</span>
                  <span>{{ fmtDate(f.flaggedAt) }}</span>
                </div>
                <div class="tw:mt-1 tw:text-sm tw:text-on-main">
                  <RichTextAttachments :modelValue="f.notes" :readonly="true" />
                </div>
                <div
                  v-if="attachmentsForFlag(f.id).length > 0"
                  class="tw:mt-2 tw:flex tw:flex-wrap tw:gap-2"
                >
                  <a
                    v-for="asset in attachmentsForFlag(f.id)"
                    :key="asset.id"
                    :href="asset.url"
                    target="_blank"
                    rel="noopener"
                    class="tw:block tw:w-20 tw:h-20 tw:rounded tw:border tw:border-divider tw:overflow-hidden tw:bg-main tw:hover:opacity-90"
                  >
                    <img
                      :src="asset.url"
                      :alt="asset.name || 'flag attachment'"
                      class="tw:w-full tw:h-full tw:object-cover"
                    />
                  </a>
                </div>
              </div>
              <button
                v-if="canReview"
                type="button"
                class="tw:px-2 tw:py-1 tw:text-xs tw:rounded tw:bg-green-100 tw:text-green-700 tw:hover:bg-green-200 tw:transition tw:flex tw:items-center tw:gap-1 tw:shrink-0"
                @click="startResolveFlag(f.id)"
              >
                <IconCircleCheck :size="12" />
                Resolve
              </button>
            </li>
          </ol>
        </div>

        <!-- Revision history.
             Every state transition is captured here — INITIAL_SUBMIT,
             USER_EDIT (within window, no esign), ADMIN_AMENDMENT
             (post-lock, esign + reason required), REVIEW_OUTCOME, and
             VOID. The append-only RLS on field_record_revisions means
             this is the auditor-grade trail; nothing here can be
             rewritten after the fact. -->
        <div
          v-if="revisions.length > 0"
          class="tw:bg-white tw:rounded-lg tw:border tw:border-divider tw:p-4"
        >
          <div class="tw:flex tw:items-center tw:justify-between tw:mb-3">
            <BaseText as="h3" class="tw:text-sm tw:font-bold tw:text-on-main">Revision history</BaseText>
            <span class="tw:text-xs tw:text-secondary">
              {{ revisions.length }} {{ revisions.length === 1 ? 'entry' : 'entries' }}
            </span>
          </div>
          <ol class="tw:flex tw:flex-col tw:gap-3">
            <li
              v-for="rev in revisions"
              :key="rev.id"
              class="tw:flex tw:items-start tw:gap-3 tw:pb-3 tw:border-b tw:border-divider tw:last:border-b-0 tw:last:pb-0"
            >
              <div class="tw:shrink-0 tw:text-xs tw:font-mono tw:text-secondary tw:mt-0.5">
                #{{ rev.revisionNumber }}
              </div>
              <div class="tw:flex-1 tw:min-w-0">
                <div class="tw:flex tw:items-center tw:gap-2 tw:flex-wrap tw:mb-1">
                  <span
                    class="tw:inline-flex tw:items-center tw:gap-1 tw:text-[10px] tw:font-bold tw:uppercase tw:rounded tw:px-2 tw:py-0.5"
                    :class="revisionTypeMeta(rev.revisionType).class"
                  >
                    {{ revisionTypeMeta(rev.revisionType).label }}
                  </span>
                  <span
                    v-if="rev.signatureId"
                    class="tw:inline-flex tw:items-center tw:gap-1 tw:text-[10px] tw:font-bold tw:uppercase tw:rounded tw:px-2 tw:py-0.5 tw:bg-green-50 tw:text-green-700 tw:border tw:border-green-200"
                  >
                    <IconShieldCheck :size="10" />
                    E-signed
                  </span>
                  <span
                    v-if="rev.reviewOutcome"
                    class="tw:text-[10px] tw:font-mono tw:text-secondary"
                  >
                    {{ rev.reviewOutcome }}
                  </span>
                </div>
                <div
                  class="tw:text-xs tw:text-secondary tw:flex tw:items-center tw:gap-1 tw:flex-wrap"
                >
                  <span>by</span>
                  <UserBadgeById :userId="rev.authorUserId" />
                  <span>·</span>
                  <span>{{ fmtDate(rev.authoredAt) }}</span>
                </div>
                <div
                  v-if="rev.comment || rev.voidReason"
                  class="tw:mt-1 tw:text-xs tw:text-on-main tw:bg-main tw:rounded tw:px-2 tw:py-1"
                >
                  {{ rev.voidReason || rev.comment }}
                </div>
              </div>
            </li>
          </ol>
        </div>

        <!-- Flag history — raise + resolve events for every flag on
             this record (open and closed), oldest → newest. Lives in a
             separate section so the content-revision feed above stays
             focused on payload changes; this feed captures the exception
             trail (who raised what, who closed it, when). -->
        <div
          v-if="flagHistory.length > 0"
          class="tw:bg-white tw:rounded-lg tw:border tw:border-divider tw:p-4"
        >
          <div class="tw:flex tw:items-center tw:justify-between tw:mb-3">
            <h3 class="tw:text-sm tw:font-bold tw:text-on-main tw:flex tw:items-center tw:gap-1.5">
              <IconFlag :size="14" />
              Flag history
            </h3>
            <span class="tw:text-xs tw:text-secondary">
              {{ flagHistory.length }} {{ flagHistory.length === 1 ? 'entry' : 'entries' }}
            </span>
          </div>
          <ol class="tw:flex tw:flex-col tw:gap-3">
            <li
              v-for="ev in flagHistory"
              :key="ev.id"
              class="tw:flex tw:items-start tw:gap-3 tw:pb-3 tw:border-b tw:border-divider tw:last:border-b-0 tw:last:pb-0"
            >
              <div class="tw:flex-1 tw:min-w-0">
                <div class="tw:flex tw:items-center tw:gap-2 tw:flex-wrap tw:mb-1">
                  <span
                    class="tw:inline-flex tw:items-center tw:gap-1 tw:text-[10px] tw:font-bold tw:uppercase tw:rounded tw:px-2 tw:py-0.5"
                    :class="
                      ev.kind === 'raised'
                        ? 'tw:bg-orange-100 tw:text-orange-700'
                        : 'tw:bg-teal-100 tw:text-teal-700'
                    "
                  >
                    {{ ev.kind === 'raised' ? 'Flag raised' : 'Flag resolved' }}
                  </span>
                  <span
                    v-if="ev.severity"
                    class="tw:inline-flex tw:items-center tw:gap-1 tw:text-[10px] tw:font-bold tw:uppercase tw:rounded tw:px-2 tw:py-0.5 tw:border"
                    :class="flagSeverityClass(ev.severity)"
                  >
                    {{ ev.severity }}
                  </span>
                </div>
                <div
                  class="tw:text-xs tw:text-secondary tw:flex tw:items-center tw:gap-1 tw:flex-wrap"
                >
                  <span>by</span>
                  <UserBadgeById :userId="ev.actorUserId" />
                  <span>·</span>
                  <span>{{ fmtDate(ev.at) }}</span>
                </div>
                <div
                  v-if="ev.body"
                  class="tw:mt-1 tw:text-xs tw:text-on-main tw:bg-main tw:rounded tw:px-2 tw:py-1"
                >
                  <RichTextAttachments :modelValue="ev.body" :readonly="true" />
                </div>
                <div
                  v-if="ev.kind === 'raised' && attachmentsForFlag(ev.flagId).length > 0"
                  class="tw:mt-2 tw:flex tw:flex-wrap tw:gap-2"
                >
                  <a
                    v-for="asset in attachmentsForFlag(ev.flagId)"
                    :key="asset.id"
                    :href="asset.url"
                    target="_blank"
                    rel="noopener"
                    class="tw:block tw:w-16 tw:h-16 tw:rounded tw:border tw:border-divider tw:overflow-hidden tw:bg-main tw:hover:opacity-90"
                  >
                    <img
                      :src="asset.url"
                      :alt="asset.name || 'flag attachment'"
                      class="tw:w-full tw:h-full tw:object-cover"
                    />
                  </a>
                </div>
              </div>
            </li>
          </ol>
        </div>

        <!-- Void reason -->
        <div
          v-if="record?.statusId === 'VOIDED' && record?.voidReason"
          class="tw:bg-purple-50 tw:rounded-lg tw:border tw:border-purple-200 tw:p-4"
        >
          <h3 class="tw:text-sm tw:font-bold tw:text-purple-900 tw:mb-1">Void reason</h3>
          <p class="tw:text-sm tw:text-purple-900">{{ record.voidReason }}</p>
          <div
            v-if="record?.voidedByUserId"
            class="tw:flex tw:items-center tw:gap-2 tw:mt-2 tw:text-xs tw:text-purple-700"
          >
            Voided by <UserBadgeById :userId="record.voidedByUserId" />
            <span v-if="record?.voidedAt">on {{ fmtDate(record.voidedAt) }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- All record actions now live on the Record content card header
         (see above) so they sit together in one prominent place. -->
    <!-- Soft hint when the record is UNDER_REVIEW and the user doesn't
         have the review permission. Sits below the action footer so
         it explains the absence of Approve / Reject without breaking
         the v-else chain. -->
    <div
      v-if="!isEditing && record?.statusId === 'UNDER_REVIEW' && !canReview"
      class="tw:flex tw:items-center tw:gap-2 tw:px-5 tw:py-2 tw:border-t tw:border-divider tw:bg-amber-50 tw:text-amber-900 tw:text-xs"
    >
      <IconShieldCheck :size="14" />
      This record is awaiting review. You need the
      <code>fieldRecords:review</code> permission to approve / reject.
    </div>

    <!-- Comment dialog -->
    <Teleport to="body">
      <div
        v-if="showCommentDialog"
        class="tw:fixed tw:inset-0 tw:z-60 tw:flex tw:items-center tw:justify-center tw:bg-black/40"
      >
        <div class="tw:bg-white tw:rounded-lg tw:max-w-md tw:w-full tw:p-5 tw:m-3">
          <h3 class="tw:text-base tw:font-bold tw:text-on-main tw:mb-2">
            {{ pendingOutcome === 'APPROVED' ? 'Approve record' : 'Reject record' }}
          </h3>
          <p class="tw:text-xs tw:text-secondary tw:mb-3">
            Comment is optional. E-signature confirmation follows.
          </p>
          <textarea
            v-model="reviewComment"
            rows="4"
            class="tw:w-full tw:rounded tw:border tw:border-divider tw:bg-card tw:text-on-main tw:px-3 tw:py-2 tw:text-sm"
            placeholder="Optional comment for the audit trail"
          ></textarea>
          <div class="tw:flex tw:justify-end tw:gap-2 tw:mt-3">
            <button
              type="button"
              class="tw:px-3 tw:py-1.5 tw:text-sm tw:rounded tw:bg-transparent tw:text-secondary tw:hover:bg-main-hover tw:transition tw:border-0"
              @click="showCommentDialog = false"
            >
              Cancel
            </button>
            <button
              type="button"
              class="tw:px-3 tw:py-1.5 tw:text-sm tw:rounded tw:bg-primary tw:text-white tw:font-medium tw:hover:bg-primary/90 tw:transition tw:border-0"
              @click="confirmComment"
            >
              Continue to sign
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Amend dialog. Reuses the form schema (same fields the original
         submitter saw), captures a comment, then hands off to the e-sig
         dialog. The amend endpoint enforces comment + esign server-side. -->
    <Teleport to="body">
      <div
        v-if="showAmendDialog"
        class="tw:fixed tw:inset-0 tw:z-60 tw:flex tw:items-center tw:justify-center tw:bg-black/40"
      >
        <div
          class="tw:bg-white tw:rounded-lg tw:max-w-2xl tw:w-full tw:p-5 tw:m-3 tw:max-h-[90vh] tw:flex tw:flex-col"
        >
          <h3 class="tw:text-base tw:font-bold tw:text-on-main tw:mb-1">Amend entry</h3>
          <p class="tw:text-xs tw:text-secondary tw:mb-3">
            The original revision stays in the history. A new ADMIN_AMENDMENT revision is appended
            with your reason and e-signature.
          </p>

          <div class="tw:flex-1 tw:overflow-y-auto tw:mb-3">
            <DynamicForm
              v-if="schemaFields.length > 0"
              v-model="amendDraft"
              :fields="schemaFields"
              :loading="isSavingAmend"
            />
            <BaseField
              v-slot="{ id: reasonId }"
              label="Reason for change"
              required
              class="tw:mt-4"
            >
              <textarea
                :id="reasonId"
                v-model="amendComment"
                rows="3"
                class="tw:w-full tw:rounded tw:border tw:border-divider tw:bg-card tw:text-on-main tw:px-3 tw:py-2 tw:text-sm"
                placeholder="Why is this entry being changed? (audit trail)"
              ></textarea>
            </BaseField>
          </div>

          <div class="tw:flex tw:justify-end tw:gap-2">
            <button
              type="button"
              class="tw:px-3 tw:py-1.5 tw:text-sm tw:rounded tw:bg-transparent tw:text-secondary tw:hover:bg-main-hover tw:transition tw:border-0"
              :disabled="isSavingAmend"
              @click="showAmendDialog = false"
            >
              Cancel
            </button>
            <button
              type="button"
              class="tw:px-3 tw:py-1.5 tw:text-sm tw:rounded tw:bg-primary tw:text-white tw:font-medium tw:hover:bg-primary/90 tw:transition tw:border-0 tw:disabled:opacity-50"
              :disabled="isSavingAmend || !amendComment.trim()"
              @click="confirmAmend"
            >
              Continue to sign
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Void dialog. Reason + esign required. -->
    <Teleport to="body">
      <div
        v-if="showVoidDialog"
        class="tw:fixed tw:inset-0 tw:z-60 tw:flex tw:items-center tw:justify-center tw:bg-black/40"
      >
        <div class="tw:bg-white tw:rounded-lg tw:max-w-md tw:w-full tw:p-5 tw:m-3">
          <h3 class="tw:text-base tw:font-bold tw:text-on-main tw:mb-1">Void entry</h3>
          <p class="tw:text-xs tw:text-secondary tw:mb-3">
            Voiding marks the entry as superseded but keeps it (and all revisions) in the audit
            trail. This action requires an e-signature.
          </p>
          <BaseField v-slot="{ id: reasonId }" label="Reason" required>
            <textarea
              :id="reasonId"
              v-model="voidReason"
              rows="3"
              class="tw:w-full tw:rounded tw:border tw:border-divider tw:bg-card tw:text-on-main tw:px-3 tw:py-2 tw:text-sm"
              placeholder="Why is this entry being voided?"
            ></textarea>
          </BaseField>
          <div class="tw:flex tw:justify-end tw:gap-2 tw:mt-3">
            <button
              type="button"
              class="tw:px-3 tw:py-1.5 tw:text-sm tw:rounded tw:bg-transparent tw:text-secondary tw:hover:bg-main-hover tw:transition tw:border-0"
              :disabled="isSavingVoid"
              @click="showVoidDialog = false"
            >
              Cancel
            </button>
            <button
              type="button"
              class="tw:px-3 tw:py-1.5 tw:text-sm tw:rounded tw:bg-red-600 tw:text-white tw:font-medium tw:hover:bg-red-700 tw:transition tw:border-0 tw:disabled:opacity-50"
              :disabled="isSavingVoid || !voidReason.trim()"
              @click="confirmVoid"
            >
              Continue to sign
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Flag dialog (R2). Notes required, photo optional via the
         shared BaseUploader. POSTs to /v1/services/fieldRecords/:id/flag
         which routes an instant notification to the supervisor. -->
    <Teleport to="body">
      <div
        v-if="showFlagDialog"
        class="tw:fixed tw:inset-0 tw:z-60 tw:flex tw:items-center tw:justify-center tw:bg-black/40"
      >
        <div
          class="tw:bg-white tw:rounded-lg tw:max-w-md tw:w-full tw:p-5 tw:m-3 tw:max-h-[90vh] tw:overflow-y-auto"
        >
          <h3
            class="tw:text-base tw:font-bold tw:text-on-main tw:mb-1 tw:flex tw:items-center tw:gap-2"
          >
            <IconFlag :size="18" class="tw:text-amber-600" />
            Flag this entry
          </h3>
          <p class="tw:text-xs tw:text-secondary tw:mb-3">
            Raise a flag to send an immediate alert to the log book supervisor.
          </p>
          <div class="tw:flex tw:items-center tw:gap-2 tw:mb-3">
            <span class="tw:text-xs tw:font-semibold tw:text-secondary">Severity</span>
            <select
              v-model="flagSeverity"
              class="tw:rounded tw:border tw:border-divider tw:bg-card tw:px-2 tw:py-1 tw:text-sm"
            >
              <option value="INFO">Info — minor note</option>
              <option value="WARN">Warn — needs attention</option>
              <option value="CRITICAL">Critical — escalates now</option>
            </select>
          </div>
          <BaseField v-slot="{ id: notesId }" label="Notes" required>
            <textarea
              :id="notesId"
              v-model="flagNotes"
              rows="4"
              class="tw:w-full tw:rounded tw:border tw:border-divider tw:bg-card tw:text-on-main tw:px-3 tw:py-2 tw:text-sm"
              placeholder="What's wrong with this entry? Detail helps your supervisor act faster."
            ></textarea>
          </BaseField>
          <BaseField label="Photo evidence" optional class="tw:mt-3">
            <BasePhoto
              v-model="flagPhoto"
              mode="both"
              fileType="ASSET"
              accept="image/*"
              placeholder="Add photo"
              previewSize="120px"
            />
          </BaseField>
          <div class="tw:flex tw:justify-end tw:gap-2 tw:mt-3">
            <button
              type="button"
              class="tw:px-3 tw:py-1.5 tw:text-sm tw:rounded tw:bg-transparent tw:text-secondary tw:hover:bg-main-hover tw:transition tw:border-0"
              :disabled="isRaisingFlag"
              @click="showFlagDialog = false"
            >
              Cancel
            </button>
            <button
              type="button"
              class="tw:px-3 tw:py-1.5 tw:text-sm tw:rounded tw:bg-amber-600 tw:text-white tw:font-medium tw:hover:bg-amber-700 tw:transition tw:border-0 tw:disabled:opacity-50"
              :disabled="isRaisingFlag || !flagNotes.trim()"
              @click="submitFlag"
            >
              {{ isRaisingFlag ? 'Raising…' : 'Raise flag' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Resolve-flag dialog. Only shown to fieldRecords:review users
         via the Resolve button on each open flag. -->
    <Teleport to="body">
      <div
        v-if="showResolveDialog"
        class="tw:fixed tw:inset-0 tw:z-60 tw:flex tw:items-center tw:justify-center tw:bg-black/40"
      >
        <div class="tw:bg-white tw:rounded-lg tw:max-w-md tw:w-full tw:p-5 tw:m-3">
          <h3 class="tw:text-base tw:font-bold tw:text-on-main tw:mb-1">Resolve flag</h3>
          <p class="tw:text-xs tw:text-secondary tw:mb-3">
            Resolution notes are optional but recommended — they show up in the audit trail.
          </p>
          <textarea
            v-model="resolutionNotes"
            rows="3"
            class="tw:w-full tw:rounded tw:border tw:border-divider tw:bg-card tw:text-on-main tw:px-3 tw:py-2 tw:text-sm"
            placeholder="What action did you take?"
          ></textarea>
          <div class="tw:flex tw:justify-end tw:gap-2 tw:mt-3">
            <button
              type="button"
              class="tw:px-3 tw:py-1.5 tw:text-sm tw:rounded tw:bg-transparent tw:text-secondary tw:hover:bg-main-hover tw:transition tw:border-0"
              :disabled="isResolvingFlag"
              @click="showResolveDialog = false"
            >
              Cancel
            </button>
            <button
              type="button"
              class="tw:px-3 tw:py-1.5 tw:text-sm tw:rounded tw:bg-green-600 tw:text-white tw:font-medium tw:hover:bg-green-700 tw:transition tw:border-0 tw:disabled:opacity-50"
              :disabled="isResolvingFlag"
              @click="submitResolveFlag"
            >
              {{ isResolvingFlag ? 'Resolving…' : 'Mark resolved' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- E-sig prompt — shared by Review, Amend, and Void. The
         pendingEsignAction ref tells onEsignVerified which submit path
         to call. -->
    <WorkflowInstanceEsignAuthDialog v-model="showEsignDialog" @verified="onEsignVerified" />
  </div>
</template>
