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
  { id: 'templates', label: 'Templates', icon: IconFileSettings },
  { id: 'optionsets', label: 'Option Sets', icon: IconChecklist },
]
const validTabIds = new Set(tabs.map((t) => t.id))
const initialTab = validTabIds.has(route.query.tab) ? route.query.tab : 'templates'
const activeTab = ref(initialTab)
watch(
  () => route.query.tab,
  (v) => {
    if (v && validTabIds.has(v)) activeTab.value = v
  },
)
function setTab(id) {
  activeTab.value = id
  router.replace({ query: { ...route.query, tab: id } })
}

const showCreateDialog = ref(false)
const viewMode = useCompanyLocalStorage('templates-view-mode', 'list')
const confirmDelete = ref({ open: false, template: null })

const canCreateTemplate = computed(() => isAllowed(['formTemplates:create']))
const canUpdateTemplate = computed(() => isAllowed(['formTemplates:update']))
const canDeleteTemplate = computed(() => isAllowed(['formTemplates:delete']))

const filters = ref({
  search: '',
  documentTypeId: null,
  siteId: null,
  statusId: null,
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

    if (statusId) results = results.filter((t) => t.statusId === statusId)
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
  { initial: [] },
)

const viewSwitches = [
  { icon: IconLayoutList, value: 'list', tooltip: 'List View' },
  { icon: IconTable, value: 'table', tooltip: 'Table View' },
]

function handleTemplateCreated(template) {
  const path = getCompanyPath(`/templates/${template.id}`)
  router.push({ path, query: { mode: 'schema' } })
}

function onDeleteTemplate(template) {
  confirmDelete.value = { open: true, template }
}

async function confirmDeleteTemplate() {
  await confirmDelete.value.template.delete()
  confirmDelete.value = { open: false, template: null }
}
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-3 tw:h-full tw:p-5">
    <PageHeader :icon="IconStack2" title="Form Templates" />

    <!-- "Create New Template" only on the Templates tab; Option Sets
         tab has its own create affordance inside the embedded panel. -->
    <SafeTeleport v-if="activeTab === 'templates'" to="#main-header-actions">
      <BaseButton v-if="canCreateTemplate" @click="showCreateDialog = true">
        Create New Template
      </BaseButton>
    </SafeTeleport>

    <!-- Page Header -->
    <div class="tw:flex tw:items-center tw:justify-between">
      <div class="tw:flex tw:flex-col tw:gap-1">
        <div class="tw:text-3xl tw:font-bold tw:text-on-sidebar">Form Templates</div>
        <div class="tw:text-sm tw:text-secondary">
          Manage QMS form structure + the reusable option sets that picker fields draw
          from.
        </div>
      </div>
    </div>

    <!-- Tabs -->
    <div class="tw:flex tw:border-b tw:border-divider">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        class="tw:px-5 tw:py-2.5 tw:border-b-2 tw:font-semibold tw:text-sm tw:flex tw:items-center tw:gap-2 tw:transition-colors tw:bg-transparent tw:cursor-pointer"
        :class="
          activeTab === tab.id
            ? 'tw:border-primary tw:text-primary'
            : 'tw:border-transparent tw:text-secondary tw:hover:text-on-sidebar'
        "
        @click="setTab(tab.id)"
      >
        <component :is="tab.icon" :size="16" /> {{ tab.label }}
      </button>
    </div>

    <!-- Tab: Templates -->
    <template v-if="activeTab === 'templates'">
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
    </template>

    <!-- Tab: Option Sets — slim embedded surface (full /option-sets page
         is still mounted at the standalone route for back-compat). -->
    <OptionSetsTab v-else-if="activeTab === 'optionsets'" />
  </div>

  <!-- Create Template Dialog -->
  <FormTemplateCreateTemplate v-model="showCreateDialog" @next="handleTemplateCreated" />

  <!-- Delete Confirm Dialog -->
  <ConfirmDialog
    v-model="confirmDelete.open"
    title="Delete Template"
    :message="`Are you sure you want to delete '${confirmDelete.template?.title}' (${confirmDelete.template?.code})? This cannot be undone.`"
    okLabel="Delete"
    @ok="confirmDeleteTemplate"
  />
</template>
