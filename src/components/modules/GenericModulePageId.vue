<script setup>
import { IconForms } from '@tabler/icons-vue'
import { currentSession } from '@/utils/currentSession'
import { post } from '@/api' // Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import DynamicForm from '@/components/form/DynamicForm.js'

const props = defineProps({
  moduleKey: { type: String, required: true },
  id: { type: String, required: true },
})

const record = useLiveQueryWithDeps(
  [() => props.id],
  async (db, [id]) => (id ? db.Record.findByPk(id) : null),
  { models: ['Record'] },
)
const template = useLiveQueryWithDeps(
  [() => record.value?.templateId],
  async (db, [tid]) => (tid ? db.FormTemplate.findByPk(tid) : null),
  { models: ['FormTemplate'] },
)

const fields = computed(() => template.value?.schema || [])
// Routed sections are filled by their workflow assignees; everything else is
// owner-level (filled at Draft and reviewed at close).
const isRoutedSection = (f) => f.type === 'section' && f.routing && f.routing.type
const ownerFields = computed(() => fields.value.filter((f) => !isRoutedSection(f)))
const hasOwnerFields = computed(() => ownerFields.value.length > 0)
const hasRoutedSections = computed(() => fields.value.some(isRoutedSection))

const status = computed(() => record.value?.statusId)
const isDraft = computed(() => status.value === 'DRAFT')
const isComplete = computed(() => status.value === 'COMPLETE')
const isStarted = computed(() => !!record.value?.workflowInstanceId && !isDraft.value)
const isTerminal = computed(() => status.value === 'CLOSED' || status.value === 'REJECTED')

const currentUserId = computed(() => currentSession.value?.userId)
const isOwner = computed(() =>
  [record.value?.ownerUserId, record.value?.userId].includes(currentUserId.value),
)
// The owner edits the owner-level sections until the record is closed/rejected.
const ownerEditable = computed(() => isOwner.value && !isTerminal.value)

const showStart = ref(false)
const showShareSupplier = ref(false)
const title = computed(
  () => template.value?.moduleConfig?.displayName || template.value?.title || 'Record',
)

// Owner-level section answers — autosave while editable.
const formData = ref({})
const ownerFormRef = ref(null)
const seeded = ref(false)
watch(
  record,
  (r) => {
    if (r && !seeded.value) {
      formData.value = { ...(r.payload || {}) }
      seeded.value = true
    }
  },
  { immediate: true },
)

const saving = ref(false)
const debouncedSave = useDebounceFn(async () => {
  if (!record.value || !ownerEditable.value) return
  saving.value = true
  try {
    record.value.payload = formData.value
    await record.value.save()
  } finally {
    saving.value = false
  }
}, 600)
watch(
  formData,
  () => {
    if (seeded.value && ownerEditable.value) debouncedSave()
  },
  { deep: true },
)

// Close — owner validates owner-level sections, then flips Complete → Closed.
const closing = ref(false)
const closeError = ref('')
async function closeRecord() {
  if (closing.value) return
  const valid = await ownerFormRef.value?.validate?.()
  if (valid === false) return
  closing.value = true
  closeError.value = ''
  try {
    await post(`/v1/services/form-modules/records/${props.id}/close`, { payload: formData.value })
  } catch (e) {
    closeError.value = e?.message || 'Failed to close'
  } finally {
    closing.value = false
  }
}
</script>

<template>
  <BasePage v-if="record" width="wide">
    <PageHeader :icon="IconForms" :title="record.recordNumber">
      <template #actions>
        <template v-if="isDraft && hasRoutedSections">
          <BaseButton variant="outline" size="sm" @click="showShareSupplier = true">
            Share with supplier
          </BaseButton>
          <BaseButton variant="primary" size="sm" @click="showStart = true"> Start </BaseButton>
        </template>
        <BaseButton
          v-if="isComplete && isOwner"
          variant="primary"
          size="sm"
          :loading="closing"
          @click="closeRecord"
        >
          Close
        </BaseButton>
      </template>
    </PageHeader>

    <div class="tw:flex tw:flex-col tw:gap-4 tw:lg:flex-row tw:lg:items-start">
      <div class="tw:flex tw:flex-col tw:gap-4 tw:flex-1 tw:min-w-0">
        <BaseCard class="tw:flex tw:flex-wrap tw:items-center tw:gap-4">
          <RecordStatusBadgeById :statusId="record.statusId" />
          <div class="tw:text-sm tw:text-secondary">{{ title }}</div>
          <div class="tw:flex-1" />
          <div v-if="saving" class="tw:text-xs tw:text-secondary">Saving…</div>
        </BaseCard>

      <div v-if="closeError" class="tw:text-sm tw:text-bad">{{ closeError }}</div>

      <!-- Owner-level (non-routed) sections — editable by the owner until the
           record is closed; read-only otherwise. -->
      <BaseCard v-if="hasOwnerFields">
        <DynamicForm
          v-if="ownerEditable"
          ref="ownerFormRef"
          v-model="formData"
          :fields="ownerFields"
        />
        <FormSchemaReadonlyView v-else :fields="ownerFields" :values="record.payload || {}" />
      </BaseCard>

      <!-- Draft: read-only preview of the routed sections (the workflow steps). -->
      <BaseCard v-if="isDraft && hasRoutedSections">
        <GenericModuleWorkflowPreview :schema="fields" />
      </BaseCard>

      <!-- Started: the live section workflow (Pending → Complete → Closed). -->
        <BaseCard v-if="isStarted">
          <GenericModuleWorkflowDetail
            :recordId="id"
            :moduleKey="moduleKey"
            :displayName="title"
            :workflowInstanceId="record.workflowInstanceId"
            :isOwner="isOwner"
          />
        </BaseCard>
      </div>

      <!-- Right rail: optional first-class fields. -->
      <div class="tw:w-full tw:lg:w-72 tw:shrink-0">
        <GenericModuleRail :recordId="id" :editable="!isTerminal" />
      </div>
    </div>

    <GenericModuleStartDialog
      v-if="record"
      v-model="showStart"
      :recordId="id"
      :templateId="record.templateId"
      :moduleKey="moduleKey"
    />
    <GenericModuleShareSupplierDialog
      v-if="record"
      v-model="showShareSupplier"
      :recordId="id"
      :templateId="record.templateId"
      :moduleKey="moduleKey"
    />
  </BasePage>
</template>
