<script setup>
/**
 * Live workflow detail for a Change Request. Renders each step as a
 * generic WorkflowStep (module=CR_MODULE) — same component CAPA + NC use.
 * Inline action buttons (Mark Complete, Reopen, Reassign, Cancel) and
 * the secondary dropdown come from the generic component; CR-specific
 * child sub-tasks for the Implementation stage go through the
 * #childSteps slot.
 *
 * Reassign is owned by the shared WorkflowReassignDialog — this section
 * just forwards the instance-step id to it via the ref.
 */
import WorkflowStep from '@/components/workflow/WorkflowStep.vue'
import WorkflowReassignDialog from '@/components/workflow/WorkflowReassignDialog.vue'
import { CR_MODULE } from '@/components/workflow/workflowModule.js'

const props = defineProps({
  crId: { type: String, required: true },
  workflowInstanceId: { type: String, default: null },
  isOwner: { type: Boolean, default: false },
})

const reassignDialogRef = ref(null)

const steps = useLiveQueryWithDeps(
  [() => props.workflowInstanceId],
  async (db, [id]) => {
    if (!id) return []
    const all = await db.WorkflowInstanceStep.where('workflowInstanceId', id)
      .orderBy('stepNumber', 'asc')
      .exec()
    // Collapse to latest instance per stepId (send-back churn) +
    // only roots — children render nested inside their parent.
    const latestByStepId = new Map()
    for (const s of all) {
      const existing = latestByStepId.get(s.stepId)
      if (!existing || s.createdAt > existing.createdAt) {
        latestByStepId.set(s.stepId, s)
      }
    }
    return [...latestByStepId.values()]
      .filter((s) => !s.parentInstanceStepId)
      .sort((a, b) => a.stepNumber - b.stepNumber)
  },
  { initial: [] },
)

// ─── Reassign dialog (owner) ─────────────────────────────────────────────────
// All the picker / candidate-pool / POST logic lives in WorkflowReassignDialog
// now (shared with CAPA + NC). We just forward the instance-step id to it.
function openReassignDialog(instanceStepId) {
  reassignDialogRef.value?.open(instanceStepId)
}
</script>

<template>
  <div class="tw:contents">
    <template v-if="steps.length">
      <WorkflowStep
        v-for="(step, idx) in steps"
        :key="step.id"
        :module="CR_MODULE"
        :instanceStepId="step.id"
        :resourceId="crId"
        :isOwner="isOwner"
        :displayNumber="String(idx + 1)"
        @reassign="openReassignDialog"
      >
        <template
          #childSteps="{ instanceStep: parentStep, stepDefinition: parentDef, displayNumber: parentNum }"
        >
          <ChangeRequestWorkflowChildSteps
            v-if="parentStep && parentDef?.allowChildSteps && parentStep.workflowInstanceId"
            :parentInstanceStepId="parentStep.id"
            :parentStepNumber="parentNum"
            :workflowInstanceId="parentStep.workflowInstanceId"
            :crId="crId"
            :isOwner="isOwner"
            :allowChildSteps="!!parentDef?.allowChildSteps"
            class="tw:mt-4 tw:mb-4"
            @reassign="(childId) => openReassignDialog(childId)"
          />
        </template>
      </WorkflowStep>
    </template>
    <div
      v-else-if="workflowInstanceId"
      class="tw:bg-white tw:border tw:border-divider tw:rounded-lg tw:p-5 tw:text-sm tw:text-secondary tw:italic"
    >
      No workflow steps to show yet.
    </div>

    <!-- Reassign dialog — shared with CAPA + NC -->
    <WorkflowReassignDialog ref="reassignDialogRef" :module="CR_MODULE" :resourceId="crId" />
  </div>
</template>
