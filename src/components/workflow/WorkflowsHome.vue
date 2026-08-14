<script setup>
import { IconSitemap, IconLayoutList, IconLayoutRows, IconSparkles } from '@tabler/icons-vue'
import { getCompanyPath } from '@/utils/routeHelpers'
import { useCompanyLocalStorage } from '@/utils/useCompanyLocalStorage'
import { isAllowed, canUseAi } from '@/utils/currentSession.js'
import { copyVersionSteps, newestVersionOf } from './workflowVersionCopy.js'

const router = useRouter()

const showCreateDialog = ref(false)
const showAiGenerateDialog = ref(false)
const viewMode = useCompanyLocalStorage('workflow-templates-view-mode', 'table')

// Filter state + URL sync + resolved content state. Declared BEFORE the live
// query so the `total`/`empty` lazy getters can reference `workflows`.
const list = useListLayout({
  filters: { statusId: null },
  total: () => filteredWorkflows.value.length,
  loading: () => workflows.value === undefined,
  empty: () => filteredWorkflows.value.length === 0,
  syncUrl: true,
})

const canCreateWorkflow = computed(() => isAllowed(['workflows_templates:create']))

const viewSwitches = [
  { icon: IconLayoutList, value: 'list', tooltip: 'List View' },
  { icon: IconLayoutRows, value: 'table', tooltip: 'Table View' },
]

// Shared source query — lifted into the parent so the list shell can resolve
// total/empty/loading state. Both view children render from the filtered rows.
const workflows = useLiveQuery((db) => db.Workflow.where().exec(), {
  models: ['Workflow'],
})

const filteredWorkflows = computed(() => {
  let rows = workflows.value ?? []
  const { statusId } = list.filters.value
  if (statusId) rows = rows.filter((r) => r.statusId === statusId)
  return rows
})

function handleWorkflowCreated(workflow) {
  const path = getCompanyPath(`/workflow-templates/${workflow.id}`)
  router.push(path)
}

// ── Clone (user request 2026-08-14) — shared by both views ──────────────────
// New Workflow + a 1.0 DRAFT version carrying the source's newest version's
// steps (incl. roles/outcomes/child steps via the shared copy helper). Never
// the default; the author reviews and publishes like any draft.
const toast = useToast()
const canCloneWorkflow = computed(() =>
  isAllowed(['workflows_templates:create', 'workflows_templates:read']),
)

const cloneWorkflowMutation = useLiveMutation(async (db, source) => {
  const workflow = db.Workflow.create({
    name: `${source.name} (Copy)`,
    description: source.description ?? '',
    moduleId: source.moduleId,
    statusId: 'ACTIVE',
    isDefault: false,
  })
  await workflow.save()

  const version = db.WorkflowVersion.create({
    workflowId: workflow.id,
    versionMajor: 1,
    versionMinor: 0,
    statusId: 'DRAFT',
  })
  await version.save()

  const sourceVersion = await newestVersionOf(db, source.id)
  await copyVersionSteps(db, sourceVersion?.id, version.id)

  return workflow
})

const cloning = ref(false)
async function handleClone(source) {
  if (cloning.value) return
  cloning.value = true
  try {
    const clone = await cloneWorkflowMutation(source)
    toast.success(`Cloned as "${clone.name}" — opening the draft`)
    router.push(getCompanyPath(`/workflow-templates/${clone.id}`))
  } catch (err) {
    toast.error(err?.message || 'Failed to clone workflow')
  } finally {
    cloning.value = false
  }
}
</script>

<template>
  <BaseListLayout
    title="Workflows"
    :icon="IconSitemap"
    subtitle="Design and manage multi-step workflow sequences for Documents and NCs."
    :state="list.state.value"
    :emptyIcon="IconSitemap"
    :emptyTitle="list.hasActiveFilters.value ? 'No workflows match your filters' : 'No workflows found'"
    emptyDescription="Create your first workflow to get started."
  >
    <template #actions>
      <BaseButton
        v-if="canUseAi && canCreateWorkflow"
        variant="outline"
        @click="showAiGenerateDialog = true"
      >
        <template #icon><IconSparkles :size="16" /></template>
        Generate with AI
      </BaseButton>
      <BaseButton v-if="canCreateWorkflow" @click="showCreateDialog = true">
        Create Workflow
      </BaseButton>
    </template>

    <template #filters>
      <WorkflowsFilterToolbar v-model:filters="list.filters.value">
        <template #actions>
          <BaseSwitcher v-model="viewMode" :switches="viewSwitches" />
        </template>
      </WorkflowsFilterToolbar>
    </template>

    <!-- Content Views -->
    <WorkflowsTable
      v-if="viewMode === 'table'"
      :workflows="filteredWorkflows"
      :canClone="canCloneWorkflow"
      @clone="handleClone"
    />
    <div v-else class="tw:flex-1 tw:overflow-y-auto">
      <WorkflowsList
        :workflows="filteredWorkflows"
        :allWorkflows="workflows ?? []"
        :canClone="canCloneWorkflow"
        @clone="handleClone"
      />
    </div>
  </BaseListLayout>

  <!-- Guided create wizard — kept OUTSIDE BaseListLayout so it stays mounted in
       the empty/loading state too (BaseListLayout renders its default slot only
       when 'ready'). Otherwise you can't create your first workflow. Replaces
       the old bare name/module create dialog (deleted — F-21) with a
       step-by-step flow (structure → approvals → effectiveness check → review). -->
  <WorkflowGuidedCreateDialog v-model="showCreateDialog" @created="handleWorkflowCreated" />

  <!-- AI generator — sidecar isolation: mounted only when AI is enabled; all
       AI logic lives inside the dialog. Lands on the new DRAFT in the editor. -->
  <WorkflowAiGenerateDialog
    v-if="canUseAi && canCreateWorkflow"
    v-model="showAiGenerateDialog"
    @created="handleWorkflowCreated"
  />
</template>
