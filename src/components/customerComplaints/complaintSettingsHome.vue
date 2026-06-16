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
  { id: 'email-channels', label: 'Email Channels', icon: IconMailForward },
  { id: 'forms', label: 'Forms', icon: IconForms },
  { id: 'canned-responses', label: 'Canned Responses', icon: IconMessage2 },
  { id: 'routing', label: 'Routing', icon: IconRoute },
  { id: 'sla', label: 'SLA', icon: IconClockHour4 },
  { id: 'suspended', label: 'Suspended Emails', icon: IconMailPause },
])

// Honor ?tab=<id> deep links (same pattern as Company Settings).
const route = useRoute()
const validTabIds = computed(() => new Set(tabs.value.map((t) => t.id)))
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
  <div class="tw:p-5">
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
      <div class="tw:flex tw:border-b tw:border-divider">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          class="tw:px-5 tw:py-2.5 tw:border-b-2 tw:font-semibold tw:text-sm tw:flex tw:items-center tw:gap-2 tw:transition-colors"
          :class="
            activeTab === tab.id
              ? 'tw:border-primary tw:text-primary'
              : 'tw:border-transparent tw:text-secondary tw:hover:text-on-sidebar'
          "
          @click="activeTab = tab.id"
        >
          <component :is="tab.icon" :size="16" /> {{ tab.label }}
        </button>
      </div>

      <!-- Tab: Email Channels -->
      <div v-if="activeTab === 'email-channels'">
        <EmailChannelsHome />
      </div>

      <!-- Tab: Forms — public complaint intake forms -->
      <div v-else-if="activeTab === 'forms'">
        <ComplaintFormsHome />
      </div>

      <!-- Tab: Canned Responses — agent saved replies -->
      <div v-else-if="activeTab === 'canned-responses'">
        <CannedResponsesHome />
      </div>

      <!-- Tab: Routing — ticket routing rules -->
      <div v-else-if="activeTab === 'routing'">
        <RoutingRulesHome />
      </div>

      <!-- Tab: SLA — response/resolution targets + lifecycle automation -->
      <div v-else-if="activeTab === 'sla'">
        <ComplaintSlaSettings />
      </div>

      <!-- Tab: Suspended — quarantined inbound mail -->
      <div v-else-if="activeTab === 'suspended'">
        <SuspendedEmailsHome />
      </div>
    </div>
  </div>
</template>
