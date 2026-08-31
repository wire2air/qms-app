<script setup>
import { IconSitemap, IconFileSettings, IconTags } from '@tabler/icons-vue'
import { isAllowed } from '@/utils/currentSession.js'

// Tabs — "Templates" hosts the original CRUD; "Categories" hosts the
// per-tenant root_cause_categories lookup admin (new with the RCA
// reportability spike). Deep-linkable via ?tab=categories.
const tabs = [
  { value: 'templates', label: 'Templates', icon: IconFileSettings },
  { value: 'categories', label: 'Categories', icon: IconTags },
]
const route = useRoute()
const router = useRouter()
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
  // Mirror to the URL so refresh / share-link lands on the same tab.
  // Use replace so the tab toggle doesn't pollute back-button history.
  if (route.query.tab !== id) router.replace({ query: { ...route.query, tab: id } })
})

const showCreateDialog = ref(false)
const editTemplate = ref(null)
const { confirm } = useConfirm()

const canCreate = computed(() => isAllowed(['rca_templates:create']))
const canUpdate = computed(() => isAllowed(['rca_templates:update']))
const canDelete = computed(() => isAllowed(['rca_templates:delete']))

const templates = useLiveQuery(
  async (db) => {
    const results = await db.RcaTemplate.where().exec()
    return results.sort(
      (a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0),
    )
  },

  { models: ['RcaTemplate'], initial: [] },
)

function onEdit(template) {
  editTemplate.value = template
  showCreateDialog.value = true
}

async function onDelete(template) {
  const ok = await confirm({
    title: 'Delete RCA Template',
    message: `Are you sure you want to delete '${template.name}'? This cannot be undone.`,
    okLabel: 'Delete',
    danger: true,
  })
  if (ok) await template.delete()
}

function onDialogClose() {
  showCreateDialog.value = false
  editTemplate.value = null
}
</script>

<template>
  <BasePage width="standard">
    <PageHeader
      :icon="IconSitemap"
      title="RCA Templates"
      subtitle="Pre-configure Root Cause Analysis frameworks and the categories supplier / analysts pick when finalising an analysis."
    >
      <template #title>
        <span class="tw:inline-flex tw:items-center tw:gap-1.5">
          RCA Templates
          <HelpButton slug="KB/quality/root-cause-analysis" :size="16" />
        </span>
      </template>
      <!-- The "New Template" header-action only makes sense on the Templates
           tab. The Categories tab has its own "Add Category" button inside
           the card. -->
      <template #actions>
        <BaseButton v-if="activeTab === 'templates' && canCreate" @click="showCreateDialog = true">
          New Template
        </BaseButton>
      </template>
    </PageHeader>

    <!-- Tabs — Templates (CRUD on rca_templates) vs Categories (admin on
         root_cause_categories, the per-tenant lookup used by the RCA
         widget finalize step). -->
    <BaseTabs v-model="activeTab" :tabs="tabs" ariaLabel="RCA Templates sections">
      <div class="tw:mt-6">
        <!-- Tab: Templates -->
        <BaseTabPanel value="templates">
          <div class="tw:flex tw:flex-col tw:gap-3">
            <RcaTemplatesTable
              :rows="templates"
              :canUpdate="canUpdate"
              :canDelete="canDelete"
              @edit="onEdit"
              @delete="onDelete"
            />
          </div>
        </BaseTabPanel>

        <!-- Tab: Categories — per-tenant root_cause_categories admin. -->
        <BaseTabPanel value="categories">
          <RootCauseCategoriesCard />
        </BaseTabPanel>
      </div>
    </BaseTabs>

    <RcaTemplateDialog v-model="showCreateDialog" :template="editTemplate" @close="onDialogClose" />
  </BasePage>
</template>
