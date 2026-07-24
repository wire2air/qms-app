<script setup>
/**
 * App Builder — the Jotform-style workspace: build Forms, collect
 * Submissions, manage the Option Sets pickers draw from. Formerly the
 * separate "Records" page + "Form Templates" page (/templates now redirects
 * here; /templates/:id detail pages still work).
 *
 * Tabs are permission-gated like the left nav (docs/backend/permissions-model.md).
 */
import { IconTable, IconForms, IconChecklist } from '@tabler/icons-vue'
import { isAllowed } from '@/utils/currentSession.js'

const route = useRoute()
const router = useRouter()

const ALL_TABS = [
  { value: 'submissions', label: 'Submissions', icon: IconTable, permission: 'records:read' },
  { value: 'forms', label: 'Forms', icon: IconForms, permission: 'forms_templates:read' },
  { value: 'optionsets', label: 'Option Sets', icon: IconChecklist, permission: 'option_sets:read' },
]
const tabs = computed(() => ALL_TABS.filter((t) => isAllowed([t.permission])))
const validTabIds = computed(() => new Set(tabs.value.map((t) => t.value)))
const firstTab = computed(() => tabs.value[0]?.value ?? 'submissions')
const activeTab = ref(
  ALL_TABS.some((t) => t.value === route.query.tab) ? route.query.tab : 'submissions',
)
watch(
  () => route.query.tab,
  (v) => {
    if (v && validTabIds.value.has(v)) activeTab.value = v
  },
)
watch(activeTab, (id) => {
  if (route.query.tab !== id) router.replace({ query: { ...route.query, tab: id } })
})
// Deep link / revoked grant → first visible tab.
watch(
  validTabIds,
  (ids) => {
    if (!ids.has(activeTab.value)) activeTab.value = firstTab.value
  },
  { immediate: true },
)
</script>

<template>
  <BasePage width="standard">
    <PageHeader
      :icon="IconTable"
      title="App Builder"
      subtitle="Build forms, collect submissions, and grow them into full modules."
    />

    <BaseTabs v-model="activeTab" :tabs="tabs" ariaLabel="App Builder sections">
      <div class="tw:mt-6">
        <BaseTabPanel value="submissions">
          <RecordsSubmissionsTab />
        </BaseTabPanel>
        <BaseTabPanel value="forms">
          <FormTemplatesPanel />
        </BaseTabPanel>
        <BaseTabPanel value="optionsets">
          <OptionSetsTab />
        </BaseTabPanel>
      </div>
    </BaseTabs>
  </BasePage>
</template>
