<script setup>
import { getCompanyPath } from '@/utils/routeHelpers.js'
import { isAllowed, currentSession, canUseAi } from '@/utils/currentSession.js'
import { useDocuments } from '@/composables/useDocuments.js'
// Bespoke header controls still need these; the toolbar buttons are now
// DetailActionBar descriptors (icons live in documentDetailConfig.js).
import { IconChevronDown, IconSparkles, IconGitCompare, IconAlertTriangle } from '@tabler/icons-vue'
import {
  buildDocumentBanners,
  buildDocumentTabs,
  buildDocumentActions,
} from './documentDetailConfig.js'

const props = defineProps({
  id: {
    type: String,
    required: true,
  },
})

const toast = useToast()
const router = useRouter()
const { setEffective, cancelReview, deleteDraftVersion } = useDocuments()

// State
const document = useLiveQueryWithDeps(
  [() => props.id],
  async (db, [id]) => {
    return db.Document.findByPk(id)
  },
  { models: ['Document'] },
)
const versions = useLiveQueryWithDeps(
  [() => props.id],
  async (db, [id]) => {
    return db.DocumentVersion.where('documentId', id).orderBy('createdAt', 'desc').exec()
  },
  { initial: [], models: ['DocumentVersion', 'Document'] },
)

// Latest SURVIVING version — drives the next version number + section/training
// cloning. Deliberately excludes soft-deleted versions: a draft that was
// created and then deleted must free its version number, otherwise the next
// draft skips ahead (v1 → delete v2 → v3.0) and leaves an auditable gap. Since
// a new version can't be started while a draft is in flight (see canCreate),
// the latest survivor here is always the highest committed version.
const latestVersion = useLiveQueryWithDeps(
  [() => props.id],
  async (db, [documentId]) => {
    return db.DocumentVersion.where('documentId', documentId).orderBy('createdAt', 'desc').first()
  },
  { models: ['DocumentVersion'] },
)

const selectedVersion = ref(null)
const showAuditLog = ref(false)
const showRevisionHistory = ref(false)

// ─── AI: summary + diff dialogs (Phase 4) ─────────────────────────────────
const showAiSummary = ref(false)
const showAiDiff = ref(false)
// Diff requires a predecessor version; pick the one immediately older than
// the currently-selected version by createdAt.
const aiDiffFromVersion = computed(() => {
  if (!selectedVersion.value || !versions.value?.length) return null
  const sorted = [...versions.value].sort(
    (a, b) => (a.createdAt?.toMillis?.() ?? 0) - (b.createdAt?.toMillis?.() ?? 0),
  )
  const idx = sorted.findIndex((v) => v.id === selectedVersion.value.id)
  return idx > 0 ? sorted[idx - 1] : null
})
const canShowAiDiff = computed(() => !!selectedVersion.value && !!aiDiffFromVersion.value)
// Lookup-style helper (the existing `versionLabel` computed already derives
// the label for the currently-selected version; this one accepts any version
// — used for the diff dialog's "from" version, which isn't selectedVersion).
function versionLabelFor(v) {
  if (!v) return ''
  return v.versionLabel || `${v.versionMajor ?? '?'}.${v.versionMinor ?? '?'}`
}

function openPrintView() {
  if (!document.value?.id) return
  // Centralised print: /<companyCode>/print?module=Document&id=...&versionId=...
  // The print module registry (components/print/modules/index.js) dispatches
  // to DocumentPrint.vue, which wraps PrintLayout for shared chrome.
  const params = new URLSearchParams({ module: 'Document', id: document.value.id })
  if (selectedVersion.value?.id) params.set('versionId', selectedVersion.value.id)
  const url = getCompanyPath(`/print?${params.toString()}`)
  window.open(url, '_blank', 'noopener,noreferrer')
}

// Resolve all related entity IDs for the audit dialog so the unified history
// includes the Document row, its Versions, their Sections, and any Links.
const auditRelatedSections = useLiveQueryWithDeps(
  [() => versions.value?.map((v) => v.id).join(',') ?? ''],
  async (db) => {
    const ids = versions.value?.map((v) => v.id) ?? []
    if (!ids.length) return []
    const sections = await Promise.all(
      ids.map((id) => db.DocumentSection.where('documentVersionId', id).exec()),
    )
    return sections.flat().map((s) => s.id)
  },

  { models: ['DocumentSection'], initial: [] },
)

const auditRelatedLinks = useLiveQueryWithDeps(
  [() => props.id],
  async (db, [id]) => {
    if (!id) return []
    const links = await db.DocumentLink.where().exec()
    return links.filter((l) => l.documentId === id || l.relatedDocumentId === id).map((l) => l.id)
  },

  { models: ['DocumentLink'], initial: [] },
)

const auditIncludeEntities = computed(() => [
  { entityType: 'Documents', entityIds: [props.id] },
  { entityType: 'DocumentVersions', entityIds: versions.value?.map((v) => v.id) ?? [] },
  { entityType: 'DocumentSections', entityIds: auditRelatedSections.value ?? [] },
  { entityType: 'DocumentLinks', entityIds: auditRelatedLinks.value ?? [] },
])

// Find an open task on any version of this document for the current user.
// Used to auto-select the version with the active task on first load.
const activeTaskVersionId = useLiveQueryWithDeps(
  [() => versions.value?.map((v) => v.id).join(','), () => currentSession.value?.userId],
  async (db, [versionIdsStr, userId]) => {
    if (!versionIdsStr || !userId) return null
    const versionIds = versionIdsStr.split(',')
    for (const versionId of versionIds) {
      const tasks = await db.TaskInstance.where('[entityType+entityId]', [
        'DocumentVersion',
        versionId,
      ]).exec()
      const match = tasks.find(
        (t) => t.assignedTo === userId && ['ASSIGNED', 'FORM_SUBMITTED'].includes(t.statusId),
      )
      if (match) return versionId
    }
    return null
  },
  { models: ['TaskInstance', 'DocumentVersion'] },
)

// Auto-select version when versions list changes.
// Prefer the version with an open task for the current user when available.
watch([versions, activeTaskVersionId], ([list, taskVersionId]) => {
  if (!list?.length) {
    selectedVersion.value = null
    return
  }
  const currentId = selectedVersion.value?.id
  const taskMatch = taskVersionId ? list.find((v) => v.id === taskVersionId) : null
  const currentMatch = currentId ? list.find((v) => v.id === currentId) : null
  selectedVersion.value = taskMatch ?? currentMatch ?? list[0]
})

const hasActiveTaskOnSelected = computed(
  () => !!activeTaskVersionId.value && selectedVersion.value?.id === activeTaskVersionId.value,
)

// workflow preview dialog state
const showPreviewDialog = ref(false)

// Main-content tab (drives BaseDetailLayout's panel tabs) so the training
// reminder can jump the author to the Training tab.
const activeContentTab = ref('content')

// Change Control only applies to a REVISION — it captures what changed versus
// the prior version. The first draft (v1.0, no earlier version) has nothing to
// compare against, so the tab is hidden until a revision exists. (Hoisted from
// the dissolved DocumentsMainContent wrapper.)
const isRevisionVersion = computed(() => {
  const sel = selectedVersion.value
  if (!sel) return false
  return versions.value.some(
    (v) =>
      v.versionMajor < sel.versionMajor ||
      (v.versionMajor === sel.versionMajor && v.versionMinor < sel.versionMinor),
  )
})
// If the active tab gets hidden (e.g. switching to the first version), fall back.
watch(isRevisionVersion, (isRev) => {
  if (!isRev && activeContentTab.value === 'changeControl') activeContentTab.value = 'content'
})

// Submit-for-review training reminder. Training defaults on; a version with
// training enabled but no audience (roles/users) would launch nothing on
// effective, so we block submit until the author sets an audience or disables
// training. Assessment stays optional (read-and-acknowledge is allowed).
const showTrainingReminder = ref(false)

// Collaborators get a REVIEW task when added. Before submitting for review we
// remind the owner to confirm their collaborators have finished (they can still
// proceed — it's an attestation, not a hard block).
const showCollaboratorReminder = ref(false)
const openCollaboratorTasks = useLiveQueryWithDeps(
  [() => props.id],
  async (db, [id]) => {
    const tasks = await db.TaskInstance.where('[entityType+entityId]', ['Document', id]).exec()
    return tasks.filter(
      (t) =>
        t.sourceType === 'DocumentCollaborator' && ['ASSIGNED', 'IN_PROGRESS'].includes(t.statusId),
    )
  },
  { models: ['TaskInstance'], initial: [] },
)

const trainingAudienceMissing = computed(() => {
  const tc = selectedVersion.value?.trainingConfig
  if (!tc?.enabled) return false
  return !(tc.curriculumIds?.length || tc.userIds?.length)
})
const trainingAssessmentMissing = computed(
  () =>
    !!selectedVersion.value?.trainingConfig?.enabled &&
    !selectedVersion.value?.trainingConfig?.assessment?.length,
)

// ── Submit-for-review completeness gate ──────────────────────────────────
// A draft can't go for review until every section is filled in: a non-blank
// title plus content (rich text for text sections, ≥1 file for attachment
// sections). A document with no sections at all is incomplete too.
const selectedVersionSections = useLiveQueryWithDeps(
  [() => selectedVersion.value?.id],
  async (db, [versionId]) =>
    versionId
      ? db.DocumentSection.where('documentVersionId', versionId).orderBy('order', 'asc').exec()
      : [],
  { initial: [], models: ['DocumentSection'] },
)

function isBlankRichText(html) {
  if (!html) return true
  // Strip tags + non-breaking spaces; whitespace-only counts as blank.
  const text = String(html)
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return text.length === 0
}

function sectionIsIncomplete(section) {
  if (!section.title || !section.title.trim()) return true
  const files = section.attachments
  const hasFiles = Array.isArray(files) ? files.length > 0 : !!files
  if (section.sectionType === 'attachment') return !hasFiles
  // 'textAttachment' carries both, so both are required — a section that
  // declares it needs supporting files is not complete without them.
  if (section.sectionType === 'textAttachment') {
    return isBlankRichText(section.content) || !hasFiles
  }
  // text (default) — needs non-blank content
  return isBlankRichText(section.content)
}

const incompleteSections = computed(() => selectedVersionSections.value.filter(sectionIsIncomplete))
const showIncompleteDialog = ref(false)

// ─── AI: section-aware drafting (view page) ───────────────────────────────
// Draft/improve the body of the current draft version's sections in place. Only
// available while the selected version is editable (DRAFT / REJECTED).
const showDraftSectionsDialog = ref(false)
const isVersionEditable = computed(
  () => canEdit.value && ['DRAFT', 'REJECTED'].includes(selectedVersion.value?.statusId),
)
const canDraftWithAi = computed(
  () => canUseAi.value && isOwnerOrAuthor.value && isVersionEditable.value,
)

const applyAiSections = useLiveMutation(async (db, sections) => {
  // Match each returned section to the current version's row by title (index
  // fallback), and write only the ones the AI actually changed.
  const existing = await db.DocumentSection.where('documentVersionId', selectedVersion.value.id)
    .orderBy('order', 'asc')
    .exec()
  const byTitle = new Map(existing.map((s) => [s.title?.trim().toLowerCase(), s]))
  let applied = 0
  for (let i = 0; i < sections.length; i++) {
    const out = sections[i]
    if (!out.changed) continue
    const target = byTitle.get(out.title?.trim().toLowerCase()) ?? existing[i]
    if (!target) continue
    target.content = out.content
    await target.save()
    applied++
  }
  return applied
})

async function handleAiSectionsDraft({ sections }) {
  try {
    const applied = await applyAiSections(sections)
    toast.success(
      applied
        ? `AI draft applied to ${applied} section${applied === 1 ? '' : 's'}.`
        : 'No changes to apply.',
    )
  } catch (e) {
    toast.error(e?.message || 'Failed to apply AI draft.')
  }
}

// Permissions
// Co-author model: the Owner (userId, accountable) OR the Author (authorId,
// originator) OR a company owner may drive the document's content / version /
// submit affordances. NOTE: the session user id is `userId` — `currentSession.id`
// is overridden by the active-company spread (membership id), so comparing `.id`
// here always failed and ownership silently fell back to company-owner only.
const isOwnerOrAuthor = computed(() => {
  const uid = currentSession.value?.userId
  return (
    (!!uid && (uid === document.value?.userId || uid === document.value?.authorId)) ||
    currentSession.value?.isOwner === true
  )
})
// Company owner only — matches the backend `setEffective` gate (manual
// effective is a company-owner action, not a document-owner one).
const isCompanyOwner = computed(() => currentSession.value?.isOwner === true)

// A new version may only be started once the current (latest) version has
// finished its lifecycle — i.e. it is APPROVED or EFFECTIVE. This blocks a new
// version while the latest is still DRAFT, IN_REVIEW, CHANGES_REQUESTED, or
// REJECTED (a rejected version is fixed and resubmitted in place, not
// superseded by a fresh version). Checking the LATEST version — not `every`
// version — avoids the trap where prior versions auto-transition to SUPERSEDED
// and would otherwise block new versions forever.
const canCreate = computed(() => {
  const latestApproved = ['APPROVED', 'EFFECTIVE'].includes(latestVersion.value?.statusId)
  return (
    isAllowed(['document_control:create']) &&
    document.value?.statusId !== 'ARCHIVED' &&
    latestApproved
  )
})
const canEdit = computed(
  () => isAllowed(['document_control:update']) && document.value?.statusId !== 'ARCHIVED',
)
const canDelete = computed(() => isAllowed(['document_control:delete']) && isOwnerOrAuthor.value)
// OB-01 reconcile: archiving (obsoletion) is gated on the delete permission only
// — the SAME check the list view uses, and the one the documents UPDATE/DELETE
// RLS actually enforces (permission + scope tier + owner bypass, NOT owner/author).
// Previously the detail used canDelete (which adds an owner/author restriction the
// backend never applies), so a delete-permitted Document Controller could archive
// from the list but not the detail. isAllowed() folds in the company-owner bypass.
const canArchive = computed(() => isAllowed(['document_control:delete']))
const canSubmitForReview = computed(
  () =>
    canEdit.value &&
    isOwnerOrAuthor.value &&
    ['DRAFT', 'REJECTED'].includes(selectedVersion.value?.statusId) &&
    !!document.value?.workflowVersionId &&
    document.value?.statusId !== 'ARCHIVED',
)
const canCancelReview = computed(
  () =>
    canEdit.value &&
    isOwnerOrAuthor.value &&
    selectedVersion.value?.statusId === 'IN_REVIEW' &&
    selectedVersion.value?.workflowInstanceId,
)
const canSetEffective = computed(
  () => isCompanyOwner.value && selectedVersion.value?.statusId === 'APPROVED',
)

const versionLabel = computed(() => {
  const v = selectedVersion.value
  if (!v) return ''
  return v.versionLabel || `${v.versionMajor}.${v.versionMinor}`
})

// Methods
function selectVersion(version) {
  selectedVersion.value = version
}

function handleExport() {
  toast.notify({ type: 'info', message: 'Export functionality coming soon' })
}

function handleReports() {
  toast.notify({ type: 'info', message: 'Reports functionality coming soon' })
}

// Archive opens the obsoletion dialog — DB CHECK rejects an obsoleted doc
// without a reason, so the dialog is mandatory. After the dialog stamps +
// soft-deletes the document, we navigate back to the list.
const showObsoletionDialog = ref(false)
function handleDeleteDocument() {
  showObsoletionDialog.value = true
}
function handleArchived() {
  router.push(getCompanyPath('/documents'))
}

// ── Draft deletion — hard delete, e-signed, with an audited reason ─────────
// Deleting a DRAFT/REJECTED version removes the row entirely (frees its version
// number). When it's the document's only version, the whole draft document
// goes. Both require a reason + e-sign PIN, recorded in the audit log.
const showDeleteReasonDialog = ref(false)
const showDeleteEsignDialog = ref(false)
const deleteReason = ref('')
const deleting = ref(false)
const deletingWholeDocument = computed(() => (versions.value?.length ?? 0) <= 1)

function handleDeleteVersion() {
  deleteReason.value = ''
  showDeleteReasonDialog.value = true
}

function confirmDeleteReason() {
  if (!deleteReason.value.trim()) return
  showDeleteReasonDialog.value = false
  showDeleteEsignDialog.value = true
}

async function onDeleteEsignVerified({ method, token }) {
  if (deleting.value || !selectedVersion.value) return
  deleting.value = true
  try {
    const { deletedDocument } = await deleteDraftVersion(props.id, selectedVersion.value.id, {
      method,
      token,
      reason: deleteReason.value.trim(),
    })
    showDeleteEsignDialog.value = false
    toast.success(deletedDocument ? 'Draft document deleted' : 'Draft version deleted')
    if (deletedDocument) {
      router.push(getCompanyPath('/documents'))
    }
    // Otherwise the versions live query drops the removed version and
    // watch(versions) auto-selects the next available one.
  } catch (e) {
    toast.error(e?.message || 'Failed to delete draft')
  } finally {
    deleting.value = false
  }
}

function handleSubmitForReview() {
  // Gate: every section must be complete (and at least one must exist).
  if (!selectedVersionSections.value.length || incompleteSections.value.length) {
    showIncompleteDialog.value = true
    return
  }
  // Gate: training enabled but no audience → remind before the workflow picker.
  if (trainingAudienceMissing.value) {
    showTrainingReminder.value = true
    return
  }
  // Gate: collaborator(s) still have an open task → confirm they're done.
  if (openCollaboratorTasks.value.length) {
    showCollaboratorReminder.value = true
    return
  }
  // open preview dialog instead of immediate confirmation
  showPreviewDialog.value = true
}

// Reminder action: owner confirms collaborators are done → proceed to submit.
function confirmCollaboratorAndSubmit() {
  showCollaboratorReminder.value = false
  showPreviewDialog.value = true
}

// Reminder action: jump to the Training tab to finish setup.
function goToTrainingSetup() {
  showTrainingReminder.value = false
  activeContentTab.value = 'training'
}

// Reminder action: turn training off on this version, then continue to submit.
async function disableTrainingAndSubmit() {
  const tc = selectedVersion.value?.trainingConfig
  if (tc) {
    selectedVersion.value.trainingConfig = { ...tc, enabled: false }
    try {
      await selectedVersion.value.save()
    } catch (e) {
      toast.error(e.message || 'Failed to update training setting')
      return
    }
  }
  showTrainingReminder.value = false
  showPreviewDialog.value = true
}

async function handleCancelReview() {
  const result = await cancelReview(props.id, selectedVersion.value.id)
  if (result?.error) {
    toast.error(result.error)
  } else {
    toast.success('Review cancelled successfully')
  }
}

async function handleSetEffective() {
  const result = await setEffective(props.id, selectedVersion.value.id)
  if (result.error) {
    toast.error(result.error)
  } else {
    toast.success('Document set as effective')
  }
}

// New-revision flow: open the change-control dialog first, then create
// the DocumentVersion with the captured fields. The DB CHECK constraint
// rejects v>1.0 without a change_reason, so the dialog is mandatory here.
const showNewVersionDialog = ref(false)

// Pre-loaded so the dialog can show baseline sections as a multi-select.
// Live-queried because the user may be looking at v1 sections elsewhere
// while requesting a v2 draft.
const baselineSections = useLiveQueryWithDeps(
  [() => latestVersion.value?.id],
  async (db, [versionId]) => {
    if (!versionId) return []
    return db.DocumentSection.where('documentVersionId', versionId).orderBy('order', 'asc').exec()
  },

  { models: ['DocumentSection'], initial: [] },
)

const nextVersionLabel = computed(() => {
  const major = (latestVersion.value?.versionMajor ?? 0) + 1
  return `v${major}.0`
})
const fromVersionLabel = computed(() => {
  if (!latestVersion.value) return ''
  return `v${latestVersion.value.versionMajor ?? 1}.${latestVersion.value.versionMinor ?? 0}`
})

function openNewVersionDialog() {
  showNewVersionDialog.value = true
}

async function handleNewVersionConfirm(changeControl) {
  // Defensive guard (the action is already gated by `canCreate`): never start a
  // new version unless the latest one is Approved/Effective.
  if (!['APPROVED', 'EFFECTIVE'].includes(latestVersion.value?.statusId)) {
    toast.error('The current version must be approved before creating a new version.')
    return
  }
  const create = useLiveMutation(async (db) => {
    const latestVersionSections = latestVersion.value?.id
      ? await db.DocumentSection.where('documentVersionId', latestVersion.value.id).exec()
      : []

    // Clone training_config from the previous version so the manager has a starting
    // point — they can then edit roles, users, or quiz questions for this revision
    // before the new version becomes effective.
    const clonedTrainingConfig = latestVersion.value?.trainingConfig
      ? JSON.parse(JSON.stringify(latestVersion.value.trainingConfig))
      : null

    const version = db.DocumentVersion.create({
      documentId: props.id,
      versionMajor: latestVersion.value ? latestVersion.value.versionMajor + 1 : 1,
      versionMinor: 0,
      statusId: 'DRAFT',
      trainingConfig: clonedTrainingConfig,
      // Change control captured by NewVersionDialog. DB CHECK enforces
      // changeReason !== null for any version after v1.0.
      changeReason: changeControl.changeReason,
      changeType: changeControl.changeType,
      changeSummary: changeControl.changeSummary || '',
      regulatoryImpact: changeControl.regulatoryImpact,
      regulatoryImpactNotes: changeControl.regulatoryImpactNotes || null,
      affectedSectionIds: changeControl.affectedSectionIds || [],
    })

    await version.save()

    await Promise.all(
      latestVersionSections.map((section) =>
        db.DocumentSection.create({
          documentId: version.documentId,
          documentVersionId: version.id,
          sectionType: section.sectionType,
          title: section.title,
          content: section.content,
          attachments: section.attachments,
          order: section.order,
        }).save(),
      ),
    )

    return version
  })

  const version = await create()
  // useLiveMutation toasts its own error and returns undefined on failure —
  // don't blank the version panel by assigning undefined.
  if (version) selectedVersion.value = version
}

// ─── BaseDetailLayout config ──────────────────────────────────────────────────
const breadcrumbs = computed(() => [
  { label: 'Documents', to: getCompanyPath('/documents') },
  { label: document.value?.title || 'Loading…' },
])
const documentBanners = computed(() => buildDocumentBanners(document.value))
const documentTabs = computed(() => buildDocumentTabs(isRevisionVersion.value))
const documentActions = computed(() =>
  buildDocumentActions(
    {
      canCreate: canCreate.value,
      canSubmitForReview: canSubmitForReview.value,
      canCancelReview: canCancelReview.value,
      canSetEffective: canSetEffective.value,
      canEdit: canEdit.value,
      canDelete: canDelete.value,
      canArchive: canArchive.value,
      statusId: document.value?.statusId,
      selectedStatus: selectedVersion.value?.statusId,
      inReview:
        selectedVersion.value?.statusId === 'IN_REVIEW' &&
        !!selectedVersion.value?.workflowInstanceId,
    },
    {
      createDraft: openNewVersionDialog,
      submitForReview: handleSubmitForReview,
      setEffective: handleSetEffective,
      cancelReview: handleCancelReview,
      showWorkflow() {
        if (selectedVersion.value?.workflowInstanceId) {
          router.push(
            getCompanyPath(`/workflow-instances/${selectedVersion.value.workflowInstanceId}`),
          )
        }
      },
      print: openPrintView,
      reports: handleReports,
      revisionHistory() {
        showRevisionHistory.value = true
      },
      auditLog() {
        showAuditLog.value = true
      },
      export: handleExport,
      deleteVersion: handleDeleteVersion,
      archive: handleDeleteDocument,
    },
  ),
)
const documentDetailConfig = computed(() =>
  defineDetailConfig({
    variant: 'standard',
    width: 'standard',
    breadcrumbs: breadcrumbs.value,
    banners: () => documentBanners.value,
    actions: documentActions.value,
    tabs: documentTabs.value,
  }),
)
</script>

<template>
  <BaseDetailLayout
    v-model:tab="activeContentTab"
    :config="documentDetailConfig"
    :record="document"
    :loading="!document"
    :rail="activeContentTab !== 'training'"
  >
    <template #title>
      <span v-if="document">
        {{ document.title }}
        <span v-if="document.docNumber" class="tw:text-secondary tw:font-normal">
          {{ document.docNumber }}
        </span>
      </span>
    </template>

    <template #status>
      <DocumentVersionStatusBadgeById v-if="selectedVersion" :statusId="selectedVersion.statusId" />
    </template>

    <template v-if="selectedVersion" #meta>
      <span class="">{{ document?.docNumber }}</span>
      <span> · v{{ versionLabel }} ({{ selectedVersion.statusId }})</span>
    </template>

    <template #actions>
      <div class="tw:flex tw:flex-wrap tw:items-center tw:gap-2 tw:max-sm:justify-end">
        <button
          v-if="canDraftWithAi && selectedVersion?.id"
          class="tw:inline-flex tw:items-center tw:gap-1.5 tw:rounded-lg tw:border tw:border-primary/30 tw:bg-primary/5 tw:text-primary tw:hover:bg-primary/10 tw:transition-colors tw:font-medium tw:px-2.5 tw:py-1 tw:text-xs"
          title="Use AI to draft or improve this document's sections"
          @click="showDraftSectionsDialog = true"
        >
          <IconSparkles :size="13" />
          Draft with AI
        </button>
        <button
          v-if="canUseAi && selectedVersion?.id"
          class="tw:inline-flex tw:items-center tw:gap-1.5 tw:rounded-lg tw:border tw:border-primary/30 tw:bg-primary/5 tw:text-primary tw:hover:bg-primary/10 tw:transition-colors tw:font-medium tw:px-2.5 tw:py-1 tw:text-xs"
          title="AI-generated summary of this version"
          @click="showAiSummary = true"
        >
          <IconSparkles :size="13" />
          Summarize
        </button>
        <button
          v-if="canUseAi && canShowAiDiff"
          class="tw:inline-flex tw:items-center tw:gap-1.5 tw:rounded-lg tw:border tw:border-primary/30 tw:bg-primary/5 tw:text-primary tw:hover:bg-primary/10 tw:transition-colors tw:font-medium tw:px-2.5 tw:py-1 tw:text-xs"
          :title="`Explain what changed since v${versionLabelFor(aiDiffFromVersion)}`"
          @click="showAiDiff = true"
        >
          <IconGitCompare :size="13" />
          What changed
        </button>
        <TaskActionBar
          v-if="selectedVersion?.id"
          entityType="DocumentVersion"
          :entityId="selectedVersion.id"
        />

        <!-- Version Selector -->
        <div class="tw:relative">
          <BasePopover placement="bottom-start">
            <template #button>
              <BaseButton variant="outline">
                Version: {{ versionLabel }} ({{ selectedVersion?.statusId }})
                <IconChevronDown :size="16" class="tw:ml-1" />
              </BaseButton>
            </template>
            <template #content="{ close }">
              <div class="tw:flex tw:flex-col tw:py-1 tw:min-w-48">
                <div class="tw:text-xs tw:font-semibold tw:text-secondary tw:px-3 tw:py-1">
                  Document History
                </div>
                <button
                  v-for="version in versions"
                  :key="version.id"
                  class="tw:flex tw:w-full tw:items-start tw:px-3 tw:py-2 tw:text-sm tw:hover:bg-main-hover"
                  :class="
                    version.id === selectedVersion?.id
                      ? 'tw:text-primary tw:font-semibold'
                      : 'tw:text-on-sidebar'
                  "
                  @click="
                    () => {
                      selectVersion(version)
                      close()
                    }
                  "
                >
                  Version
                  {{ version.versionLabel || `${version.versionMajor}.${version.versionMinor}` }}
                  <span
                    v-if="version.statusId === 'EFFECTIVE'"
                    class="tw:text-primary tw:font-bold tw:ml-1"
                  >
                    (Current)
                  </span>
                  <span v-else-if="version.statusId === 'DRAFT'" class="tw:text-secondary tw:ml-1">
                    (Draft)
                  </span>
                </button>
              </div>
            </template>
          </BasePopover>
        </div>

        <DetailActionBar :actions="documentActions" />
      </div>
    </template>

    <template v-if="document" #tab-content>
      <!-- The route this document takes to Effective, left to right. Sits
           above the body so "where is this and who's next" is answered before
           you start reading (user request 2026-08-15). The rail's timeline is
           the detailed, per-step view; this is the one-line summary. -->
      <DocumentApprovalFlowStrip
        :versionId="selectedVersion?.id"
        :workflowVersionId="document.workflowVersionId"
        class="tw:mb-4"
      />
      <PrintTeleport>
        <DocumentsMainContentLeft
          :documentId="props.id"
          :versionId="selectedVersion?.id"
          :reviewMode="hasActiveTaskOnSelected"
        />
      </PrintTeleport>
    </template>

    <template v-if="document && isRevisionVersion" #tab-changeControl>
      <PrintTeleport>
        <DocumentsChangeControlTab :documentId="props.id" :versionId="selectedVersion?.id" />
      </PrintTeleport>
    </template>

    <template v-if="document" #tab-training>
      <PrintTeleport>
        <DocumentsTrainingTab :documentId="props.id" :versionId="selectedVersion?.id" />
      </PrintTeleport>
    </template>

    <template v-if="document" #rail>
      <DocumentsMainContentRight
        :documentId="props.id"
        :versionId="selectedVersion?.id"
        :reviewMode="hasActiveTaskOnSelected"
        :activeTab="activeContentTab"
      />
      <!-- Read-only external-access panel — populated by workflow-step
           assignment via autoShareSupplierUsers. See SharedWithPanel.vue. -->
      <SharedWithPanel entityType="Document" :entityId="props.id" />
      <!-- Collaborator's own task — self-hides unless the viewer has one open. -->
      <DocumentCollaboratorTaskCard :documentId="props.id" />
    </template>
  </BaseDetailLayout>

  <!-- Dialogs (siblings after </BaseDetailLayout>) -->

  <DocumentWorkflowPreviewDialog
    v-model="showPreviewDialog"
    :documentId="props.id"
    :versionId="selectedVersion?.id"
  />

  <!-- Incomplete-sections reminder before submitting for review. -->
  <BaseDialog v-model="showIncompleteDialog" title="Finish all sections" maxWidth="md">
    <div class="tw:flex tw:flex-col tw:gap-3 tw:p-1">
      <div
        class="tw:flex tw:items-start tw:gap-3 tw:p-3 tw:rounded-lg tw:bg-amber-50 tw:border tw:border-amber-200"
      >
        <IconAlertTriangle :size="20" class="tw:text-amber-600 tw:shrink-0 tw:mt-0.5" />
        <div class="tw:text-sm tw:text-amber-900">
          <template v-if="!selectedVersionSections.length">
            This document has no sections yet. Add and complete at least one section before
            submitting it for review.
          </template>
          <template v-else>
            Every section needs a title and content before this document can go for review. The
            following {{ incompleteSections.length }}
            {{ incompleteSections.length === 1 ? 'section is' : 'sections are' }} still incomplete:
          </template>
        </div>
      </div>
      <ul
        v-if="incompleteSections.length"
        class="tw:flex tw:flex-col tw:gap-1 tw:text-sm tw:text-secondary tw:pl-1"
      >
        <li v-for="s in incompleteSections" :key="s.id" class="tw:flex tw:items-center tw:gap-2">
          <span class="tw:text-red-500">•</span>
          <span>{{ s.title?.trim() || 'Untitled section' }}</span>
        </li>
      </ul>
    </div>
    <template #footer="{ close }">
      <BaseButton variant="primary" @click="close">Got it</BaseButton>
    </template>
  </BaseDialog>

  <!-- Training-not-set reminder before submitting for review. -->
  <BaseDialog v-model="showTrainingReminder" title="Finish training setup" maxWidth="md">
    <div class="tw:flex tw:flex-col tw:gap-3 tw:p-1">
      <div
        class="tw:flex tw:items-start tw:gap-3 tw:p-3 tw:rounded-lg tw:bg-amber-50 tw:border tw:border-amber-200"
      >
        <IconAlertTriangle :size="20" class="tw:text-amber-600 tw:shrink-0 tw:mt-0.5" />
        <div class="tw:text-sm tw:text-amber-900">
          Training is enabled for this document but no
          <strong>audience</strong> is selected — nothing would be assigned when it becomes
          effective.
          <span v-if="trainingAssessmentMissing">
            No assessment has been added yet either (optional — leave it off for
            read-and-acknowledge).
          </span>
        </div>
      </div>
      <p class="tw:text-sm tw:text-secondary">
        Add a training audience (roles or users) on the Training tab, or disable training if this
        document doesn't need it.
      </p>
    </div>
    <template #footer="{ close }">
      <BaseButton variant="outline" @click="close">Cancel</BaseButton>
      <BaseButton variant="outline" @click="disableTrainingAndSubmit">
        Disable training &amp; submit
      </BaseButton>
      <BaseButton variant="primary" @click="goToTrainingSetup">Set up training</BaseButton>
    </template>
  </BaseDialog>

  <!-- Collaborator completion reminder (attestation; owner can proceed) -->
  <BaseDialog
    v-model="showCollaboratorReminder"
    title="Has the collaborator finished?"
    maxWidth="md"
  >
    <div class="tw:flex tw:flex-col tw:gap-3 tw:p-1">
      <div
        class="tw:flex tw:items-start tw:gap-3 tw:p-3 tw:rounded-lg tw:bg-amber-50 tw:border tw:border-amber-200"
      >
        <IconAlertTriangle :size="20" class="tw:text-amber-600 tw:shrink-0 tw:mt-0.5" />
        <div class="tw:text-sm tw:text-amber-900">
          {{ openCollaboratorTasks.length }} collaborator{{
            openCollaboratorTasks.length === 1 ? '' : 's'
          }}
          still {{ openCollaboratorTasks.length === 1 ? 'has' : 'have' }} an open task on this
          document. Have they completed their contributions?
        </div>
      </div>
      <div class="tw:flex tw:flex-wrap tw:gap-1.5">
        <UserBadgeById v-for="t in openCollaboratorTasks" :key="t.id" :userId="t.assignedTo" />
      </div>
      <p class="tw:text-sm tw:text-secondary">
        You can submit anyway — their task will stay assigned in their inbox.
      </p>
    </div>
    <template #footer="{ close }">
      <BaseButton variant="outline" @click="close">Not yet</BaseButton>
      <BaseButton variant="primary" @click="confirmCollaboratorAndSubmit">
        Submit for review
      </BaseButton>
    </template>
  </BaseDialog>

  <!-- Audit Log Dialog — covers the Document plus its Versions, Sections, and Links -->
  <AuditLogDialog
    v-model="showAuditLog"
    :includeEntities="auditIncludeEntities"
    :title="`Audit Log — ${document?.title ?? 'Document'}`"
  />

  <!-- Revision History — version-by-version change control + approval chain -->
  <DocumentRevisionHistoryDialog
    v-model="showRevisionHistory"
    :documentId="props.id"
    :documentTitle="document?.title ?? ''"
  />

  <!-- Obsoletion (archive with required reason) -->
  <DocumentObsoletionDialog
    v-model="showObsoletionDialog"
    :document="document"
    :documentTitle="document?.title ?? ''"
    :documentNumber="document?.docNumber ?? ''"
    @archived="handleArchived"
  />

  <!-- AI generation dialogs (Phase 4) -->
  <DocumentSummaryDialog
    v-model="showAiSummary"
    :versionId="selectedVersion?.id"
    :documentTitle="`${document?.title ?? 'Document'} v${versionLabelFor(selectedVersion)}`"
  />
  <DocumentDiffSummaryDialog
    v-model="showAiDiff"
    :fromVersionId="aiDiffFromVersion?.id"
    :toVersionId="selectedVersion?.id"
    :fromLabel="versionLabelFor(aiDiffFromVersion)"
    :toLabel="versionLabelFor(selectedVersion)"
  />
  <!-- Section-aware AI drafting — fills / improves the current draft's
           sections in place; highlights the sections it changed. -->
  <DocumentDraftSectionsDialog
    v-model="showDraftSectionsDialog"
    :versionId="selectedVersion?.id"
    @apply="handleAiSectionsDraft"
  />

  <!-- Draft deletion — capture a reason, then confirm with an e-sign PIN,
           then hard-delete (see deleteDraftVersion). -->
  <BaseDialog
    v-model="showDeleteReasonDialog"
    :title="deletingWholeDocument ? 'Delete draft document' : 'Delete draft version'"
    maxWidth="md"
  >
    <div class="tw:flex tw:flex-col tw:gap-3 tw:p-1">
      <div
        class="tw:flex tw:items-start tw:gap-3 tw:p-3 tw:rounded-lg tw:bg-red-50 tw:border tw:border-red-200"
      >
        <IconAlertTriangle :size="20" class="tw:text-red-600 tw:shrink-0 tw:mt-0.5" />
        <div class="tw:text-sm tw:text-red-900">
          This permanently deletes
          <template v-if="deletingWholeDocument">
            this draft document and all its content.
          </template>
          <template v-else>version {{ versionLabel }} and its content.</template>
          It can't be undone. You'll confirm with your e-signature PIN.
        </div>
      </div>
      <BaseField label="Reason for deletion" required>
        <BaseTextarea
          v-model="deleteReason"
          :rows="3"
          placeholder="Why is this draft being deleted? (recorded in the audit log)"
        />
      </BaseField>
    </div>
    <template #footer="{ close }">
      <BaseButton variant="outline" @click="close">Cancel</BaseButton>
      <BaseButton variant="danger" :disabled="!deleteReason.trim()" @click="confirmDeleteReason">
        Continue
      </BaseButton>
    </template>
  </BaseDialog>

  <WorkflowInstanceEsignAuthDialog
    v-model="showDeleteEsignDialog"
    @verified="onDeleteEsignVerified"
  />
  <DocumentsNewVersionDialog
    v-model="showNewVersionDialog"
    :baselineSections="baselineSections"
    :nextVersionLabel="nextVersionLabel"
    :fromVersionLabel="fromVersionLabel"
    @confirm="handleNewVersionConfirm"
  />
</template>
