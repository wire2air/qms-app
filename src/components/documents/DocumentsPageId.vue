<script setup>
import { getCompanyPath } from '@/utils/routeHelpers.js'
import { isAllowed, currentSession } from '@/utils/currentSession.js'
import { useDocuments } from '@/composables/useDocuments.js'
import {
  IconNotes,
  IconSend,
  IconX,
  IconChecks,
  IconChevronDown,
  IconChartBar,
  IconFileDescription,
  IconMessage,
  IconTrash,
  IconArchive,
  IconHistory,
  IconSparkles,
  IconGitCompare,
  IconPrinter,
  IconClipboardList,
} from '@tabler/icons-vue'

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
const document = useLiveQueryWithDeps([() => props.id], async (db, [id]) => {
  return db.Document.findByPk(id)
})
const versions = useLiveQueryWithDeps(
  [() => props.id],
  async (db, [id]) => {
    return db.DocumentVersion.where('documentId', id).orderBy('createdAt', 'desc').exec()
  },
  { initial: [], models: ['DocumentVersion', 'Document'] },
)

const latestVersion = useLiveQueryWithDeps([() => props.id], async (db, [documentId]) => {
  return db.DocumentVersion.where('documentId', documentId, { force: true })
    .orderBy('createdAt', 'desc')
    .first()
})

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
const canShowAiDiff = computed(
  () => !!selectedVersion.value && !!aiDiffFromVersion.value,
)
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
  { initial: [] },
)

const auditRelatedLinks = useLiveQueryWithDeps(
  [() => props.id],
  async (db, [id]) => {
    if (!id) return []
    const links = await db.DocumentLink.where().exec()
    return links
      .filter((l) => l.documentId === id || l.relatedDocumentId === id)
      .map((l) => l.id)
  },
  { initial: [] },
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

const breadcrumbs = computed(() => [
  { label: 'Documents', to: getCompanyPath('/documents') },
  { label: document.value ? document.value.title : 'Loading...' },
])

// workflow preview dialog state
const showPreviewDialog = ref(false)

// Permissions
const isOwner = computed(
  () => currentSession.value?.id === document.value?.userId || currentSession.value?.isOwner,
)

const canCreate = computed(() => {
  const allApproved = versions.value.every(
    (v) => v.statusId === 'APPROVED' || v.statusId === 'EFFECTIVE',
  )
  return isAllowed(['documents:create']) && document.value?.statusId !== 'ARCHIVED' && allApproved
})
const canEdit = computed(
  () => isAllowed(['documents:update']) && document.value?.statusId !== 'ARCHIVED',
)
const canDelete = computed(() => isAllowed(['documents:delete']) && isOwner.value)
const canSubmitForReview = computed(
  () =>
    canEdit.value &&
    isOwner.value &&
    ['DRAFT', 'REJECTED'].includes(selectedVersion.value?.statusId) &&
    !!document.value?.workflowVersionId &&
    document.value?.statusId !== 'ARCHIVED',
)
const canCancelReview = computed(
  () =>
    canEdit.value &&
    isOwner.value &&
    selectedVersion.value?.statusId === 'IN_REVIEW' &&
    selectedVersion.value?.workflowInstanceId,
)
const canSetEffective = computed(
  () => isOwner.value && selectedVersion.value?.statusId === 'APPROVED',
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
  // open preview dialog instead of immediate confirmation
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

const moreActionsItems = computed(() => {
  const items = []
  if (canDelete.value && selectedVersion.value?.statusId === 'DRAFT') {
    items.push({ name: 'Delete Version', icon: IconTrash, click: handleDeleteVersion })
  }
  if (canEdit.value) {
    items.push({ name: 'Archive Document', icon: IconArchive, click: handleDeleteDocument })
  }
  return items
})

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
  { initial: [] },
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
</script>

<template>
  <div class="tw:min-h-screen tw:bg-main">
    <SafeTeleport to="#main-header-title">
      <BaseBreadcrumbs :items="breadcrumbs" />
    </SafeTeleport>
    <!-- Loading State -->
    <div v-if="!document" class="tw:flex tw:items-center tw:justify-center tw:min-h-screen">
      <div
        class="tw:animate-spin tw:rounded-full tw:size-12 tw:border-4 tw:border-primary tw:border-t-transparent"
      />
    </div>

    <!-- Main Content -->
    <div v-else class="tw:flex tw:flex-col">
      <!-- Toolbar Section -->
      <div class="tw:bg-sidebar tw:border-b tw:border-divider tw:sticky tw:top-0 tw:z-10">
        <div
          class="tw:max-w-360 tw:mx-auto tw:px-6 tw:py-4 tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-4"
        >
          <div class="tw:flex tw:flex-wrap tw:items-center tw:gap-3">
            <AskAiButton
              v-if="document?.id"
              entityType="Document"
              :entityId="document.id"
              :entityTitle="document.title"
              :entityNumber="document.docNumber"
            />
            <button
              v-if="selectedVersion?.id"
              class="tw:inline-flex tw:items-center tw:gap-1.5 tw:rounded-lg tw:border tw:border-primary/30 tw:bg-primary/5 tw:text-primary tw:hover:bg-primary/10 tw:transition-colors tw:font-medium tw:px-2.5 tw:py-1 tw:text-xs"
              title="AI-generated summary of this version"
              @click="showAiSummary = true"
            >
              <IconSparkles :size="13" />
              Summarize
            </button>
            <button
              v-if="canShowAiDiff"
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

            <BaseButton v-if="canCreate" @click="openNewVersionDialog">
              <IconNotes :size="20" class="tw:mr-1" />
              Create New Draft
            </BaseButton>

            <BaseButton v-if="canSubmitForReview" @click="handleSubmitForReview">
              <IconSend :size="20" class="tw:mr-1" />
              Submit For Review
            </BaseButton>

            <BaseButton v-if="canCancelReview" variant="danger" @click="handleCancelReview">
              <IconX :size="20" class="tw:mr-1" />
              Cancel Review
            </BaseButton>

            <BaseButton v-if="canSetEffective" @click="handleSetEffective">
              <IconChecks :size="20" class="tw:mr-1" />
              Set Effective
            </BaseButton>

            <BaseButton
              v-if="
                selectedVersion?.statusId === 'IN_REVIEW' &&
                canEdit &&
                selectedVersion.workflowInstanceId
              "
              variant="outline"
              @click="
                router.push(
                  getCompanyPath(`/workflow-instances/${selectedVersion.workflowInstanceId}`),
                )
              "
            >
              Show Workflow
            </BaseButton>

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

            <div class="tw:h-6 tw:w-px tw:bg-divider tw:mx-2"></div>

            <BaseButton variant="secondary" @click="handleReports">
              <IconChartBar :size="20" class="tw:mr-1" />
              Reports
            </BaseButton>

            <BaseButton variant="secondary" @click="openPrintView">
              <IconPrinter :size="20" class="tw:mr-1" />
              Print
            </BaseButton>

            <BaseButton variant="secondary" @click="showRevisionHistory = true">
              <IconHistory :size="20" class="tw:mr-1" />
              Revision History
            </BaseButton>

            <BaseButton variant="secondary" @click="showAuditLog = true">
              <IconClipboardList :size="20" class="tw:mr-1" />
              Audit Log
            </BaseButton>

            <BaseButton variant="secondary" @click="handleExport">
              <IconFileDescription :size="20" class="tw:mr-1" />
              Export
            </BaseButton>

            <BaseButton variant="secondary" @click="showMessages = true">
              <IconMessage :size="20" class="tw:mr-1" />
              Discussion
            </BaseButton>
          </div>

          <div class="tw:flex tw:items-center tw:gap-2">
            <BaseMenu
              v-if="document.statusId !== 'ARCHIVED' && (canEdit || canDelete)"
              :items="moreActionsItems"
            >
              <template #trigger>
                <BaseButton variant="outline" data-testid="document-actions-menu">
                  More Actions
                  <IconChevronDown :size="16" class="tw:ml-1" />
                </BaseButton>
              </template>
            </BaseMenu>
          </div>
        </div>
      </div>

      <!-- Main Content Grid -->
      <DocumentsMainContent
        :documentId="props.id"
        :versionId="selectedVersion?.id"
        :reviewMode="hasActiveTaskOnSelected"
      />

      <!-- Messages Drawer -->
      <DocumentsMessages v-model="showMessages" :documentId="props.id" />

      <DocumentWorkflowPreviewDialog
        v-model="showPreviewDialog"
        :documentId="props.id"
        :versionId="selectedVersion?.id"
      />

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
    </div>
  </div>
</template>
