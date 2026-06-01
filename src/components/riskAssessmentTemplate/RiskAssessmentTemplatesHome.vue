<script setup>
import { IconLayoutGrid, IconFileSettings, IconAlertTriangle } from '@tabler/icons-vue'
import { isAllowed } from '@/utils/currentSession.js'

// Tabs — "Templates" hosts the original CRUD; "Hazard Categories" hosts
// the per-tenant hazard_categories lookup admin (new with the RA
// reportability spike). Deep-linkable via ?tab=hazards.
const tabs = [
  { id: 'templates', label: 'Templates', icon: IconFileSettings },
  { id: 'hazards', label: 'Hazard Categories', icon: IconAlertTriangle },
]
const route = useRoute()
const router = useRouter()
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
const editTemplate = ref(null)
const confirmDelete = ref({ open: false, template: null })

const canCreate = computed(() => isAllowed(['riskAssessmentTemplates:create']))
const canUpdate = computed(() => isAllowed(['riskAssessmentTemplates:update']))
const canDelete = computed(() => isAllowed(['riskAssessmentTemplates:delete']))

const search = ref('')

const templates = useLiveQueryWithDeps(
  [() => search.value],
  async (db, [q]) => {
    const results = await db.RiskAssessmentTemplate.where().exec()
    if (!q)
      return results.sort(
        (a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0),
      )
    const lower = q.toLowerCase()
    return results
      .filter((t) => t.name.toLowerCase().includes(lower))
      .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))
  },
  { initial: [] },
)

function onEdit(template) {
  editTemplate.value = template
  showCreateDialog.value = true
}

function onDelete(template) {
  confirmDelete.value = { open: true, template }
}

async function confirmDeleteTemplate() {
  await confirmDelete.value.template.delete()
  confirmDelete.value = { open: false, template: null }
}

function onDialogClose() {
  showCreateDialog.value = false
  editTemplate.value = null
}
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-3 tw:h-full tw:p-5">
    <SafeTeleport to="#main-header-title">
      <div class="tw:flex tw:items-center tw:gap-2 tw:text-on-sidebar">
        <IconLayoutGrid class="tw:text-primary" :size="24" />
        <h2 class="tw:text-lg tw:font-bold tw:tracking-tight tw:text-nowrap">Risk Assessment Templates</h2>
      </div>
    </SafeTeleport>

    <!-- "New Template" header-action only on the Templates tab; the
         Hazard Categories tab has its own "Add Category" affordance. -->
    <SafeTeleport v-if="activeTab === 'templates'" to="#main-header-actions">
      <BaseButton v-if="canCreate" @click="showCreateDialog = true">
        New Template
      </BaseButton>
    </SafeTeleport>

    <div class="tw:flex tw:items-center tw:justify-between">
      <div class="tw:flex tw:flex-col tw:gap-1">
        <div class="tw:text-3xl tw:font-bold tw:text-on-sidebar">Risk Assessment Templates</div>
        <div class="tw:text-sm tw:text-secondary">
          Configure risk matrices and the hazard categories used when finalising an
          assessment.
        </div>
      </div>
    </div>

    <!-- Tabs — Templates (CRUD on risk_assessment_templates) vs Hazard
         Categories (admin on hazard_categories, the per-tenant lookup
         used by the RA widget finalize step). -->
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
      <div class="tw:flex tw:items-center tw:gap-3">
        <BaseTextInput
          v-model="search"
          placeholder="Search templates..."
          class="tw:w-72"
        />
      </div>

      <RiskAssessmentTemplatesTable
        :rows="templates"
        :canUpdate="canUpdate"
        :canDelete="canDelete"
        @edit="onEdit"
        @delete="onDelete"
      />
    </template>

    <!-- Tab: Hazard Categories — per-tenant hazard_categories admin. -->
    <HazardCategoriesCard v-else-if="activeTab === 'hazards'" />

    <RiskAssessmentTemplateDialog
      v-model="showCreateDialog"
      :template="editTemplate"
      @close="onDialogClose"
    />

    <ConfirmDialog
      v-model="confirmDelete.open"
      title="Delete Risk Assessment Template"
      :message="`Are you sure you want to delete '${confirmDelete.template?.name}'? This cannot be undone.`"
      okLabel="Delete"
      @ok="confirmDeleteTemplate"
    />
  </div>
</template>
