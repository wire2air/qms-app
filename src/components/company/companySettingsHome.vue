<script setup>
import {
  IconSettings,
  IconAdjustments,
  IconPrinter,
  IconInfoCircle,
  IconList,
} from '@tabler/icons-vue'
import { currentCompany } from '@/utils/currentCompany.js'

const company = useLiveQueryWithDeps(
  [() => currentCompany.value?.id],
  async (db, [id]) => {
    if (!id) return null
    const c = await db.Company.findByPk(id)
    // Pre-create nested settings buckets so child v-model bindings have a
    // path to write to from first render. syncEngine wraps the model in a
    // shallowRef, which doesn't propagate nested mutations to templates —
    // initialising here keeps templates from rendering against undefined.
    if (c) {
      if (c.settings == null) c.settings = {}
      if (c.settings.printSettings == null) c.settings.printSettings = {}
    }
    return c
  },
  { models: ['Company'] },
)

const loading = computed(() => company.value === undefined)

watch(
  company,
  (c) => {
    if (!c) return
    // Backfill settings as {} if backend stored null so cards can bind safely.
    if (c.settings == null) c.settings = {}
    mirrorToCurrentCompany(c)
  },
  { deep: true, immediate: true },
)

function mirrorToCurrentCompany(c) {
  if (!currentCompany.value || c.id !== currentCompany.value.id) return
  currentCompany.value.name = c.name
  currentCompany.value.code = c.code
  currentCompany.value.defaultTimeZone = c.defaultTimeZone
  currentCompany.value.defaultFirstDayOfWeek = c.defaultFirstDayOfWeek
  currentCompany.value.companyIconUrl = c.companyIconUrl
  currentCompany.value.companyDarkIconUrl = c.companyDarkIconUrl
  currentCompany.value.settings = c.settings
}

const tabs = [
  { id: 'general', label: 'General', icon: IconInfoCircle },
  { id: 'defaults', label: 'Defaults', icon: IconAdjustments },
  { id: 'print', label: 'Print', icon: IconPrinter },
  { id: 'lookups', label: 'Lookups', icon: IconList },
]
// Honor ?tab=<id> so deep-links from the sidebar (e.g. NC Dispositions
// going to /settings?tab=lookups) land directly on the right pane.
const route = useRoute()
const validTabIds = new Set(tabs.map((t) => t.id))
const initialTab = validTabIds.has(route.query.tab) ? route.query.tab : 'general'
const activeTab = ref(initialTab)
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
        <IconSettings class="tw:text-primary tw:size-6" />
        <h2 class="tw:text-lg tw:font-bold tw:tracking-tight tw:text-nowrap">Company Settings</h2>
      </div>
    </SafeTeleport>

    <div v-if="loading" class="tw:flex tw:items-center tw:justify-center tw:h-full">
      <div
        class="tw:animate-spin tw:rounded-full tw:size-12 tw:border-4 tw:border-primary tw:border-t-transparent"
      />
    </div>

    <div v-else-if="!company" class="tw:p-8 tw:text-center tw:text-secondary">
      Company not found.
    </div>

    <div v-else class="tw:flex tw:flex-col tw:gap-6 tw:max-w-6xl">
      <div class="tw:flex tw:flex-col tw:gap-1">
        <div class="tw:text-3xl tw:font-bold tw:text-on-sidebar">Company Settings</div>
        <div class="tw:text-sm tw:text-secondary">
          Manage organization profile, branding, regional preferences, defaults, and print
          customization.
        </div>
      </div>

      <!-- Tabs -->
      <div class="tw:flex tw:border-b tw:border-divider">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          class="tw:px-5 tw:py-2.5 tw:border-b-2 tw:font-semibold tw:text-sm tw:flex tw:items-center tw:gap-2 tw:transition-colors"
          :class="activeTab === tab.id
            ? 'tw:border-primary tw:text-primary'
            : 'tw:border-transparent tw:text-secondary tw:hover:text-on-sidebar'"
          @click="activeTab = tab.id"
        >
          <component :is="tab.icon" :size="16" /> {{ tab.label }}
        </button>
      </div>

      <!-- Tab: General -->
      <div v-if="activeTab === 'general'" class="tw:flex tw:flex-col tw:gap-8">
        <CompanyInfoCard />

        <div class="tw:grid tw:grid-cols-1 tw:lg:grid-cols-3 tw:gap-8">
          <div class="tw:lg:col-span-2 tw:flex tw:flex-col tw:gap-8">
            <CompanyBrandingCard />
            <CompanyRegionalCard />
          </div>
          <CompanyMetadataCard />
        </div>
      </div>

      <!-- Tab: Defaults -->
      <div v-else-if="activeTab === 'defaults'">
        <CompanyDefaultsCard />
      </div>

      <!-- Tab: Print -->
      <div v-else-if="activeTab === 'print'">
        <CompanyPrintCard />
      </div>

      <!-- Tab: Lookups — shared master data (NC dispositions, etc.) -->
      <div v-else-if="activeTab === 'lookups'" class="tw:flex tw:flex-col tw:gap-8">
        <NcDispositionTypesCard />
      </div>
    </div>
  </div>
</template>
