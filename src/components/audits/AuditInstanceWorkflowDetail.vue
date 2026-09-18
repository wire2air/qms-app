<script setup>
/**
 * Renders the close-out workflow's steps for an AuditInstance with
 * the unified WorkflowStep card + reassign dialog. Mirrors
 * NcWorkflowDetail exactly — no child steps (the seeded "Default
 * Audit Close-Out" template is two APPROVAL gates, no
 * allowChildSteps), so the simpler NC shape is the right base.
 *
 * Mounted on AuditInstancesPageId once the audit has a
 * workflowInstanceId (i.e. after Submit-for-Close-Out fires).
 */
import WorkflowStepRun from '@/components/workflow/WorkflowStepRun.vue'
import WorkflowReassignDialog from '@/components/workflow/WorkflowReassignDialog.vue'
import { AUDIT_INSTANCE_MODULE } from '@/components/workflow/workflowModule.js'

const props = defineProps({
  auditInstanceId: { type: String, required: true },
  workflowInstanceId: { type: String, default: null },
  isOwner: { type: Boolean, default: false },
})

const reassignDialogRef = ref(null)

// Workflow instance steps — latest per stepId (collapses send-back
// churn the same way NC + CAPA do).
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

  { models: ['WorkflowInstanceStep'], initial: [] },
)

function openReassignDialog(instanceStepId) {
  reassignDialogRef.value?.open(instanceStepId)
}
</script>

<template>
  <div class="tw:contents">
    <template v-if="workflowInstanceSteps.length">
      <WorkflowStepRun
        :steps="workflowInstanceSteps"
        :module="AUDIT_INSTANCE_MODULE"
        :resourceId="auditInstanceId"
        :isOwner="isOwner"
        @reassign="openReassignDialog"
      />
    </template>

    <WorkflowReassignDialog
      ref="reassignDialogRef"
      :module="AUDIT_INSTANCE_MODULE"
      :resourceId="auditInstanceId"
    />
  </div>
</template>
