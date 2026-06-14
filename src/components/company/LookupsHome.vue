<script setup>
/**
 * Lookups — tenant master data that used to live under Company Settings →
 * Lookups as one long stacked page. Now a standalone page with one tab per
 * lookup so each list gets the full width and is directly deep-linkable
 * (?tab=<id>). The cards themselves are unchanged — only the layout moved.
 */
import { IconList } from '@tabler/icons-vue'

const tabs = [
  { id: 'nc-dispositions', label: 'NC Dispositions' },
  { id: 'nc-issue-types', label: 'NC Issue Types' },
  { id: 'supplier-certificate-types', label: 'Supplier Certificates' },
  { id: 'audit-standard-types', label: 'Audit Standard Types' },
  { id: 'audit-finding-categories', label: 'Audit Finding Categories' },
]
const validTabIds = new Set(tabs.map((t) => t.id))

const route = useRoute()
const activeTab = ref(validTabIds.has(route.query.tab) ? route.query.tab : 'nc-dispositions')
watch(
  () => route.query.tab,
  (v) => {
    if (v && validTabIds.has(v)) activeTab.value = v
  },
)
</script>

<template>
  <div class="tw:p-5">
    <SafeTeleport to="#main-header-title">
      <div class="tw:flex tw:items-center tw:gap-2 tw:text-on-sidebar">
        <IconList class="tw:text-primary tw:size-6" />
        <h2 class="tw:text-lg tw:font-bold tw:tracking-tight tw:text-nowrap">Lookups</h2>
      </div>
    </SafeTeleport>

    <div class="tw:flex tw:flex-col tw:gap-6 tw:max-w-6xl">
      <div class="tw:flex tw:flex-col tw:gap-1">
        <div class="tw:text-3xl tw:font-bold tw:text-on-sidebar">Lookups</div>
        <div class="tw:text-sm tw:text-secondary">
          Shared master data — dispositions, issue types, certificate types and audit categories
          used across the QMS.
        </div>
      </div>

      <!-- Tabs -->
      <div class="tw:flex tw:border-b tw:border-divider tw:overflow-x-auto">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          class="tw:px-5 tw:py-2.5 tw:border-b-2 tw:font-semibold tw:text-sm tw:whitespace-nowrap tw:transition-colors"
          :class="activeTab === tab.id
            ? 'tw:border-primary tw:text-primary'
            : 'tw:border-transparent tw:text-secondary tw:hover:text-on-sidebar'"
          @click="activeTab = tab.id"
        >
          {{ tab.label }}
        </button>
      </div>

      <NcDispositionTypesCard v-if="activeTab === 'nc-dispositions'" />
      <NcIssueTypesCard v-else-if="activeTab === 'nc-issue-types'" />
      <SupplierCertificateTypesCard v-else-if="activeTab === 'supplier-certificate-types'" />
      <AuditStandardTypesCard v-else-if="activeTab === 'audit-standard-types'" />
      <AuditFindingCategoriesCard v-else-if="activeTab === 'audit-finding-categories'" />
    </div>
  </div>
</template>
