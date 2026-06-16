<script setup>
import { IconSitemap, IconFileSettings, IconTags } from '@tabler/icons-vue'
import { isAllowed } from '@/utils/currentSession.js'

// Tabs — "Templates" hosts the original CRUD; "Categories" hosts the
// per-tenant root_cause_categories lookup admin (new with the RCA
// reportability spike). Deep-linkable via ?tab=categories.
const tabs = [
  { id: 'templates', label: 'Templates', icon: IconFileSettings },
  { id: 'categories', label: 'Categories', icon: IconTags },
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
  // Mirror to the URL so refresh / share-link lands on the same tab.
  // Use replace so the tab toggle doesn't pollute back-button history.
  router.replace({ query: { ...route.query, tab: id } })
}

const showCreateDialog = ref(false)
const editTemplate = ref(null)
const confirmDelete = ref({ open: false, template: null })

const canCreate = computed(() => isAllowed(['rcaTemplates:create']))
const canUpdate = computed(() => isAllowed(['rcaTemplates:update']))
const canDelete = computed(() => isAllowed(['rcaTemplates:delete']))

const search = ref('')

const templates = useLiveQueryWithDeps(
  [() => search.value],
  async (db, [q]) => {
    const results = await db.RcaTemplate.where().exec()
    if (!q) return results.sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))
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
    <PageHeader :icon="IconSitemap" title="RCA Templates" />

    <!-- The "New Template" header-action only makes sense on the Templates
         tab. The Categories tab has its own "Add Category" button inside
         the card. -->
    <SafeTeleport v-if="activeTab === 'templates'" to="#main-header-actions">
      <BaseButton v-if="canCreate" @click="showCreateDialog = true">
        New Template
      </BaseButton>
    </SafeTeleport>

    <div class="tw:flex tw:items-center tw:justify-between">
      <div class="tw:flex tw:flex-col tw:gap-1">
        <div class="tw:text-3xl tw:font-bold tw:text-on-sidebar">RCA Templates</div>
        <div class="tw:text-sm tw:text-secondary">
          Pre-configure Root Cause Analysis frameworks and the categories supplier /
          analysts pick when finalising an analysis.
        </div>
      </div>
    </div>

    <!-- Tabs — Templates (CRUD on rca_templates) vs Categories (admin on
         root_cause_categories, the per-tenant lookup used by the RCA
         widget finalize step). -->
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

      <RcaTemplatesTable
        :rows="templates"
        :canUpdate="canUpdate"
        :canDelete="canDelete"
        @edit="onEdit"
        @delete="onDelete"
      />
    </template>

    <!-- Tab: Categories — per-tenant root_cause_categories admin. -->
    <RootCauseCategoriesCard v-else-if="activeTab === 'categories'" />

    <RcaTemplateDialog
      v-model="showCreateDialog"
      :template="editTemplate"
      @close="onDialogClose"
    />

    <ConfirmDialog
      v-model="confirmDelete.open"
      title="Delete RCA Template"
      :message="`Are you sure you want to delete '${confirmDelete.template?.name}'? This cannot be undone.`"
      okLabel="Delete"
      @ok="confirmDeleteTemplate"
    />
  </div>
</template>
