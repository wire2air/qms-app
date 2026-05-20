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
})

const document = useLiveQueryWithDeps([() => props.documentId], async (db, [id]) => {
  return db.Document.findByPk(id)
})

const currentVersion = useLiveQueryWithDeps([() => props.versionId], async (db, [id]) => {
  return id ? db.DocumentVersion.findByPk(id) : null
})

const canEdit = computed(
  () =>
    isAllowed(['documents:update']) && document.value?.statusId !== 'ARCHIVED' && !props.reviewMode,
)

// State
const activeSection = ref(null)
const showWorkflowDialog = ref(false)

const selectedWorkflowVersion = useLiveQueryWithDeps(
  [() => document.value?.workflowVersionId],
  async (db, [versionId]) => (versionId ? db.WorkflowVersion.findByPk(versionId) : null),
)

const selectedWorkflow = useLiveQueryWithDeps(
  [() => selectedWorkflowVersion.value?.workflowId],
  async (db, [workflowId]) => (workflowId ? db.Workflow.findByPk(workflowId) : null),
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
  <div v-if="document && currentVersion" class="tw:lg:col-span-1 tw:space-y-6 tw:print:hidden">
    <div class="tw:sticky tw:top-24 tw:space-y-6">
      <!-- Properties Card -->
      <div class="tw:bg-sidebar tw:rounded-xl tw:shadow-sm tw:border tw:border-divider tw:p-5">
        <h4 class="ds-label tw:text-secondary tw:mb-4 tw:flex tw:items-center tw:justify-between">
          Properties
          <IconSettings class="tw:size-4" />
        </h4>
        <div class="tw:space-y-3">
          <!-- ID + Owner -->
          <div class="tw:grid tw:grid-cols-2 tw:gap-3">
            <div>
              <label class="ds-label">Document ID</label>
              <p class="tw:text-sm tw:font-semibold tw:text-on-sidebar tw:mt-1">
                {{ document.docNumber }}
              </p>
            </div>
            <div>
              <label class="ds-label">Owner</label>
              <div class="tw:mt-1"><UserBadgeById :userId="document.userId" /></div>
            </div>
          </div>

          <!-- Type + Status -->
          <div class="tw:grid tw:grid-cols-2 tw:gap-3">
            <div>
              <label class="ds-label">Type</label>
              <div class="tw:mt-1">
                <DocumentTypeSelectMenu v-if="canEdit" v-model="document.documentTypeId" required />
                <DocumentTypeBadgeById v-else :documentTypeId="document.documentTypeId" :iconOnly="false" />
              </div>
            </div>
            <div>
              <label class="ds-label">Status</label>
              <div class="tw:mt-1">
                <DocumentVersionStatusBadgeById :statusId="currentVersion.statusId" />
              </div>
            </div>
          </div>

          <!-- Department + Related Standard -->
          <div class="tw:grid tw:grid-cols-2 tw:gap-3">
            <div>
              <label class="ds-label">Department</label>
              <div class="tw:mt-1">
                <DepartmentSelectMenu v-if="canEdit" v-model="document.departmentId" required />
                <DepartmentBadgeById v-else-if="document.departmentId" :departmentId="document.departmentId" />
                <span v-else class="tw:text-sm tw:text-secondary">—</span>
              </div>
            </div>
            <div>
              <label class="ds-label">Related Standard</label>
              <div class="tw:mt-1">
                <RelatedStandardSelectMenu v-if="canEdit" v-model="document.relatedStandardId" />
                <RelatedStandardBadgeById v-else-if="document.relatedStandardId" :relatedStandardId="document.relatedStandardId" />
                <span v-else class="tw:text-sm tw:text-secondary">—</span>
              </div>
            </div>
          </div>

          <!-- Periodic Review + Auto-Effective -->
          <div class="tw:grid tw:grid-cols-2 tw:gap-3">
            <div>
              <label class="ds-label">Periodic Review</label>
              <div v-if="canEdit" class="tw:flex tw:items-center tw:gap-1.5 tw:mt-1">
                <input
                  v-model.number="document.periodicReviewMonths"
                  type="number"
                  min="1"
                  class="tw:w-16 tw:rounded-md tw:border tw:border-divider tw:bg-sidebar tw:px-2 tw:py-1 tw:text-sm tw:text-on-sidebar tw:focus:outline-none tw:focus:ring-2 tw:focus:ring-primary/50"
                />
                <span class="tw:text-xs tw:text-secondary">months</span>
              </div>
              <p v-else class="tw:text-sm tw:font-medium tw:mt-1">{{ document.periodicReviewMonths }} months</p>
            </div>
            <div>
              <label class="ds-label">Auto-Effective</label>
              <div class="tw:mt-1">
                <BaseSwitch v-model="document.autoEffectiveOnApproval" :disabled="!canEdit" />
              </div>
            </div>
          </div>

          <!-- Effective Date (own row — date picker needs width) -->
          <div>
            <label class="ds-label">Effective Date</label>
            <div class="tw:mt-1">
              <BaseDatePicker v-if="canEdit" v-model="currentVersion.effectiveDate" :required="false" />
              <p v-else class="tw:text-sm tw:font-medium">
                {{ currentVersion.effectiveDate ? currentVersion.effectiveDate.formatDate('date') : '—' }}
              </p>
            </div>
          </div>

          <!-- Collaborators Section -->
          <DocumentsCollaborators :documentId="document.id" :canEdit="canEdit" />
        </div>
      </div>

      <div class="tw:bg-sidebar tw:rounded-xl tw:shadow-sm tw:border tw:border-divider tw:p-5">
        <div class="tw:flex tw:items-center tw:justify-between tw:mb-3">
          <h4 class="ds-label tw:text-secondary">Workflow</h4>
          <button
            v-if="canEdit"
            class="tw:text-xs tw:font-medium tw:text-primary tw:hover:text-primary/80 tw:transition-colors"
            @click="showWorkflowDialog = true"
          >
            {{ document.workflowVersionId ? 'Change' : 'Select' }}
          </button>
        </div>

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

        <!-- Workflow Selection Dialog -->
        <BaseDialog v-model="showWorkflowDialog" title="Select Workflow" maxWidth="lg">
          <WorkflowVersionSelect
            v-model="document.workflowVersionId"
            moduleId="APPROVAL"
            @update:modelValue="showWorkflowDialog = false"
          />
        </BaseDialog>
      </div>

      <!-- Approval Workflow Timeline (live) -->
      <div v-if="currentVersion.workflowInstanceId" class="tw:space-y-4">
        <h4 class="ds-label tw:text-secondary tw:px-1">Workflow Timeline</h4>
        <WorkflowInstanceTimeline :workflowInstanceId="currentVersion.workflowInstanceId" />
      </div>

      <!-- Table of Contents Card -->
      <div class="tw:bg-sidebar tw:rounded-xl tw:shadow-sm tw:border tw:border-divider tw:p-5">
        <div class="tw:flex tw:items-center tw:justify-between tw:mb-4">
          <h4 class="ds-label tw:text-secondary">Table of Contents</h4>
        </div>
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
      </div>
    </div>
  </div>
</template>
