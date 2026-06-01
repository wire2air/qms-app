<script setup>
import { IconStack2 } from '@tabler/icons-vue'
import { IconLayoutList, IconTable } from '@tabler/icons-vue'
import { getCompanyPath } from '@/utils/routeHelpers'
import { useCompanyLocalStorage } from '@/utils/useCompanyLocalStorage'
import { isAllowed } from '@/utils/currentSession.js'

const router = useRouter()

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
    <SafeTeleport to="#main-header-title">
      <div class="tw:flex tw:items-center tw:gap-2 tw:text-on-sidebar">
        <IconStack2 class="tw:text-primary" :size="24" />
        <h2 class="tw:text-lg tw:font-bold tw:tracking-tight tw:text-nowrap">Form Templates</h2>
      </div>
    </SafeTeleport>

    <SafeTeleport to="#main-header-actions">
      <BaseButton
        v-if="canCreateTemplate"
        data-testid="form-template-create-button"
        @click="showCreateDialog = true"
      >
        Create New Template
      </BaseButton>
    </SafeTeleport>

    <!-- Page Header -->
    <div class="tw:flex tw:items-center tw:justify-between">
      <div class="tw:flex tw:flex-col tw:gap-1">
        <div class="tw:text-3xl tw:font-bold tw:text-on-sidebar">Form Templates</div>
        <div class="tw:text-sm tw:text-secondary">
          Manage the structure and versioning of QMS forms (CAPA, NC, Audit).
        </div>
      </div>
    </div>

    <FormTemplatesFilterToolbar v-model:filters="filters">
      <template #actions>
        <BaseSwitcher v-model="viewMode" :switches="viewSwitches" />
      </template>
    </FormTemplatesFilterToolbar>

    <!-- Content Views -->
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
