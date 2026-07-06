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
  // Complaint QMS lookups (per-tenant).
  { value: 'complaint-sources', label: 'Complaint Sources' },
  { value: 'complaint-regions', label: 'Complaint Regions' },
  { value: 'complaint-countries', label: 'Complaint Countries' },
  { value: 'complaint-customer-types', label: 'Complaint Customer Types' },
  { value: 'complaint-categories', label: 'Complaint Categories' },
  { value: 'complaint-sub-categories', label: 'Complaint Sub-categories' },
  { value: 'complaint-types', label: 'Complaint Types' },
  { value: 'complaint-severities', label: 'Complaint Severities' },
  { value: 'complaint-risk-levels', label: 'Complaint Risk Levels' },
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

        <BaseTabPanel value="complaint-sources">
          <ComplaintLookupCard
model="ComplaintSourceType" title="Complaint Source"
            subtitle="Who reported the complaint (Customer, Distributor, Sales Rep…). Scoped to this company." />
        </BaseTabPanel>
        <BaseTabPanel value="complaint-regions">
          <ComplaintLookupCard
model="ComplaintRegion" title="Region"
            subtitle="Geographic regions a complaint can originate from." />
        </BaseTabPanel>
        <BaseTabPanel value="complaint-countries">
          <ComplaintLookupCard
model="ComplaintCountry" title="Country"
            parentModel="ComplaintRegion" parentField="regionId" parentLabel="Region"
            subtitle="Countries of origin, grouped by region." />
        </BaseTabPanel>
        <BaseTabPanel value="complaint-customer-types">
          <ComplaintLookupCard
model="ComplaintCustomerType" title="Customer Type"
            subtitle="End User, Distributor, Healthcare Facility, …" />
        </BaseTabPanel>
        <BaseTabPanel value="complaint-categories">
          <ComplaintLookupCard
model="ComplaintCategory" title="Category"
            subtitle="Top-level complaint classification (parent of sub-categories)." />
        </BaseTabPanel>
        <BaseTabPanel value="complaint-sub-categories">
          <ComplaintLookupCard
model="ComplaintSubCategory" title="Sub-category"
            parentModel="ComplaintCategory" parentField="categoryId" parentLabel="Category"
            subtitle="Dependent detail under a category (QA fills this during investigation)." />
        </BaseTabPanel>
        <BaseTabPanel value="complaint-types">
          <ComplaintLookupCard
model="ComplaintType" title="Complaint Type"
            subtitle="Product, Service, Delivery, Billing, …" />
        </BaseTabPanel>
        <BaseTabPanel value="complaint-severities">
          <ComplaintLookupCard
model="ComplaintSeverity" title="Severity" :hasColor="true"
            subtitle="Severity classification with colour + rank." />
        </BaseTabPanel>
        <BaseTabPanel value="complaint-risk-levels">
          <ComplaintLookupCard
model="ComplaintRiskLevel" title="Risk Level" :hasColor="true"
            subtitle="Risk classification with colour + rank." />
        </BaseTabPanel>
      </BaseTabs>
    </div>
  </BasePage>
</template>
