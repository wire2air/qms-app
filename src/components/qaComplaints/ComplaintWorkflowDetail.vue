<script setup>
import WorkflowStepRun from '@/components/workflow/WorkflowStepRun.vue'
import WorkflowReassignDialog from '@/components/workflow/WorkflowReassignDialog.vue'
import { COMPLAINT_MODULE } from '@/components/workflow/workflowModule.js'

/**
 * QA-review workflow for a QMS Complaint — thin wrapper over the generic engine
 * UI (mirror of NcWorkflowDetail). Renders each WorkflowInstanceStep as a step
 * card with its form + task actions; the owner reassigns steps via the shared
 * dialog. Owns its own inter-card spacing (rendered inside a gapless container).
 */
const props = defineProps({
  complaintId: { type: String, required: true },
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
    // After a send-back the same stepId can have multiple instances — keep the latest.
    const latestByStepId = new Map()
    for (const step of all) {
      const existing = latestByStepId.get(step.stepId)
      if (!existing || step.createdAt > existing.createdAt) latestByStepId.set(step.stepId, step)
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
  <div class="tw:flex tw:flex-col tw:gap-4">
    <template v-if="workflowInstanceSteps.length">
      <WorkflowStepRun
        :steps="workflowInstanceSteps"
        :module="COMPLAINT_MODULE"
        :resourceId="complaintId"
        :isOwner="isOwner"
        @reassign="openReassignDialog"
      >
        <!-- Sub-tasks under any step whose template allows them. Available to
             every record module since 2026-09-26 — the engine always supported
             ad-hoc children, only the creation endpoint and this wiring were
             CAPA/Change-Control-only. -->
        <template
          #childSteps="{
            instanceStep: parentStep,
            stepDefinition: parentDef,
            displayNumber: parentNum,
          }"
        >
          <WorkflowChildSteps
            v-if="parentStep && parentDef?.allowChildSteps && parentStep.workflowInstanceId"
            :parentInstanceStepId="parentStep.id"
            :parentStepNumber="parentNum"
            :workflowInstanceId="parentStep.workflowInstanceId"
            :module="COMPLAINT_MODULE"
            :resourceId="complaintId"
            :isOwner="isOwner"
            :allowChildSteps="!!parentDef?.allowChildSteps && parentStep.statusId !== 'APPROVED'"
            class="tw:mt-4 tw:mb-4"
            @reassign="(childInstanceStepId) => openReassignDialog(childInstanceStepId)"
          />
        </template>
      </WorkflowStepRun>
    </template>
    <div v-else class="tw:text-sm tw:text-secondary tw:italic">
      No QA-review workflow yet. Accept the complaint (or submit for review) to start it.
    </div>

    <WorkflowReassignDialog
      ref="reassignDialogRef"
      :module="COMPLAINT_MODULE"
      :resourceId="complaintId"
    />
  </div>
</template>
