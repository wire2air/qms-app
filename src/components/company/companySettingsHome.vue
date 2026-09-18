<script setup>
import {
  IconSettings,
  IconAdjustments,
  IconPrinter,
  IconInfoCircle,
  IconSparkles,
  IconPlug,
} from '@tabler/icons-vue'
import { currentCompany } from '@/utils/currentCompany.js'
import { isAllowed } from '@/utils/currentSession.js'

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

// AI tab visible to anyone with ai:manage (owners auto-pass). Tenants
// where the operator hasn't enabled AI yet still need this tab so an
// admin can turn it on; gating on the canUseAi session flag would hide
// the very switch you need to flip.
const canManageAi = computed(() => isAllowed(['ai:manage']))
const canManageCompany = computed(() => isAllowed(['company_settings:manage']))


const tabs = computed(() => {
  const base = [
    { value: 'general', label: 'General', icon: IconInfoCircle },
    { value: 'defaults', label: 'Defaults', icon: IconAdjustments },
    { value: 'print', label: 'Print', icon: IconPrinter },
  ]
  if (canManageCompany.value)
    base.push({ value: 'integrations', label: 'Integrations', icon: IconPlug })
  if (canManageAi.value) base.push({ value: 'ai', label: 'AI', icon: IconSparkles })
  return base
})
// Honor ?tab=<id> deep-links. Lookups moved to the standalone /lookups page
// (2026-06-12) — redirect old ?tab=lookups bookmarks there.
const route = useRoute()
const router = useRouter()
const validTabIds = computed(() => new Set(tabs.value.map((t) => t.value)))
const initialTab = validTabIds.value.has(route.query.tab) ? route.query.tab : 'general'
const activeTab = ref(initialTab)
watch(
  () => route.query.tab,
  (v) => {
    if (v === 'lookups') {
      router.replace('/lookups')
      return
    }
    if (v && validTabIds.value.has(v)) activeTab.value = v
  },
  { immediate: true },
)
</script>

<template>
  <BasePage width="standard">
    <PageHeader
      :icon="IconSettings"
      title="Company Settings"
      subtitle="Manage organization profile, branding, regional preferences, defaults, and print customization."
    />

    <div v-if="loading" class="tw:flex tw:items-center tw:justify-center tw:py-20">
      <BaseSpinner size="lg" />
    </div>

    <div v-else-if="!company" class="tw:py-8 tw:text-center tw:text-secondary">
      Company not found.
    </div>

    <template v-else>
      <BaseTabs v-model="activeTab" :tabs="tabs" ariaLabel="Company settings">
        <!-- Tab: General -->
        <BaseTabPanel value="general">
          <div class="tw:flex tw:flex-col tw:gap-8">
            <CompanyInfoCard />

            <div class="tw:grid tw:grid-cols-1 tw:lg:grid-cols-3 tw:gap-8">
              <div class="tw:lg:col-span-2 tw:flex tw:flex-col tw:gap-8">
                <CompanyBrandingCard />
                <CompanyRegionalCard />
              </div>
              <CompanyMetadataCard />
            </div>
          </div>
        </BaseTabPanel>

        <!-- Tab: Defaults -->
        <BaseTabPanel value="defaults">
          <div class="tw:flex tw:flex-col tw:gap-4">
            <CompanyDefaultsCard />
            <ComplaintSettingsCard />
          </div>
        </BaseTabPanel>

        <!-- Tab: Print -->
        <BaseTabPanel value="print">
          <CompanyPrintCard />
        </BaseTabPanel>

        <!-- Tab: Integrations — connected third-party accounts (Adobe Sign). -->
        <BaseTabPanel value="integrations">
          <CompanyIntegrationsCard />
        </BaseTabPanel>

        <!-- Tab: AI — only present when the user has ai:manage. -->
        <BaseTabPanel value="ai">
          <CompanyAiProfileCard />
        </BaseTabPanel>
      </BaseTabs>
    </template>
  </BasePage>
</template>
