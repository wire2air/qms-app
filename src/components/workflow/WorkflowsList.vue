<script setup>
import { getCompanyPath } from '@/utils/routeHelpers'
import { toggleWorkflowDefault } from './workflowDefault.js'

const props = defineProps({
  // Filtered rows to render; resolved by the parent (WorkflowsHome).
  workflows: { type: Array, default: () => [] },
  // Full unfiltered set — setDefault clears the existing default across the
  // whole module, so it needs every workflow, not just the filtered view.
  allWorkflows: { type: Array, default: () => [] },
  // Clone is handled by the parent (shared with the table view).
  canClone: { type: Boolean, default: false },
  // Where a card opens. Approval flows mount the same editor under
  // /approval-flows/:id so the sidebar stays on Approval Flows.
  basePath: { type: String, default: '/workflow-templates' },
})

const emit = defineEmits(['clone'])

const router = useRouter()

const filteredWorkflows = computed(() => props.workflows)

function navigateToWorkflow(workflow) {
  router.push(getCompanyPath(`${props.basePath}/${workflow.id}`))
}

// Toggle a module's default workflow. Clear the current default FIRST —
// the DB enforces at most one live default per (company, module) via a
// partial unique index, so set-before-clear would violate it.
const toast = useToast()
async function setDefault(workflow) {
  try {
    toast.success(await toggleWorkflowDefault(workflow, props.allWorkflows ?? []))
  } catch (err) {
    toast.error(err?.message || 'Failed to update default workflow')
  }
}
</script>

<template>
  <div
    class="tw:p-6 tw:grid tw:grid-cols-1 tw:md:grid-cols-2 tw:lg:grid-cols-3 tw:gap-4 tw:auto-rows-min"
  >
    <!-- Workflow Cards. Loading/empty states are owned by the BaseListLayout
         shell in WorkflowsHome. -->
    <WorkflowCard
      v-for="workflow in filteredWorkflows"
      :key="workflow.id"
      :workflow="workflow"
      :canClone="canClone"
      @click="navigateToWorkflow(workflow)"
      @setDefault="setDefault"
      @clone="(w) => emit('clone', w)"
    />
  </div>
</template>
