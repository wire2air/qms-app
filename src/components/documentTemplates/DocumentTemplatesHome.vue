<script setup>
import { IconFileDescription } from '@tabler/icons-vue'
import { isAllowed } from '@/utils/currentSession.js'
import { getCompanyPath } from '@/utils/routeHelpers.js'

const router = useRouter()

const documentTemplates = useLiveQuery(async (db) => db.DocumentTemplate.where().exec())
const loading = computed(() => documentTemplates.value === undefined)

const canCreate = computed(() => isAllowed(['document-templates:create']))

const totalTemplates = computed(() => (documentTemplates.value || []).length)
const activeTemplates = computed(
  () => (documentTemplates.value || []).filter((t) => t.statusId === 'PUBLISHED').length,
)
const withTraining = computed(
  () => (documentTemplates.value || []).filter((t) => t.trainingAvailable).length,
)

function navigateToCreate() {
  router.push(getCompanyPath('/document-templates/create'))
}
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-3 tw:h-full tw:p-5">
    <SafeTeleport to="#main-header-title">
      <div class="tw:flex tw:items-center tw:gap-2 tw:text-on-sidebar">
        <IconFileDescription class="tw:text-primary" :size="24" />
        <h2 class="tw:text-lg tw:font-bold tw:tracking-tight tw:text-nowrap">Document Templates</h2>
      </div>
    </SafeTeleport>

    <SafeTeleport to="#main-header-actions">
      <BaseButton
        v-if="canCreate"
        data-testid="document-template-create-button"
        @click="navigateToCreate"
      >
        Create Template
      </BaseButton>
    </SafeTeleport>

    <!-- Page Header -->
    <div class="tw:flex tw:items-center tw:justify-between">
      <div class="tw:flex tw:flex-col tw:gap-1">
        <div class="tw:text-3xl tw:font-bold tw:text-on-sidebar">Document Templates</div>
        <div class="tw:text-sm tw:text-secondary">
          Define document lifecycles, metadata, and structural components.
        </div>
      </div>
    </div>

    <!-- Stats Cards -->
    <DocumentTemplatesStatsCards
      :total="totalTemplates"
      :active="activeTemplates"
      :withTraining="withTraining"
      :loading="loading"
    />

    <!-- Templates Table -->
    <DocumentTemplatesTable :rows="documentTemplates || []" :loading="loading" />
  </div>
</template>
