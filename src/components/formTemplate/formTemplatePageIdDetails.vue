<script setup>
import { IconTrash, IconEdit, IconCode, IconRocket, IconBolt } from '@tabler/icons-vue'
import { isAllowed } from '@/utils/currentSession'
import { getCompanyPath } from '@/utils/routeHelpers'

const props = defineProps({
  id: {
    type: String,
    required: true,
  },
})

const toast = useToast()
const router = useRouter()

const template = useLiveQueryWithDeps(
  [() => props.id],
  async (db, [id]) => {
    if (!id) return null
    return db.FormTemplate.findByPk(id)
  },
  { models: ['FormTemplate'] },
)

const siteAssignments = useLiveQueryWithDeps(
  [() => props.id],
  async (db, [id]) => {
    if (!id) return []
    return db.SiteOnTemplate.where('templateId', id).exec()
  },

  { models: ['SiteOnTemplate'], initial: [] },
)

const assignedSiteIds = computed(() => siteAssignments.value.map((s) => s.siteId))

const formData = ref({})

const formattedCreatedAt = computed(() => template.value?.createdAt?.formatDate('date'))
const relativeUpdatedAt = computed(() => template.value?.updatedAt?.formatDate('date'))
const canUpdate = computed(() => isAllowed(['formTemplates:update']))
const canDelete = computed(() => isAllowed(['formTemplates:delete']))
const loading = computed(() => template.value === undefined)
const showPromote = ref(false)

// Auto-save for template fields
useAutoSave(template, { onError: (err) => toast.error(err.message || 'Failed to save') })

// Site assignments (junction table — separate handler)
const addSiteOnTemplate = useLiveMutation(async (db, { templateId, siteId }) => {
  const sot = db.SiteOnTemplate.create({ templateId, siteId })
  await sot.save()
  return sot
})

async function handleSitesChange(newSiteIds) {
  const currentIds = assignedSiteIds.value
  const toAdd = newSiteIds.filter((id) => !currentIds.includes(id))
  const toRemove = currentIds.filter((id) => !newSiteIds.includes(id))

  // Surface the failure instead of leaving an unhandled rejection in the
  // console. The save can be rejected server-side (e.g. RLS on
  // sites_on_templates) — pessimistic saves mean a throw == nothing changed.
  try {
    for (const siteId of toAdd) {
      await addSiteOnTemplate({ templateId: props.id, siteId })
    }
    for (const siteId of toRemove) {
      const match = siteAssignments.value.find((sa) => sa.siteId === siteId)
      if (match) await match.delete()
    }
  } catch (err) {
    toast.error(err?.message || 'Failed to update assigned sites')
  }
}

// Delete
const { confirm } = useConfirm()

async function handleDelete() {
  if (!template.value) return
  const ok = await confirm({
    title: 'Delete Template',
    message: `Are you sure you want to delete form template "${template.value.title}" (${template.value.code})? This action cannot be undone.`,
    okLabel: 'Delete',
    danger: true,
  })
  if (!ok) return
  try {
    await template.value.delete()
    toast.success('Form template deleted successfully')
    router.push(getCompanyPath('/templates'))
  } catch {
    toast.error('Failed to delete form template')
  }
}
</script>

<template>
  <div class="tw:flex tw:overflow-hidden tw:h-full">
    <!-- Header Actions Section -->
    <SafeTeleport to="#main-header-actions">
      <div v-if="template" class="tw:flex tw:items-center tw:gap-3">
        <BaseButton
          v-if="canDelete"
          variant="outline"
          class="tw:text-bad!"
          @click="handleDelete"
        >
          <IconTrash :size="16" class="tw:mr-1" />
          Delete
        </BaseButton>
        <BaseButton
          v-if="canUpdate"
          variant="outline"
          :to="getCompanyPath(`/templates/${template.id}?mode=schema`)"
        >
          <IconEdit :size="16" class="tw:mr-1" />
          Edit Template
        </BaseButton>
        <BaseButton
          variant="outline"
          :to="getCompanyPath(`/templates/${template.id}?mode=records`)"
        >
          View records
        </BaseButton>
        <BaseButton
          v-if="template.isModule"
          variant="outline"
          :to="getCompanyPath(`/templates/${template.id}?mode=automation`)"
        >
          <IconBolt :size="16" class="tw:mr-1" />
          Automation
        </BaseButton>
        <BaseButton
          v-if="canUpdate && !template.isModule"
          variant="primary"
          @click="showPromote = true"
        >
          <IconRocket :size="16" class="tw:mr-1" />
          Promote to Module
        </BaseButton>
        <BaseButton
          v-else-if="template.isModule"
          variant="outline"
          :to="getCompanyPath(`/m/${template.internalName}`)"
        >
          Open Module
        </BaseButton>
      </div>
    </SafeTeleport>

    <PromoteToModuleDialog
      v-if="template"
      v-model="showPromote"
      :templateId="template.id"
      :suggestedName="template.title"
    />

    <!-- Main Content Area (Fields Preview) -->
    <div class="tw:grow tw:flex tw:flex-col tw:min-w-0 tw:overflow-hidden">
      <!-- Loading State -->
      <div v-if="loading" class="tw:flex tw:flex-col tw:items-center tw:justify-center tw:h-full">
        <BaseSpinner size="lg" />
        <div class="tw:text-sm tw:text-on-main tw:mt-4">Loading template...</div>
      </div>

      <div v-else-if="template" class="tw:grow tw:flex tw:flex-col tw:p-8 tw:overflow-hidden">
        <div
          class="tw:max-w-3xl tw:mx-auto tw:flex tw:flex-col tw:w-full tw:h-full tw:overflow-hidden"
        >
          <div
            class="tw:mb-8 tw:flex tw:items-center tw:justify-between tw:border-b tw:border-divider tw:pb-4 tw:shrink-0"
          >
            <div>
              <h3 class="tw:text-lg tw:font-bold tw:text-on-main">Fields Preview</h3>
              <p class="tw:text-sm tw:text-secondary">
                Live representation of the form generated from metadata.
              </p>
            </div>
            <span
              class="tw:text-xs tw:font-semibold tw:uppercase tw:text-secondary tw:bg-main-hover tw:px-2 tw:py-1 tw:rounded"
              >Read-only view</span
            >
          </div>

          <!-- Form area -->
          <div class="tw:grow tw:overflow-y-auto tw:min-h-0">
            <div
              class="tw:bg-sidebar tw:p-4 tw:rounded-xl tw:border tw:border-divider tw:shadow-sm"
            >
              <DynamicForm v-model="formData" :fields="template.schema || []" readonly />

              <div
                v-if="!template.schema || template.schema.length === 0"
                class="tw:text-center tw:py-8 tw:text-gray-500"
              >
                No fields defined in this template.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Right Sidebar (Metadata) -->
    <aside
      v-if="template"
      class="tw:w-96 tw:border-l tw:border-divider tw:bg-sidebar tw:overflow-y-auto tw:shrink-0"
    >
      <div class="tw:p-6">
        <div class="tw:flex tw:items-center tw:gap-2 tw:mb-6 tw:text-on-sidebar">
          <IconCode :size="20" class="tw:text-primary" />
          <BaseText as="h3" variant="subheading" weight="bold">Metadata Properties</BaseText>
        </div>
        <div class="tw:space-y-6">
          <!-- Template Identity -->
          <div class="tw:space-y-4">
            <BaseText as="h4" variant="overline" class="tw:block">Template Identity</BaseText>
            <div class="tw:grid tw:gap-4">
              <div class="tw:space-y-1">
                <label class="tw:text-xs tw:font-medium tw:text-secondary">ID</label>
                <div
                  class="tw:text-sm tw:font-mono tw:bg-main tw:p-2 tw:rounded tw:text-on-main tw:break-all"
                >
                  {{ template.id }}
                </div>
              </div>
              <BaseField v-slot="{ id: fieldId }" label="Internal Title">
                <BaseTextInput v-if="canUpdate" :id="fieldId" v-model="template.title" size="sm" />
                <div v-else class="tw:text-sm tw:font-medium tw:text-on-main">
                  {{ template.title }}
                </div>
              </BaseField>
              <BaseField v-slot="{ id: fieldId }" label="Description">
                <BaseTextarea
                  v-if="canUpdate"
                  :id="fieldId"
                  v-model="template.description"
                  placeholder="Click to add description..."
                  size="sm"
                />
                <div v-else class="tw:text-sm tw:text-on-main tw:min-h-5">
                  {{ template.description || '—' }}
                </div>
              </BaseField>
            </div>
          </div>

          <!-- Classification -->
          <div class="tw:space-y-4 tw:pt-4 tw:border-t tw:border-divider">
            <BaseText as="h4" variant="overline" class="tw:block">Classification</BaseText>
            <div class="tw:grid tw:gap-4">
              <div class="tw:space-y-1 tw:flex tw:flex-col">
                <label class="tw:text-xs tw:font-medium tw:text-secondary">Template Code</label>
                <div
                  class="tw:text-xs tw:font-mono tw:bg-main-hover tw:px-2 tw:py-1 tw:rounded tw:text-on-main tw:inline-flex tw:w-fit"
                >
                  {{ template.code }}
                </div>
              </div>
              <BaseField label="Status">
                <FormTemplateStatusSelectMenu
                  v-if="canUpdate"
                  v-model="template.statusId"
                  required
                />
                <FormTemplateStatusBadgeById v-else :statusId="template.statusId" showDot />
              </BaseField>
              <!-- Assigned Sites -->
              <BaseField label="Assigned Sites">
                <SiteSelectMenu
                  v-if="canUpdate"
                  multiple
                  :modelValue="assignedSiteIds"
                  @update:modelValue="handleSitesChange"
                />
                <div v-else class="tw:flex tw:flex-wrap tw:gap-1">
                  <SiteBadgeById
                    v-for="sa in siteAssignments"
                    :key="sa.siteId"
                    :siteId="sa.siteId"
                  />
                  <span v-if="siteAssignments.length === 0" class="tw:text-sm tw:text-secondary">
                    No sites assigned
                  </span>
                </div>
              </BaseField>
            </div>
          </div>

          <!-- JSON Configuration -->
          <div
            v-if="template.config && Object.keys(template.config).length"
            class="tw:space-y-4 tw:pt-4 tw:border-t tw:border-divider"
          >
            <BaseText as="h4" variant="overline" class="tw:block">JSON Configuration</BaseText>
            <div class="tw:rounded-lg tw:bg-code tw:p-3 tw:overflow-hidden">
              <pre
                class="tw:text-micro tw:text-good tw:font-mono tw:leading-relaxed tw:whitespace-pre-wrap"
              ><code>{{ JSON.stringify(template.config, null, 2) }}</code></pre>
            </div>
          </div>

          <!-- System Info -->
          <div class="tw:p-4 tw:bg-main tw:rounded-lg">
            <div class="tw:flex tw:flex-col tw:gap-2">
              <div class="tw:flex tw:justify-between tw:text-caption">
                <span class="tw:text-secondary">Last Modified</span>
                <span class="tw:font-bold tw:text-on-main">{{ relativeUpdatedAt }}</span>
              </div>

              <div class="tw:flex tw:justify-between tw:text-caption">
                <span class="tw:text-secondary">Created Date</span>
                <span class="tw:font-bold tw:text-on-main">{{ formattedCreatedAt }}</span>
              </div>

              <div class="tw:flex tw:justify-between tw:text-caption">
                <span class="tw:text-secondary">Version</span>
                <span class="tw:font-bold tw:text-on-main">{{ template.version }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </aside>

  </div>
</template>
