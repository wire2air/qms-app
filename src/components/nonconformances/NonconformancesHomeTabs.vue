<script setup>
/**
 * Nonconformances, with an Insights tab beside the list.
 *
 * Same shape as CapasHomeTabs — see that file for why the LIST is the default
 * tab rather than Insights: this page's list syncs its filters to the URL with
 * `router.replace({ query })`, which replaces the whole query object and drops
 * `?tab=`. Defaulting to the list makes that loss a no-op instead of throwing
 * the user out of the list mid-filter, and keeps the page identical for anyone
 * who never opens Insights.
 */
import { IconChartBar, IconAlertTriangle } from '@tabler/icons-vue'

const route = useRoute()
const router = useRouter()

const tabs = [
  { value: 'nonconformances', label: 'Nonconformances', icon: IconAlertTriangle },
  { value: 'insights', label: 'Insights', icon: IconChartBar },
]

const validTabIds = new Set(tabs.map((t) => t.value))

const activeTab = computed({
  get() {
    return validTabIds.has(route.query.tab) ? route.query.tab : 'nonconformances'
  },
  set(id) {
    router.replace({ query: { ...route.query, tab: id } })
  },
})
</script>

<template>
  <BasePage width="standard">
    <PageHeader :icon="IconAlertTriangle" title="Nonconformances" subtitle="Record, investigate and close nonconformities." />

    <BaseTabs v-model="activeTab" :tabs="tabs" ariaLabel="Nonconformance sections">
      <div class="tw:mt-6">
        <BaseTabPanel value="nonconformances"><NonconformancesHome embedded /></BaseTabPanel>
        <BaseTabPanel value="insights"><ModuleInsightsTab moduleId="ncr" /></BaseTabPanel>
      </div>
    </BaseTabs>
  </BasePage>
</template>
