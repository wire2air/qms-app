<script setup>
import {
  IconShieldCheck,
  IconFileText,
  IconDeviceFloppy,
  IconX,
  IconPlus,
  IconEdit,
  IconClipboardList,
} from '@tabler/icons-vue'
import { useDebounceFn } from '@vueuse/core'
import { isAllowed, currentSession } from '@/utils/currentSession.js'
import { getCompanyPath } from '@/utils/routeHelpers.js'
import { humanizeCron } from '@/utils/cronHumanize.js'
import { patch, del, post } from '@/api'
import FormBuilder from '@/components/form-builder/FormBuilder.vue'
import DynamicForm from '@/components/form/DynamicForm.js'
import { buildLogBookSections, buildLogBookActions } from './logBookDetailConfig.js'

/**
 * Log Book detail page — wired at /inspections-logs/log-books/:id.
 *
 * Two tabs:
 *   - Details   — title / description / type / supervisor / policy
 *                 settings / references / compliance / sites /
 *                 document links. Auto-save through PATCH so the
 *                 logBookService can validate + bump schemaVersion
 *                 when needed.
 *   - Schema    — full FormBuilder. Saving the schema also goes
 *                 through PATCH so schemaVersion gets bumped on
 *                 every changed save.
 *
 * Save UX: title + checkbox-style fields debounce auto-save (500 ms).
 * Schema has its own explicit "Save schema" button — auto-saving the
 * FormBuilder on every drag would feel jittery and could conflict
 * with the version-bump cadence.
 */

const props = defineProps({
  id: { type: String, required: true },
})

const toast = useToast()
const { confirm } = useConfirm()
const router = useRouter()

// Editing a log book is OWNER-only (creator stands in while no owner is set;
// company owners bypass) — module read access only VIEWS (user decision
// 2026-08-05). RLS enforces the same rule server-side.
const canUpdate = computed(() => {
  if (currentSession.value?.isOwner) return true
  const me = currentSession.value?.userId ?? currentSession.value?.id
  const book = logBook.value
  if (!book) return false
  return book.ownerUserId === me || (!book.ownerUserId && book.createdBy === me)
})

const logBook = useLiveQueryWithDeps(
  [() => props.id],
  async (db, [id]) => {
    if (!id) return null
    return db.LogBook.findByPk(id)
  },
  { models: ['LogBook'] },
)

const logBookTypes = useLiveQuery(
  async (db) => {
    const rows = await db.LogBookType.where().exec()
    return rows.sort((a, b) => (a.sequence ?? 100) - (b.sequence ?? 100))
  },

  { models: ['LogBookType'], initial: [] },
)

const siteLinks = useLiveQueryWithDeps(
  [() => props.id],
  async (db, [id]) => {
    if (!id) return []
    return db.SiteOnLogBook.where('logBookId', id).exec()
  },

  { models: ['SiteOnLogBook'], initial: [] },
)
const assignedSiteIds = computed(() => siteLinks.value.map((s) => s.siteId))

const documentLinks = useLiveQueryWithDeps(
  [() => props.id],
  async (db, [id]) => {
    if (!id) return []
    return db.LogBookDocumentLink.where('logBookId', id).exec()
  },

  { models: ['LogBookDocumentLink'], initial: [] },
)

const documents = useLiveQuery((db) => db.Document.where().exec(), {
  models: ['Document'],
  initial: [],
})
const documentById = computed(() => new Map(documents.value.map((d) => [d.id, d])))

const loading = computed(() => logBook.value === undefined)

// ─── Editable draft + auto-save ────────────────────────────────────
// Bind the form to a *draft* so we can validate before PATCH. The
// SyncEngine live query keeps logBook.value fresh; we seed the draft
// from it on first load + reset on id change.
const draft = ref(null)
const isSaving = ref(false)
const isFirstLoad = ref(true)

watch(
  logBook,
  (lb) => {
    if (!lb) return
    if (isFirstLoad.value || draft.value?.id !== lb.id) {
      draft.value = {
        id: lb.id,
        title: lb.title ?? '',
        description: lb.description ?? '',
        logBookTypeId: lb.logBookTypeId || null,
        ownerUserId: lb.ownerUserId || null,
        supervisorUserId: lb.supervisorUserId || null,
        codePrefix: lb.codePrefix ?? '{TYPECODE}-LOG-{DEPTCODE}',
        equipmentId: lb.equipmentId || null,
        syncsEquipmentCalibration: !!lb.syncsEquipmentCalibration,
        syncsEquipmentPm: !!lb.syncsEquipmentPm,
        scheduleMode: lb.scheduleMode ?? 'AD_HOC',
        schedule: lb.schedule ? JSON.parse(JSON.stringify(lb.schedule)) : {},
        graceMinutes: lb.graceMinutes ?? 60,
        generateTasks: lb.generateTasks !== false,
        triggerSource: lb.triggerSource || null,
        departmentId: lb.departmentId || null,
        location: lb.location ?? '',
        relatedStandardId: lb.relatedStandardId || null,
        regulatoryCitation: lb.regulatoryCitation ?? '',
        retentionMonths: lb.retentionMonths ?? null,
        editWindowMode: lb.editWindowMode ?? 'TIME_WINDOW',
        editWindowMinutes: lb.editWindowMinutes ?? null,
        signatureRequired: !!lb.signatureRequired,
        reviewRequired: !!lb.reviewRequired,
        notifyOnSubmit: lb.notifyOnSubmit ?? 'DIGEST',
        statusId: lb.statusId ?? 'ACTIVE',
        statusReason: lb.statusReason ?? '',
        workflowVersionId: lb.workflowVersionId || null,
      }
      isFirstLoad.value = false
    }
  },
  { immediate: true },
)

// Prefill location from the selected instrument (equipment has its own
// location) when the log book's location is still empty.
const selectedEquipment = useLiveQueryWithDeps(
  [() => draft.value?.equipmentId],
  async (db, [id]) => (id ? db.Equipment.findByPk(id) : null),
  { models: ['Equipment'] },
)
watch(selectedEquipment, (eq) => {
  if (eq?.locationText && draft.value && !draft.value.location?.trim()) {
    draft.value.location = eq.locationText
  }
})

// ── Schedule editing (2026-08-06: WHEN lives on the book) ───────────────────
// Sub-field bridges write through draft.schedule as a NEW object each time so
// the deep autosave watcher always fires.
const SCHEDULE_TIMEZONES = [
  ...new Set(
    [
      Intl.DateTimeFormat().resolvedOptions().timeZone,
      'UTC',
      'America/New_York',
      'America/Chicago',
      'America/Denver',
      'America/Los_Angeles',
      'Europe/London',
      'Europe/Paris',
      'Europe/Berlin',
    ].filter(Boolean),
  ),
]
const scheduleFrequency = ref('DAILY')
function scheduleField(key, fallback) {
  return computed({
    get: () => draft.value?.schedule?.[key] ?? fallback,
    set: (v) => {
      if (!draft.value) return
      draft.value.schedule = { ...draft.value.schedule, [key]: v }
    },
  })
}
const scheduleCron = scheduleField('cron', '0 8 * * *')
const scheduleTimezone = scheduleField('timezone', SCHEDULE_TIMEZONES[0])
const scheduleWindowMinutes = scheduleField('windowMinutes', 240)
const scheduleOnWindowExpire = scheduleField('onWindowExpire', 'MISS')
// Flipping into RECURRING with no cron yet seeds sensible defaults so the
// very next autosave PATCH passes backend validation.
watch(
  () => draft.value?.scheduleMode,
  (mode) => {
    if (mode === 'RECURRING' && draft.value && !draft.value.schedule?.cron) {
      draft.value.schedule = {
        cron: '0 8 * * *',
        timezone: SCHEDULE_TIMEZONES[0],
        windowMinutes: 240,
        startOffsetMinutes: 0,
        onWindowExpire: 'MISS',
      }
    }
  },
)

// Derived classification — keeps the dialog's logic in lockstep with
// the create-flow's "policy implies classification" rule.
const derivedClassification = computed(() =>
  draft.value?.signatureRequired ? 'CONTROLLED_RECORD' : 'OPERATIONAL_LOG',
)

// The record-ID naming convention (code prefix) is editable only while the
// log book is still a draft (no effective version yet). Once effective the
// code is frozen so live record numbers stay consistent.
const debouncedSave = useDebounceFn(async () => {
  // canEditDetails: UNDER_REVIEW/OBSOLETE books never autosave. On an
  // ACTIVE book only the operational fields change (frozen inputs render
  // disabled; the server refuses frozen-field changes as a backstop).
  if (!draft.value || !canEditDetails.value) return
  isSaving.value = true
  try {
    await patch(`/v1/services/logBooks/${draft.value.id}`, {
      title: draft.value.title?.trim() || undefined,
      description: draft.value.description?.trim() || null,
      logBookTypeId: draft.value.logBookTypeId,
      ownerUserId: draft.value.ownerUserId,
      supervisorUserId: draft.value.supervisorUserId,
      codePrefix: draft.value.codePrefix?.trim() || undefined,
      equipmentId: draft.value.equipmentId,
      syncsEquipmentCalibration: draft.value.equipmentId
        ? !!draft.value.syncsEquipmentCalibration
        : false,
      syncsEquipmentPm: draft.value.equipmentId ? !!draft.value.syncsEquipmentPm : false,
      scheduleMode: draft.value.scheduleMode,
      schedule: draft.value.scheduleMode === 'RECURRING' ? draft.value.schedule : {},
      graceMinutes: draft.value.graceMinutes ?? 60,
      generateTasks: !!draft.value.generateTasks,
      triggerSource: draft.value.scheduleMode === 'TRIGGER' ? draft.value.triggerSource : null,
      departmentId: draft.value.departmentId,
      location: draft.value.location?.trim() || null,
      relatedStandardId: draft.value.relatedStandardId,
      regulatoryCitation: draft.value.regulatoryCitation?.trim() || null,
      retentionMonths: draft.value.retentionMonths || null,
      editWindowMode: draft.value.editWindowMode,
      editWindowMinutes:
        draft.value.editWindowMode === 'TIME_WINDOW' ? draft.value.editWindowMinutes : null,
      signatureRequired: !!draft.value.signatureRequired,
      reviewRequired: !!draft.value.reviewRequired,
      notifyOnSubmit: draft.value.notifyOnSubmit,
      statusId: draft.value.statusId,
      statusReason:
        draft.value.statusId === 'OBSOLETE' ? draft.value.statusReason?.trim() || undefined : null,
      recordClassification: derivedClassification.value,
      workflowVersionId: draft.value.workflowVersionId || null,
    })
  } catch (err) {
    toast.error(err?.message || 'Failed to save')
  } finally {
    isSaving.value = false
  }
}, 500)

// Auto-save the metadata draft whenever the user changes a field.
// Skip the first watcher tick so seeding the draft from logBook
// doesn't trigger a redundant PATCH.
let skipNextWatch = true
watch(
  draft,
  () => {
    if (skipNextWatch) {
      skipNextWatch = false
      return
    }
    debouncedSave()
  },
  { deep: true },
)

// ─── Site links — junction table (SyncEngine direct save) ──────────
const addSite = useLiveMutation(async (db, { logBookId, siteId }) => {
  const sot = db.SiteOnLogBook.create({ logBookId, siteId })
  await sot.save()
  return sot
})

async function handleSitesChange(newSiteIds) {
  const currentIds = assignedSiteIds.value
  const toAdd = newSiteIds.filter((id) => !currentIds.includes(id))
  const toRemove = currentIds.filter((id) => !newSiteIds.includes(id))
  for (const siteId of toAdd) await addSite({ logBookId: props.id, siteId })
  for (const siteId of toRemove) {
    const match = siteLinks.value.find((sl) => sl.siteId === siteId)
    if (match) await match.delete()
  }
}

// ─── Document links — many-to-many ─────────────────────────────────
const showAddDocDialog = ref(false)
const pendingDocId = ref(null)
const pendingRelType = ref('IMPLEMENTS')
const pendingDocNotes = ref('')

const addDocLink = useLiveMutation(async (db, payload) => {
  const link = db.LogBookDocumentLink.create(payload)
  await link.save()
  return link
})

async function saveDocLink() {
  if (!pendingDocId.value) {
    toast.error('Pick a document')
    return
  }
  try {
    await addDocLink({
      logBookId: props.id,
      documentId: pendingDocId.value,
      relationshipType: pendingRelType.value,
      notes: pendingDocNotes.value?.trim() || null,
    })
    showAddDocDialog.value = false
    pendingDocId.value = null
    pendingRelType.value = 'IMPLEMENTS'
    pendingDocNotes.value = ''
  } catch (err) {
    toast.error(err?.message || 'Failed to link document')
  }
}

async function removeDocLink(link) {
  if (
    !(await confirm({
      title: 'Remove document link',
      message: 'Remove this document link?',
      okLabel: 'Remove',
      danger: true,
    }))
  ) {
    return
  }
  await link.delete()
}

// ─── Schema (FormBuilder) ──────────────────────────────────────────
// The Schema tab opens FormBuilder in a full-screen teleported panel
// (same UX pattern as WorkflowStepFormBuilderPanel). Inline FormBuilder
// in a regular tab swallows its palette + config drawers because the
// drawers anchor against the FormBuilder's own bounding box; full-
// screen gives them somewhere to land. The builder fires `save` from
// its internal toolbar with the final schema; we PATCH and close.
// Versions FIRST (user decision 2026-08-07): opening a log book lands on
// the version history — pick a version to view it; only the open draft is
// editable, an effective version is immutable.
const activeTab = ref('details') // 'details' | 'schema' | 'assignments'

// ─── Assignments tab data ────────────────────────────────────────────
// Lists FormAssignment rows scoped to this log book. The full create /
// edit flow lives on the dedicated /form-assignments routes — this tab
// is a focused view so admins can manage who-fills-this-book without
// leaving the log book.
const canAssign = computed(() => isAllowed(['inspections:assign']))
const logBookAssignments = useLiveQueryWithDeps(
  [() => props.id],
  async (db, [logBookId]) => {
    if (!logBookId) return []
    const rows = await db.FormAssignment.where('logBookId', logBookId).exec()
    return rows.sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))
  },

  { models: ['FormAssignment'], initial: [] },
)

function scheduleSummary(plan) {
  if (!plan.schedule || typeof plan.schedule !== 'object') return '—'
  if (plan.schedule.type === 'AD_HOC') return 'Ad-hoc (no schedule)'
  return humanizeCron(plan.schedule.cron)
}

const assignmentColumns = [
  { name: 'schedule', label: 'Schedule', field: 'id', align: 'left' },
  { name: 'assignees', label: 'Assignees', field: 'id', align: 'left' },
  { name: 'status', label: 'Status', field: 'active', align: 'left' },
  { name: 'actions', label: '', field: 'actions', align: 'right' },
]
// Assignment create/edit is embedded inline in this tab (no navigation
// to /form-assignments/*). null id = create; a string id = edit.
const showAssignmentEditor = ref(false)
const editingAssignmentId = ref(null)
function goCreateAssignment() {
  editingAssignmentId.value = null
  showAssignmentEditor.value = true
}
function goEditAssignment(id) {
  editingAssignmentId.value = id
  showAssignmentEditor.value = true
}
function onAssignmentSaved() {
  showAssignmentEditor.value = false
  editingAssignmentId.value = null
}
const showSchemaBuilder = ref(false)
const isSavingSchema = ref(false)
// Local model for the interactive preview on the Schema tab. Just a
// scratch object — never posted anywhere, lets the author test
// conditional / required logic visually before opening the builder.
const schemaPreviewData = ref({})

function openSchemaBuilder() {
  // Editing the schema of an effective book requires a new version.
  if (!canEditDetails.value) return
  showSchemaBuilder.value = true
}

async function onSchemaBuilderSave(nextSchema) {
  if (!canEditDetails.value) return
  isSavingSchema.value = true
  try {
    const res = await patch(`/v1/services/logBooks/${props.id}`, {
      schema: nextSchema,
    })
    toast.success(`Log template saved (v${res?.logBook?.schemaVersion ?? '?'})`)
    showSchemaBuilder.value = false
  } catch (err) {
    toast.error(err?.message || 'Failed to save log template')
  } finally {
    isSavingSchema.value = false
  }
}

// ─── Approval lifecycle (supersede model, 2026-08-08) ───────────────
// The BOOK carries the whole lifecycle: DRAFT → UNDER_REVIEW → (REJECTED)
// → ACTIVE → INACTIVE/OBSOLETE. Approval rides the generic workflow
// engine (resourceType 'LogBook') — same TaskActionBar documents use.
// Once ACTIVE, the contract (template + entry policy + equipment +
// location + code) is FROZEN; changes go through "Create replacement",
// which clones this book into a lineage-linked draft (code root-V<gen>)
// and obsoletes this one on approval.
const bookStatus = computed(() => logBook.value?.statusId ?? 'DRAFT')
const isEditableDraft = computed(() => ['DRAFT', 'REJECTED'].includes(bookStatus.value))
const isUnderReview = computed(() => bookStatus.value === 'UNDER_REVIEW')

const tabs = computed(() => [
  { value: 'details', label: 'Details' },
  { value: 'schema', label: 'Log Template' },
  { value: 'assignments', label: 'Assignments', badge: logBookAssignments.value.length || null },
])

// Lineage — the physical-logbook chain, both directions.
const predecessor = useLiveQueryWithDeps(
  [() => logBook.value?.supersedesLogBookId],
  async (db, [pid]) => (pid ? db.LogBook.findByPk(pid) : null),
  { models: ['LogBook'] },
)
const replacement = useLiveQueryWithDeps(
  [() => props.id],
  async (db, [id]) => {
    if (!id) return null
    const rows = await db.LogBook.where().exec()
    return rows.find((b) => b.supersedesLogBookId === id) ?? null
  },
  { models: ['LogBook'], initial: null },
)

// Edit gates:
//  - UNDER_REVIEW / OBSOLETE: everything read-only.
//  - Draft/Rejected: everything editable (incl. the frozen-set fields).
//  - ACTIVE/INACTIVE: only the operational fields — the contract inputs
//    render disabled (server enforces the same freeze).
const canEditDetails = computed(
  () => canUpdate.value && !isUnderReview.value && bookStatus.value !== 'OBSOLETE',
)
const canEditFrozen = computed(() => canUpdate.value && isEditableDraft.value)
const canEditPrefix = computed(() => canUpdate.value && isEditableDraft.value)

// The current user's active approval task on this book — drives the
// review banner. TaskActionBar re-queries the same task for its buttons.
const myReviewTask = useLiveQueryWithDeps(
  [() => (isUnderReview.value ? props.id : null), () => currentSession.value?.userId],
  async (db, [bookId, userId]) => {
    if (!bookId || !userId) return null
    const tasks = await db.TaskInstance.where('[entityType+entityId]', ['LogBook', bookId]).exec()
    return (
      tasks.find(
        (t) => t.assignedTo === userId && ['ASSIGNED', 'FORM_SUBMITTED'].includes(t.statusId),
      ) || null
    )
  },
  { models: ['TaskInstance'] },
)
const isReviewing = computed(() => isUnderReview.value && !!myReviewTask.value)
// Scratch model for the read-only template preview in the review banner.
const reviewPreviewData = ref({})

// The draft scratch object is seeded once per book id, but the book's
// lifecycle can move underneath it (submit → UNDER_REVIEW, reviewer
// rejects → REJECTED, approval → ACTIVE). Autosave echoes
// draft.statusId in every PATCH, and the backend rejects any status
// change outside pause/resume/obsolete — so a stale echo would 400
// every subsequent edit. Track the server value.
watch(
  () => logBook.value?.statusId,
  (statusId) => {
    if (!statusId || !draft.value) return
    draft.value.statusId = statusId
    draft.value.statusReason = logBook.value?.statusReason ?? ''
  },
)

// ─── Submit / replace / discard actions ─────────────────────────────
const submitDialog = reactive({ open: false })

function openSubmit() {
  if (!canUpdate.value || !isEditableDraft.value) return
  if (!draft.value?.workflowVersionId) {
    toast.error('Attach an approval workflow on the Details tab first')
    activeTab.value = 'details'
    return
  }
  submitDialog.open = true
}

const creatingReplacement = ref(false)
async function createReplacement() {
  if (!canUpdate.value || creatingReplacement.value || bookStatus.value !== 'ACTIVE') return
  creatingReplacement.value = true
  try {
    const res = await post(`/v1/services/logBooks/${props.id}/replace`, {})
    toast.success(
      `Replacement ${res?.logBook?.code ?? 'draft'} created — edit its log template, then submit for approval`,
    )
    if (res?.logBook?.id) {
      router.push(getCompanyPath(`/inspections-logs/log-books/${res.logBook.id}`))
    }
  } catch (err) {
    toast.error(err?.message || 'Failed to create replacement')
  } finally {
    creatingReplacement.value = false
  }
}

const discardingDraft = ref(false)
async function discardDraft() {
  if (!canUpdate.value || !isEditableDraft.value || discardingDraft.value) return
  if (
    !(await confirm({
      title: 'Discard draft log book',
      message: `Discard "${logBook.value?.title}"? This deletes the draft${
        predecessor.value ? ` — ${predecessor.value.code} stays in use` : ''
      }.`,
      okLabel: 'Discard',
      danger: true,
    }))
  ) {
    return
  }
  discardingDraft.value = true
  try {
    await del(`/v1/services/logBooks/${props.id}`)
    toast.success('Draft discarded')
    router.push(getCompanyPath('/inspections-logs/templates'))
  } catch (err) {
    toast.error(err?.message || 'Failed to discard draft')
  } finally {
    discardingDraft.value = false
  }
}

// ─── Mark Obsolete (was Archive) ────────────────────────────────────
// Status transition with a REQUIRED reason — recorded in the audit trail
// via the log_books row trigger. The book stays visible as controlled
// history (this does NOT delete it); loggers stop seeing it because only
// ACTIVE books appear on the logging surfaces.
const showObsoleteDialog = ref(false)
const obsoleteReason = ref('')
const obsoleting = ref(false)
function markObsolete() {
  obsoleteReason.value = ''
  showObsoleteDialog.value = true
}
async function confirmObsolete() {
  if (!obsoleteReason.value.trim() || obsoleting.value) return
  obsoleting.value = true
  try {
    await patch(`/v1/services/logBooks/${props.id}`, {
      statusId: 'OBSOLETE',
      statusReason: obsoleteReason.value.trim(),
    })
    toast.success('Log book marked obsolete')
    showObsoleteDialog.value = false
  } catch (err) {
    toast.error(err?.message || 'Failed to mark obsolete')
  } finally {
    obsoleting.value = false
  }
}

// ─── BaseDetailLayout config ──────────────────────────────────────────────────
const breadcrumbs = computed(() => [
  { label: 'Log Books', to: getCompanyPath('/inspections-logs/templates') },
  { label: logBook.value?.title || 'Log Book' },
])
const logBookActions = computed(() =>
  buildLogBookActions(
    {
      canUpdate: canUpdate.value,
      hasLogBook: !!logBook.value,
      statusId: bookStatus.value,
    },
    { submitForApproval: openSubmit, createReplacement, discardDraft, markObsolete },
  ),
)
const logBookDetailConfig = computed(() =>
  defineDetailConfig({
    variant: 'standard',
    width: 'standard',
    breadcrumbs: breadcrumbs.value,
    actions: logBookActions.value,
    sections: buildLogBookSections(logBook.value),
  }),
)
</script>

<template>
  <BaseDetailLayout
    :config="logBookDetailConfig"
    :record="logBook"
    :loading="loading"
    :notFound="!loading && !logBook"
    notFoundTitle="Log book not found"
    notFoundDescription="This log book could not be found."
  >
    <template #title>
      <span class="tw:text-base tw:font-semibold tw:text-on-main">{{
        logBook?.title || 'Log Book'
      }}</span>
    </template>

    <template #status>
      <span
        v-if="logBook"
        class="tw:inline-flex tw:items-center tw:gap-1 tw:text-micro tw:font-bold tw:uppercase tw:rounded tw:px-2 tw:py-1 tw:border"
        :class="
          logBook.recordClassification === 'CONTROLLED_RECORD'
            ? 'tw:bg-red-50 tw:text-red-700 tw:border-red-200'
            : 'tw:bg-amber-50 tw:text-amber-700 tw:border-amber-200'
       "
      >
        <IconShieldCheck v-if="logBook.recordClassification === 'CONTROLLED_RECORD'" :size="10" />
        {{ logBook.recordClassification?.replace('_', ' ') }}
      </span>
    </template>

    <template v-if="logBook" #meta>
      <span class="tw:uppercase">{{ logBook.code }}</span>
      <span> · V{{ logBook.generation ?? 1 }}</span>
      <span v-if="isSaving" class="tw:text-amber-600"> · saving…</span>
    </template>

    <template #actions>
      <DetailActionBar :actions="logBookActions" />
    </template>

    <template v-if="logBook" #section-details>
      <!-- Lifecycle banner — the BOOK carries the approval lifecycle
           (supersede model). Lineage links tell the physical-logbook story. -->
      <div
        class="tw:flex tw:items-center tw:gap-3 tw:flex-wrap tw:bg-white tw:border tw:border-divider tw:rounded-lg tw:px-4 tw:py-2.5 tw:mb-4"
      >
        <LogBookStatusBadge :statusId="bookStatus" />
        <span class="tw:text-xs tw:font-semibold tw:text-secondary">V{{ logBook.generation ?? 1 }}</span>
        <span v-if="logBook.effectiveAt" class="tw:text-xs tw:text-secondary">
          effective {{ logBook.effectiveAt.formatDate('date') }}
        </span>
        <RouterLink
          v-if="predecessor"
          :to="getCompanyPath(`/inspections-logs/log-books/${predecessor.id}`)"
          class="tw:text-xs tw:text-primary tw:hover:underline"
        >
          Replaces {{ predecessor.code }}
        </RouterLink>
        <RouterLink
          v-if="replacement"
          :to="getCompanyPath(`/inspections-logs/log-books/${replacement.id}`)"
          class="tw:text-xs tw:text-primary tw:hover:underline"
        >
          Replaced by {{ replacement.code }} ({{ replacement.statusId?.toLowerCase() }})
        </RouterLink>
        <span class="tw:text-xs tw:text-secondary tw:italic tw:ml-auto">
          <template v-if="isEditableDraft">Draft — editable; submit for approval when ready.</template>
          <template v-else-if="isUnderReview">Under review — locked until the approval completes.</template>
          <template v-else-if="bookStatus === 'ACTIVE'">Approved — template, policy, equipment &amp; location are locked. Create a replacement to change them.</template>
          <template v-else-if="bookStatus === 'OBSOLETE'">Obsolete{{ logBook.statusReason ? ` — ${logBook.statusReason}` : '' }}</template>
          <template v-else-if="bookStatus === 'INACTIVE'">Paused — not accepting entries.</template>
        </span>
      </div>

      <!-- Tab strip -->
      <BaseTabs v-model="activeTab" :tabs="tabs" ariaLabel="Log book sections">
        <div class="tw:mt-6">
          <!-- Details tab -->
          <BaseTabPanel value="details">
            <div v-if="draft" class="tw:flex tw:flex-col tw:gap-4">
              <p class="tw:text-xs tw:text-secondary tw:px-1">
                Book settings — ownership, schedule, equipment and sites apply to every
                version and take effect immediately (each change is audit-logged). The versioned
                entry policy (signature, review, edit window) lives with the template on the Log
                Template tab.
              </p>
              <!-- Approval — approver sees Approve/Reject; the owner's
                   submit/replace/discard live in the header actions. -->
              <section
                v-if="isReviewing || isUnderReview || bookStatus === 'REJECTED'"
                class="tw:bg-white tw:rounded-lg tw:border tw:border-divider tw:p-4 tw:space-y-3"
              >
                <!-- A) Approver — your approval is requested. -->
                <div
                  v-if="isReviewing"
                  class="tw:bg-amber-50 tw:border tw:border-amber-200 tw:rounded tw:p-3 tw:space-y-3"
                >
                  <div class="tw:flex tw:items-center tw:justify-between tw:gap-3 tw:flex-wrap">
                    <span class="tw:text-sm tw:font-semibold tw:text-amber-900">
                      Your approval is requested — {{ logBook.code }} (V{{ logBook.generation ?? 1 }})
                    </span>
                    <TaskActionBar entityType="LogBook" :entityId="logBook.id" />
                  </div>
                  <p v-if="logBook.changeSummary" class="tw:text-sm tw:text-amber-900">
                    <span class="tw:font-semibold">Change summary:</span>
                    {{ logBook.changeSummary }}
                  </p>
                  <div class="tw:grid tw:grid-cols-2 tw:md:grid-cols-4 tw:gap-2 tw:text-xs">
                    <div class="tw:bg-white tw:rounded tw:p-2 tw:border tw:border-amber-200">
                      <div class="tw:text-secondary">Classification</div>
                      <div class="tw:font-medium tw:text-on-main">
                        {{ logBook.recordClassification?.replace('_', ' ') }}
                      </div>
                    </div>
                    <div class="tw:bg-white tw:rounded tw:p-2 tw:border tw:border-amber-200">
                      <div class="tw:text-secondary">Edit window</div>
                      <div class="tw:font-medium tw:text-on-main">
                        {{ logBook.editWindowMode?.replace(/_/g, ' ')
                        }}{{
                          logBook.editWindowMode === 'TIME_WINDOW'
                            ? ` (${logBook.editWindowMinutes ?? '?'}m)`
                            : ''
                        }}
                      </div>
                    </div>
                    <div class="tw:bg-white tw:rounded tw:p-2 tw:border tw:border-amber-200">
                      <div class="tw:text-secondary">E-signature</div>
                      <div class="tw:font-medium tw:text-on-main">
                        {{ logBook.signatureRequired ? 'Required' : 'Not required' }}
                      </div>
                    </div>
                    <div class="tw:bg-white tw:rounded tw:p-2 tw:border tw:border-amber-200">
                      <div class="tw:text-secondary">Reviewer approval</div>
                      <div class="tw:font-medium tw:text-on-main">
                        {{ logBook.reviewRequired ? 'Required' : 'Not required' }}
                      </div>
                    </div>
                  </div>
                  <details class="tw:bg-white tw:rounded tw:border tw:border-amber-200">
                    <summary
                      class="tw:cursor-pointer tw:px-3 tw:py-2 tw:text-sm tw:font-medium tw:text-on-main"
                    >
                      Review log template ({{ logBook.schema?.length ?? 0 }} fields)
                    </summary>
                    <div class="tw:p-4 tw:border-t tw:border-amber-200">
                      <DynamicForm
                        v-if="(logBook.schema?.length ?? 0) > 0"
                        v-model="reviewPreviewData"
                        :fields="logBook.schema"
                      />
                      <div v-else class="tw:text-sm tw:text-secondary">No fields defined.</div>
                    </div>
                  </details>
                  <div v-if="predecessor" class="tw:text-xs tw:text-amber-900">
                    Approving retires <span class="tw:font-semibold">{{ predecessor.code }}</span>
                    (marked Obsolete; its records remain readable) and activates this book.
                  </div>
                </div>

                <!-- B) Under review, not the approver. -->
                <div
                  v-else-if="isUnderReview"
                  class="tw:bg-main-hover tw:rounded tw:p-3 tw:text-sm tw:text-secondary"
                >
                  Awaiting approval{{ logBook.changeSummary ? ` — "${logBook.changeSummary}"` : '' }}.
                </div>

                <!-- C) Rejected — reviewer's reason + edit/resubmit hint. -->
                <div
                  v-else
                  class="tw:bg-red-50 tw:border tw:border-red-200 tw:rounded tw:p-3 tw:text-sm tw:text-red-800"
                >
                  This log book was rejected — edit it and resubmit, or discard the draft.
                  <div v-if="logBook.rejectionComment" class="tw:mt-1 tw:text-xs">
                    <span class="tw:font-semibold">Reviewer's reason:</span>
                    {{ logBook.rejectionComment }}
                  </div>
                </div>
              </section>

              <!-- Basics -->
              <section
                class="tw:bg-white tw:rounded-lg tw:border tw:border-divider tw:p-4 tw:space-y-3"
              >
                <BaseText as="h3" class="tw:text-sm tw:font-semibold tw:text-on-main"
                  >Basics</BaseText
                >
                <BaseField v-slot="{ id: fieldId }" label="Title">
                  <BaseTextInput :id="fieldId" v-model="draft.title" :disabled="!canEditDetails" />
                </BaseField>
                <BaseField v-slot="{ id: fieldId }" label="Description">
                  <BaseTextarea
                    :id="fieldId"
                    v-model="draft.description"
                    :rows="2"
                    :disabled="!canEditDetails"
                  />
                </BaseField>
                <div class="tw:grid tw:grid-cols-1 tw:md:grid-cols-2 tw:gap-3">
                  <BaseField v-slot="{ id: fieldId }" label="Log Book Type">
                    <select
                      :id="fieldId"
                      v-model="draft.logBookTypeId"
                      :disabled="!canEditFrozen"
                      class="tw:w-full tw:rounded tw:border tw:border-divider tw:bg-card tw:px-3 tw:py-1.5 tw:text-sm"
                    >
                      <option :value="null">— Uncategorised —</option>
                      <option v-for="t in logBookTypes" :key="t.id" :value="t.id">
                        {{ t.name }}{{ t.prefix ? ` (${t.prefix})` : '' }}
                      </option>
                    </select>
                  </BaseField>
                  <BaseField
                    label="Owner"
                    hint="Owns the approval flow — submits the book for approval and manages replacements."
                  >
                    <UserSelectMenu v-model="draft.ownerUserId" :disabled="!canEditDetails" />
                  </BaseField>
                  <BaseField
                    label="Supervisor (reviewer)"
                    hint="Reviews and approves submitted entries when 'Require reviewer approval' is on. Entries land in this person's review queue."
                  >
                    <UserSelectMenu
                      v-model="draft.supervisorUserId"
                      :disabled="!canEditDetails || !!(draft.equipmentId && selectedEquipment?.ownerUserId)"
                    />
                    <div
                      v-if="draft.equipmentId && selectedEquipment?.ownerUserId"
                      class="tw:text-caption tw:text-secondary tw:mt-1"
                    >
                      Follows the equipment custodian (source of truth) — change it on the
                      equipment.
                    </div>
                  </BaseField>
                  <BaseField v-slot="{ id: fieldId }" label="Status">
                    <!-- Approved books: pause/resume here; Obsolete goes
                         through the header action (requires a reason).
                         Draft/review lifecycle is workflow-owned. -->
                    <select
                      v-if="['ACTIVE', 'INACTIVE'].includes(bookStatus)"
                      :id="fieldId"
                      v-model="draft.statusId"
                      :disabled="!canEditDetails"
                      class="tw:w-full tw:rounded tw:border tw:border-divider tw:bg-card tw:px-3 tw:py-1.5 tw:text-sm"
                    >
                      <option value="ACTIVE">Active</option>
                      <option value="INACTIVE">Inactive (paused)</option>
                    </select>
                    <LogBookStatusBadge v-else :statusId="bookStatus" />
                  </BaseField>
                  <BaseField v-slot="{ id: fieldId }" label="Notification mode">
                    <select
                      :id="fieldId"
                      v-model="draft.notifyOnSubmit"
                      :disabled="!canEditDetails"
                      class="tw:w-full tw:rounded tw:border tw:border-divider tw:bg-card tw:px-3 tw:py-1.5 tw:text-sm"
                    >
                      <option value="DIGEST">Digest (daily roll-up)</option>
                      <option value="INSTANT">Instant (every submission)</option>
                      <option value="NONE">None</option>
                    </select>
                  </BaseField>
                  <BaseField label="Department">
                    <DepartmentSelectMenu
                      v-model="draft.departmentId"
                      :disabled="!canEditFrozen"
                    />
                    <p class="tw:text-caption tw:text-secondary tw:italic tw:mt-1">
                      Feeds <span class="">{DEPTCODE}</span> in the Record Id prefix.
                    </p>
                  </BaseField>
                  <BaseField label="Site">
                    <!-- One site per log book (2026-08-05); the pivot table is
                         unchanged — a single selection replaces the set. -->
                    <SiteSelectMenu
                      :modelValue="assignedSiteIds[0] ?? null"
                      :disabled="!canEditDetails"
                      @update:modelValue="(v) => handleSitesChange(v ? [v] : [])"
                    />
                    <p class="tw:text-caption tw:text-secondary tw:italic tw:mt-1">
                      Leave empty to allow all sites.
                    </p>
                  </BaseField>
                </div>
                <BaseField label="Record Id Prefix">
                  <template v-if="canEditPrefix">
                    <BaseTextInput
                      v-model="draft.codePrefix"
                      placeholder="{TYPECODE}-LOG-{DEPTCODE}"
                    />
                    <p class="tw:text-caption tw:text-secondary tw:italic tw:mt-1">
                      Tokens <span class="tw:text-on-main">{DEPTCODE}</span> /
                      <span class="tw:text-on-main">{TYPECODE}</span> resolve from the
                      Department code + the Log book type's prefix (Lookups → Log Book Types)
                      on save. Current:
                      <span class="tw:text-on-main">{{ logBook.code }}</span>
                    </p>
                  </template>
                  <template v-else>
                    <div class="tw:text-sm tw:text-on-main">{{ logBook.code }}</div>
                    <p class="tw:text-caption tw:text-secondary tw:italic tw:mt-1">
                      Locked — the log book has an effective version, so record IDs stay consistent.
                    </p>
                  </template>
                </BaseField>
                <!-- Document links — which SOPs / work instructions this book
                     implements (audit crumb). Last field of Basics (user
                     layout decision 2026-08-06). -->
                <div class="tw:pt-3 tw:border-t tw:border-divider tw:space-y-2">
                  <div class="tw:flex tw:items-center tw:justify-between">
                    <span class="tw:text-sm tw:font-medium tw:text-on-main">
                      Document links ({{ documentLinks.length }})
                    </span>
                    <BaseButton v-if="canUpdate" variant="ghost" @click="showAddDocDialog = true">
                      Link a document
                    </BaseButton>
                  </div>
                  <div v-if="documentLinks.length === 0" class="tw:text-xs tw:text-secondary">
                    No documents linked. Use this to mark which SOPs / work instructions this log
                    book implements — useful in audits.
                  </div>
                  <div v-else class="tw:flex tw:flex-col tw:gap-1.5">
                    <div
                      v-for="link in documentLinks"
                      :key="link.id"
                      class="tw:flex tw:items-center tw:gap-3 tw:p-2 tw:bg-main tw:rounded"
                    >
                      <IconFileText :size="14" class="tw:text-secondary tw:shrink-0" />
                      <div class="tw:flex-1 tw:min-w-0">
                        <div class="tw:text-sm tw:text-on-main tw:truncate">
                          {{ documentById.get(link.documentId)?.title ?? link.documentId }}
                        </div>
                        <div class="tw:text-xs tw:text-secondary">
                          {{ link.relationshipType }}
                          <span v-if="link.notes"> · {{ link.notes }}</span>
                        </div>
                      </div>
                      <button
                        v-if="canUpdate"
                        class="tw:text-xs tw:text-red-600 tw:hover:underline"
                        @click="removeDocLink(link)"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              </section>

              <!-- Equipment — the linked instrument, its entry-driven
                   calibration/PM syncs, and the physical location. -->
              <section
                class="tw:bg-white tw:rounded-lg tw:border tw:border-divider tw:p-4 tw:space-y-3"
              >
                <BaseText as="h3" class="tw:text-sm tw:font-semibold tw:text-on-main"
                  >Equipment</BaseText
                >
                <BaseField label="Equipment">
                  <EquipmentSelectMenu v-model="draft.equipmentId" :disabled="!canEditFrozen" />
                </BaseField>

                <!-- Calibration sync: when this book is linked to an instrument,
                     opt in to auto-rolling that instrument's calibration from
                     each finalized entry — no manual "Record calibration". The
                     calibration date is the entry's submit time (tamper-proof);
                     next-due rolls forward by the instrument's interval. -->
                <label
                  v-if="draft.equipmentId"
                  class="tw:flex tw:items-start tw:gap-2 tw:cursor-pointer tw:select-none"
                >
                  <BaseCheckbox
                    v-model="draft.syncsEquipmentCalibration"
                    :disabled="!canEditFrozen"
                    class="tw:mt-0.5"
                  />
                  <span class="tw:text-sm tw:text-on-main">
                    Update this instrument's calibration when an entry is logged
                    <span class="tw:block tw:text-caption tw:text-secondary">
                      On approval (or submit, if no review), the instrument's last-calibrated date is
                      set to the entry's submit time and next-due rolls forward by its interval.
                      Overrides are done from Equipment.
                    </span>
                  </span>
                </label>
                <label
                  v-if="draft.equipmentId"
                  class="tw:flex tw:items-start tw:gap-2 tw:cursor-pointer tw:select-none"
                >
                  <BaseCheckbox
                    v-model="draft.syncsEquipmentPm"
                    :disabled="!canEditFrozen"
                    class="tw:mt-0.5"
                  />
                  <span class="tw:text-sm tw:text-on-main">
                    Update this instrument's preventive maintenance when an entry is logged
                    <span class="tw:block tw:text-caption tw:text-secondary">
                      The PM twin of the calibration sync — last-PM date stamps from the entry and
                      next-PM-due rolls forward by the PM interval.
                    </span>
                  </span>
                </label>
                <BaseField
                  v-slot="{ id: fieldId }"
                  label="Location"
                  hint="Where this log is performed. Equipment covers the asset/line; this is the spot."
                >
                  <BaseTextInput
                    :id="fieldId"
                    v-model="draft.location"
                    :disabled="!canEditFrozen"
                    placeholder="e.g. Room 201, Cold Store, Line 3"
                  />
                </BaseField>
              </section>

              <!-- Schedule — WHEN entries happen (moved off assignments,
                   2026-08-06). Assignments (tab) carry only WHO. -->
              <section
                class="tw:bg-white tw:rounded-lg tw:border tw:border-divider tw:p-4 tw:space-y-3"
              >
                <BaseText as="h3" class="tw:text-sm tw:font-semibold tw:text-on-main"
                  >Schedule</BaseText
                >
                <div class="tw:flex tw:flex-col tw:gap-1.5 tw:text-sm tw:text-on-main">
                  <label class="tw:flex tw:items-center tw:gap-2">
                    <input
                      v-model="draft.scheduleMode"
                      type="radio"
                      value="AD_HOC"
                      :disabled="!canEditDetails"
                    />
                    <span>Ad hoc — assignees log whenever needed</span>
                  </label>
                  <label class="tw:flex tw:items-center tw:gap-2">
                    <input
                      v-model="draft.scheduleMode"
                      type="radio"
                      value="RECURRING"
                      :disabled="!canEditDetails"
                    />
                    <span>Scheduled — recurring cadence (cron)</span>
                  </label>
                  <label class="tw:flex tw:items-start tw:gap-2">
                    <input
                      v-model="draft.scheduleMode"
                      type="radio"
                      value="TRIGGER"
                      :disabled="!canEditDetails"
                      class="tw:mt-0.5"
                    />
                    <span>
                      Equipment trigger — the linked instrument's calibration / PM due date
                      creates the tasks
                      <span class="tw:block tw:text-caption tw:text-secondary">
                        Tasks stay open until the entry is filed. Requires a linked instrument
                        (Equipment section).
                      </span>
                    </span>
                  </label>
                </div>

                <template v-if="draft.scheduleMode === 'RECURRING'">
                  <CronPicker v-model="scheduleCron" v-model:frequency="scheduleFrequency" />
                  <div class="tw:grid tw:grid-cols-2 tw:gap-3">
                    <BaseField v-slot="{ id: tzId }" label="Timezone">
                      <select
                        :id="tzId"
                        v-model="scheduleTimezone"
                        :disabled="!canEditDetails"
                        class="tw:w-full tw:rounded tw:border tw:border-divider tw:bg-card tw:px-3 tw:py-1.5 tw:text-sm"
                      >
                        <option v-for="tz in SCHEDULE_TIMEZONES" :key="tz" :value="tz">
                          {{ tz }}
                        </option>
                      </select>
                    </BaseField>
                    <BaseField v-slot="{ id: winId }" label="Entry window (minutes)">
                      <input
                        :id="winId"
                        v-model.number="scheduleWindowMinutes"
                        type="number"
                        min="5"
                        :disabled="!canEditDetails"
                        class="tw:w-full tw:rounded tw:border tw:border-divider tw:bg-card tw:px-3 tw:py-1.5 tw:text-sm"
                      />
                    </BaseField>
                    <BaseField v-slot="{ id: graceId }" label="Grace (minutes)">
                      <input
                        :id="graceId"
                        v-model.number="draft.graceMinutes"
                        type="number"
                        min="0"
                        :disabled="!canEditDetails"
                        class="tw:w-full tw:rounded tw:border tw:border-divider tw:bg-card tw:px-3 tw:py-1.5 tw:text-sm"
                      />
                    </BaseField>
                    <BaseField v-slot="{ id: expId }" label="When the window expires">
                      <select
                        :id="expId"
                        v-model="scheduleOnWindowExpire"
                        :disabled="!canEditDetails"
                        class="tw:w-full tw:rounded tw:border tw:border-divider tw:bg-card tw:px-3 tw:py-1.5 tw:text-sm"
                      >
                        <option value="MISS">Mark as missed</option>
                        <option value="KEEP_OPEN">Keep open until done</option>
                      </select>
                    </BaseField>
                  </div>
                  <label class="tw:flex tw:items-start tw:gap-2 tw:text-sm tw:text-on-main">
                    <input
                      v-model="draft.generateTasks"
                      type="checkbox"
                      :disabled="!canEditDetails"
                      class="tw:mt-0.5"
                    />
                    <span>
                      Create tasks for assignees
                      <span class="tw:block tw:text-caption tw:text-secondary">
                        Unchecked: assignees get a reminder notification per occurrence instead —
                        no My Tasks entry, no missed-tracking.
                      </span>
                    </span>
                  </label>
                </template>

                <template v-if="draft.scheduleMode === 'TRIGGER'">
                  <div
                    v-if="!draft.equipmentId"
                    class="tw:bg-amber-50 tw:text-amber-800 tw:border tw:border-amber-200 tw:rounded tw:p-2 tw:text-xs"
                  >
                    Link an instrument in the <strong>Equipment</strong> section first — the trigger follows its
                    due dates.
                  </div>
                  <BaseField v-slot="{ id: srcId }" label="Trigger on">
                    <select
                      :id="srcId"
                      v-model="draft.triggerSource"
                      :disabled="!canEditDetails || !draft.equipmentId"
                      class="tw:w-full tw:rounded tw:border tw:border-divider tw:bg-card tw:px-3 tw:py-1.5 tw:text-sm"
                    >
                      <option :value="null" disabled>— Select —</option>
                      <option value="CALIBRATION">Calibration due</option>
                      <option value="PM">Preventive maintenance due</option>
                    </select>
                  </BaseField>
                </template>
              </section>

              <!-- Compliance -->
              <section
                class="tw:bg-white tw:rounded-lg tw:border tw:border-divider tw:p-4 tw:space-y-3"
              >
                <BaseText as="h3" class="tw:text-sm tw:font-semibold tw:text-on-main"
                  >Compliance</BaseText
                >
                <BaseField label="Related standard">
                  <RelatedStandardSelectMenu
                    v-model="draft.relatedStandardId"
                    :disabled="!canEditDetails"
                  />
                </BaseField>
                <BaseField v-slot="{ id: fieldId }" label="Regulatory citation">
                  <BaseTextInput
                    :id="fieldId"
                    v-model="draft.regulatoryCitation"
                    :disabled="!canEditDetails"
                    placeholder="e.g. ISO 9001 §7.5.3.2"
                  />
                </BaseField>
                <BaseField v-slot="{ id: fieldId }" label="Retention (months)">
                  <input
                    :id="fieldId"
                    v-model.number="draft.retentionMonths"
                    type="number"
                    min="1"
                    max="600"
                    :disabled="!canEditDetails"
                    class="tw:w-40 tw:rounded tw:border tw:border-divider tw:bg-card tw:px-3 tw:py-1.5 tw:text-sm"
                  />
                  <span class="tw:text-xs tw:text-secondary tw:ml-2">(blank = indefinite)</span>
                </BaseField>
              </section>

              <!-- Log Book Approval — approves the log book DEFINITION (schema +
                   policy), NOT the daily entries. A new/revised version routes
                   through this workflow before it becomes effective. -->
              <section
                class="tw:bg-white tw:rounded-lg tw:border tw:border-divider tw:p-4 tw:space-y-3"
              >
                <BaseText as="h3" class="tw:text-sm tw:font-semibold tw:text-on-main">
                  Log Book Approval
                </BaseText>
                <p class="tw:text-xs tw:text-secondary">
                  Approves the <strong>log book itself</strong> — its fields and policy. The
                  book routes through this workflow (review → sign-off) before it becomes
                  <strong>Active</strong> and can accept entries; a replacement book goes through
                  it again. This is <strong>not</strong> the approval for daily entries — those
                  use the reviewer sign-off in <strong>Entry policy</strong> above. Design
                  workflows under the <strong>Log Book</strong> module.
                </p>
                <WorkflowVersionSelect
                  v-if="canUpdate"
                  v-model="draft.workflowVersionId"
                  moduleId="LOG_BOOK"
                  dense
                />
                <div v-else-if="!draft.workflowVersionId" class="tw:text-sm tw:text-secondary">
                  No approval workflow attached.
                </div>
                <div
                  v-if="!draft.workflowVersionId"
                  class="tw:bg-amber-50 tw:text-amber-800 tw:border tw:border-amber-200 tw:rounded tw:p-2 tw:text-xs"
                >
                  No workflow attached — the book can't be submitted for approval until one is set.
                </div>
              </section>
            </div>
          </BaseTabPanel>

          <!-- Schema tab — opens the FormBuilder full-screen so its
               palette + config drawers have somewhere to land. The inline
               variant collapsed because the drawers anchor against the
               builder's bounding box. Below the header card we render a
               read-only preview of what the form actually looks like so
               the author can see + skim the schema without entering the
               builder. Same component the FieldRecordPreview uses for
               rendering submitted entries — keeps the preview consistent
               with the real submission view. -->
          <BaseTabPanel value="schema">
            <div class="tw:flex tw:flex-col tw:gap-3">
              <FormSection title="Log template">
                <template #actions>
                  <div class="tw:flex tw:items-center tw:gap-2 tw:flex-wrap">
                    <BaseButton
                      v-if="isEditableDraft"
                      variant="primary"
                      :disabled="!canEditFrozen || isSavingSchema"
                      @click="openSchemaBuilder"
                    >
                      <IconDeviceFloppy :size="16" />
                      {{ (logBook.schema?.length ?? 0) > 0 ? 'Edit log template' : 'Build log template' }}
                    </BaseButton>
                    <BaseButton
                      v-else-if="canUpdate && bookStatus === 'ACTIVE'"
                      variant="outline"
                      :disabled="creatingReplacement"
                      @click="createReplacement"
                    >
                      <IconPlus :size="16" />
                      Create replacement
                    </BaseButton>
                  </div>
                </template>
                <p class="tw:text-sm tw:text-secondary">
                  <LogBookStatusBadge :statusId="bookStatus" class="tw:mr-1" />
                  <span v-if="logBook.effectiveAt">
                    effective {{ logBook.effectiveAt.formatDate('date') }} ·
                  </span>
                  <span v-if="isEditableDraft" class="tw:italic">editable until submitted</span>
                  <span v-else class="tw:italic">
                    read-only ({{ isUnderReview ? 'awaiting approval' : 'the approved template is frozen — create a replacement to change it' }})
                  </span>
                </p>
                <p v-if="logBook.changeSummary" class="tw:text-xs tw:text-secondary tw:mt-1">
                  {{ logBook.changeSummary }}
                </p>
              </FormSection>

              <!-- Entry policy — approved together with the template; frozen
                   once the book is ACTIVE. -->
              <section
                v-if="isEditableDraft"
                class="tw:bg-white tw:rounded-lg tw:border tw:border-divider tw:p-4 tw:space-y-3"
              >
                <BaseText as="h3" class="tw:text-sm tw:font-semibold tw:text-on-main"
                  >Entry policy</BaseText
                >
                <p class="tw:text-caption tw:text-secondary">
                  Approved together with the template and frozen once the book is active —
                  changing these later means creating a replacement book.
                </p>
                <BaseField v-slot="{ id: fieldId }" label="Edit window">
                  <select
                    :id="fieldId"
                    v-model="draft.editWindowMode"
                    :disabled="!canEditDetails"
                    class="tw:w-full tw:rounded tw:border tw:border-divider tw:bg-card tw:px-3 tw:py-1.5 tw:text-sm"
                  >
                    <option value="NONE">None — lock immediately on submit</option>
                    <option value="TIME_WINDOW">Time window — lock after N minutes</option>
                    <option value="UNTIL_NEXT_ENTRY">Until next entry from the same user</option>
                    <option value="UNTIL_REVIEW">Until reviewed</option>
                  </select>
                  <BaseField
                    v-if="draft.editWindowMode === 'TIME_WINDOW'"
                    v-slot="{ id: minutesId }"
                    label="Lock after (minutes)"
                    class="tw:mt-2"
                  >
                    <input
                      :id="minutesId"
                      v-model.number="draft.editWindowMinutes"
                      type="number"
                      min="1"
                      max="2880"
                      :disabled="!canEditDetails"
                      class="tw:w-32 tw:rounded tw:border tw:border-divider tw:bg-card tw:px-3 tw:py-1.5 tw:text-sm"
                    />
                  </BaseField>
                </BaseField>
                <div class="tw:flex tw:flex-col tw:gap-2">
                  <label class="tw:flex tw:items-center tw:gap-2 tw:text-sm tw:text-on-main">
                    <input
                      v-model="draft.signatureRequired"
                      type="checkbox"
                      :disabled="!canEditDetails"
                    />
                    <span>Require e-signature on submit</span>
                  </label>
                  <label class="tw:flex tw:items-start tw:gap-2 tw:text-sm tw:text-on-main">
                    <input
                      v-model="draft.reviewRequired"
                      type="checkbox"
                      :disabled="!canEditDetails"
                      class="tw:mt-0.5"
                    />
                    <span>
                      Require reviewer approval before locking
                      <span class="tw:block tw:text-caption tw:text-secondary">
                        Each entry is held for the <strong>Supervisor</strong> (above) to approve
                        or reject before it locks.
                      </span>
                    </span>
                  </label>
                </div>
                <div
                  v-if="draft.reviewRequired && !draft.supervisorUserId"
                  class="tw:bg-amber-50 tw:text-amber-800 tw:border tw:border-amber-200 tw:rounded tw:p-2 tw:text-xs"
                >
                  Reviewer approval is on but no <strong>Supervisor</strong> is set — set one in
                  Basics so entries have a designated reviewer.
                </div>
                <div class="tw:bg-main-hover tw:rounded tw:p-2 tw:text-xs">
                  Saves as a
                  <strong
                    >{{ derivedClassification.replace('_', ' ').toLowerCase() }} log book</strong
                  >
                  based on the current settings.
                </div>
              </section>


              <!-- EDITABLE DRAFT: interactive preview — the same DynamicForm a
                   floor user gets at submission time. Nothing posts; authors
                   can test conditional / required logic before opening the
                   builder. (logBook.schema mirrors the open draft.) -->
              <section
                v-if="selectedIsEditableDraft && (logBook.schema?.length ?? 0) > 0"
                class="tw:bg-sidebar tw:border tw:border-divider tw:rounded-2xl tw:shadow-xl tw:overflow-hidden"
              >
                <div class="tw:bg-main tw:px-5 tw:py-3 tw:border-b tw:border-divider">
                  <div class="tw:text-xl tw:font-bold tw:text-on-sidebar">Form Preview</div>
                  <div class="tw:text-xs tw:text-secondary tw:mt-0.5">
                    Preview only — nothing is saved. Use "Edit log template" to make changes.
                  </div>
                </div>
                <div class="tw:p-5">
                  <DynamicForm v-model="schemaPreviewData" :fields="logBook.schema" />
                </div>
              </section>
              <div
                v-else-if="selectedIsEditableDraft"
                class="tw:text-sm tw:text-secondary tw:italic tw:px-1"
              >
                No fields yet. Open the builder to drag-and-drop the form structure.
              </div>

              <!-- READ-ONLY VERSION: that version's exact snapshot — template
                   fields + the policy that was in force. -->
              <section
                v-else-if="selectedVersion"
                class="tw:bg-white tw:rounded-lg tw:border tw:border-divider tw:p-4 tw:flex tw:flex-col tw:gap-3"
              >
                <div class="tw:text-xs tw:text-secondary tw:flex tw:flex-wrap tw:gap-x-4 tw:gap-y-1">
                  <span>
                    Classification:
                    <span class="tw:text-on-main">
                      {{ selectedVersion.recordClassification === 'CONTROLLED_RECORD' ? 'Controlled record' : 'Operational log' }}
                    </span>
                  </span>
                  <span>
                    Signature:
                    <span class="tw:text-on-main">{{ selectedVersion.signatureRequired ? 'Required' : 'Not required' }}</span>
                  </span>
                  <span>
                    Review:
                    <span class="tw:text-on-main">{{ selectedVersion.reviewRequired ? 'Required' : 'Not required' }}</span>
                  </span>
                </div>
                <div class="tw:border-t tw:border-divider tw:pt-3">
                  <FormSchemaReadonlyView
                    v-if="Array.isArray(selectedVersion.schema) && selectedVersion.schema.length"
                    :fields="selectedVersion.schema"
                  />
                  <div v-else class="tw:text-sm tw:text-secondary tw:italic">
                    No fields in this version's log template.
                  </div>
                </div>
              </section>
            </div>
          </BaseTabPanel>

          <!-- Assignments tab — scoped view of FormAssignment rows that
               target this log book. The full create / edit experience
               still lives at /inspections-logs/form-assignments/* (we
               route to it with the logBookId pre-filled). -->
          <BaseTabPanel value="assignments">
            <div class="tw:flex tw:flex-col tw:gap-3">
              <p class="tw:text-xs tw:text-secondary tw:px-1">
                Assignments are operational — they apply to the log book as a whole, not to a
                specific version. Whoever is assigned always logs against the current effective
                version.
              </p>
              <!-- Inline create/edit — embedded editor scoped to this log book
             (no navigation to /form-assignments/*). -->
              <BaseCard v-if="showAssignmentEditor">
                <FormAssignmentEditor
                  :id="editingAssignmentId"
                  :key="editingAssignmentId || 'new'"
                  embedded
                  :logBookId="props.id"
                  @saved="onAssignmentSaved"
                  @cancel="showAssignmentEditor = false"
                />
              </BaseCard>
              <section v-else class="tw:bg-white tw:rounded-lg tw:border tw:border-divider tw:p-4">
                <div class="tw:flex tw:items-start tw:justify-between tw:gap-3 tw:mb-3">
                  <div>
                    <BaseText as="h3" class="tw:text-base tw:font-semibold tw:text-on-main">
                      Assignments
                    </BaseText>
                    <div class="tw:text-xs tw:text-secondary">
                      Who fills this log book, when (cron + timezone), and where (site). Recurring
                      plans materialise an instance per assignee per occurrence; ad-hoc plans
                      surface the form in users' available list.
                    </div>
                  </div>
                  <BaseButton v-if="canAssign" variant="primary" @click="goCreateAssignment">
                    <IconPlus :size="16" />
                    New assignment
                  </BaseButton>
                </div>

                <div
                  v-if="logBookAssignments.length === 0"
                  class="tw:flex tw:flex-col tw:items-center tw:gap-2 tw:py-8 tw:text-secondary"
                >
                  <IconClipboardList :size="32" class="tw:opacity-60" />
                  <div class="tw:text-sm">No assignments yet.</div>
                  <div class="tw:text-xs tw:text-secondary">
                    Without an assignment, no one is scheduled to fill this log book.
                  </div>
                </div>

                <DataTable
                  v-else
                  :rows="logBookAssignments"
                  :columns="assignmentColumns"
                  rowKey="id"
                  :mobileCards="false"
                  hidePagination
                >
                  <template #body-cell-schedule="{ row }">
                    <button
                      type="button"
                      class="tw:text-left tw:text-on-main tw:hover:text-primary"
                      :aria-label="`Edit assignment: ${scheduleSummary(row)}`"
                      @click="goEditAssignment(row.id)"
                    >
                      <div>{{ scheduleSummary(row) }}</div>
                      <div
                        v-if="row.schedule?.type === 'RECURRING' && row.schedule?.timezone"
                        class="tw:text-xs tw:text-secondary"
                      >
                        {{ row.schedule.timezone }}
                      </div>
                    </button>
                  </template>

                  <template #body-cell-assignees="{ row }">
                    <RoleBadgeById v-if="row.assignedRoleId" :roleId="row.assignedRoleId" />
                    <div
                      v-else-if="row.assignedUserIds?.length"
                      class="tw:flex tw:flex-wrap tw:gap-1"
                    >
                      <UserBadgeById v-for="uid in row.assignedUserIds" :key="uid" :userId="uid" />
                    </div>
                    <span v-else class="tw:text-secondary">—</span>
                  </template>

                  <template #body-cell-status="{ row }">
                    <span
                      class="tw:inline-flex tw:items-center tw:gap-1 tw:text-xs tw:rounded tw:px-2 tw:py-0.5"
                      :class="
                        row.active
                          ? 'tw:bg-green-100 tw:text-green-700'
                          : 'tw:bg-gray-100 tw:text-gray-700'
                     "
                    >
                      {{ row.active ? 'Active' : 'Inactive' }}
                    </span>
                  </template>

                  <template #body-cell-actions="{ row }">
                    <button
                      v-if="canAssign"
                      type="button"
                      class="tw:text-primary tw:text-xs tw:hover:underline tw:flex tw:items-center tw:gap-1 tw:ml-auto"
                      @click="goEditAssignment(row.id)"
                    >
                      <IconEdit :size="14" />
                      Edit
                    </button>
                  </template>
                </DataTable>
              </section>
            </div>
          </BaseTabPanel>

        </div>
      </BaseTabs>
    </template>
  </BaseDetailLayout>

  <!-- Submit-for-approval dialog (reviewer-per-step picker). -->
  <LogBookSubmitDialog
    v-model="submitDialog.open"
    :logBookId="props.id"
    :workflowVersionId="draft?.workflowVersionId || null"
  />

  <!-- Mark Obsolete — status transition with a required, audit-recorded reason. -->
  <BaseDialog v-model="showObsoleteDialog" title="Mark Log Book Obsolete" maxWidth="md">
    <div class="tw:flex tw:flex-col tw:gap-3 tw:p-1">
      <p class="tw:text-sm tw:text-secondary">
        The log book stops accepting new entries and disappears from the logging surfaces, but
        stays here as controlled history — existing records remain readable. The reason is
        recorded in the audit trail.
      </p>
      <BaseField v-slot="{ id: fieldId }" label="Reason" required>
        <BaseTextarea
          :id="fieldId"
          v-model="obsoleteReason"
          :rows="3"
          placeholder="Why is this log book obsolete? (e.g. replaced by CAL-LOG-QA v2, equipment retired…)"
        />
      </BaseField>
    </div>
    <template #footer="{ close }">
      <BaseDialogFooter
        submitLabel="Mark Obsolete"
        submitVariant="danger"
        :loading="obsoleting"
        :disabled="!obsoleteReason.trim()"
        @cancel="close"
        @submit="confirmObsolete"
      />
    </template>
  </BaseDialog>


  <!-- Full-screen FormBuilder overlay. Mirrors the workflow-step
         panel pattern: teleport to body, slide-up transition, internal
         FormBuilder fires `save` from its toolbar with the final schema. -->
  <Teleport to="body">
    <Transition
      enterActiveClass="tw:transition-transform tw:duration-300 tw:ease-out"
      enterFromClass="tw:translate-y-full"
      enterToClass="tw:translate-y-0"
      leaveActiveClass="tw:transition-transform tw:duration-200 tw:ease-in"
      leaveFromClass="tw:translate-y-0"
      leaveToClass="tw:translate-y-full"
    >
      <!-- z-overlay (below z-modal) so dialogs opened from inside the builder —
           Generate with AI, JSON, Clear, Preview — render ABOVE this panel
           instead of behind it. -->
      <div
        v-if="showSchemaBuilder"
        class="tw:fixed tw:inset-0 tw:flex tw:flex-col tw:bg-main tw:z-overlay"
      >
        <div class="tw:flex tw:flex-col tw:h-full tw:flex-nowrap">
          <!-- Header -->
          <div
            class="tw:flex tw:items-center tw:border-b tw:border-divider tw:py-3 tw:px-4 tw:shrink-0"
          >
            <div class="tw:flex tw:items-center tw:gap-2">
              <div class="tw:text-lg tw:font-medium tw:text-on-main">
                {{ logBook?.title || 'Log template' }}
              </div>
              <span class="tw:text-xs tw:text-secondary">
                v{{ logBook?.schemaVersion ?? 1 }}
              </span>
            </div>
            <div class="tw:flex-1" />
            <button
              type="button"
              class="tw:p-1.5 tw:rounded-full tw:bg-transparent tw:border-0 tw:cursor-pointer tw:hover:bg-main-hover tw:text-secondary tw:transition-colors"
              :disabled="isSavingSchema"
              @click="showSchemaBuilder = false"
            >
              <IconX :size="20" />
            </button>
          </div>
          <!-- Body — the FormBuilder fills the remaining space; its
                 own toolbar contains Save / Undo / Redo / Preview / JSON. -->
          <div class="tw:flex-1 tw:min-h-0 tw:overflow-hidden">
            <FormBuilder
              :initialSchema="logBook.schema || []"
              title="Log template"
              @save="onSchemaBuilderSave"
            />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>

  <!-- Add-document dialog -->
  <Teleport to="body">
    <div
      v-if="showAddDocDialog"
      class="tw:fixed tw:inset-0 tw:z-popover tw:flex tw:items-center tw:justify-center tw:bg-black/40"
    >
      <div class="tw:bg-white tw:rounded-lg tw:max-w-md tw:w-full tw:p-5 tw:m-3">
        <h3 class="tw:text-base tw:font-bold tw:text-on-main tw:mb-3">Link a document</h3>
        <BaseField label="Document" class="tw:mb-3">
          <DocumentSelectMenu v-model="pendingDocId" hideNullOption />
        </BaseField>
        <BaseField v-slot="{ id: relId }" label="Relationship" class="tw:mb-3">
          <select
            :id="relId"
            v-model="pendingRelType"
            class="tw:w-full tw:rounded tw:border tw:border-divider tw:bg-card tw:px-3 tw:py-1.5 tw:text-sm"
          >
            <option value="IMPLEMENTS">Implements — this log book operationalises the doc</option>
            <option value="REFERENCES">References — the doc is cited but not implemented</option>
            <option value="EVIDENCE_OF">Evidence of — entries serve as compliance evidence</option>
          </select>
        </BaseField>
        <BaseField v-slot="{ id: notesId }" label="Notes" optional>
          <textarea
            :id="notesId"
            v-model="pendingDocNotes"
            rows="2"
            class="tw:w-full tw:rounded tw:border tw:border-divider tw:bg-card tw:px-3 tw:py-1.5 tw:text-sm"
          ></textarea>
        </BaseField>
        <div class="tw:flex tw:justify-end tw:gap-2 tw:mt-3">
          <button
            type="button"
            class="tw:px-3 tw:py-1.5 tw:text-sm tw:rounded tw:bg-transparent tw:text-secondary tw:hover:bg-main-hover"
            @click="showAddDocDialog = false"
          >
            Cancel
          </button>
          <BaseButton variant="primary" @click="saveDocLink">Link</BaseButton>
        </div>
      </div>
    </div>
  </Teleport>
</template>
