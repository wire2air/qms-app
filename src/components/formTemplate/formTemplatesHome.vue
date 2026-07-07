<script setup>
import { IconStack2, IconFileSettings, IconChecklist } from '@tabler/icons-vue'
import { IconLayoutList, IconTable } from '@tabler/icons-vue'
import { getCompanyPath } from '@/utils/routeHelpers'
import { useCompanyLocalStorage } from '@/utils/useCompanyLocalStorage'
import { isAllowed } from '@/utils/currentSession.js'

const router = useRouter()
const route = useRoute()

// Tabs — "Templates" (the existing form-template CRUD) and "Option Sets"
// (moved here from a top-level sidebar entry so reusable picker options
// live next to the templates that consume them). The standalone
// /option-sets route still works for back-compat.
const tabs = [
  { value: 'templates', label: 'Templates', icon: IconFileSettings },
  { value: 'optionsets', label: 'Option Sets', icon: IconChecklist },
]
const validTabIds = new Set(tabs.map((t) => t.value))
const initialTab = validTabIds.has(route.query.tab) ? route.query.tab : 'templates'
const activeTab = ref(initialTab)
watch(
  () => route.query.tab,
  (v) => {
    if (v && validTabIds.has(v)) activeTab.value = v
  },
)
watch(activeTab, (id) => {
  if (route.query.tab !== id) router.replace({ query: { ...route.query, tab: id } })
})

const showCreateDialog = ref(false)
const viewMode = useCompanyLocalStorage('templates-view-mode', 'list')
const { confirm } = useConfirm()

// Create needs read too: the create mutation reads the new row back through the
// `formTemplates:read` RLS SELECT policy, so create-without-read fails at the DB.
const canCreateTemplate = computed(() => isAllowed(['formTemplates:create', 'formTemplates:read']))
const canUpdateTemplate = computed(() => isAllowed(['formTemplates:update']))
const canDeleteTemplate = computed(() => isAllowed(['formTemplates:delete']))

// Multi-select dimensions (Linear-style filter menu) — arrays of ids.
const filters = ref({
  search: '',
  documentTypeId: [],
  siteId: [],
  statusId: [],
})

const templates = useLiveQueryWithDeps(
  [
    () => filters.value.search,
    () => filters.value.statusId,
    () => filters.value.siteId,
    () => filters.value.documentTypeId,
  ],
  async (db, [search, statusId, siteId, documentTypeId]) => {
    let results = await db.FormTemplate.where().exec()

    if (statusId) {
      const statusIds = Array.isArray(statusId) ? statusId : [statusId]
      if (statusIds.length) results = results.filter((t) => statusIds.includes(t.statusId))
    }
    if (documentTypeId) {
      const ids = Array.isArray(documentTypeId) ? documentTypeId : [documentTypeId]
      if (ids.length) results = results.filter((t) => ids.includes(t.documentTypeId))
    }

    if (siteId) {
      const siteIds = Array.isArray(siteId) ? siteId : [siteId]
      if (siteIds.length) {
        const siteOnTemplates = await db.SiteOnTemplate.where().exec()
        const templateIdsForSites = new Set(
          siteOnTemplates.filter((s) => siteIds.includes(s.siteId)).map((s) => s.templateId),
        )
        results = results.filter((t) => templateIdsForSites.has(t.id))
      }
    }

    if (search) {
      const q = search.toLowerCase()
      results = results.filter(
        (t) => t.title.toLowerCase().includes(q) || t.code.toLowerCase().includes(q),
      )
    }

    return results.sort(
      (a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0),
    )
  },

  { models: ['FormTemplate', 'SiteOnTemplate'], initial: [] },
)

const viewSwitches = [
  { icon: IconLayoutList, value: 'list', tooltip: 'List View' },
  { icon: IconTable, value: 'table', tooltip: 'Table View' },
]

function handleTemplateCreated(template) {
  const path = getCompanyPath(`/templates/${template.id}`)
  router.push({ path, query: { mode: 'schema' } })
}

async function onDeleteTemplate(template) {
  const ok = await confirm({
    title: 'Delete Template',
    message: `Are you sure you want to delete '${template.title}' (${template.code})? This cannot be undone.`,
    okLabel: 'Delete',
    danger: true,
  })
  if (ok) await template.delete()
}
</script>

<template>
  <BasePage width="standard">
    <PageHeader
      :icon="IconStack2"
      title="Form Templates"
      subtitle="Manage QMS form structure + the reusable option sets that picker fields draw from."
    >
      <!-- "Create New Template" only on the Templates tab; Option Sets
           tab has its own create affordance inside the embedded panel. -->
      <template #actions>
        <BaseButton
          v-if="activeTab === 'templates' && canCreateTemplate"
          @click="showCreateDialog = true"
        >
          Create New Template
        </BaseButton>
      </template>
    </PageHeader>

    <!-- Tabs -->
    <BaseTabs v-model="activeTab" :tabs="tabs" ariaLabel="Form template sections">
      <div class="tw:mt-6">
        <!-- Tab: Templates -->
        <BaseTabPanel value="templates">
          <FormTemplatesFilterToolbar v-model:filters="filters">
            <template #actions>
              <BaseSwitcher v-model="viewMode" :switches="viewSwitches" />
            </template>
          </FormTemplatesFilterToolbar>

          <FormTemplatesTable
            v-if="viewMode === 'table'"
            :rows="templates"
            :canUpdate="canUpdateTemplate"
            :canDelete="canDeleteTemplate"
            @delete="onDeleteTemplate"
          />
          <div v-else class="tw:flex-1 tw:overflow-y-auto">
            <FormTemplatesList
              :templates="templates"
              :canDelete="canDeleteTemplate"
              @delete="onDeleteTemplate"
            />
          </div>
        </BaseTabPanel>

        <!-- Tab: Option Sets — slim embedded surface (full /option-sets page
             is still mounted at the standalone route for back-compat). -->
        <BaseTabPanel value="optionsets">
          <OptionSetsTab />
        </BaseTabPanel>
      </div>
    </BaseTabs>
  </BasePage>

  <!-- Create Template Dialog -->
  <FormTemplateCreateTemplate v-model="showCreateDialog" @next="handleTemplateCreated" />

</template>
