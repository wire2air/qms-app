<script setup>
/**
 * CAPAs, with an Insights tab beside the list.
 *
 * Follows the shape AuditsHome established — BasePage + PageHeader + BaseTabs —
 * so a module page with analytics looks the same everywhere rather than each
 * module inventing its own.
 *
 * ── WHY THE LIST IS THE DEFAULT TAB, NOT INSIGHTS ───────────────────────────
 * This started as a workaround: `useListLayout`'s writer replaced the whole
 * query, so `?tab=` was dropped the moment the user touched a filter, and
 * defaulting to the list made that loss harmless. The writer now merges, so the
 * tab survives and the workaround is no longer load-bearing.
 *
 * The default stays on the list because it is the right default on its own
 * terms: someone navigating to a records page came for the records. Insights is
 * one click away and now genuinely linkable, which it was not before.
 */
import { IconChartBar, IconShieldCheck } from '@tabler/icons-vue'

const route = useRoute()
const router = useRouter()

const tabs = [
  { value: 'capas', label: 'CAPAs', icon: IconShieldCheck },
  { value: 'insights', label: 'Insights', icon: IconChartBar },
]

const validTabIds = new Set(tabs.map((t) => t.value))

const activeTab = computed({
  get() {
    return validTabIds.has(route.query.tab) ? route.query.tab : 'capas'
  },
  set(id) {
    router.replace({ query: { ...route.query, tab: id } })
  },
})
</script>

<template>
  <BasePage width="standard">
    <PageHeader
      :icon="IconShieldCheck"
      title="CAPAs"
      subtitle="Track corrective and preventive actions through to verification."
    >
      <template #title>
        <span class="tw:inline-flex tw:items-center tw:gap-1.5">
          CAPAs
          <HelpButton slug="KB/quality/capas" :size="16" />
        </span>
      </template>
    </PageHeader>

    <BaseTabs v-model="activeTab" :tabs="tabs" ariaLabel="CAPA sections">
      <div class="tw:mt-6">
        <BaseTabPanel value="capas"><CapasHome embedded /></BaseTabPanel>
        <BaseTabPanel value="insights"><ModuleInsightsTab moduleId="capa" /></BaseTabPanel>
      </div>
    </BaseTabs>
  </BasePage>
</template>
