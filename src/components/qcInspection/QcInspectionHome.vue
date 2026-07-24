<script setup>
/**
 * QC Inspection landing — tabbed workspace for the operational quality layer:
 * Inspection Lots (execution), Specifications (test master), Inspection Plans
 * (the product+point → spec/sampling/workflow resolution table), Sampling
 * Plans and AQL Standards.
 */
import { IconTestPipe } from '@tabler/icons-vue'
import { isAllowed } from '@/utils/currentSession.js'

const route = useRoute()

// Tabs are permission-gated like the left navigation: a tab is a module's
// management surface, so it hides when the user holds no grant on that module
// (any grant implies :read). Reference resolution doesn't need the tab — lots
// snapshot their spec/sampling at create, and master/lookup reads are
// tenant-public. See docs/backend/permissions.md.
const ALL_TABS = [
  { value: 'lots', label: 'Inspections', permission: 'inspection_qc:read' },
  { value: 'retain-samples', label: 'Retain Samples', permission: 'retain_samples:read' },
  { value: 'inspection-plans', label: 'Inspection Plans', permission: 'inspection_templates:read' },
  { value: 'specifications', label: 'Specifications', permission: 'inspection_spec:read' },
  { value: 'sampling-plans', label: 'Sampling Plans', permission: 'inspection_plan:read' },
  { value: 'aql-standards', label: 'AQL Standards', permission: 'inspection_standards:read' },
  { value: 'test-library', label: 'Test Library', permission: 'inspection_catalog:read' },
  { value: 'line-clearance', label: 'Line Clearance', permission: 'inspection_settings:read' },
]
const tabs = computed(() => ALL_TABS.filter((t) => isAllowed([t.permission])))
const validTabIds = computed(() => new Set(tabs.value.map((t) => t.value)))
const firstTab = computed(() => tabs.value[0]?.value ?? 'lots')
const activeTab = ref(ALL_TABS.some((t) => t.value === route.query.tab) ? route.query.tab : 'lots')
watch(
  () => route.query.tab,
  (v) => {
    if (v && validTabIds.value.has(v)) activeTab.value = v
  },
)
// If the current tab isn't visible for this user (deep link / revoked grant),
// fall back to their first visible tab.
watch(
  validTabIds,
  (ids) => {
    if (!ids.has(activeTab.value)) activeTab.value = firstTab.value
  },
  { immediate: true },
)

const canManageSpecs = computed(() => isAllowed(['inspection_spec:write']))
const canCreateLots = computed(() => isAllowed(['inspection_qc:create']))
const canManagePlans = computed(() => isAllowed(['inspection_plan:create']))
const canManageStandards = computed(() => isAllowed(['inspection_standards:write']))
const canManageTemplates = computed(() => isAllowed(['inspection_templates:write']))
const canManageDefects = computed(() => isAllowed(['inspection_catalog:write']))
</script>

<template>
  <BasePage width="standard">
    <PageHeader
      :icon="IconTestPipe"
      title="QC Inspection"
      subtitle="Incoming, in-process, final and outgoing inspection — specifications, lots, results and disposition."
    >
      <template #title>
        <span class="tw:inline-flex tw:items-center tw:gap-1.5">
          QC Inspection
          <HelpButton slug="KB/quality/qc-inspection" :size="16" />
        </span>
      </template>
    </PageHeader>

    <div class="tw:flex tw:flex-col tw:gap-5 tw:max-w-7xl">
      <BaseTabs v-model="activeTab" :tabs="tabs" ariaLabel="QC Inspection sections">
        <div class="tw:mt-6">
          <BaseTabPanel value="lots">
            <InspectionLotsList :canCreate="canCreateLots" />
          </BaseTabPanel>
          <BaseTabPanel value="retain-samples">
            <RetainSamplesList />
          </BaseTabPanel>
          <BaseTabPanel value="inspection-plans">
            <InspectionPlansList :canManage="canManageTemplates" />
          </BaseTabPanel>
          <BaseTabPanel value="specifications">
            <SpecificationsList :canManage="canManageSpecs" />
          </BaseTabPanel>
          <BaseTabPanel value="sampling-plans">
            <SamplingPlansList :canManage="canManagePlans" />
          </BaseTabPanel>
          <BaseTabPanel value="aql-standards">
            <AqlStandardsList :canManage="canManageStandards" />
          </BaseTabPanel>
          <BaseTabPanel value="test-library">
            <DefectCatalogList :canManage="canManageDefects" />
          </BaseTabPanel>
          <BaseTabPanel value="line-clearance">
            <LineClearanceSettings />
          </BaseTabPanel>
        </div>
      </BaseTabs>
    </div>
  </BasePage>
</template>
