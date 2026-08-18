<script setup>
/**
 * Documents, with an Insights tab beside the list.
 *
 * Same shape and same reasoning as CapasHomeTabs — the LIST is the default tab
 * because this page's list syncs filters to the URL with
 * `router.replace({ query })`, which replaces the whole query and drops `?tab=`.
 * Defaulting to the list makes that loss a no-op rather than ejecting the user
 * mid-filter.
 */
import { IconChartBar, IconFileText } from '@tabler/icons-vue'

const route = useRoute()
const router = useRouter()

const tabs = [
  { value: 'documents', label: 'Documents', icon: IconFileText },
  { value: 'insights', label: 'Insights', icon: IconChartBar },
]

const validTabIds = new Set(tabs.map((t) => t.value))

const activeTab = computed({
  get() {
    return validTabIds.has(route.query.tab) ? route.query.tab : 'documents'
  },
  set(id) {
    router.replace({ query: { ...route.query, tab: id } })
  },
})
</script>

<template>
  <BasePage width="standard">
    <PageHeader :icon="IconFileText" title="Documents" subtitle="Controlled documents, versions and their approval history." />

    <BaseTabs v-model="activeTab" :tabs="tabs" ariaLabel="Document sections">
      <div class="tw:mt-6">
        <BaseTabPanel value="documents"><DocumentsHome embedded /></BaseTabPanel>
        <BaseTabPanel value="insights"><ModuleInsightsTab moduleId="document_control" /></BaseTabPanel>
      </div>
    </BaseTabs>
  </BasePage>
</template>
