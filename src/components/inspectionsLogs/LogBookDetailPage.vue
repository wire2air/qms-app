<script setup>
import {
  IconShieldCheck,
  IconFileText,
  IconDeviceFloppy,
  IconX,
  IconPlus,
  IconEdit,
  IconClipboardList,
  IconGitBranch,
  IconSend,
  IconTrash,
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

const router = useRouter()
const toast = useToast()
const { confirm } = useConfirm()

const canUpdate = computed(() => isAllowed(['logBooks:update']))

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
        codePrefix: lb.codePrefix ?? 'FRM-{DEPTCODE}-{TYPECODE}',
        equipmentId: lb.equipmentId || null,
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
        workflowVersionId: lb.workflowVersionId || null,
      }
      isFirstLoad.value = false
    }
  },
  { immediate: true },
)

// Derived classification — keeps the dialog's logic in lockstep with
// the create-flow's "policy implies classification" rule.
const derivedClassification = computed(() =>
  draft.value?.signatureRequired ? 'CONTROLLED_RECORD' : 'OPERATIONAL_LOG',
)

// The record-ID naming convention (code prefix) is editable only while the
// log book is still a draft (no effective version yet). Once effective the
// code is frozen so live record numbers stay consistent.
const canEditPrefix = computed(() => canUpdate.value && !logBook.value?.currentEffectiveVersionId)

const debouncedSave = useDebounceFn(async () => {
  // canEditDetails (not just canUpdate) so an effective book never silently
  // persists edits — those must go through a new version.
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
const activeTab = ref('details') // 'details' | 'schema' | 'versions' | 'assignments'

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
    toast.success(`Schema saved (v${res?.logBook?.schemaVersion ?? '?'})`)
    showSchemaBuilder.value = false
  } catch (err) {
    toast.error(err?.message || 'Failed to save schema')
  } finally {
    isSavingSchema.value = false
  }
}

// ─── Controlled versions + approval ────────────────────────────────
// A log book is a controlled entity: its schema + policy are versioned,
// and a version only becomes usable for new entries once approved
// through the attached workflow. Approval rides the generic workflow
// engine (resourceType 'LogBookVersion'), so the approve/reject UI is
// the same TaskActionBar documents use.
const versions = useLiveQueryWithDeps(
  [() => props.id],
  async (db, [id]) => {
    if (!id) return []
    const rows = await db.LogBookVersion.where('logBookId', id).exec()
    return rows.sort(
      (a, b) =>
        (b.versionMajor ?? 0) - (a.versionMajor ?? 0) ||
        (b.versionMinor ?? 0) - (a.versionMinor ?? 0),
    )
  },

  { models: ['LogBookVersion'], initial: [] },
)

const effectiveVersionId = computed(() => logBook.value?.currentEffectiveVersionId || null)
const hasEffectiveVersion = computed(() => !!effectiveVersionId.value)

// Tab strip — version/assignment counts and the "no effective version" warning
// dot are surfaced via BaseTabs' badge/indicator (declared here so the reactive
// counts above are in scope).
const tabs = computed(() => [
  { value: 'details', label: 'Details' },
  { value: 'schema', label: 'Schema' },
  {
    value: 'versions',
    label: 'Versions',
    icon: IconGitBranch,
    badge: versions.value.length || null,
    indicator: !hasEffectiveVersion.value,
  },
  { value: 'assignments', label: 'Assignments', badge: logBookAssignments.value.length || null },
])
const effectiveVersion = computed(
  () => versions.value.find((v) => v.id === effectiveVersionId.value) || null,
)
const openDraft = computed(
  () => versions.value.find((v) => ['DRAFT', 'REJECTED'].includes(v.statusId)) || null,
)
const versionUnderReview = computed(
  () => versions.value.find((v) => v.statusId === 'UNDER_REVIEW') || null,
)

// Document parity: an EFFECTIVE log book is locked. Its schema + settings
// can only change through a new version (Create new version → edit the
// draft → submit for approval). The Details form is editable only while
// there's no effective version yet, or there's an open editable draft to
// edit. Otherwise it's read-only.
const lockedAsEffective = computed(() => hasEffectiveVersion.value && !openDraft.value)
const canEditDetails = computed(() => canUpdate.value && !lockedAsEffective.value)

// Owner of this log book (drives the approval flow). isOwner is for
// display/accountability; the actual submit/discard/new-version actions
// are gated on the manage permission (canManageVersion), matching the
// rest of the controlled flow.
const isOwner = computed(
  () => !!logBook.value?.ownerUserId && logBook.value.ownerUserId === currentSession.value?.userId,
)
const canManageVersion = computed(() => canUpdate.value)
// A draft can be discarded only when there's an effective version to fall
// back to (the very first draft has none — delete the log book instead).
const canDiscardDraft = computed(
  () => canManageVersion.value && !!openDraft.value && hasEffectiveVersion.value,
)

function versionLabel(v) {
  return `v${v.versionMajor ?? 1}.${v.versionMinor ?? 0}`
}

// The current user's active approval task on the version under review —
// drives the read-only review banner. TaskActionBar re-queries the same
// task independently to render the action buttons.
const myReviewTask = useLiveQueryWithDeps(
  [() => versionUnderReview.value?.id, () => currentSession.value?.userId],
  async (db, [versionId, userId]) => {
    if (!versionId || !userId) return null
    const tasks = await db.TaskInstance.where('[entityType+entityId]', [
      'LogBookVersion',
      versionId,
    ]).exec()
    return (
      tasks.find(
        (t) => t.assignedTo === userId && ['ASSIGNED', 'FORM_SUBMITTED'].includes(t.statusId),
      ) || null
    )
  },
  { models: ['TaskInstance'] },
)
const isReviewing = computed(() => !!versionUnderReview.value && !!myReviewTask.value)
// Scratch model for the read-only schema preview in the review banner.
const reviewPreviewData = ref({})

// ─── Submit-for-approval + new-draft actions ───────────────────────
const submitDialog = reactive({ open: false, versionId: null })

function openSubmit(version) {
  if (!canUpdate.value) return
  if (!draft.value?.workflowVersionId) {
    toast.error('Attach an approval workflow on the Details tab first')
    activeTab.value = 'details'
    return
  }
  submitDialog.versionId = version.id
  submitDialog.open = true
}

const creatingDraft = ref(false)
async function createNewDraft() {
  if (!canManageVersion.value || creatingDraft.value) return
  creatingDraft.value = true
  try {
    await post(`/v1/services/logBooks/${props.id}/versions`, {})
    toast.success('New draft created — edit its schema, then submit for approval')
    activeTab.value = 'versions'
  } catch (err) {
    toast.error(err?.message || 'Failed to create draft')
  } finally {
    creatingDraft.value = false
  }
}

const discardingDraft = ref(false)
async function discardDraft() {
  const target = openDraft.value
  if (!canDiscardDraft.value || !target || discardingDraft.value) return
  if (
    !(await confirm({
      title: 'Discard draft',
      message: `Discard ${versionLabel(target)}? This permanently deletes the draft. The current effective version stays in use.`,
      okLabel: 'Discard',
      danger: true,
    }))
  ) {
    return
  }
  discardingDraft.value = true
  try {
    await del(`/v1/services/logBookVersions/${target.id}`)
    toast.success('Draft discarded')
  } catch (err) {
    toast.error(err?.message || 'Failed to discard draft')
  } finally {
    discardingDraft.value = false
  }
}

// ─── Archive / restore ─────────────────────────────────────────────
async function archive() {
  if (
    !(await confirm({
      title: 'Archive log book',
      message: 'Archive this log book? It will stop appearing as an option for new entries.',
      okLabel: 'Archive',
      danger: true,
    }))
  ) {
    return
  }
  try {
    await del(`/v1/services/logBooks/${props.id}`)
    toast.success('Log book archived')
    router.push(getCompanyPath('/inspections-logs/templates'))
  } catch (err) {
    toast.error(err?.message || 'Failed to archive')
  }
}

// ─── BaseDetailLayout config ──────────────────────────────────────────────────
const breadcrumbs = computed(() => [
  { label: 'Log Books', to: getCompanyPath('/inspections-logs/templates') },
  { label: logBook.value?.title || 'Log Book' },
])
const logBookActions = computed(() =>
  buildLogBookActions({ canUpdate: canUpdate.value, hasLogBook: !!logBook.value }, { archive }),
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
      <span> · schema v{{ logBook.schemaVersion }}</span>
      <span v-if="isSaving" class="tw:text-amber-600"> · saving…</span>
    </template>

    <template #actions>
      <DetailActionBar :actions="logBookActions" />
    </template>

    <template v-if="logBook" #section-details>
      <!-- Tab strip -->
      <BaseTabs v-model="activeTab" :tabs="tabs" ariaLabel="Log book sections">
        <div class="tw:mt-6">
          <!-- Details tab -->
          <BaseTabPanel value="details">
            <div v-if="draft" class="tw:flex tw:flex-col tw:gap-4">
              <!-- Version & approval — the controlled-flow control centre.
             Approver sees Approve/Reject; owner sees Submit / Discard /
             Create new version depending on the version state. -->
              <section
                class="tw:bg-white tw:rounded-lg tw:border tw:border-divider tw:p-4 tw:space-y-3"
              >
                <div class="tw:flex tw:items-start tw:justify-between tw:gap-3 tw:flex-wrap">
                  <div>
                    <BaseText as="h3" class="tw:text-sm tw:font-semibold tw:text-on-main">
                      Version &amp; approval
                    </BaseText>
                    <div class="tw:text-xs tw:text-secondary tw:mt-0.5">
                      <template v-if="hasEffectiveVersion">
                        Effective:
                        <span class="tw:font-mono tw:text-on-main">{{ logBook.code }}</span>
                        <span v-if="effectiveVersion"> · {{ versionLabel(effectiveVersion) }}</span>
                      </template>
                      <template v-else
                        >No effective version yet — entries can't be logged until one is
                        approved.</template
                      >
                    </div>
                  </div>
                  <div class="tw:flex tw:items-center tw:gap-2 tw:flex-wrap">
                    <span
                      v-if="openDraft"
                      class="tw:flex tw:items-center tw:gap-1 tw:text-xs tw:text-secondary"
                    >
                      {{ versionLabel(openDraft) }}
                      <LogBookVersionStatusBadge :statusId="openDraft.statusId" />
                    </span>
                    <span
                      v-else-if="versionUnderReview"
                      class="tw:flex tw:items-center tw:gap-1 tw:text-xs tw:text-secondary"
                    >
                      {{ versionLabel(versionUnderReview) }}
                      <LogBookVersionStatusBadge :statusId="versionUnderReview.statusId" />
                    </span>
                    <span class="tw:flex tw:items-center tw:gap-1 tw:text-xs tw:text-secondary">
                      Owner:
                      <UserBadgeById v-if="logBook.ownerUserId" :userId="logBook.ownerUserId" />
                      <span v-else>—</span>
                      <span v-if="isOwner" class="tw:text-micro tw:font-semibold tw:text-primary"
                        >(you)</span
                      >
                    </span>
                  </div>
                </div>

                <!-- A) Approver — your approval is requested. -->
                <div
                  v-if="isReviewing"
                  class="tw:bg-amber-50 tw:border tw:border-amber-200 tw:rounded tw:p-3 tw:space-y-3"
                >
                  <div class="tw:flex tw:items-center tw:justify-between tw:gap-3 tw:flex-wrap">
                    <span class="tw:text-sm tw:font-semibold tw:text-amber-900">
                      Your approval is requested — {{ versionLabel(versionUnderReview) }}
                    </span>
                    <TaskActionBar entityType="LogBookVersion" :entityId="versionUnderReview.id" />
                  </div>
                  <p v-if="versionUnderReview.changeSummary" class="tw:text-sm tw:text-amber-900">
                    <span class="tw:font-semibold">Change summary:</span>
                    {{ versionUnderReview.changeSummary }}
                  </p>
                  <div class="tw:grid tw:grid-cols-2 tw:md:grid-cols-4 tw:gap-2 tw:text-xs">
                    <div class="tw:bg-white tw:rounded tw:p-2 tw:border tw:border-amber-200">
                      <div class="tw:text-secondary">Classification</div>
                      <div class="tw:font-medium tw:text-on-main">
                        {{ versionUnderReview.recordClassification?.replace('_', ' ') }}
                      </div>
                    </div>
                    <div class="tw:bg-white tw:rounded tw:p-2 tw:border tw:border-amber-200">
                      <div class="tw:text-secondary">Edit window</div>
                      <div class="tw:font-medium tw:text-on-main">
                        {{ versionUnderReview.editWindowMode?.replace(/_/g, ' ')
                        }}{{
                          versionUnderReview.editWindowMode === 'TIME_WINDOW'
                            ? ` (${versionUnderReview.editWindowMinutes ?? '?'}m)`
                            : ''
                        }}
                      </div>
                    </div>
                    <div class="tw:bg-white tw:rounded tw:p-2 tw:border tw:border-amber-200">
                      <div class="tw:text-secondary">E-signature</div>
                      <div class="tw:font-medium tw:text-on-main">
                        {{ versionUnderReview.signatureRequired ? 'Required' : 'Not required' }}
                      </div>
                    </div>
                    <div class="tw:bg-white tw:rounded tw:p-2 tw:border tw:border-amber-200">
                      <div class="tw:text-secondary">Reviewer approval</div>
                      <div class="tw:font-medium tw:text-on-main">
                        {{ versionUnderReview.reviewRequired ? 'Required' : 'Not required' }}
                      </div>
                    </div>
                  </div>
                  <details class="tw:bg-white tw:rounded tw:border tw:border-amber-200">
                    <summary
                      class="tw:cursor-pointer tw:px-3 tw:py-2 tw:text-sm tw:font-medium tw:text-on-main"
                    >
                      Review form schema ({{ versionUnderReview.schema?.length ?? 0 }} fields)
                    </summary>
                    <div class="tw:p-4 tw:border-t tw:border-amber-200">
                      <DynamicForm
                        v-if="(versionUnderReview.schema?.length ?? 0) > 0"
                        v-model="reviewPreviewData"
                        :fields="versionUnderReview.schema"
                      />
                      <div v-else class="tw:text-sm tw:text-secondary">No fields defined.</div>
                    </div>
                  </details>
                </div>

                <!-- B) Owner — an editable draft is open: submit or discard it. -->
                <div
                  v-else-if="openDraft && canManageVersion"
                  class="tw:flex tw:items-center tw:justify-between tw:gap-3 tw:flex-wrap tw:bg-main-hover tw:rounded tw:p-3"
                >
                  <div class="tw:text-sm tw:text-on-main">
                    <template v-if="openDraft.statusId === 'REJECTED'">
                      {{ versionLabel(openDraft) }} was rejected — edit it and resubmit, or discard
                      it.
                    </template>
                    <template v-else>
                      Editing draft {{ versionLabel(openDraft) }}. Submit it for approval when
                      ready.
                    </template>
                  </div>
                  <div class="tw:flex tw:items-center tw:gap-2">
                    <BaseButton variant="primary" size="sm" @click="openSubmit(openDraft)">
                      <IconSend :size="14" />
                      Submit for approval
                    </BaseButton>
                    <BaseButton
                      v-if="canDiscardDraft"
                      variant="secondary"
                      size="sm"
                      :loading="discardingDraft"
                      @click="discardDraft"
                    >
                      <IconTrash :size="14" />
                      Discard draft
                    </BaseButton>
                  </div>
                </div>

                <!-- C) A version is under review (current user isn't the approver). -->
                <div
                  v-else-if="versionUnderReview"
                  class="tw:bg-main-hover tw:rounded tw:p-3 tw:text-sm tw:text-secondary"
                >
                  {{ versionLabel(versionUnderReview) }} is awaiting approval.
                </div>

                <!-- D) Effective with no open draft — create a new version to change anything. -->
                <div
                  v-else-if="lockedAsEffective"
                  class="tw:flex tw:items-center tw:justify-between tw:gap-3 tw:flex-wrap tw:bg-main-hover tw:rounded tw:p-3"
                >
                  <div class="tw:text-sm tw:text-secondary">
                    This log book is effective and locked. Create a new version to change its schema
                    or settings — the current version stays in use until the new one is approved.
                  </div>
                  <BaseButton
                    v-if="canManageVersion"
                    variant="primary"
                    size="sm"
                    :loading="creatingDraft"
                    @click="createNewDraft"
                  >
                    <IconPlus :size="14" />
                    Create new version
                  </BaseButton>
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
                  <BaseField v-slot="{ id: fieldId }" label="Category">
                    <select
                      :id="fieldId"
                      v-model="draft.logBookTypeId"
                      :disabled="!canEditDetails"
                      class="tw:w-full tw:rounded tw:border tw:border-divider tw:bg-card tw:px-3 tw:py-1.5 tw:text-sm"
                    >
                      <option :value="null">— Uncategorised —</option>
                      <option v-for="t in logBookTypes" :key="t.id" :value="t.id">
                        {{ t.name }}
                      </option>
                    </select>
                  </BaseField>
                  <BaseField
                    label="Owner"
                    hint="Owns the approval flow — submits versions for approval and manages drafts."
                  >
                    <UserSelectMenu v-model="draft.ownerUserId" :disabled="!canEditDetails" />
                  </BaseField>
                  <BaseField label="Supervisor">
                    <UserSelectMenu v-model="draft.supervisorUserId" :disabled="!canEditDetails" />
                  </BaseField>
                  <BaseField v-slot="{ id: fieldId }" label="Status">
                    <select
                      :id="fieldId"
                      v-model="draft.statusId"
                      :disabled="!canEditDetails"
                      class="tw:w-full tw:rounded tw:border tw:border-divider tw:bg-card tw:px-3 tw:py-1.5 tw:text-sm"
                    >
                      <option value="ACTIVE">Active</option>
                      <option value="INACTIVE">Inactive</option>
                      <option value="ARCHIVED">Archived</option>
                    </select>
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
                      :disabled="!canEditDetails"
                    />
                    <p class="tw:text-caption tw:text-secondary tw:italic tw:mt-1">
                      Feeds <span class="tw:font-mono">{DEPTCODE}</span> in the Record Id prefix.
                    </p>
                  </BaseField>
                </div>
              </section>

              <!-- References — equipment / location + the record-ID naming
             convention. (Department lives in Basics — it feeds {DEPTCODE}
             alongside Sites.) -->
              <section
                class="tw:bg-white tw:rounded-lg tw:border tw:border-divider tw:p-4 tw:space-y-3"
              >
                <BaseText as="h3" class="tw:text-sm tw:font-semibold tw:text-on-main"
                  >References</BaseText
                >
                <BaseField label="Equipment">
                  <EquipmentSelectMenu v-model="draft.equipmentId" :disabled="!canEditDetails" />
                </BaseField>
                <BaseField
                  v-slot="{ id: fieldId }"
                  label="Location"
                  hint="Where this log is performed. Equipment covers the asset/line; this is the spot."
                >
                  <BaseTextInput
                    :id="fieldId"
                    v-model="draft.location"
                    :disabled="!canEditDetails"
                    placeholder="e.g. Room 201, Cold Store, Line 3"
                  />
                </BaseField>
                <BaseField label="Record Id Prefix">
                  <template v-if="canEditPrefix">
                    <BaseTextInput
                      v-model="draft.codePrefix"
                      placeholder="FRM-{DEPTCODE}-{TYPECODE}"
                    />
                    <p class="tw:text-caption tw:text-secondary tw:italic tw:mt-1">
                      Tokens <span class="tw:font-mono tw:text-on-main">{DEPTCODE}</span> /
                      <span class="tw:font-mono tw:text-on-main">{TYPECODE}</span> resolve from
                      Department + Log book type on save. Current:
                      <span class="tw:font-mono tw:text-on-main">{{ logBook.code }}</span>
                    </p>
                  </template>
                  <template v-else>
                    <div class="tw:text-sm tw:text-on-main">{{ logBook.code }}</div>
                    <p class="tw:text-caption tw:text-secondary tw:italic tw:mt-1">
                      Locked — the log book has an effective version, so record IDs stay consistent.
                    </p>
                  </template>
                </BaseField>
              </section>

              <!-- Entry policy -->
              <section
                class="tw:bg-white tw:rounded-lg tw:border tw:border-divider tw:p-4 tw:space-y-3"
              >
                <BaseText as="h3" class="tw:text-sm tw:font-semibold tw:text-on-main"
                  >Entry policy</BaseText
                >
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
                  <label class="tw:flex tw:items-center tw:gap-2 tw:text-sm tw:text-on-main">
                    <input
                      v-model="draft.reviewRequired"
                      type="checkbox"
                      :disabled="!canEditDetails"
                    />
                    <span>Require reviewer approval before locking</span>
                  </label>
                </div>
                <div class="tw:bg-main-hover tw:rounded tw:p-2 tw:text-xs">
                  Saves as a
                  <strong
                    >{{ derivedClassification.replace('_', ' ').toLowerCase() }} log book</strong
                  >
                  based on the current settings.
                </div>
              </section>

              <!-- Approval workflow — versions of this log book are approved
             through this workflow before they become effective. Document
             parity: the chosen PUBLISHED workflow drives reviewer
             assignment + approve/reject via the generic engine. -->
              <section
                class="tw:bg-white tw:rounded-lg tw:border tw:border-divider tw:p-4 tw:space-y-3"
              >
                <BaseText as="h3" class="tw:text-sm tw:font-semibold tw:text-on-main">
                  Approval workflow
                </BaseText>
                <p class="tw:text-xs tw:text-secondary">
                  New versions go through this workflow for approval before becoming effective.
                  Design workflows under the <strong>Log Book</strong> module.
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
                  No workflow attached — versions can't be submitted for approval until one is set.
                </div>
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

              <!-- Sites -->
              <section
                class="tw:bg-white tw:rounded-lg tw:border tw:border-divider tw:p-4 tw:space-y-3"
              >
                <BaseText as="h3" class="tw:text-sm tw:font-semibold tw:text-on-main"
                  >Sites</BaseText
                >
                <SiteSelectMenu
                  :modelValue="assignedSiteIds"
                  multiple
                  :disabled="!canEditDetails"
                  @update:modelValue="handleSitesChange"
                />
                <div class="tw:text-xs tw:text-secondary">Leave empty to allow all sites.</div>
              </section>

              <!-- Document links -->
              <section
                class="tw:bg-white tw:rounded-lg tw:border tw:border-divider tw:p-4 tw:space-y-3"
              >
                <div class="tw:flex tw:items-center tw:justify-between">
                  <BaseText as="h3" class="tw:text-sm tw:font-semibold tw:text-on-main">
                    Document links ({{ documentLinks.length }})
                  </BaseText>
                  <BaseButton v-if="canUpdate" variant="ghost" @click="showAddDocDialog = true">
                    Link a document
                  </BaseButton>
                </div>
                <div v-if="documentLinks.length === 0" class="tw:text-xs tw:text-secondary">
                  No documents linked. Use this to mark which SOPs / work instructions this log book
                  implements — useful in audits.
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
              <FormSection title="Log book schema">
                <template #actions>
                  <BaseButton
                    variant="primary"
                    :disabled="!canEditDetails || isSavingSchema"
                    @click="openSchemaBuilder"
                  >
                    <IconDeviceFloppy :size="16" />
                    {{ (logBook.schema?.length ?? 0) > 0 ? 'Edit schema' : 'Build schema' }}
                  </BaseButton>
                </template>
                <p class="tw:text-sm tw:text-secondary">
                  {{
                    (logBook.schema?.length ?? 0) > 0
                      ? `${logBook.schema.length} field${logBook.schema.length === 1 ? '' : 's'} defined. Saving in the builder bumps schemaVersion (currently v${logBook.schemaVersion}).`
                      : 'No fields yet. Open the builder to drag-and-drop the form structure.'
                  }}
                </p>
              </FormSection>

              <!-- Interactive preview pane — same DynamicForm a floor user
             gets at submission time, wrapped in the FormBuilder's
             "Form Preview" card styling. No submit button: this is
             pure preview, nothing posts. Authors can fill fields to
             test conditional / required logic visually before opening
             the builder. -->
              <section
                v-if="(logBook.schema?.length ?? 0) > 0"
                class="tw:bg-sidebar tw:border tw:border-divider tw:rounded-2xl tw:shadow-xl tw:overflow-hidden"
              >
                <div class="tw:bg-main tw:px-5 tw:py-3 tw:border-b tw:border-divider">
                  <div class="tw:text-xl tw:font-bold tw:text-on-sidebar">Form Preview</div>
                  <div class="tw:text-xs tw:text-secondary tw:mt-0.5">
                    Preview only — nothing is saved. Use the "Edit schema" button to make changes.
                  </div>
                </div>
                <div class="tw:p-5">
                  <DynamicForm v-model="schemaPreviewData" :fields="logBook.schema" />
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

          <!-- Versions tab — the controlled-version history + approval
               actions. Submit hands a DRAFT to the attached workflow; New
               draft branches a fresh editable version off the effective one. -->
          <BaseTabPanel value="versions">
            <div class="tw:flex tw:flex-col tw:gap-3">
              <section class="tw:bg-white tw:rounded-lg tw:border tw:border-divider tw:p-4">
                <div class="tw:flex tw:items-start tw:justify-between tw:gap-3 tw:mb-3">
                  <div>
                    <BaseText as="h3" class="tw:text-base tw:font-semibold tw:text-on-main">
                      Versions
                    </BaseText>
                    <div class="tw:text-xs tw:text-secondary">
                      A version becomes effective once approved. Only the effective version is used
                      for new entries.
                    </div>
                  </div>
                  <BaseButton
                    v-if="canUpdate && hasEffectiveVersion && !openDraft"
                    variant="primary"
                    :disabled="creatingDraft"
                    @click="createNewDraft"
                  >
                    <IconPlus :size="16" />
                    New draft
                  </BaseButton>
                </div>

                <div
                  v-if="!hasEffectiveVersion"
                  class="tw:bg-amber-50 tw:text-amber-800 tw:border tw:border-amber-200 tw:rounded tw:p-2 tw:text-xs tw:mb-3"
                >
                  No effective version yet — this log book can't accept entries until a version is
                  approved.
                </div>

                <div
                  v-if="versions.length === 0"
                  class="tw:flex tw:flex-col tw:items-center tw:gap-2 tw:py-8 tw:text-secondary"
                >
                  <IconGitBranch :size="32" class="tw:opacity-60" />
                  <div class="tw:text-sm">No versions yet.</div>
                </div>

                <div v-else class="tw:flex tw:flex-col tw:gap-2">
                  <div
                    v-for="v in versions"
                    :key="v.id"
                    class="tw:flex tw:items-center tw:justify-between tw:gap-3 tw:rounded tw:border tw:border-divider tw:p-3"
                    :class="
                      v.id === effectiveVersionId ? 'tw:bg-green-50/40 tw:border-green-200' : ''
                    "
                  >
                    <div class="tw:min-w-0">
                      <div class="tw:flex tw:items-center tw:gap-2">
                        <span class="tw:text-sm tw:font-semibold tw:text-on-main">
                          {{ versionLabel(v) }}
                        </span>
                        <LogBookVersionStatusBadge :statusId="v.statusId" />
                        <span
                          v-if="v.id === effectiveVersionId"
                          class="tw:text-micro tw:font-bold tw:uppercase tw:text-green-700"
                        >
                          Current
                        </span>
                      </div>
                      <div
                        v-if="v.changeSummary"
                        class="tw:text-xs tw:text-secondary tw:truncate tw:mt-0.5"
                      >
                        {{ v.changeSummary }}
                      </div>
                    </div>
                    <div class="tw:flex tw:items-center tw:gap-2 tw:shrink-0">
                      <BaseButton
                        v-if="canUpdate && ['DRAFT', 'REJECTED'].includes(v.statusId)"
                        variant="primary"
                        size="sm"
                        @click="openSubmit(v)"
                      >
                        <IconSend :size="14" />
                        Submit for approval
                      </BaseButton>
                      <span
                        v-else-if="v.statusId === 'UNDER_REVIEW'"
                        class="tw:text-xs tw:text-secondary tw:italic"
                      >
                        Awaiting approval
                      </span>
                    </div>
                  </div>
                </div>
              </section>
            </div>
          </BaseTabPanel>
        </div>
      </BaseTabs>
    </template>
  </BaseDetailLayout>

  <!-- Submit-for-approval dialog (reviewer-per-step picker). -->
  <LogBookVersionSubmitDialog
    v-if="submitDialog.versionId"
    v-model="submitDialog.open"
    :versionId="submitDialog.versionId"
    :workflowVersionId="draft?.workflowVersionId || null"
  />

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
      <div
        v-if="showSchemaBuilder"
        class="tw:fixed tw:inset-0 tw:flex tw:flex-col tw:bg-main tw:z-max"
      >
        <div class="tw:flex tw:flex-col tw:h-full tw:flex-nowrap">
          <!-- Header -->
          <div
            class="tw:flex tw:items-center tw:border-b tw:border-divider tw:py-3 tw:px-4 tw:shrink-0"
          >
            <div class="tw:flex tw:items-center tw:gap-2">
              <div class="tw:text-lg tw:font-medium tw:text-on-main">
                {{ logBook?.title || 'Log book schema' }}
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
              title="Log book schema"
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
