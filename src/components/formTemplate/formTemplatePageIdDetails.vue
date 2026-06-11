<script setup>
import { IconTrash, IconEdit, IconCode } from '@tabler/icons-vue'
import { isAllowed } from '@/utils/currentSession'
import { getCompanyPath } from '@/utils/routeHelpers'
import { useDebounceFn } from '@vueuse/core'

const props = defineProps({
  id: {
    type: String,
    required: true,
  },
})

const toast = useToast()
const router = useRouter()

const template = useLiveQueryWithDeps([() => props.id], async (db, [id]) => {
  if (!id) return null
  return db.FormTemplate.findByPk(id)
})

const siteAssignments = useLiveQueryWithDeps(
  [() => props.id],
  async (db, [id]) => {
    if (!id) return []
    return db.SiteOnTemplate.where('templateId', id).exec()
  },
  { initial: [] },
)

const assignedSiteIds = computed(() => siteAssignments.value.map((s) => s.siteId))

const formData = ref({})

const formattedCreatedAt = computed(() => template.value?.createdAt?.formatDate('date'))
const relativeUpdatedAt = computed(() => template.value?.updatedAt?.formatDate('date'))
const canUpdate = computed(() => isAllowed(['formTemplates:update']))
const canDelete = computed(() => isAllowed(['formTemplates:delete']))
const loading = computed(() => template.value === undefined)

// Auto-save for template fields
const isSaving = ref(false)
const isFirstLoad = ref(true)

const debouncedSave = useDebounceFn(async () => {
  if (!template.value) return
  isSaving.value = true
  try {
    await template.value.save()
  } catch (err) {
    toast.error(err.message || 'Failed to save')
  } finally {
    isSaving.value = false
  }
}, 500)

watch(
  template,
  (t) => {
    if (isFirstLoad.value) {
      isFirstLoad.value = false
      return
    }
    if (t) debouncedSave()
  },
  { deep: true },
)

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

  for (const siteId of toAdd) {
    await addSiteOnTemplate({ templateId: props.id, siteId })
  }
  for (const siteId of toRemove) {
    const match = siteAssignments.value.find((sa) => sa.siteId === siteId)
    if (match) await match.delete()
  }
}

// Delete
const showDeleteConfirm = ref(false)

async function handleDelete() {
  if (!template.value) return
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
          @click="showDeleteConfirm = true"
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
      </div>
    </SafeTeleport>

    <!-- Main Content Area (Fields Preview) -->
    <div class="tw:grow tw:flex tw:flex-col tw:min-w-0 tw:overflow-hidden">
      <!-- Loading State -->
      <div v-if="loading" class="tw:flex tw:flex-col tw:items-center tw:justify-center tw:h-full">
        <div
          class="tw:size-12 tw:animate-spin tw:rounded-full tw:border-2 tw:border-primary tw:border-t-transparent"
        />
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
          <h3 class="tw:text-base tw:font-bold">Metadata Properties</h3>
        </div>
        <div class="tw:space-y-6">
          <!-- Template Identity -->
          <div class="tw:space-y-4">
            <h4 class="tw:text-xs tw:font-semibold tw:uppercase tw:text-secondary">
              Template Identity
            </h4>
            <div class="tw:grid tw:gap-4">
              <div class="tw:space-y-1">
                <label class="tw:text-xs tw:font-medium tw:text-secondary">ID</label>
                <div
                  class="tw:text-sm tw:font-mono tw:bg-main tw:p-2 tw:rounded tw:text-on-main tw:break-all"
                >
                  {{ template.id }}
                </div>
              </div>
              <div class="tw:space-y-1">
                <label class="tw:text-xs tw:font-medium tw:text-secondary">Internal Title</label>
                <BaseTextInput v-if="canUpdate" v-model="template.title" size="sm" />
                <div v-else class="tw:text-sm tw:font-medium tw:text-on-main">
                  {{ template.title }}
                </div>
              </div>
              <div class="tw:space-y-1">
                <label class="tw:text-xs tw:font-medium tw:text-secondary">Description</label>
                <BaseTextarea
                  v-if="canUpdate"
                  v-model="template.description"
                  placeholder="Click to add description..."
                  size="sm"
                />
                <div v-else class="tw:text-sm tw:text-on-main tw:min-h-5">
                  {{ template.description || '—' }}
                </div>
              </div>
            </div>
          </div>

          <!-- Classification -->
          <div class="tw:space-y-4 tw:pt-4 tw:border-t tw:border-divider">
            <h4 class="tw:text-xs tw:font-semibold tw:uppercase tw:text-secondary">
              Classification
            </h4>
            <div class="tw:grid tw:gap-4">
              <div class="tw:space-y-1 tw:flex tw:flex-col">
                <label class="tw:text-xs tw:font-medium tw:text-secondary">Template Code</label>
                <div
                  class="tw:text-xs tw:font-mono tw:bg-main-hover tw:px-2 tw:py-1 tw:rounded tw:text-on-main tw:inline-flex tw:w-fit"
                >
                  {{ template.code }}
                </div>
              </div>
              <div class="tw:space-y-1">
                <label class="tw:text-xs tw:font-medium tw:text-secondary">Status</label>
                <FormTemplateStatusSelectMenu
                  v-if="canUpdate"
                  v-model="template.statusId"
                  required
                />
                <FormTemplateStatusBadgeById v-else :statusId="template.statusId" showDot />
              </div>
              <!-- Assigned Sites -->
              <div class="tw:space-y-1">
                <label class="tw:text-xs tw:font-medium tw:text-secondary">Assigned Sites</label>
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
              </div>
            </div>
          </div>

          <!-- Inspections & Logs classification editor -->
          <div class="tw:space-y-4 tw:pt-4 tw:border-t tw:border-divider">
            <FormTemplateClassificationEditor :template="template" />
          </div>

          <!-- JSON Configuration -->
          <div
            v-if="template.config && Object.keys(template.config).length"
            class="tw:space-y-4 tw:pt-4 tw:border-t tw:border-divider"
          >
            <h4 class="tw:text-xs tw:font-semibold tw:uppercase tw:text-secondary">
              JSON Configuration
            </h4>
            <div class="tw:rounded-lg tw:bg-[#111827] tw:p-3 tw:overflow-hidden">
              <pre
                class="tw:text-[10px] tw:text-good tw:font-mono tw:leading-relaxed tw:whitespace-pre-wrap"
              ><code>{{ JSON.stringify(template.config, null, 2) }}</code></pre>
            </div>
          </div>

          <!-- System Info -->
          <div class="tw:p-4 tw:bg-main tw:rounded-lg">
            <div class="tw:flex tw:flex-col tw:gap-2">
              <div class="tw:flex tw:justify-between tw:text-[11px]">
                <span class="tw:text-secondary">Last Modified</span>
                <span class="tw:font-bold tw:text-on-main">{{ relativeUpdatedAt }}</span>
              </div>

              <div class="tw:flex tw:justify-between tw:text-[11px]">
                <span class="tw:text-secondary">Created Date</span>
                <span class="tw:font-bold tw:text-on-main">{{ formattedCreatedAt }}</span>
              </div>

              <div class="tw:flex tw:justify-between tw:text-[11px]">
                <span class="tw:text-secondary">Version</span>
                <span class="tw:font-bold tw:text-on-main">{{ template.version }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </aside>

    <!-- Delete Confirmation -->
    <ConfirmDialog
      v-model="showDeleteConfirm"
      title="Delete Template"
      :message="`Are you sure you want to delete form template &quot;${template?.title}&quot; (${template?.code})? This action cannot be undone.`"
      confirmLabel="Delete"
      variant="danger"
      @confirm="handleDelete"
    />
  </div>
</template>
