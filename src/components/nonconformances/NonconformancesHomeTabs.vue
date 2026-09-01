<script setup>
/**
 * Nonconformances, with an Insights tab beside the list.
 *
 * Same shape and same reasoning as CapasHomeTabs — the LIST is the default tab
 * because someone navigating to a records page came for the records. (It began
 * as a workaround for `useListLayout` replacing the whole query and dropping
 * `?tab=`; that writer now merges, so the tab survives either way.)
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
    <PageHeader
      :icon="IconAlertTriangle"
      title="Nonconformances"
      subtitle="Record, investigate and close nonconformities."
    >
      <template #title>
        <span class="tw:inline-flex tw:items-center tw:gap-1.5">
          Nonconformances
          <HelpButton slug="KB/quality/nonconformances" :size="16" />
        </span>
      </template>
    </PageHeader>

    <BaseTabs v-model="activeTab" :tabs="tabs" ariaLabel="Nonconformance sections">
      <div class="tw:mt-6">
        <BaseTabPanel value="nonconformances"><NonconformancesHome embedded /></BaseTabPanel>
        <BaseTabPanel value="insights"><ModuleInsightsTab moduleId="ncr" /></BaseTabPanel>
      </div>
    </BaseTabs>
  </BasePage>
</template>
