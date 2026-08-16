<script setup>
import { IconLayoutGrid, IconFileSettings } from '@tabler/icons-vue'
import { isAllowed } from '@/utils/currentSession.js'

// Tabs — "Templates" hosts the CRUD on risk_assessment_templates.
//
// "Hazard Categories" is HIDDEN (user request 2026-08-15) — not deleted. Its
// only consumer was the Hazard category picker on RiskAssessmentField, which
// is hidden too, so the tab now administers a lookup nothing reads. The
// hazard_categories table, its controller and the panel below all still work;
// restore this entry to bring the tab back (and un-comment the field in
// RiskAssessmentField.vue). A ?tab=hazards deep link falls back to Templates
// because the id is no longer in validTabIds.
const tabs = [{ value: 'templates', label: 'Templates', icon: IconFileSettings }]
const route = useRoute()
const router = useRouter()
const validTabIds = new Set(tabs.map((t) => t.value))
const activeTab = computed({
  get() {
    return validTabIds.has(route.query.tab) ? route.query.tab : 'templates'
  },
  set(id) {
    router.replace({ query: { ...route.query, tab: id } })
  },
})

const showCreateDialog = ref(false)
const editTemplate = ref(null)
const { confirm } = useConfirm()

const canCreate = computed(() => isAllowed(['risk_assessment_templates:create']))
const canUpdate = computed(() => isAllowed(['risk_assessment_templates:update']))
const canDelete = computed(() => isAllowed(['risk_assessment_templates:delete']))

const templates = useLiveQuery(
  async (db) => {
    const results = await db.RiskAssessmentTemplate.where().exec()
    return results.sort(
      (a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0),
    )
  },

  { models: ['RiskAssessmentTemplate'], initial: [] },
)

function onEdit(template) {
  editTemplate.value = template
  showCreateDialog.value = true
}

async function onDelete(template) {
  const ok = await confirm({
    title: 'Delete Risk Assessment Template',
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
      :icon="IconLayoutGrid"
      title="Risk Assessment Templates"
      subtitle="Configure the risk matrices used when finalising an assessment."
    >
      <!-- "New Template" header-action only on the Templates tab; the
           Hazard Categories tab has its own "Add Category" affordance. -->
      <template #actions>
        <BaseButton v-if="activeTab === 'templates' && canCreate" @click="showCreateDialog = true">
          New Template
        </BaseButton>
      </template>
    </PageHeader>

    <!-- Tabs — Templates (CRUD on risk_assessment_templates) vs Hazard
         Categories (admin on hazard_categories, the per-tenant lookup
         used by the RA widget finalize step). -->
    <BaseTabs v-model="activeTab" :tabs="tabs" ariaLabel="Risk assessment settings">
      <div class="tw:mt-6">
        <!-- Tab: Templates -->
        <BaseTabPanel value="templates">
          <div class="tw:flex tw:flex-col tw:gap-3">
            <RiskAssessmentTemplatesTable
              :rows="templates"
              :canUpdate="canUpdate"
              :canDelete="canDelete"
              @edit="onEdit"
              @delete="onDelete"
            />
          </div>
        </BaseTabPanel>

        <!-- Tab: Hazard Categories — per-tenant hazard_categories admin. -->
        <BaseTabPanel value="hazards">
          <HazardCategoriesCard />
        </BaseTabPanel>
      </div>
    </BaseTabs>

    <RiskAssessmentTemplateDialog
      v-model="showCreateDialog"
      :template="editTemplate"
      @close="onDialogClose"
    />

  </BasePage>
</template>
