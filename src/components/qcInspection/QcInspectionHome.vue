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
  { id: 'lots', label: 'Inspection Lots' },
  { id: 'specifications', label: 'Specifications' },
  { id: 'inspection-plans', label: 'Inspection Plans' },
  { id: 'sampling-plans', label: 'Sampling Plans' },
  { id: 'aql-standards', label: 'AQL Standards' },
]
const validTabIds = new Set(tabs.map((t) => t.id))
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
</script>

<template>
  <div class="tw:p-5">
    <PageHeader :icon="IconTestPipe" title="QC Inspection" />

    <div class="tw:flex tw:flex-col tw:gap-5 tw:max-w-7xl">
      <div class="tw:flex tw:flex-col tw:gap-1">
        <div class="tw:text-3xl tw:font-bold tw:text-on-sidebar">QC Inspection</div>
        <div class="tw:text-sm tw:text-secondary">
          Incoming, in-process, final and outgoing inspection — specifications, lots, results and
          disposition.
        </div>
      </div>

      <div class="tw:flex tw:border-b tw:border-divider">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          class="tw:px-5 tw:py-2.5 tw:border-b-2 tw:font-semibold tw:text-sm tw:transition-colors"
          :class="
            activeTab === tab.id
              ? 'tw:border-primary tw:text-primary'
              : 'tw:border-transparent tw:text-secondary tw:hover:text-on-sidebar'
          "
          @click="activeTab = tab.id"
        >
          {{ tab.label }}
        </button>
      </div>

      <InspectionLotsList v-if="activeTab === 'lots'" :canCreate="canCreateLots" />
      <SpecificationsList v-else-if="activeTab === 'specifications'" :canManage="canManageSpecs" />
      <InspectionPlansList v-else-if="activeTab === 'inspection-plans'" :canManage="canManageTemplates" />
      <SamplingPlansList v-else-if="activeTab === 'sampling-plans'" :canManage="canManagePlans" />
      <AqlStandardsList v-else-if="activeTab === 'aql-standards'" :canManage="canManageStandards" />
    </div>
  </div>
</template>
