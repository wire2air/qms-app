<script setup>
/**
 * QC Inspection landing — renders one section of the operational quality
 * layer: Inspection Lots (execution), Retain Samples, Specifications (test
 * master), Inspection Plans (the product+point → spec/sampling/workflow
 * resolution table), Sampling Plans, AQL Standards, Test Library and Line
 * Clearance. The SWITCHER is the sidebar's QC Inspection submenu (?tab=
 * links, Training-style group — user decision 2026-07-27); the on-page tab
 * strip was removed with it.
 */
import { IconTestPipe } from '@tabler/icons-vue'
import { isAllowed } from '@/utils/currentSession.js'

const route = useRoute()
const router = useRouter()

// Sections are permission-gated like the left navigation: a section is a
// module's management surface, so it hides when the user holds no grant on
// that module (any grant implies :read). Reference resolution doesn't need the
// section — lots snapshot their spec/sampling at create, and master/lookup
// reads are tenant-public. See docs/backend/permissions-model.md.
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
// Keep ?tab= in the URL at all times — the sidebar submenu's links are
// query-tab links, so this is what lights up the active entry.
watch(
  activeTab,
  (id) => {
    if (route.query.tab !== id) router.replace({ query: { ...route.query, tab: id } })
  },
  { immediate: true },
)
// If the current section isn't visible for this user (deep link / revoked
// grant), fall back to their first visible one.
watch(
  validTabIds,
  (ids) => {
    if (!ids.has(activeTab.value)) activeTab.value = firstTab.value
  },
  { immediate: true },
)
const activeLabel = computed(() => ALL_TABS.find((t) => t.value === activeTab.value)?.label ?? '')

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
          <span v-if="activeLabel" class="tw:text-secondary tw:font-normal">
            · {{ activeLabel }}
          </span>
          <HelpButton slug="KB/quality/qc-inspection" :size="16" />
        </span>
      </template>
    </PageHeader>

    <div class="tw:flex tw:flex-col tw:gap-5 tw:max-w-7xl">
      <InspectionLotsList v-if="activeTab === 'lots'" :canCreate="canCreateLots" />
      <RetainSamplesList v-else-if="activeTab === 'retain-samples'" />
      <InspectionPlansList v-else-if="activeTab === 'inspection-plans'" :canManage="canManageTemplates" />
      <SpecificationsList v-else-if="activeTab === 'specifications'" :canManage="canManageSpecs" />
      <SamplingPlansList v-else-if="activeTab === 'sampling-plans'" :canManage="canManagePlans" />
      <AqlStandardsList v-else-if="activeTab === 'aql-standards'" :canManage="canManageStandards" />
      <DefectCatalogList v-else-if="activeTab === 'test-library'" :canManage="canManageDefects" />
      <LineClearanceSettings v-else-if="activeTab === 'line-clearance'" />
    </div>
  </BasePage>
</template>
