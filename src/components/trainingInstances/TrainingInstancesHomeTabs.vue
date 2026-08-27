<script setup>
/**
 * Training, with an Insights tab beside the list.
 *
 * Same shape and same reasoning as CapasHomeTabs — the LIST is the default tab
 * because someone navigating to a records page came for the records. (It began
 * as a workaround for `useListLayout` replacing the whole query and dropping
 * `?tab=`; that writer now merges, so the tab survives either way.)
 */
import { IconChartBar, IconSchool } from '@tabler/icons-vue'

const route = useRoute()
const router = useRouter()

const tabs = [
  { value: 'instances', label: 'Training', icon: IconSchool },
  { value: 'insights', label: 'Insights', icon: IconChartBar },
]

const validTabIds = new Set(tabs.map((t) => t.value))

const activeTab = computed({
  get() {
    return validTabIds.has(route.query.tab) ? route.query.tab : 'instances'
  },
  set(id) {
    router.replace({ query: { ...route.query, tab: id } })
  },
})
</script>

<template>
  <BasePage width="standard">
    <PageHeader :icon="IconSchool" title="Training" subtitle="Assigned training, completion and compliance." />

    <BaseTabs v-model="activeTab" :tabs="tabs" ariaLabel="Training sections">
      <div class="tw:mt-6">
        <BaseTabPanel value="instances"><TrainingInstancesHome embedded /></BaseTabPanel>
        <BaseTabPanel value="insights"><ModuleInsightsTab moduleId="training_instances" /></BaseTabPanel>
      </div>
    </BaseTabs>
  </BasePage>
</template>
