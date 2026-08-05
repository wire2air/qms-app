<script setup>
import { isAllowed } from '@/utils/currentSession.js'
import { getCompanyPath } from '@/utils/routeHelpers'
import { IconSettings, IconHierarchy } from '@tabler/icons-vue'

const props = defineProps({
  documentId: {
    type: String,
    required: true,
  },
  versionId: {
    type: String,
    default: null,
  },
  reviewMode: {
    type: Boolean,
    default: false,
  },
  // Which detail tab is active. The rail is now persistent across all tabs
  // (Properties/Collaborators/Workflow are document-level), but the Table of
  // Contents is content-specific and only renders on the Content tab.
  activeTab: {
    type: String,
    default: 'content',
  },
})

const document = useLiveQueryWithDeps(
  [() => props.documentId],
  async (db, [id]) => {
    return db.Document.findByPk(id)
  },
  { models: ['Document'] },
)

const currentVersion = useLiveQueryWithDeps(
  [() => props.versionId],
  async (db, [id]) => {
    return id ? db.DocumentVersion.findByPk(id) : null
  },
  { models: ['DocumentVersion'] },
)

// Editable only while the SELECTED version is a working draft. Once it's
// submitted (IN_REVIEW), approved, effective, or superseded, the document and
// all its metadata are locked — you must create a new draft version to change
// anything. `document.statusId` is only the ACTIVE/ARCHIVED lifecycle flag, so
// it can't gate this on its own; the version status is what matters.
const canEdit = computed(
  () =>
    isAllowed(['document_control:update']) &&
    document.value?.statusId !== 'ARCHIVED' &&
    !props.reviewMode &&
    ['DRAFT', 'REJECTED'].includes(currentVersion.value?.statusId),
)

// State
const activeSection = ref(null)
const showWorkflowDialog = ref(false)

const selectedWorkflowVersion = useLiveQueryWithDeps(
  [() => document.value?.workflowVersionId],

  async (db, [versionId]) => (versionId ? db.WorkflowVersion.findByPk(versionId) : null),
  { models: ['WorkflowVersion'] },
)

const selectedWorkflow = useLiveQueryWithDeps(
  [() => selectedWorkflowVersion.value?.workflowId],

  async (db, [workflowId]) => (workflowId ? db.Workflow.findByPk(workflowId) : null),
  { models: ['Workflow'] },
)

// Computed properties
const documentSections = useLiveQueryWithDeps(
  [() => props.versionId],
  async (db, [versionId]) => {
    if (!versionId) return []
    return db.DocumentSection.where('documentVersionId', versionId).orderBy('order', 'asc').exec()
  },
  { initial: [], models: ['DocumentSection', 'Document', 'DocumentVersion'] },
)

// Section methods
function scrollToSection(sectionId) {
  const element = window.document.getElementById(sectionId)
  if (element) {
    element.scrollIntoView({ behavior: 'smooth' })
    activeSection.value = sectionId
  }
}

// Applicability — where the document APPLIES (visibility). document.siteId is
// the OWNING site and always applies; appliesAllSites bypasses per-site rows.
const documentSites = useLiveQueryWithDeps(
  [() => props.documentId],
  async (db, [id]) => db.DocumentSite.where('documentId', id).exec(),
  { models: ['DocumentSite'], initial: [] },
)
const applicabilitySiteIds = computed(() => documentSites.value.map((ds) => ds.siteId))

const addDocumentSite = useLiveMutation(async (db, { documentId, siteId }) => {
  const link = db.DocumentSite.create({ documentId, siteId })
  await link.save()
  return link
})

async function handleApplicabilityChange(newSiteIds) {
  const next = newSiteIds || []
  // A document must apply SOMEWHERE — refuse to drop the last site unless
  // company-wide is on.
  if (!next.length && !document.value?.appliesAllSites) return
  const current = applicabilitySiteIds.value
  const toAdd = next.filter((id) => !current.includes(id))
  const toRemove = current.filter((id) => !next.includes(id))
  for (const siteId of toAdd) await addDocumentSite({ documentId: props.documentId, siteId })
  for (const siteId of toRemove) {
    const match = documentSites.value.find((ds) => ds.siteId === siteId)
    if (match) await match.delete()
  }
}

const debounceSaveDocument = useDebounceFn(() => {
  if (!document.value || !canEdit.value) return
  try {
    document.value.save()
  } catch (error) {
    console.error('Error saving document:', error)
  }
}, 500)

const debounceSaveVersion = useDebounceFn(() => {
  if (!currentVersion.value || !canEdit.value) return
  try {
    currentVersion.value.save()
  } catch (error) {
    console.error('Error saving document version:', error)
  }
}, 500)

watch(
  document,
  () => {
    debounceSaveDocument()
  },
  { deep: true },
)

watch(
  currentVersion,
  () => {
    debounceSaveVersion()
  },
  { deep: true },
)
</script>

<template>
  <template v-if="document && currentVersion">
    <!-- Properties -->
    <BaseRailCard title="Properties" :icon="IconSettings">
      <div class="tw:grid tw:gap-x-4 tw:gap-y-3 tw:grid-cols-[repeat(auto-fit,minmax(8rem,1fr))]">
        <BaseDetailField label="Document ID">
          <BaseText
            v-if="document.docNumber"
            variant="body"
            weight="medium"
            class="tw:text-on-main"
          >
            {{ document.docNumber }}
          </BaseText>
          <BaseText v-else variant="body" class="tw:text-secondary tw:italic">
            Assigned on submit
          </BaseText>
        </BaseDetailField>

        <!-- Co-author model: Owner is accountable for the lifecycle (periodic
             review, effectiveness, default step assignee); Author is the
             originator. Both reassignable inline when editable. -->
        <BaseDetailField label="Owner">
          <UserSelectMenu v-if="canEdit" v-model="document.userId" :required="true" />
          <UserBadgeById v-else :userId="document.userId" />
        </BaseDetailField>

        <BaseDetailField label="Author">
          <UserSelectMenu v-if="canEdit" v-model="document.authorId" :required="true" />
          <UserBadgeById v-else-if="document.authorId" :userId="document.authorId" />
          <span v-else class="tw:text-sm tw:text-secondary">—</span>
        </BaseDetailField>

        <BaseDetailField label="Status">
          <DocumentVersionStatusBadgeById :statusId="currentVersion.statusId" />
        </BaseDetailField>

        <BaseDetailField label="Department">
          <DepartmentSelectMenu
            v-if="canEdit"
            v-model="document.departmentId"
            :siteIds="document.appliesAllSites ? null : applicabilitySiteIds"
            required
          />
          <DepartmentBadgeById
            v-else-if="document.departmentId"
            :departmentId="document.departmentId"
          />
          <span v-else class="tw:text-sm tw:text-secondary">—</span>
        </BaseDetailField>

        <BaseDetailField label="Sites">
          <div v-if="canEdit" class="tw:flex tw:flex-col tw:gap-1.5">
            <BaseCheckbox v-model="document.appliesAllSites" label="All sites (company-wide)" />
            <SiteSelectMenu
              v-if="!document.appliesAllSites"
              :modelValue="applicabilitySiteIds"
              :multiple="true"
              nullLabel="Select sites…"
              @update:modelValue="handleApplicabilityChange"
            />
          </div>
          <template v-else>
            <span v-if="document.appliesAllSites" class="tw:text-sm tw:text-on-main">
              All sites (company-wide)
            </span>
            <div v-else-if="applicabilitySiteIds.length" class="tw:flex tw:flex-wrap tw:gap-1">
              <SiteBadgeById v-for="sid in applicabilitySiteIds" :key="sid" :siteId="sid" />
            </div>
            <span v-else class="tw:text-sm tw:text-secondary">—</span>
          </template>
        </BaseDetailField>

        <BaseDetailField label="Related Standard">
          <RelatedStandardSelectMenu v-if="canEdit" v-model="document.relatedStandardId" />
          <RelatedStandardBadgeById
            v-else-if="document.relatedStandardId"
            :relatedStandardId="document.relatedStandardId"
          />
          <span v-else class="tw:text-sm tw:text-secondary">—</span>
        </BaseDetailField>

        <BaseDetailField label="Periodic Review">
          <div v-if="canEdit" class="tw:flex tw:items-center tw:gap-1.5">
            <input
              v-model.number="document.periodicReviewMonths"
              type="number"
              min="1"
              class="tw:w-16 tw:rounded-md tw:border tw:border-divider tw:bg-sidebar tw:px-2 tw:py-1 tw:text-sm tw:text-on-sidebar tw:focus:outline-none tw:focus:ring-2 tw:focus:ring-primary/50"
            />
            <span class="tw:text-xs tw:text-secondary">months</span>
          </div>
          <BaseText v-else variant="body" weight="medium">
            {{ document.periodicReviewMonths }} months
          </BaseText>
        </BaseDetailField>

        <BaseDetailField label="Auto-Effective">
          <BaseSwitch v-model="document.autoEffectiveOnApproval" :disabled="!canEdit" />
        </BaseDetailField>

        <BaseDetailField label="Effective Date">
          <BaseDateField
            v-if="canEdit"
            v-model="currentVersion.effectiveDate"
            mode="date"
            :required="false"
          />
          <BaseText v-else variant="body" weight="medium">
            {{
              currentVersion.effectiveDate ? currentVersion.effectiveDate.formatDate('date') : '—'
            }}
          </BaseText>
        </BaseDetailField>

        <!-- Immutable audit-PDF snapshot, generated by the worker on EFFECTIVE
             transition. The sha256 is the tamper-evidence anchor. -->
        <BaseDetailField
          v-if="currentVersion.snapshotStoragePath"
          label="Audit Snapshot"
          class="tw:col-span-full"
        >
          <div class="tw:flex tw:flex-col tw:gap-1">
            <a
              :href="`/api/v1/files/${currentVersion.snapshotStoragePath}`"
              target="_blank"
              rel="noopener"
              class="tw:text-sm tw:font-medium tw:text-primary tw:hover:underline"
            >
              Download audit PDF
            </a>
            <p v-if="currentVersion.snapshotGeneratedAt" class="tw:text-xs tw:text-secondary">
              Generated {{ currentVersion.snapshotGeneratedAt.formatDate('datetime') }}
            </p>
            <p
              v-if="currentVersion.snapshotSha256"
              class="tw:text-micro tw:text-secondary tw:break-all"
              :title="currentVersion.snapshotSha256"
            >
              sha256: {{ currentVersion.snapshotSha256.slice(0, 16) }}…
            </p>
          </div>
        </BaseDetailField>

      </div>
    </BaseRailCard>

    <!-- Collaborators + Chat — one section right below Properties. The chat only
         appears once collaborators exist. -->
    <DocumentsCollaborationCard :documentId="document.id" :canEdit="canEdit" />

    <!-- Admin-defined custom fields, right after Properties. Self-hides when
         none configured. -->
    <CustomFieldsCard entityType="Document" :entityId="document.id" :editable="canEdit" />

    <!-- Workflow -->
    <BaseRailCard title="Workflow" :icon="IconHierarchy">
      <div class="tw:flex tw:flex-col tw:gap-2">
        <!-- Selected workflow display -->
        <RouterLink
          v-if="selectedWorkflow && selectedWorkflowVersion"
          :to="getCompanyPath('workflow-templates/' + selectedWorkflow.id)"
          class="tw:flex tw:items-center tw:gap-3 tw:p-3 tw:rounded-lg tw:bg-main tw:border tw:border-divider"
        >
          <div
            class="tw:w-8 tw:h-8 tw:rounded-md tw:bg-primary/10 tw:text-primary tw:flex tw:items-center tw:justify-center tw:shrink-0"
          >
            <IconHierarchy :size="16" />
          </div>
          <div class="tw:min-w-0">
            <p class="tw:text-sm tw:font-semibold tw:text-on-sidebar tw:truncate">
              {{ selectedWorkflow.name }}
            </p>
            <p class="tw:text-xs tw:text-secondary">
              v{{
                selectedWorkflowVersion.versionLabel ||
                `${selectedWorkflowVersion.versionMajor}.${selectedWorkflowVersion.versionMinor}`
              }}
            </p>
          </div>
        </RouterLink>

        <!-- Empty state -->
        <button
          v-else
          class="tw:w-full tw:py-3 tw:border-2 tw:border-dashed tw:border-divider tw:rounded-lg tw:flex tw:items-center tw:justify-center tw:gap-2 tw:text-secondary tw:hover:text-primary tw:hover:border-primary tw:hover:bg-primary/5 tw:transition-all tw:text-sm"
          :disabled="!canEdit"
          @click="showWorkflowDialog = true"
        >
          <IconHierarchy :size="16" />
          <span>Select a workflow</span>
        </button>

        <button
          v-if="canEdit && selectedWorkflow"
          class="tw:self-start tw:text-xs tw:font-medium tw:text-primary tw:hover:text-primary/80 tw:transition-colors"
          @click="showWorkflowDialog = true"
        >
          Change workflow
        </button>
      </div>
    </BaseRailCard>

    <!-- Approval Workflow Timeline (live) -->
    <BaseRailCard v-if="currentVersion.workflowInstanceId" title="Workflow Timeline">
      <WorkflowInstanceTimeline :workflowInstanceId="currentVersion.workflowInstanceId" />
    </BaseRailCard>

    <!-- Table of Contents — content-specific, hidden on other tabs -->
    <BaseRailCard v-if="activeTab === 'content'" title="Table of Contents">
      <nav class="tw:space-y-1">
        <a
          v-for="(section, index) in documentSections"
          :key="section.id"
          :href="`#${section.id}`"
          class="tw:group tw:flex tw:items-center tw:gap-3 tw:px-3 tw:py-2 tw:rounded-lg tw:text-sm tw:font-medium tw:transition-colors"
          :class="
            activeSection === section.id
              ? 'tw:text-primary tw:bg-primary/5'
              : 'tw:text-secondary tw:hover:bg-sidebar-hover'
         "
          @click.prevent="scrollToSection(section.id)"
        >
          <span
            class="tw:text-xs tw:font-bold"
            :class="
              activeSection === section.id
                ? 'tw:text-primary/50'
                : 'tw:text-secondary tw:group-hover:text-primary/50'
           "
          >
            {{ index + 1 }}.
          </span>
          {{ section.title }}
        </a>

        <!-- Empty state -->
        <div
          v-if="documentSections.length === 0"
          class="tw:text-center tw:py-4 tw:text-secondary tw:text-xs"
        >
          No sections available
        </div>
      </nav>
    </BaseRailCard>

    <!-- Workflow Selection Dialog -->
    <BaseDialog v-model="showWorkflowDialog" title="Select Workflow" maxWidth="lg">
      <WorkflowVersionSelect
        v-model="document.workflowVersionId"
        moduleId="APPROVAL"
        @update:modelValue="showWorkflowDialog = false"
      />
    </BaseDialog>
  </template>
</template>
