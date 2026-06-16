<script setup>
import WorkflowStep from '@/components/workflow/WorkflowStep.vue'
import WorkflowReassignDialog from '@/components/workflow/WorkflowReassignDialog.vue'
import { NC_MODULE } from '@/components/workflow/workflowModule.js'

const props = defineProps({
  ncId: { type: String, required: true },
  workflowInstanceId: { type: String, default: null },
  isOwner: { type: Boolean, default: false },
})

const reassignDialogRef = ref(null)

// ─── Workflow instance steps (latest per stepId after send-back churn) ──────
const workflowInstanceSteps = useLiveQueryWithDeps(
  [() => props.workflowInstanceId],
  async (db, [instanceId]) => {
    if (!instanceId) return []
    const all = await db.WorkflowInstanceStep.where('workflowInstanceId', instanceId)
      .orderBy('stepNumber', 'asc')
      .exec()
    // After a send-back the same stepId can have multiple instances.
    // Keep only the most recently created one per stepId.
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

// ─── Reassign dialog ─────────────────────────────────────────────────────────
// All the picker / candidate-pool / POST logic lives in WorkflowReassignDialog
// now (shared with CAPA + CR). We just forward the instance-step id to it.
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
      <WorkflowStep
        v-for="(step, idx) in workflowInstanceSteps"
        :key="step.id"
        :module="NC_MODULE"
        :instanceStepId="step.id"
        :resourceId="ncId"
        :isOwner="isOwner"
        :displayNumber="String(idx + 1)"
        @reassign="openReassignDialog"
      />
    </template>

    <!-- Reassign dialog — shared with CAPA + CR -->
    <WorkflowReassignDialog ref="reassignDialogRef" :module="NC_MODULE" :resourceId="ncId" />
  </div>
</template>
