<script setup>
// Renders the running section workflow for a Started module record — mirrors
// CapaWorkflowDetail but with the dynamic FORM descriptor and no child steps
// (form sections are flat). Each WorkflowStep renders the assignee's section
// fill (WorkflowStepForm reads the step's formSchema; answers → ModuleSectionRecord).
import WorkflowStep from '@/components/workflow/WorkflowStep.vue'
import WorkflowReassignDialog from '@/components/workflow/WorkflowReassignDialog.vue'
import { formModuleFor } from '@/components/workflow/workflowModule.js'

const props = defineProps({
  recordId: { type: String, required: true },
  moduleKey: { type: String, required: true },
  displayName: { type: String, default: 'Module' },
  workflowInstanceId: { type: String, default: null },
  isOwner: { type: Boolean, default: false },
})

const moduleDescriptor = computed(() => formModuleFor(props.moduleKey, props.displayName))
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
      if (!existing || step.createdAt > existing.createdAt) latestByStepId.set(step.stepId, step)
    }
    return [...latestByStepId.values()]
      .filter((s) => !s.parentInstanceStepId)
      .sort((a, b) => a.stepNumber - b.stepNumber)
  },
  { models: ['WorkflowInstanceStep'], initial: [] },
)

function openReassignDialog(instanceStepId) {
  reassignDialogRef.value?.open(instanceStepId)
}
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-4">
    <WorkflowStep
      v-for="(step, idx) in workflowInstanceSteps"
      :key="step.id"
      :module="moduleDescriptor"
      :instanceStepId="step.id"
      :resourceId="recordId"
      :isOwner="isOwner"
      :displayNumber="String(idx + 1)"
      @reassign="openReassignDialog"
    />
    <WorkflowReassignDialog
      ref="reassignDialogRef"
      :module="moduleDescriptor"
      :resourceId="recordId"
    />
  </div>
</template>
