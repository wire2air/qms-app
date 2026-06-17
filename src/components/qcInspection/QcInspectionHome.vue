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

const tabs = [
  { value: 'lots', label: 'Inspection Lots' },
  { value: 'inspection-plans', label: 'Inspection Plans' },
  { value: 'specifications', label: 'Specifications' },
  { value: 'sampling-plans', label: 'Sampling Plans' },
  { value: 'aql-standards', label: 'AQL Standards' },
  { value: 'test-library', label: 'Test Library' },
]
const validTabIds = new Set(tabs.map((t) => t.value))
const activeTab = ref(validTabIds.has(route.query.tab) ? route.query.tab : 'lots')
watch(
  () => route.query.tab,
  (v) => {
    if (v && validTabIds.has(v)) activeTab.value = v
  },
)

const canManageSpecs = computed(() => isAllowed(['qcInspection:spec:write']))
const canCreateLots = computed(() => isAllowed(['qcInspection:lot:create']))
const canManagePlans = computed(() => isAllowed(['qcInspection:plan:create']))
const canManageStandards = computed(() => isAllowed(['qcInspection:standards:write']))
const canManageTemplates = computed(() => isAllowed(['qcInspection:template:write']))
const canManageDefects = computed(() => isAllowed(['qcInspection:catalog:write']))
</script>

<template>
  <BasePage width="wide">
    <PageHeader :icon="IconTestPipe" title="QC Inspection" />

    <div class="tw:flex tw:flex-col tw:gap-5 tw:max-w-7xl">
      <div class="tw:flex tw:flex-col tw:gap-1">
        <div class="tw:text-3xl tw:font-bold tw:text-on-sidebar">QC Inspection</div>
        <div class="tw:text-sm tw:text-secondary">
          Incoming, in-process, final and outgoing inspection — specifications, lots, results and
          disposition.
        </div>
      </div>

      <BaseTabs v-model="activeTab" :tabs="tabs" ariaLabel="QC Inspection sections">
        <div class="tw:mt-6">
          <BaseTabPanel value="lots">
            <InspectionLotsList :canCreate="canCreateLots" />
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
        </div>
      </BaseTabs>
    </div>
  </BasePage>
</template>
