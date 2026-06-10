<script setup>
/**
 * Renders the approval workflow steps for the audit standard's
 * currently-UNDER_REVIEW version. Same shape as
 * AuditInstanceWorkflowDetail / NcWorkflowDetail — passes
 * AUDIT_STANDARD_VERSION_MODULE through the shared WorkflowStep card.
 *
 * Mounted on AuditStandardsPageId when a version is UNDER_REVIEW
 * (has workflowInstanceId set). On step completion, the
 * auditStandardVersionHandler resourceHandler flips the version to
 * EFFECTIVE (or REJECTED on rejection) and the next bootstrap tick
 * unmounts this card.
 */
import WorkflowStep from '@/components/workflow/WorkflowStep.vue'
import WorkflowReassignDialog from '@/components/workflow/WorkflowReassignDialog.vue'
import { AUDIT_STANDARD_VERSION_MODULE } from '@/components/workflow/workflowModule.js'

const props = defineProps({
  // The AuditStandardVersion id that's under review. resourceId on
  // the workflow engine side is the version's id, NOT the parent
  // standard's, because the resource handler flips the version row.
  versionId: { type: String, required: true },
  workflowInstanceId: { type: String, default: null },
  isOwner: { type: Boolean, default: false },
})

const reassignDialogRef = ref(null)

const workflowInstanceSteps = useLiveQueryWithDeps(
  [() => props.workflowInstanceId],
  async (db, [instanceId]) => {
    if (!instanceId) return []
    const all = await db.WorkflowInstanceStep.where('workflowInstanceId', instanceId)
      .orderBy('stepNumber', 'asc')
      .exec()
    const latestByStepId = new Map()
    for (const step of all) {
      const existing = latestByStepId.get(step.stepId)
      if (!existing || step.createdAt > existing.createdAt) {
        latestByStepId.set(step.stepId, step)
      }
    }
    return [...latestByStepId.values()].sort((a, b) => a.stepNumber - b.stepNumber)
  },
  { initial: [] },
)

function openReassignDialog(instanceStepId) {
  reassignDialogRef.value?.open(instanceStepId)
}
</script>

<template>
  <div class="tw:contents">
    <template v-if="workflowInstanceSteps.length">
      <WorkflowStep
        v-for="(step, idx) in workflowInstanceSteps"
        :key="step.id"
        :module="AUDIT_STANDARD_VERSION_MODULE"
        :instanceStepId="step.id"
        :resourceId="versionId"
        :isOwner="isOwner"
        :displayNumber="String(idx + 1)"
        @reassign="openReassignDialog"
      />
    </template>

    <WorkflowReassignDialog
      ref="reassignDialogRef"
      :module="AUDIT_STANDARD_VERSION_MODULE"
      :resourceId="versionId"
    />
  </div>
</template>
