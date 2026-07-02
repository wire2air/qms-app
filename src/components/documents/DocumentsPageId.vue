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
const { setEffective, cancelReview } = useDocuments()

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

const latestVersion = useLiveQueryWithDeps(
  [() => props.id],
  async (db, [documentId]) => {
    return db.DocumentVersion.where('documentId', documentId, { force: true })
      .orderBy('createdAt', 'desc')
      .first()
  },
  { models: ['DocumentVersion'] },
)

const selectedVersion = ref(null)
const showMessages = ref(false)
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
const trainingAudienceMissing = computed(() => {
  const tc = selectedVersion.value?.trainingConfig
  if (!tc?.enabled) return false
  return !(tc.roleIds?.length || tc.userIds?.length)
})
const trainingAssessmentMissing = computed(
  () => !!selectedVersion.value?.trainingConfig?.enabled && !selectedVersion.value?.trainingConfig?.assessment?.length,
)

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

// Create New Draft is allowed when there's no version currently in flight.
// "In flight" = a draft anyone is actively iterating on or has open for
// review. Terminal / finalized statuses (APPROVED, EFFECTIVE, REJECTED,
// SUPERSEDED, ARCHIVED) don't block a new draft.
//
// Previously this used `versions.every(v => APPROVED || EFFECTIVE)` —
// which broke after the second approval, because the prior version
// auto-transitions to SUPERSEDED and `every` then returned false forever.
const canCreate = computed(() => {
  const hasActiveDraft = versions.value.some((v) =>
    ['DRAFT', 'IN_REVIEW', 'CHANGES_REQUESTED'].includes(v.statusId),
  )
  return (
    isAllowed(['documents:create']) && document.value?.statusId !== 'ARCHIVED' && !hasActiveDraft
  )
})
const canEdit = computed(
  () => isAllowed(['documents:update']) && document.value?.statusId !== 'ARCHIVED',
)
const canDelete = computed(() => isAllowed(['documents:delete']) && isOwnerOrAuthor.value)
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

async function handleDeleteVersion() {
  await selectedVersion.value.delete()
  // watch(versions) will auto-select the next available version
}

function handleSubmitForReview() {
  // Gate: training enabled but no audience → remind before the workflow picker.
  if (trainingAudienceMissing.value) {
    showTrainingReminder.value = true
    return
  }
  // open preview dialog instead of immediate confirmation
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

  selectedVersion.value = await create()
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
      discussion() {
        showMessages.value = true
      },
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
        <AskAiButton
              v-if="canUseAi && document?.id"
              entityType="Document"
              :entityId="document.id"
              :entityTitle="document.title"
              :entityNumber="document.docNumber"
            />
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
                      {{
                        version.versionLabel || `${version.versionMajor}.${version.versionMinor}`
                      }}
                      <span
                        v-if="version.statusId === 'EFFECTIVE'"
                        class="tw:text-primary tw:font-bold tw:ml-1"
                      >
                        (Current)
                      </span>
                      <span
                        v-else-if="version.statusId === 'DRAFT'"
                        class="tw:text-secondary tw:ml-1"
                      >
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
    </template>
  </BaseDetailLayout>

  <!-- Dialogs (siblings after </BaseDetailLayout>) -->

      <!-- Messages Drawer -->
      <DocumentsMessages v-model="showMessages" :documentId="props.id" />

      <DocumentWorkflowPreviewDialog
        v-model="showPreviewDialog"
        :documentId="props.id"
        :versionId="selectedVersion?.id"
      />

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
      <DocumentsNewVersionDialog
        v-model="showNewVersionDialog"
        :baselineSections="baselineSections"
        :nextVersionLabel="nextVersionLabel"
        :fromVersionLabel="fromVersionLabel"
        @confirm="handleNewVersionConfirm"
      />
</template>
