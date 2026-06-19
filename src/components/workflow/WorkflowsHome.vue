<script setup>
import { IconSitemap, IconLayoutList, IconLayoutRows } from '@tabler/icons-vue'
import { getCompanyPath } from '@/utils/routeHelpers'
import { useCompanyLocalStorage } from '@/utils/useCompanyLocalStorage'
import { isAllowed } from '@/utils/currentSession.js'

const router = useRouter()

const showCreateDialog = ref(false)
const viewMode = useCompanyLocalStorage('workflow-templates-view-mode', 'table')

// Filter state + URL sync + resolved content state. Declared BEFORE the live
// query so the `total`/`empty` lazy getters can reference `workflows`.
const list = useListLayout({
  filters: { search: '', statusId: null },
  total: () => filteredWorkflows.value.length,
  loading: () => workflows.value === undefined,
  empty: () => filteredWorkflows.value.length === 0,
  syncUrl: true,
})

const canCreateWorkflow = computed(() => isAllowed(['workflows:create']))

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
  const { search, statusId } = list.filters.value
  if (statusId) rows = rows.filter((r) => r.statusId === statusId)
  if (search) {
    const q = search.toLowerCase()
    rows = rows.filter((r) => r.name?.toLowerCase().includes(q))
  }
  return rows
})

function handleWorkflowCreated(workflow) {
  const path = getCompanyPath(`/workflow-templates/${workflow.id}`)
  router.push(path)
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
    />
    <div v-else class="tw:flex-1 tw:overflow-y-auto">
      <WorkflowsList
        :workflows="filteredWorkflows"
        :allWorkflows="workflows ?? []"
      />
    </div>

    <!-- Create Dialog -->
    <WorkflowCreateDialog v-model="showCreateDialog" @created="handleWorkflowCreated" />
  </BaseListLayout>
</template>
