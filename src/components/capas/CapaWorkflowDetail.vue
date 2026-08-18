<script setup>
import WorkflowStepRun from '@/components/workflow/WorkflowStepRun.vue'
import WorkflowReassignDialog from '@/components/workflow/WorkflowReassignDialog.vue'
import { CAPA_MODULE } from '@/components/workflow/workflowModule.js'

const props = defineProps({
  capaId: { type: String, required: true },
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
    // Collapse to the latest instance per stepId (handles send-back churn).
    const latestByStepId = new Map()
    for (const step of all) {
      const existing = latestByStepId.get(step.stepId)
      if (!existing || step.createdAt > existing.createdAt) {
        latestByStepId.set(step.stepId, step)
      }
    }
    // Only show root-level instance steps at this depth — children are rendered
    // nested inside their parent stage by CapaWorkflowStep. Hierarchy lives on
    // the instance row (parentInstanceStepId is NULL for roots).
    return [...latestByStepId.values()]
      .filter((s) => !s.parentInstanceStepId)
      .sort((a, b) => a.stepNumber - b.stepNumber)
  },

  { models: ['WorkflowInstanceStep'], initial: [] },
)

function openReassignDialog(instanceStepId) {
  reassignDialogRef.value?.open(instanceStepId)
}

// Send back is owned entirely by the reviewer's dropdown action now.
// The engine auto-targets the entity owner (parent step) or the parent
// step's assignee (child task), so this section no longer drives a
// shared picker dialog.
</script>

<template>
  <div class="tw:contents">
    <template v-if="workflowInstanceSteps.length">
      <WorkflowStepRun
        :steps="workflowInstanceSteps"
        :module="CAPA_MODULE"
        :resourceId="capaId"
        :isOwner="isOwner"
        @reassign="openReassignDialog"
      >
        <!-- CAPA stages can have nested sub-tasks under each parent. The
           generic WorkflowStep hands us the parent step + definition via
           a scoped slot so we don't need to re-fetch them. -->
        <template
          #childSteps="{
            instanceStep: parentStep,
            stepDefinition: parentDef,
            displayNumber: parentNum,
          }"
        >
          <CapaWorkflowChildSteps
            v-if="parentStep && (parentDef?.allowChildSteps || parentStep.workflowInstanceId)"
            :parentInstanceStepId="parentStep.id"
            :parentStepNumber="parentNum"
            :workflowInstanceId="parentStep.workflowInstanceId"
            :capaId="capaId"
            :isOwner="isOwner"
            :allowChildSteps="!!parentDef?.allowChildSteps && parentStep.statusId !== 'APPROVED'"
            class="tw:mt-4 tw:mb-4"
            @reassign="(childInstanceStepId) => openReassignDialog(childInstanceStepId)"
          />
        </template>
      </WorkflowStepRun>
    </template>

    <WorkflowReassignDialog ref="reassignDialogRef" :module="CAPA_MODULE" :resourceId="capaId" />
  </div>
</template>
