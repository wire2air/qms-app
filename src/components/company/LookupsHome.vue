<script setup>
/**
 * Lookups — tenant master data. There are now ~20 lookups, so instead of one
 * long horizontal tab strip the picker is a single grouped, searchable
 * dropdown; the chosen lookup's card renders below it. Selection is still
 * deep-linkable via ?tab=<id>. Only the active card mounts (v-if), so its live
 * queries don't run for lookups you're not looking at.
 */
import { IconList } from '@tabler/icons-vue'

const tabs = [
  { value: 'nc-dispositions', label: 'NC Dispositions', group: 'Nonconformance' },
  { value: 'nc-issue-types', label: 'NC Issue Types', group: 'Nonconformance' },
  { value: 'item-categories', label: 'Item Categories', group: 'Products & Suppliers' },
  { value: 'product-families', label: 'Item Groups', group: 'Products & Suppliers' },
  { value: 'uoms', label: 'Units of Measure', group: 'Products & Suppliers' },
  { value: 'supplier-certificate-types', label: 'Supplier Certificates', group: 'Products & Suppliers' },
  { value: 'log-book-types', label: 'Log Book Types', group: 'Inspections & Logs' },
  { value: 'production-lines', label: 'Production Lines', group: 'QC Inspection' },
  { value: 'storage-locations', label: 'Storage Locations', group: 'QC Inspection' },
  { value: 'shifts', label: 'Shifts', group: 'QC Inspection' },
  { value: 'audit-standard-types', label: 'Audit Standard Types', group: 'Audit' },
  { value: 'audit-finding-categories', label: 'Audit Finding Categories', group: 'Audit' },
  { value: 'event-categories', label: 'Event Categories', group: 'Events' },
  { value: 'event-severities', label: 'Event Severities', group: 'Events' },
  { value: 'related-standards', label: 'Related Standards', group: 'People & Standards' },
  { value: 'employee-titles', label: 'Employee Titles', group: 'People & Standards' },
  // Complaint QMS lookups (per-tenant).
  { value: 'complaint-sources', label: 'Complaint Sources', group: 'Complaints' },
  { value: 'countries-regions', label: 'Countries & Regions (Global)', group: 'General' },
  { value: 'complaint-customer-types', label: 'Complaint Customer Types', group: 'Complaints' },
  { value: 'complaint-categories', label: 'Complaint Categories', group: 'Complaints' },
  { value: 'complaint-sub-categories', label: 'Complaint Sub-categories', group: 'Complaints' },
  { value: 'complaint-types', label: 'Complaint Types', group: 'Complaints' },
  { value: 'complaint-severities', label: 'Complaint Severities', group: 'Complaints' },
  { value: 'complaint-risk-levels', label: 'Complaint Risk Levels', group: 'Complaints' },
  { value: 'complaint-report-schemes', label: 'Complaint Report Schemes', group: 'Complaints' },
]
const validTabIds = new Set(tabs.map((t) => t.value))

const route = useRoute()
const router = useRouter()
const activeTab = ref(validTabIds.has(route.query.tab) ? route.query.tab : 'nc-dispositions')
watch(
  () => route.query.tab,
  (v) => {
    if (v && validTabIds.has(v)) activeTab.value = v
  },
)
// Keep the URL in sync so the current lookup is deep-linkable / bookmarkable.
watch(activeTab, (v) => {
  if (route.query.tab !== v) router.replace({ query: { ...route.query, tab: v } })
})
</script>

<template>
  <BasePage width="standard">
    <PageHeader
      :icon="IconList"
      title="Lookups"
      subtitle="Shared master data — dispositions, issue types, certificate types and audit categories used across the QMS."
    />

    <div class="tw:flex tw:flex-col tw:gap-6 tw:max-w-6xl">
      <div class="tw:max-w-sm">
        <label class="tw:text-xs tw:font-medium tw:text-secondary tw:mb-1 tw:block">Lookup</label>
        <BaseSelect
          v-model="activeTab"
          :options="tabs"
          optionLabel="label"
          optionValue="value"
          optionGroup="group"
          :clearable="false"
          ariaLabel="Select lookup"
        />
      </div>

      <LogBookTypesCard v-if="activeTab === 'log-book-types'" />
      <ProductionLinesCard v-else-if="activeTab === 'production-lines'" />
      <StorageLocationsCard v-else-if="activeTab === 'storage-locations'" />
      <ShiftsCard v-else-if="activeTab === 'shifts'" />
      <NcDispositionTypesCard v-else-if="activeTab === 'nc-dispositions'" />
      <NcIssueTypesCard v-else-if="activeTab === 'nc-issue-types'" />
      <ItemCategoriesCard v-else-if="activeTab === 'item-categories'" />
      <ProductFamiliesCard v-else-if="activeTab === 'product-families'" />
      <UnitsOfMeasureCard v-else-if="activeTab === 'uoms'" />
      <SupplierCertificateTypesCard v-else-if="activeTab === 'supplier-certificate-types'" />
      <AuditStandardTypesCard v-else-if="activeTab === 'audit-standard-types'" />
      <AuditFindingCategoriesCard v-else-if="activeTab === 'audit-finding-categories'" />
      <EventCategoriesCard v-else-if="activeTab === 'event-categories'" />
      <EventSeveritiesCard v-else-if="activeTab === 'event-severities'" />
      <RelatedStandardsCard v-else-if="activeTab === 'related-standards'" />
      <ComplaintLookupCard
        v-else-if="activeTab === 'employee-titles'"
        model="EmployeeTitle"
        title="Employee Title"
        subtitle="Job titles for people records — pre-seeded with industry-standard quality / manufacturing titles. Scoped to this company."
      />

      <ComplaintLookupCard
        v-else-if="activeTab === 'complaint-sources'"
        model="ComplaintSourceType"
        title="Complaint Source"
        subtitle="Who reported the complaint (Customer, Distributor, Sales Rep…). Scoped to this company."
      />
      <CountriesRegionsCard v-else-if="activeTab === 'countries-regions'" />
      <ComplaintLookupCard
        v-else-if="activeTab === 'complaint-customer-types'"
        model="ComplaintCustomerType"
        title="Customer Type"
        subtitle="End User, Distributor, Healthcare Facility, …"
      />
      <ComplaintLookupCard
        v-else-if="activeTab === 'complaint-categories'"
        model="ComplaintCategory"
        title="Category"
        subtitle="Top-level complaint classification (parent of sub-categories)."
      />
      <ComplaintLookupCard
        v-else-if="activeTab === 'complaint-sub-categories'"
        model="ComplaintSubCategory"
        title="Sub-category"
        parentModel="ComplaintCategory"
        parentField="categoryId"
        parentLabel="Category"
        subtitle="Dependent detail under a category (QA fills this during investigation)."
      />
      <ComplaintLookupCard
        v-else-if="activeTab === 'complaint-types'"
        model="ComplaintType"
        title="Complaint Type"
        subtitle="Product, Service, Delivery, Billing, …"
      />
      <ComplaintLookupCard
        v-else-if="activeTab === 'complaint-severities'"
        model="ComplaintSeverity"
        title="Severity"
        :hasColor="true"
        subtitle="Severity classification with colour + rank."
      />
      <ComplaintLookupCard
        v-else-if="activeTab === 'complaint-risk-levels'"
        model="ComplaintRiskLevel"
        title="Risk Level"
        :hasColor="true"
        subtitle="Risk classification with colour + rank."
      />
      <ComplaintLookupCard
        v-else-if="activeTab === 'complaint-report-schemes'"
        model="ComplaintReportScheme"
        title="Report Scheme"
        subtitle="Regulatory reporting schemes for the reportability assessment (FDA MDR, EU MDR, MoCRA…)."
      />
    </div>
  </BasePage>
</template>
