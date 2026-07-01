<script setup>
/**
 * Lookups — tenant master data that used to live under Company Settings →
 * Lookups as one long stacked page. Now a standalone page with one tab per
 * lookup so each list gets the full width and is directly deep-linkable
 * (?tab=<id>). The cards themselves are unchanged — only the layout moved.
 */
import { IconList } from '@tabler/icons-vue'

const tabs = [
  { value: 'nc-dispositions', label: 'NC Dispositions' },
  { value: 'nc-issue-types', label: 'NC Issue Types' },
  { value: 'product-families', label: 'Product Families' },
  { value: 'supplier-certificate-types', label: 'Supplier Certificates' },
  { value: 'audit-standard-types', label: 'Audit Standard Types' },
  { value: 'audit-finding-categories', label: 'Audit Finding Categories' },
  { value: 'event-categories', label: 'Event Categories' },
  { value: 'event-severities', label: 'Event Severities' },
  { value: 'related-standards', label: 'Related Standards' },
]
const validTabIds = new Set(tabs.map((t) => t.value))

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
  <BasePage width="standard">
    <PageHeader
      :icon="IconList"
      title="Lookups"
      subtitle="Shared master data — dispositions, issue types, certificate types and audit categories used across the QMS."
    />

    <div class="tw:flex tw:flex-col tw:gap-6 tw:max-w-6xl">
      <BaseTabs v-model="activeTab" :tabs="tabs" ariaLabel="Lookups">
        <BaseTabPanel value="nc-dispositions"><NcDispositionTypesCard /></BaseTabPanel>
        <BaseTabPanel value="nc-issue-types"><NcIssueTypesCard /></BaseTabPanel>
        <BaseTabPanel value="product-families"><ProductFamiliesCard /></BaseTabPanel>
        <BaseTabPanel value="supplier-certificate-types">
          <SupplierCertificateTypesCard />
        </BaseTabPanel>
        <BaseTabPanel value="audit-standard-types"><AuditStandardTypesCard /></BaseTabPanel>
        <BaseTabPanel value="audit-finding-categories"><AuditFindingCategoriesCard /></BaseTabPanel>
        <BaseTabPanel value="event-categories"><EventCategoriesCard /></BaseTabPanel>
        <BaseTabPanel value="event-severities"><EventSeveritiesCard /></BaseTabPanel>
        <BaseTabPanel value="related-standards"><RelatedStandardsCard /></BaseTabPanel>
      </BaseTabs>
    </div>
  </BasePage>
</template>
