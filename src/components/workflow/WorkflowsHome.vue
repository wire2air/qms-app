<script setup>
import { IconSitemap, IconLayoutList, IconLayoutRows } from '@tabler/icons-vue'
import { getCompanyPath } from '@/utils/routeHelpers'
import { useCompanyLocalStorage } from '@/utils/useCompanyLocalStorage'
import { isAllowed } from '@/utils/currentSession.js'

const router = useRouter()

const showCreateDialog = ref(false)
const viewMode = useCompanyLocalStorage('workflow-templates-view-mode', 'table')

const filters = ref({ search: '', statusId: null })

const canCreateWorkflow = computed(() => isAllowed(['workflows:create']))

const viewSwitches = [
  { icon: IconLayoutList, value: 'list', tooltip: 'List View' },
  { icon: IconLayoutRows, value: 'table', tooltip: 'Table View' },
]

function handleWorkflowCreated(workflow) {
  const path = getCompanyPath(`/workflow-templates/${workflow.id}`)
  router.push(path)
}
</script>

<template>
  <BasePage width="standard">
    <PageHeader
      :icon="IconSitemap"
      title="Workflows"
      subtitle="Design and manage multi-step workflow sequences for Documents and NCs."
    >
      <template #actions>
        <BaseButton v-if="canCreateWorkflow" @click="showCreateDialog = true">
          Create Workflow
        </BaseButton>
      </template>
    </PageHeader>

    <WorkflowsFilterToolbar v-model:filters="filters">
      <template #actions>
        <BaseSwitcher v-model="viewMode" :switches="viewSwitches" />
      </template>
    </WorkflowsFilterToolbar>

    <!-- Content Views -->
    <WorkflowsTable v-if="viewMode === 'table'" :filters="filters" />
    <div v-else class="tw:flex-1 tw:overflow-y-auto">
      <WorkflowsList :filters="filters" />
    </div>
  </BasePage>

  <!-- Create Dialog -->
  <WorkflowCreateDialog v-model="showCreateDialog" @created="handleWorkflowCreated" />
</template>
