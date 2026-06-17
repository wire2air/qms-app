<script setup>
import {
  IconHeadset,
  IconMailForward,
  IconForms,
  IconMessage2,
  IconRoute,
  IconClockHour4,
  IconMailPause,
} from '@tabler/icons-vue'

/**
 * Customer Complaint settings hub — the module's own admin area
 * (Zendesk Admin Center equivalent), independent from Company Settings.
 *
 * Tabs grow with the module:
 *   email-channels  — support addresses (live)
 *   forms           — channel forms / dynamic form builder (Phase 2)
 *   custom-fields   — ticket custom attributes (Phase 2)
 *   canned-responses— saved replies (Phase 4)
 *   routing         — trigger/rule engine (Phase 5)
 */
const tabs = computed(() => [
  { value: 'email-channels', label: 'Email Channels', icon: IconMailForward },
  { value: 'forms', label: 'Forms', icon: IconForms },
  { value: 'canned-responses', label: 'Canned Responses', icon: IconMessage2 },
  { value: 'routing', label: 'Routing', icon: IconRoute },
  { value: 'sla', label: 'SLA', icon: IconClockHour4 },
  { value: 'suspended', label: 'Suspended Emails', icon: IconMailPause },
])

// Honor ?tab=<id> deep links (same pattern as Company Settings).
const route = useRoute()
const validTabIds = computed(() => new Set(tabs.value.map((t) => t.value)))
const initialTab = validTabIds.value.has(route.query.tab) ? route.query.tab : 'email-channels'
const activeTab = ref(initialTab)
watch(
  () => route.query.tab,
  (v) => {
    if (v && validTabIds.value.has(v)) activeTab.value = v
  },
)
</script>

<template>
  <BasePage width="standard">
    <PageHeader :icon="IconHeadset" title="Complaint Settings" />

    <div class="tw:flex tw:flex-col tw:gap-6 tw:max-w-6xl">
      <div class="tw:flex tw:flex-col tw:gap-1">
        <div class="tw:text-3xl tw:font-bold tw:text-on-sidebar">Complaint Settings</div>
        <div class="tw:text-sm tw:text-secondary">
          Configure how customer complaints reach and move through your support queue — email
          channels, intake forms, and ticket fields.
        </div>
      </div>

      <!-- Tabs -->
      <BaseTabs v-model="activeTab" :tabs="tabs" ariaLabel="Complaint settings sections">
        <div class="tw:mt-6">
          <!-- Tab: Email Channels -->
          <BaseTabPanel value="email-channels">
            <EmailChannelsHome />
          </BaseTabPanel>

          <!-- Tab: Forms — public complaint intake forms -->
          <BaseTabPanel value="forms">
            <ComplaintFormsHome />
          </BaseTabPanel>

          <!-- Tab: Canned Responses — agent saved replies -->
          <BaseTabPanel value="canned-responses">
            <CannedResponsesHome />
          </BaseTabPanel>

          <!-- Tab: Routing — ticket routing rules -->
          <BaseTabPanel value="routing">
            <RoutingRulesHome />
          </BaseTabPanel>

          <!-- Tab: SLA — response/resolution targets + lifecycle automation -->
          <BaseTabPanel value="sla">
            <ComplaintSlaSettings />
          </BaseTabPanel>

          <!-- Tab: Suspended — quarantined inbound mail -->
          <BaseTabPanel value="suspended">
            <SuspendedEmailsHome />
          </BaseTabPanel>
        </div>
      </BaseTabs>
    </div>
  </BasePage>
</template>
