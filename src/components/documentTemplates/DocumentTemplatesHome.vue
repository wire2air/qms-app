<script setup>
import { IconFileDescription } from '@tabler/icons-vue'
import { isAllowed } from '@/utils/currentSession.js'
import { getCompanyPath } from '@/utils/routeHelpers.js'

const router = useRouter()

const documentTemplates = useLiveQuery(async (db) => db.DocumentTemplate.where().exec(), {
  models: ['DocumentTemplate'],
})
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
  <BasePage width="standard">
    <PageHeader
      :icon="IconFileDescription"
      title="Document Templates"
      subtitle="Define document lifecycles, metadata, and structural components."
    >
      <template #actions>
        <BaseButton v-if="canCreate" @click="navigateToCreate">Create Template</BaseButton>
      </template>
    </PageHeader>

    <!-- Stats Cards -->
    <DocumentTemplatesStatsCards
      :total="totalTemplates"
      :active="activeTemplates"
      :withTraining="withTraining"
      :loading="loading"
    />

    <!-- Templates Table -->
    <DocumentTemplatesTable :rows="documentTemplates || []" :loading="loading" />
  </BasePage>
</template>
