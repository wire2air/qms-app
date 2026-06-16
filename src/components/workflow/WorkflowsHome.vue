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
  <div class="tw:flex tw:flex-col tw:gap-3 tw:h-full tw:p-5">
    <PageHeader :icon="IconSitemap" title="Workflows" />

    <SafeTeleport to="#main-header-actions">
      <BaseButton v-if="canCreateWorkflow" @click="showCreateDialog = true">
        Create Workflow
      </BaseButton>
    </SafeTeleport>

    <!-- Page Header -->
    <div class="tw:flex tw:items-center tw:justify-between">
      <div class="tw:flex tw:flex-col tw:gap-1">
        <div class="tw:text-3xl tw:font-bold tw:text-on-sidebar">Workflows</div>
        <div class="tw:text-sm tw:text-secondary">
          Design and manage multi-step workflow sequences for Documents and NCs.
        </div>
      </div>
    </div>

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
  </div>

  <!-- Create Dialog -->
  <WorkflowCreateDialog v-model="showCreateDialog" @created="handleWorkflowCreated" />
</template>
