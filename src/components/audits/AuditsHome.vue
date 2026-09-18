<script setup>
/**
 * Audits landing — one section at a time, chosen from the sidebar.
 *
 * The five sections used to be a tab strip. They were promoted to sidebar
 * sub-menu items, but the strip stayed, so every audit page showed the same
 * five choices twice — once in the nav, once under the title (reported
 * 2026-08-17).
 *
 * `?tab=<id>` remains the source of truth: the sidebar links point at it, and
 * its active-item highlighting keys off route.query.tab. Only the duplicate
 * control is gone, not the routing.
 *
 * The header now names the SECTION rather than always saying "Audits". With
 * the strip removed there was nothing left to say which of the five you were
 * looking at — the title teleports into the top bar, so it is the only label
 * on screen. (PageHeader accepts a subtitle but does not render it in the
 * compact bar; kept per-section anyway so it is right if that changes.)
 */
import {
  IconBook,
  IconCalendarTime,
  IconCalendar,
  IconChecklist,
  IconChartBar,
  IconShieldCheck,
} from '@tabler/icons-vue'

const SECTIONS = {
  insights: {
    label: 'Insights',
    icon: IconChartBar,
    subtitle: 'Conformance trends, findings by standard, and audit throughput.',
  },
  instances: {
    label: 'Audits',
    icon: IconChecklist,
    subtitle: 'Internal, external and supplier audits — scheduled, in progress and closed.',
  },
  programs: {
    label: 'Audit Plan',
    icon: IconCalendarTime,
    subtitle: 'Recurring audit programs and the schedule they generate.',
  },
  calendar: {
    label: 'Calendar',
    icon: IconCalendar,
    subtitle: 'Planned and in-flight audits across the year.',
  },
  standards: {
    label: 'Standards',
    icon: IconBook,
    subtitle: 'The clause libraries audits are conducted against.',
  },
  readiness: {
    label: 'Audit Readiness',
    icon: IconShieldCheck,
    subtitle: 'Open gaps an auditor would find — close them before the audit does.',
  },
}

const route = useRoute()
const router = useRouter()

// Unknown or absent ?tab lands on Insights rather than a blank page — the
// sidebar always supplies one, but a hand-edited URL might not.
const activeTab = computed(() =>
  Object.hasOwn(SECTIONS, route.query.tab) ? route.query.tab : 'insights',
)
const section = computed(() => SECTIONS[activeTab.value])

// The sidebar now shows ONE "Auditor" entry (the Auditee module is its
// sibling), so the auditor working sections regained their tab strip
// (2026-08-24). Calendar is NOT one of them — it shows every audit,
// internal, supplier and certification alike, so it has its own sidebar
// entry beside Auditee. Standards + Readiness likewise render without the
// strip.
const AUDITOR_TAB_IDS = ['insights', 'instances', 'programs']
const auditorTabs = AUDITOR_TAB_IDS.map((id) => ({
  value: id,
  label: SECTIONS[id].label,
  icon: SECTIONS[id].icon,
}))
const showAuditorTabs = computed(() => AUDITOR_TAB_IDS.includes(activeTab.value))
const tabModel = computed({
  get: () => activeTab.value,
  set: (tab) => router.push({ query: { ...route.query, tab } }),
})
</script>

<template>
  <BasePage width="standard">
    <PageHeader
      :icon="section.icon"
      :title="showAuditorTabs ? 'Auditor' : section.label"
      :subtitle="section.subtitle"
    >
      <template #title>
        <span class="tw:inline-flex tw:items-center tw:gap-1.5">
          {{ showAuditorTabs ? 'Auditor' : section.label }}
          <HelpButton v-if="showAuditorTabs" slug="KB/quality/audits-auditor" :size="16" />
        </span>
      </template>
    </PageHeader>

    <BaseTabs
      v-if="showAuditorTabs"
      v-model="tabModel"
      :tabs="auditorTabs"
      ariaLabel="Auditor sections"
    />

    <!-- One section. Which one is a sidebar decision, not a second control
         repeated on every page. -->
    <AuditsInsightsDashboard v-if="activeTab === 'insights'" />
    <AuditInstancesHome v-else-if="activeTab === 'instances'" />
    <AuditProgramsHome v-else-if="activeTab === 'programs'" />
    <AuditScheduleCalendar v-else-if="activeTab === 'calendar'" />
    <AuditStandardsHome v-else-if="activeTab === 'standards'" />
    <AuditReadinessDashboard v-else-if="activeTab === 'readiness'" />
  </BasePage>
</template>
