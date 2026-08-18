<script setup>
/**
 * CAPAs, with an Insights tab beside the list.
 *
 * Follows the shape AuditsHome established — BasePage + PageHeader + BaseTabs —
 * so a module page with analytics looks the same everywhere rather than each
 * module inventing its own.
 *
 * ── WHY THE LIST IS THE DEFAULT TAB, NOT INSIGHTS ───────────────────────────
 * AuditsHome defaults to Insights, and that is fine there because its list tab
 * does not sync filters to the URL. CapasHome DOES: `useListLayout({ syncUrl:
 * true })` writes `router.replace({ query })` from `filtersToQuery`, which
 * REPLACES the whole query object — so `?tab=…` is dropped the moment the user
 * touches a filter.
 *
 * Defaulting to the list makes that harmless: losing the tab param means
 * "stay on the list", which is exactly where the user already is. Defaulting to
 * Insights would instead yank them out of the list mid-filtering, which reads as
 * the page throwing them away. It also means this change is invisible to anyone
 * who never opens Insights — the page behaves exactly as it did before.
 *
 * The real fix is for the query writers to merge rather than replace; until then
 * this ordering makes the collision benign instead of user-visible.
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
    />

    <BaseTabs v-model="activeTab" :tabs="tabs" ariaLabel="CAPA sections">
      <div class="tw:mt-6">
        <BaseTabPanel value="capas"><CapasHome embedded /></BaseTabPanel>
        <BaseTabPanel value="insights"><ModuleInsightsTab moduleId="capa" /></BaseTabPanel>
      </div>
    </BaseTabs>
  </BasePage>
</template>
