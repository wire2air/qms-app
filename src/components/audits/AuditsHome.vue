<script setup>
/**
 * Audits landing — tabbed surface for the three Audit module sections.
 *
 * Phase B-1 ships only the Standards list (live read of seeded
 * standards). Programs + Instances tabs are placeholders pointing at
 * the next phase. Deep-linkable via ?tab=<id> for share-links.
 */
import {
  IconClipboardCheck,
  IconBook,
  IconCalendarTime,
  IconCalendar,
  IconChecklist,
  IconChartBar,
} from '@tabler/icons-vue'

// Insights / Standards / Programs / Instances — all live.

const tabs = [
  { value: 'insights', label: 'Insights', icon: IconChartBar },
  { value: 'instances', label: 'Audits', icon: IconChecklist },
  { value: 'programs', label: 'Audit Plan', icon: IconCalendarTime },
  { value: 'calendar', label: 'Calendar', icon: IconCalendar },
  { value: 'standards', label: 'Standards', icon: IconBook },
]

const route = useRoute()
const router = useRouter()
const validTabIds = new Set(tabs.map((t) => t.value))
const activeTab = computed({
  get() {
    return validTabIds.has(route.query.tab) ? route.query.tab : 'insights'
  },
  set(id) {
    router.replace({ query: { ...route.query, tab: id } })
  },
})
</script>

<template>
  <BasePage width="standard" density="compact">
    <PageHeader :icon="IconClipboardCheck" title="Audits" />

    <div class="tw:flex tw:items-center tw:justify-between">
      <div class="tw:flex tw:flex-col tw:gap-1">
        <div class="tw:text-3xl tw:font-bold tw:text-on-sidebar">Audits</div>
        <div class="tw:text-sm tw:text-secondary">
          Manage the standards library, recurring audit programs, and audit instances —
          internal, external, and supplier.
        </div>
      </div>
    </div>

    <!-- Tabs — Standards (live; CRUD ships in this phase), Programs (next),
         Audits/Instances (next). The standards tab works today against
         the bootstrap-seeded "Internal Quality Audit" shell. -->
    <BaseTabs v-model="activeTab" :tabs="tabs" ariaLabel="Audit sections">
      <div class="tw:mt-6">
        <BaseTabPanel value="insights"><AuditsInsightsDashboard /></BaseTabPanel>
        <BaseTabPanel value="standards"><AuditStandardsHome /></BaseTabPanel>
        <BaseTabPanel value="programs"><AuditProgramsHome /></BaseTabPanel>
        <BaseTabPanel value="instances"><AuditInstancesHome /></BaseTabPanel>
        <BaseTabPanel value="calendar"><AuditScheduleCalendar /></BaseTabPanel>
      </div>
    </BaseTabs>
  </BasePage>
</template>
