<script setup>
import { getCompanyPath } from '@/utils/routeHelpers'
import { post } from '@/api' // Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import DynamicForm from '@/components/form/DynamicForm.js'
import { IconForms } from '@tabler/icons-vue'
import { currentSession } from '@/utils/currentSession.js'

const props = defineProps({ moduleKey: { type: String, required: true } })
const router = useRouter()
const route = useRoute()
// Optional supplier context (create-from-supplier, e.g. "New Qualification").
const supplierId = computed(() => route.query.supplierId || null)

const template = useLiveQueryWithDeps(
  [() => props.moduleKey],
  async (db, [key]) => {
    if (!key) return null
    const list = await db.FormTemplate.where('internalName', key).exec()
    return list.find((t) => t.isModule) || null
  },
  { models: ['FormTemplate'] },
)

const title = computed(
  () => template.value?.moduleConfig?.displayName || template.value?.title || 'Module',
)
// The creator only fills the non-routed content; routed sections (Action /
// Approval) are locked at create and completed by their workflow-step assignees
// after Start.
const isRoutedSection = (f) => f.type === 'section' && f.routing && f.routing.type
const fields = computed(() => (template.value?.schema || []).filter((f) => !isRoutedSection(f)))
const hasDraftFields = computed(() => fields.value.length > 0)

const formData = ref({})
// First-class envelope, in the right rail — the SAME Details card the detail
// page shows (user 2026-08-28), so create and review read identically. Scoped
// access, automation and notifications key on these record columns.
const siteId = ref(null)
const departmentId = ref(null)
const ownerUserId = ref(currentSession.value?.userId ?? null)
// Session can resolve after mount — default the owner once it does, unless the
// creator already picked someone.
watch(
  () => currentSession.value?.userId,
  (id) => {
    if (id && !ownerUserId.value) ownerUserId.value = id
  },
)
const formRef = ref(null)
// Which button is in flight — 'draft' | 'start' | null. One at a time.
const savingMode = ref(null)

// Two exits (user request 2026-08-27): "Save as Draft" parks the record
// (no number yet — numbers mint at Start), "Create" lands on the detail page
// with the Start dialog already open, so the record goes straight into its
// workflow.
async function create(startAfter) {
  if (!template.value || savingMode.value) return
  const valid = await formRef.value?.validate?.()
  if (valid === false) return
  savingMode.value = startAfter ? 'start' : 'draft'
  try {
    const res = await post('/v1/services/form-modules/records', {
      templateId: template.value.id,
      payload: formData.value,
      siteId: siteId.value,
      departmentId: departmentId.value,
      ownerUserId: ownerUserId.value,
      ...(supplierId.value ? { supplierId: supplierId.value } : {}),
    })
    const record = res?.record ?? res
    router.push(
      getCompanyPath(`/m/${props.moduleKey}/${record.id}${startAfter ? '?start=1' : ''}`),
    )
  } finally {
    savingMode.value = null
  }
}

function cancel() {
  router.push(getCompanyPath(`/m/${props.moduleKey}`))
}
</script>

<template>
  <BasePage width="standard" :fullHeight="false">
    <PageHeader :icon="IconForms" :title="`New ${title}`" />
    <div v-if="template" class="tw:flex tw:flex-col tw:lg:flex-row tw:items-start tw:gap-6">
      <div class="tw:flex-1 tw:min-w-0 tw:flex tw:flex-col tw:gap-4">
        <DynamicForm v-if="hasDraftFields" ref="formRef" v-model="formData" :fields="fields" />
        <!-- Read-only preview of the steps that will fire on Start. -->
        <GenericModuleWorkflowPreview :schema="template.schema" />
        <div class="tw:flex tw:justify-end tw:gap-2">
          <BaseButton variant="outline" @click="cancel">Cancel</BaseButton>
          <BaseButton
            variant="outline"
            :loading="savingMode === 'draft'"
            :disabled="!!savingMode"
            @click="create(false)"
          >
            Save as Draft
          </BaseButton>
          <BaseButton
            variant="primary"
            :loading="savingMode === 'start'"
            :disabled="!!savingMode"
            @click="create(true)"
          >
            Create
          </BaseButton>
        </div>
      </div>

      <!-- Right rail — the same Details card the detail page shows, live from
           the first keystroke. Values land on the record columns at create. -->
      <div class="tw:w-full tw:lg:w-72 tw:shrink-0 tw:flex tw:flex-col tw:gap-4">
        <BaseRailCard title="Details">
          <div class="tw:flex tw:flex-col tw:gap-3 tw:text-sm">
            <div class="tw:flex tw:flex-col tw:gap-1">
              <p class="tw:text-xs tw:font-medium tw:text-secondary">Initiator</p>
              <UserBadgeById v-if="currentSession?.userId" :userId="currentSession.userId" />
              <span v-else class="tw:text-secondary">—</span>
            </div>
            <div class="tw:flex tw:flex-col tw:gap-1">
              <p class="tw:text-xs tw:font-medium tw:text-secondary">Owner</p>
              <UserSelectMenu v-model="ownerUserId" kind="INTERNAL" />
            </div>
            <div class="tw:flex tw:flex-col tw:gap-1">
              <p class="tw:text-xs tw:font-medium tw:text-secondary">Site</p>
              <SiteSelectMenu v-model="siteId" />
            </div>
            <div class="tw:flex tw:flex-col tw:gap-1">
              <p class="tw:text-xs tw:font-medium tw:text-secondary">Department</p>
              <DepartmentSelectMenu v-model="departmentId" :siteId="siteId" />
            </div>
          </div>
        </BaseRailCard>
      </div>
    </div>
  </BasePage>
</template>
