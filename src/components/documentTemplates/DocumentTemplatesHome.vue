<script setup>
import { IconFileDescription } from '@tabler/icons-vue'
import { isAllowed } from '@/utils/currentSession.js'
import { getCompanyPath } from '@/utils/routeHelpers.js'

const router = useRouter()

// Headless list-page core. This page has no toolbar/filters of its own — it
// just drives the shell's resolved content state (loading / empty / ready)
// off the live query below.
const list = useListLayout({
  filters: {},
  total: () => documentTemplates.value?.length ?? 0,
  loading: () => documentTemplates.value === undefined,
  empty: () => documentTemplates.value?.length === 0,
})

const documentTemplates = useLiveQuery(async (db) => db.DocumentTemplate.where().exec(), {
  models: ['DocumentTemplate'],
})
const loading = computed(() => documentTemplates.value === undefined)

const canCreate = computed(() => isAllowed(['document_templates:create']))

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
  <BaseListLayout
    helpSlug="KB/documents/document-templates"
    title="Document Templates"
    :icon="IconFileDescription"
    subtitle="Define document lifecycles, metadata, and structural components."
    :state="list.state.value"
    :emptyIcon="IconFileDescription"
    emptyTitle="No document templates yet"
  >
    <template #actions>
      <BaseButton v-if="canCreate" @click="navigateToCreate">Create Template</BaseButton>
    </template>

    <template #stats>
      <!-- Stats Cards -->
      <DocumentTemplatesStatsCards
        :total="totalTemplates"
        :active="activeTemplates"
        :withTraining="withTraining"
        :loading="loading"
      />
    </template>

    <template #empty-action>
      <BaseButton v-if="canCreate" @click="navigateToCreate">Create Template</BaseButton>
    </template>

    <!-- Templates Table -->
    <DocumentTemplatesTable :rows="documentTemplates || []" :loading="loading" />
  </BaseListLayout>
</template>
