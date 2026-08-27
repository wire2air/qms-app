<script setup>
import { IconForms, IconPrinter, IconTrash } from '@tabler/icons-vue'
import { currentSession, canUseAi, isAllowedOnRecord } from '@/utils/currentSession'
import { getCompanyPath } from '@/utils/routeHelpers.js'
import { post } from '@/api' // Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import DynamicForm from '@/components/form/DynamicForm.js'
import { countStepsBlockingClose } from '@/components/workflow/delayStepClose.js'

const props = defineProps({
  moduleKey: { type: String, required: true },
  id: { type: String, required: true },
})

const route = useRoute()
const router = useRouter()

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

// The record's FROZEN form once started (snapshot stamped at Start); the live
// template only while DRAFT — so a later design change never rewrites what an
// existing record shows (user report 2026-08-27).
const fields = computed(() => record.value?.schemaSnapshot || template.value?.schema || [])
// Routed sections are filled by their workflow assignees; everything else is
// owner-level (filled at Draft and reviewed at close).
const isRoutedSection = (f) => f.type === 'section' && f.routing && f.routing.type
const ownerFields = computed(() => fields.value.filter((f) => !isRoutedSection(f)))
const hasOwnerFields = computed(() => ownerFields.value.length > 0)
const hasRoutedSections = computed(() => fields.value.some(isRoutedSection))

const status = computed(() => record.value?.statusId)
const isDraft = computed(() => status.value === 'DRAFT')
const isStarted = computed(() => !!record.value?.workflowInstanceId && !isDraft.value)
// Unified parent statuses (2026-08-26): Draft / Open / Closed / Cancelled.
const isTerminal = computed(() => status.value === 'CLOSED' || status.value === 'CANCELLED')

// The close gate is the WORKFLOW, not a status: no step may still BLOCK
// (deferred DELAY steps — effectiveness checks armed with a wake date — are
// the exception: they outlive the close and fire after, same as CAPA).
// Reopening a step re-blocks Close automatically.
const blockingStepCount = useLiveQueryWithDeps(
  [() => record.value?.workflowInstanceId],
  async (db, [id]) => {
    if (!id) return 0
    const steps = await db.WorkflowInstanceStep.where('workflowInstanceId', id).exec()
    return countStepsBlockingClose(steps)
  },
  { models: ['WorkflowInstanceStep'], initial: 0 },
)
const workflowDone = computed(
  () => !!record.value?.workflowInstanceId && blockingStepCount.value === 0,
)
const readyToClose = computed(() => status.value === 'OPEN' && workflowDone.value)

const currentUserId = computed(() => currentSession.value?.userId)
const isOwner = computed(() =>
  [record.value?.ownerUserId, record.value?.userId].includes(currentUserId.value),
)
// The owner edits the owner-level sections until the record is closed/rejected.
const ownerEditable = computed(() => isOwner.value && !isTerminal.value)

const showStart = ref(false)
const showShareSupplier = ref(false)

// Create-page "Create" lands here with ?start=1: open the Start dialog as soon
// as the draft is in, then strip the flag so a refresh doesn't re-fire it.
// A draft has no schemaSnapshot, so the routed-section check needs the live
// template — wait for it before deciding, and open only AFTER the query strip
// (dialogs close on route change).
watch(
  [record, template, () => route.query.start],
  async ([r, t, start]) => {
    if (!start || !r) return
    if (!r.schemaSnapshot && !t) return
    const wantsStart = r.statusId === 'DRAFT' && hasRoutedSections.value
    await router.replace({ query: { ...route.query, start: undefined } })
    if (wantsStart) showStart.value = true
  },
  { immediate: true },
)
const title = computed(
  () => template.value?.moduleConfig?.displayName || template.value?.title || 'Record',
)

// Scoring — live preview while editable, sealed once the workflow is done.
const moduleScoring = computed(() => template.value?.moduleConfig?.scoring || null)
const sealedScoring = computed(() =>
  workflowDone.value || isTerminal.value ? record.value?.scoringResult || null : null,
)

// Owner-level section answers — autosave while editable.
const formData = ref({})
// Payload for the live score preview: the sealed record payload overlaid with
// the owner's in-progress edits.
const livePayload = computed(() => ({ ...(record.value?.payload || {}), ...formData.value }))
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
function openPrintView() {
  if (!record.value?.id) return
  // Centralised print: /<companyCode>/print?module=ModuleRecord&id=… —
  // dispatched via components/print/modules/index.js → ModuleRecordPrint.vue,
  // one entry for every promoted form module.
  const params = new URLSearchParams({ module: 'ModuleRecord', id: record.value.id })
  window.open(getCompanyPath(`/print?${params.toString()}`), '_blank', 'noopener,noreferrer')
}

// ─── Delete draft (DRAFT-only) ──────────────────────────────────────────────
// Drafts carry no record number (minted at Start), so deleting one leaves no
// gap in the register. Past Draft the record is controlled — Cancel instead.
const canDelete = computed(
  () => isDraft.value && isAllowedOnRecord(`${props.moduleKey}:update`, record.value),
)
const showDeleteDialog = ref(false)
const deleting = ref(false)
const deleteError = ref('')

async function handleDeleteDraft() {
  if (!record.value || record.value.statusId !== 'DRAFT' || deleting.value) return
  deleting.value = true
  deleteError.value = ''
  try {
    await record.value.delete()
    showDeleteDialog.value = false
    router.push(getCompanyPath(`/m/${props.moduleKey}`))
  } catch (e) {
    deleteError.value = e?.message || 'Failed to delete draft'
  } finally {
    deleting.value = false
  }
}

// ─── Cancel (OPEN-only; controlled) ─────────────────────────────────────────
// An Open record is controlled: abandoning it requires a REQUIRED reason and
// an e-signature (PIN), mirroring the CAPA/NC/CR cancel. The verb decides who
// may — same `<key>:update` the rest of the page runs on.
const canCancel = computed(
  () => status.value === 'OPEN' && isAllowedOnRecord(`${props.moduleKey}:update`, record.value),
)
const showCancelDialog = ref(false)
const showCancelEsign = ref(false)
const cancelling = ref(false)
const cancelReason = ref('')
const cancelReasonError = ref('')
const cancelError = ref('')

function openCancelDialog() {
  cancelReason.value = ''
  cancelReasonError.value = ''
  cancelError.value = ''
  showCancelDialog.value = true
}

function handleCancelClick() {
  if (!cancelReason.value.trim()) {
    cancelReasonError.value = 'A cancel reason is required'
    return
  }
  cancelReasonError.value = ''
  showCancelDialog.value = false
  showCancelEsign.value = true
}

async function onCancelEsignVerified({ method, provider, token }) {
  showCancelEsign.value = false
  cancelling.value = true
  try {
    await post(`/v1/services/form-modules/records/${props.id}/cancel`, {
      method,
      provider,
      token,
      reason: cancelReason.value.trim(),
    })
    showCancelDialog.value = false
  } catch (e) {
    cancelError.value = e?.message || 'Failed to cancel'
    showCancelDialog.value = true
  } finally {
    cancelling.value = false
  }
}

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
    <PageHeader :icon="IconForms" :title="record.recordNumber || 'Draft'">
      <template #actions>
        <BaseButton variant="outline" size="sm" @click="openPrintView">
          <template #icon><IconPrinter :size="16" /></template>
          Print
        </BaseButton>
        <template v-if="isDraft && hasRoutedSections">
          <BaseButton variant="outline" size="sm" @click="showShareSupplier = true">
            Share with supplier
          </BaseButton>
          <BaseButton variant="primary" size="sm" @click="showStart = true"> Start </BaseButton>
        </template>
        <BaseButton v-if="canDelete" variant="outline" size="sm" @click="showDeleteDialog = true">
          <template #icon><IconTrash :size="16" /></template>
          Delete
        </BaseButton>
        <BaseButton v-if="canCancel" variant="outline" size="sm" @click="openCancelDialog">
          Cancel Record
        </BaseButton>
        <BaseButton
          v-if="readyToClose && isOwner"
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

      <!-- AI sidecar: on-demand scoring of AI-enabled fields (owner-editable
           only; results feed the weighted score). Hidden for non-AI tenants. -->
      <ModuleAiEvaluationCard
        v-if="canUseAi && ownerEditable"
        v-model:payload="formData"
        :schema="ownerFields"
      />

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

      <!-- Right rail: optional first-class fields + live/sealed score. -->
      <div class="tw:w-full tw:lg:w-72 tw:shrink-0 tw:flex tw:flex-col tw:gap-4">
        <GenericModuleRail :recordId="id" :editable="!isTerminal" />
        <ScoringSummaryCard
          :schema="fields"
          :payload="livePayload"
          :moduleScoring="moduleScoring"
          :sealed="sealedScoring"
        />
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

    <!-- Delete draft -->
    <BaseDialog v-model="showDeleteDialog" title="Delete Draft" maxWidth="md">
      <p class="tw:text-sm tw:text-on-main tw:mb-3">
        Delete this draft? Drafts have no record number yet, so nothing is lost from the register.
      </p>
      <div
        v-if="deleteError"
        class="tw:bg-red-50 tw:border tw:border-red-200 tw:text-red-700 tw:rounded-md tw:p-2 tw:text-sm tw:mb-3"
      >
        {{ deleteError }}
      </div>
      <div class="tw:flex tw:justify-end tw:gap-2 tw:pt-3 tw:border-t tw:border-divider">
        <BaseButton variant="outline" :disabled="deleting" @click="showDeleteDialog = false">
          Cancel
        </BaseButton>
        <BaseButton variant="danger" :disabled="deleting" @click="handleDeleteDraft">
          {{ deleting ? 'Deleting…' : 'Delete' }}
        </BaseButton>
      </div>
    </BaseDialog>

    <!-- Cancel record (reason + e-signature) -->
    <BaseDialog v-model="showCancelDialog" :title="`Cancel ${title}`" maxWidth="md">
      <div class="tw:flex tw:flex-col tw:gap-3 tw:p-1">
        <p class="tw:text-sm tw:text-on-main">
          Cancelling permanently terminates this record. It stays in the register and audit log;
          you cannot re-open it.
        </p>
        <BaseField v-slot="{ id: fieldId }" label="Reason" required :error="cancelReasonError">
          <BaseTextarea
            :id="fieldId"
            v-model="cancelReason"
            :rows="3"
            placeholder="Why is this record being cancelled?"
            @input="cancelReasonError = ''"
          />
        </BaseField>
        <p
          v-if="cancelError"
          class="tw:text-xs tw:text-red-600 tw:bg-red-50 tw:border tw:border-red-200 tw:rounded-md tw:p-2"
        >
          {{ cancelError }}
        </p>
      </div>
      <template #footer="{ close }">
        <BaseDialogFooter
          cancelLabel="Back"
          submitLabel="Sign &amp; Cancel"
          submitVariant="danger"
          :loading="cancelling"
          :disabled="!cancelReason.trim()"
          @cancel="close"
          @submit="handleCancelClick"
        />
      </template>
    </BaseDialog>
    <WorkflowInstanceEsignAuthDialog v-model="showCancelEsign" @verified="onCancelEsignVerified" />
  </BasePage>
</template>
