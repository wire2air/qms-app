<script setup>
import { getCompanyPath } from '@/utils/routeHelpers'

const props = defineProps({
  // Filtered rows to render; resolved by the parent (WorkflowsHome).
  workflows: { type: Array, default: () => [] },
  // Full unfiltered set — setDefault clears the existing default across the
  // whole module, so it needs every workflow, not just the filtered view.
  allWorkflows: { type: Array, default: () => [] },
})

const router = useRouter()

const filteredWorkflows = computed(() => props.workflows)

function navigateToWorkflow(workflow) {
  const path = getCompanyPath(`/workflow-templates/${workflow.id}`)
  router.push(path)
}

// Toggle a module's default workflow. Clear the current default FIRST —
// the DB enforces at most one live default per (company, module) via a
// partial unique index, so set-before-clear would violate it.
const toast = useToast()
async function setDefault(workflow) {
  try {
    if (workflow.isDefault) {
      workflow.isDefault = false
      await workflow.save()
      toast.success(`${workflow.name} is no longer the default`)
      return
    }
    const current = (props.allWorkflows || []).find(
      (w) => w.moduleId === workflow.moduleId && w.isDefault && w.id !== workflow.id,
    )
    if (current) {
      current.isDefault = false
      await current.save()
    }
    workflow.isDefault = true
    await workflow.save()
    toast.success(
      `${workflow.name} is now the default for new ${workflow.moduleId.toLowerCase().replaceAll('_', ' ')} entities`,
    )
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
      @click="navigateToWorkflow(workflow)"
      @setDefault="setDefault"
    />
  </div>
</template>
