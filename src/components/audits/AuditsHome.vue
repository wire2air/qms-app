<script setup>
/**
 * Audits landing — tabbed surface for the three Audit module sections.
 *
 * Phase B-1 ships only the Standards list (live read of seeded
 * standards). Programs + Instances tabs are placeholders pointing at
 * the next phase. Deep-linkable via ?tab=<id> for share-links.
 */
import { IconClipboardCheck, IconBook, IconCalendarTime, IconChecklist } from '@tabler/icons-vue'

// Standards + Programs tabs are live; Audits/Instances ships in Phase C.

const tabs = [
  { id: 'standards', label: 'Standards', icon: IconBook },
  { id: 'programs', label: 'Programs', icon: IconCalendarTime },
  { id: 'instances', label: 'Audits', icon: IconChecklist },
]

const route = useRoute()
const router = useRouter()
const validTabIds = new Set(tabs.map((t) => t.id))
const initialTab = validTabIds.has(route.query.tab) ? route.query.tab : 'standards'
const activeTab = ref(initialTab)
watch(
  () => route.query.tab,
  (v) => {
    if (v && validTabIds.has(v)) activeTab.value = v
  },
)
function setTab(id) {
  activeTab.value = id
  router.replace({ query: { ...route.query, tab: id } })
}
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-3 tw:h-full tw:p-5">
    <SafeTeleport to="#main-header-title">
      <div class="tw:flex tw:items-center tw:gap-2 tw:text-on-sidebar">
        <IconClipboardCheck class="tw:text-primary" :size="24" />
        <h2 class="tw:text-lg tw:font-bold tw:tracking-tight tw:text-nowrap">Audits</h2>
      </div>
    </SafeTeleport>

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
    <div class="tw:flex tw:border-b tw:border-divider">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        class="tw:px-5 tw:py-2.5 tw:border-b-2 tw:font-semibold tw:text-sm tw:flex tw:items-center tw:gap-2 tw:transition-colors tw:bg-transparent tw:cursor-pointer"
        :class="
          activeTab === tab.id
            ? 'tw:border-primary tw:text-primary'
            : 'tw:border-transparent tw:text-secondary tw:hover:text-on-sidebar'
        "
        @click="setTab(tab.id)"
      >
        <component :is="tab.icon" :size="16" /> {{ tab.label }}
      </button>
    </div>

    <AuditStandardsHome v-if="activeTab === 'standards'" />
    <AuditProgramsHome v-else-if="activeTab === 'programs'" />
    <div
      v-else-if="activeTab === 'instances'"
      class="tw:flex tw:flex-col tw:items-center tw:justify-center tw:gap-2 tw:py-16 tw:text-secondary"
    >
      <IconChecklist :size="40" class="tw:opacity-50" />
      <div class="tw:text-base tw:font-semibold">Audit instances — next phase</div>
      <div class="tw:text-sm tw:text-center tw:max-w-md">
        The actual audits — requirement execution screen, findings, evidence. Ships in
        Phase C.
      </div>
    </div>
  </div>
</template>
