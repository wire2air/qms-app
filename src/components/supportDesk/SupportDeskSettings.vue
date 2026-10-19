<script setup>
import {
  IconArrowLeft,
  IconTag,
  IconHeadphones,
  IconSpeakerphone,
  IconMailForward,
  IconForms,
  IconMessage2,
  IconRoute,
  IconClockHour4,
  IconMailPause,
  IconMailOff,
} from '@tabler/icons-vue'
import { isAllowed } from '@/utils/currentSession.js'
import { getCompanyPath } from '@/utils/routeHelpers.js'

/**
 * Support Desk settings, hosted INSIDE the desk shell (no QMS chrome) so a
 * Support Admin never leaves their product. Same tab components as the QMS
 * framed settings page — one implementation, two frames.
 */
const route = useRoute()
const router = useRouter()
const canConfigure = computed(() => isAllowed(['complaint_management:update']))

const tabs = [
  { value: 'brands', label: 'Brands', icon: IconTag },
  { value: 'agents', label: 'Agents', icon: IconHeadphones },
  { value: 'outbound', label: 'Outbound Messages', icon: IconSpeakerphone },
  { value: 'email-channels', label: 'Email Channels', icon: IconMailForward },
  { value: 'forms', label: 'Forms', icon: IconForms },
  { value: 'canned-responses', label: 'Canned Responses', icon: IconMessage2 },
  { value: 'routing', label: 'Routing', icon: IconRoute },
  { value: 'sla', label: 'SLA', icon: IconClockHour4 },
  { value: 'suspended', label: 'Suspended Emails', icon: IconMailPause },
  { value: 'blocklist', label: 'Spam Blocklist', icon: IconMailOff },
]
const valid = new Set(tabs.map((t) => t.value))
const activeTab = ref(valid.has(route.query.tab) ? route.query.tab : 'brands')
watch(activeTab, (t) => router.replace({ query: { ...route.query, tab: t } }))
watch(
  () => route.query.tab,
  (t) => {
    if (valid.has(t) && t !== activeTab.value) activeTab.value = t
  },
)
</script>

<template>
  <div
    class="tw:flex tw:h-screen tw:w-full tw:flex-col tw:overflow-hidden tw:bg-main tw:text-on-main"
  >
    <header
      class="tw:flex tw:items-center tw:gap-2 tw:border-b tw:border-divider tw:bg-card tw:px-4 tw:py-2"
    >
      <button
        class="tw:rounded-md tw:p-1 tw:text-secondary tw:hover:bg-main-hover tw:hover:text-on-main"
        aria-label="Back to inbox"
        @click="router.push(getCompanyPath('/desk'))"
      >
        <IconArrowLeft :size="18" />
      </button>
      <h1 class="tw:flex-1 tw:text-sm tw:font-semibold">Support Desk settings</h1>
      <SupportAgentPresence />
    </header>

    <div class="tw:flex-1 tw:overflow-y-auto">
      <div class="tw:mx-auto tw:max-w-6xl tw:p-4 tw:sm:p-6">
        <BaseEmptyState
          v-if="!canConfigure"
          title="Settings are for Support Admins"
          description="Ask a Support Admin to change brands, agents or channels. Your own preferences are under the account menu."
        />
        <BaseTabs
          v-else
          v-model="activeTab"
          :tabs="tabs"
          ariaLabel="Support Desk settings sections"
        >
          <div class="tw:mt-6">
            <BaseTabPanel value="brands"><SupportBrandsHome /></BaseTabPanel>
            <BaseTabPanel value="agents"><SupportAgentsHome /></BaseTabPanel>
            <BaseTabPanel value="outbound"><SupportOutboundHome /></BaseTabPanel>
            <BaseTabPanel value="email-channels"><EmailChannelsHome /></BaseTabPanel>
            <BaseTabPanel value="forms"><ComplaintFormsHome /></BaseTabPanel>
            <BaseTabPanel value="canned-responses"><CannedResponsesHome /></BaseTabPanel>
            <BaseTabPanel value="routing"><RoutingRulesHome /></BaseTabPanel>
            <BaseTabPanel value="sla"><ComplaintSlaSettings /></BaseTabPanel>
            <BaseTabPanel value="suspended"><SuspendedEmailsHome /></BaseTabPanel>
            <BaseTabPanel value="blocklist"><SupportBlocklistHome /></BaseTabPanel>
          </div>
        </BaseTabs>
      </div>
    </div>
  </div>
</template>
