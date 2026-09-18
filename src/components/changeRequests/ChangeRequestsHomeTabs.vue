<script setup>
/**
 * Change Requests, with an Insights tab beside the list.
 *
 * Same shape and same reasoning as CapasHomeTabs — the LIST is the default tab
 * because someone navigating to a records page came for the records. (It began
 * as a workaround for `useListLayout` replacing the whole query and dropping
 * `?tab=`; that writer now merges, so the tab survives either way.)
 */
import { IconChartBar, IconGitBranch } from '@tabler/icons-vue'

const route = useRoute()
const router = useRouter()

const tabs = [
  { value: 'changeRequests', label: 'Change Requests', icon: IconGitBranch },
  { value: 'insights', label: 'Insights', icon: IconChartBar },
]

const validTabIds = new Set(tabs.map((t) => t.value))

const activeTab = computed({
  get() {
    return validTabIds.has(route.query.tab) ? route.query.tab : 'changeRequests'
  },
  set(id) {
    router.replace({ query: { ...route.query, tab: id } })
  },
})
</script>

<template>
  <BasePage width="standard">
    <PageHeader
      :icon="IconGitBranch"
      title="Change Requests"
      subtitle="Propose, review and approve controlled changes."
    >
      <template #title>
        <span class="tw:inline-flex tw:items-center tw:gap-1.5">
          Change Requests
          <HelpButton slug="KB/quality/change-requests" :size="16" />
        </span>
      </template>
    </PageHeader>

    <BaseTabs v-model="activeTab" :tabs="tabs" ariaLabel="Change request sections">
      <div class="tw:mt-6">
        <BaseTabPanel value="changeRequests"><ChangeRequestsHome embedded /></BaseTabPanel>
        <BaseTabPanel value="insights"
          ><ModuleInsightsTab moduleId="change_control"
        /></BaseTabPanel>
      </div>
    </BaseTabs>
  </BasePage>
</template>
