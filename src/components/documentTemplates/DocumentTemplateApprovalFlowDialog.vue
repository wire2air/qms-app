<script setup>
/**
 * Edit a document template's approval flow without leaving the template
 * (user request 2026-08-15).
 *
 * Hosts the real step builder — the same WorkflowStepList / WorkflowStepEditor
 * the workflow page uses, so add-step, reorder, assignees, settings and
 * autosave all behave identically. What it deliberately leaves out is
 * WorkflowEditor's page chrome: version picker, Publish, New Draft, Archive.
 * Those don't apply here, because a template-owned flow is published and
 * archived BY its template (see syncApprovalWorkflowLifecycle) — and
 * WorkflowEditor teleports that chrome into the app header, which would escape
 * the dialog anyway.
 *
 * Edits land on the template's editable DRAFT version when there is one, and
 * fall back to the live published version otherwise (a published template's
 * flow is read-only until the template is reopened, mirroring the template's
 * own immutability).
 */
import { isAllowed } from '@/utils/currentSession.js'
import { pickAuthoringVersion } from './documentTemplateApprovalFlow.js'

const props = defineProps({
  templateId: { type: String, required: true },
})

const open = defineModel({ type: Boolean, default: false })

const template = useLiveQueryWithDeps(
  [() => props.templateId],
  async (db, [id]) => (id ? db.DocumentTemplate.findByPk(id) : null),
  { models: ['DocumentTemplate'], initial: null },
)

const versions = useLiveQueryWithDeps(
  [() => template.value?.workflowId],
  async (db, [workflowId]) =>
    workflowId ? db.WorkflowVersion.where('workflowId', workflowId).exec() : [],
  { models: ['WorkflowVersion'], initial: [] },
)

// The version being authored. Shared with the template page via
// pickAuthoringVersion so the two never disagree about which steps they are
// showing — they did once, and edits made here looked like they had no effect.
const displayVersion = computed(() => pickAuthoringVersion(versions.value))
const editableVersion = computed(() =>
  displayVersion.value?.statusId === 'DRAFT' ? displayVersion.value : null,
)

const subtitle = computed(() =>
  template.value
    ? `Documents created from “${template.value.name}” are approved through these stages.`
    : '',
)

const canUpdate = computed(
  () => !!editableVersion.value && isAllowed(['workflows_templates:update']),
)

// Step-level dialogs are owned here, exactly as WorkflowEditor owns them: one
// instance each, driven by the gear / people buttons on any step header.
const selectedStepId = ref(null)
const settingsDialogOpen = ref(false)
const settingsStepId = ref(null)
const assigneesDialogOpen = ref(false)
const assigneesStepId = ref(null)

function openStepSettings(id) {
  settingsStepId.value = id
  settingsDialogOpen.value = true
}
function openStepAssignees(id) {
  assigneesStepId.value = id
  assigneesDialogOpen.value = true
}

watch(open, (isOpen) => {
  if (!isOpen) {
    selectedStepId.value = null
    settingsDialogOpen.value = false
    assigneesDialogOpen.value = false
  }
})
</script>

<template>
  <BaseDialog v-model="open" title="Approval Flow" :subtitle="subtitle" maxWidth="4xl">
    <div class="tw:flex tw:flex-col tw:gap-4 tw:p-1">
      <div
        v-if="!canUpdate && displayVersion"
        class="tw:flex tw:items-start tw:gap-2 tw:rounded-lg tw:border tw:border-divider tw:bg-main-hover tw:p-3 tw:text-sm tw:text-secondary"
      >
        This flow is live and read-only, like the published template that owns it. Unarchive or
        reopen the template to change it — the flow then goes live again when the template is
        republished.
      </div>

      <WorkflowStepList
        v-if="displayVersion"
        v-model:stepId="selectedStepId"
        :versionId="displayVersion.id"
        :canUpdate="canUpdate"
        moduleId="APPROVAL"
        @openSettings="openStepSettings"
        @openAssignees="openStepAssignees"
      >
        <template #stepEditor="{ stepId: expandedStepId }">
          <div class="tw:bg-sidebar tw:p-4 tw:md:p-5">
            <WorkflowStepEditor
              :stepId="expandedStepId"
              :canUpdate="canUpdate"
              :showFormSchema="false"
              :selectedApprovalRule="null"
              @openAssignees="openStepAssignees(expandedStepId)"
            />
          </div>
        </template>
      </WorkflowStepList>

      <BaseEmptyState
        v-else
        dense
        title="No approval flow yet"
        description="Save the template to generate its approval flow."
      />
    </div>

    <WorkflowStepSettingsDialog
      v-model="settingsDialogOpen"
      :stepId="settingsStepId"
      :canUpdate="canUpdate"
      :showAllowChildSteps="false"
    />
    <WorkflowStepAssigneesDialog
      v-if="assigneesStepId"
      v-model="assigneesDialogOpen"
      :stepId="assigneesStepId"
      :canUpdate="canUpdate"
      stepApproversTab="roles"
    />
  </BaseDialog>
</template>
