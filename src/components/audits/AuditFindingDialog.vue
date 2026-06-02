<script setup>
/**
 * Audit-finding create / edit dialog.
 *
 * Two modes selected by the `finding` prop:
 *   - null   → CREATE: POST /v1/services/auditFindings with
 *              auditInstanceId + optional requirementResponseId.
 *   - object → EDIT:   PATCH /v1/services/auditFindings/:id with the
 *              dirty fields.
 *
 * Pre-fill rules on create (mirrored from the BE controller —
 * presented up-front so the user sees the inherited values + can
 * override before saving):
 *   - departmentId / supplierId default to the parent audit's.
 *   - processArea defaults to the requirementResponse's clause title
 *     when spawning from a non-CONFORMING response.
 */
// Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { post, patch } from '@/api'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  auditInstance: { type: Object, required: true },
  // When passed: the response the user is escalating into a finding.
  // Drives the auditRequirementResponseId binding + the prefilled
  // processArea (clause title).
  requirementResponse: { type: Object, default: null },
  // When passed: edit-existing mode.
  finding: { type: Object, default: null },
})
const emit = defineEmits(['update:modelValue', 'created'])

const toast = useToast()

const FINDING_TYPES = [
  { id: 'MAJOR_NC', name: 'Major NC' },
  { id: 'MINOR_NC', name: 'Minor NC' },
  { id: 'OBSERVATION', name: 'Observation' },
  { id: 'OFI', name: 'OFI' },
]

function defaultForm() {
  // Derive a sensible processArea from the response snapshot — the
  // clause number + title is the most useful "where in the audit
  // did this come from" hint.
  let processArea = ''
  if (props.requirementResponse?.requirementSnapshot) {
    const s = props.requirementResponse.requirementSnapshot
    processArea = `${s.clauseNumber || ''} ${s.title || ''}`.trim()
  }
  return {
    findingTypeId: 'MINOR_NC',
    description: '',
    categoryId: null,
    departmentId: props.auditInstance?.departmentId ?? null,
    supplierId: props.auditInstance?.supplierId ?? null,
    processArea,
    assignedToUserId: null,
    dueDate: '',
    severityScore: 1,
    riskScore: 1,
  }
}

const isEdit = computed(() => !!props.finding)
const form = ref(defaultForm())
const saving = ref(false)

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return
    if (props.finding) {
      // Pre-fill from the existing finding row.
      form.value = {
        findingTypeId: props.finding.findingTypeId,
        description: props.finding.description ?? '',
        categoryId: props.finding.categoryId ?? null,
        departmentId: props.finding.departmentId ?? null,
        supplierId: props.finding.supplierId ?? null,
        processArea: props.finding.processArea ?? '',
        assignedToUserId: props.finding.assignedToUserId ?? null,
        dueDate: props.finding.dueDate
          ? typeof props.finding.dueDate === 'string'
            ? props.finding.dueDate
            : props.finding.dueDate.toFormat?.('yyyy-LL-dd') ?? ''
          : '',
        severityScore: props.finding.severityScore ?? 1,
        riskScore: props.finding.riskScore ?? 1,
      }
    } else {
      form.value = defaultForm()
    }
  },
)

function close() {
  emit('update:modelValue', false)
}

const canSave = computed(() => !!form.value.description.trim() && !!form.value.findingTypeId)

async function handleSave() {
  if (!canSave.value || saving.value) return
  saving.value = true
  try {
    const payload = {
      findingTypeId: form.value.findingTypeId,
      description: form.value.description.trim(),
      categoryId: form.value.categoryId || null,
      departmentId: form.value.departmentId || null,
      supplierId: form.value.supplierId || null,
      processArea: form.value.processArea?.trim() || null,
      assignedToUserId: form.value.assignedToUserId || null,
      dueDate: form.value.dueDate || null,
      severityScore: Number(form.value.severityScore) || 1,
      riskScore: Number(form.value.riskScore) || 1,
    }
    if (isEdit.value) {
      await patch(`/v1/services/auditFindings/${props.finding.id}`, payload)
      toast.success('Finding updated')
    } else {
      const result = await post('/v1/services/auditFindings', {
        ...payload,
        auditInstanceId: props.auditInstance.id,
        auditRequirementResponseId: props.requirementResponse?.id ?? null,
      })
      toast.success(`Finding ${result?.finding?.findingNumber} created`)
      emit('created', result?.finding)
    }
    close()
  } catch (e) {
    toast.error(e.message || 'Failed to save finding')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <BaseDialog
    :modelValue="modelValue"
    :title="isEdit ? 'Edit Finding' : 'New Finding'"
    maxWidth="lg"
    @update:modelValue="close"
  >
    <div class="tw:flex tw:flex-col tw:gap-3 tw:p-1">
      <!-- Source context — visible only on create, when escalating
           from a clause response. Reminds the user this finding will
           link back to the response row. -->
      <div
        v-if="!isEdit && requirementResponse?.requirementSnapshot"
        class="tw:rounded-lg tw:bg-blue-50 tw:border tw:border-blue-200 tw:p-3 tw:text-xs tw:text-blue-800"
      >
        <strong>Escalating from clause:</strong>
        {{ requirementResponse.requirementSnapshot.clauseNumber }} —
        {{ requirementResponse.requirementSnapshot.title }}
      </div>

      <div class="tw:grid tw:grid-cols-2 tw:gap-3">
        <div>
          <p class="tw:text-xs tw:uppercase tw:font-bold tw:text-secondary tw:mb-1">
            Type <span class="tw:text-red-500">*</span>
          </p>
          <BaseInlineSelect v-model="form.findingTypeId" :items="FINDING_TYPES" :required="true" />
        </div>
        <div>
          <p class="tw:text-xs tw:uppercase tw:font-bold tw:text-secondary tw:mb-1">Category</p>
          <AuditFindingCategorySelectMenu v-model="form.categoryId" />
        </div>
      </div>

      <div>
        <p class="tw:text-xs tw:uppercase tw:font-bold tw:text-secondary tw:mb-1">
          Description <span class="tw:text-red-500">*</span>
        </p>
        <BaseTextarea
          v-model="form.description"
          :rows="4"
          placeholder="What was observed? Include the requirement reference + evidence summary."
        />
      </div>

      <div class="tw:grid tw:grid-cols-2 tw:gap-3">
        <div>
          <p class="tw:text-xs tw:uppercase tw:font-bold tw:text-secondary tw:mb-1">Department</p>
          <DepartmentSelectMenu v-model="form.departmentId" />
        </div>
        <div>
          <p class="tw:text-xs tw:uppercase tw:font-bold tw:text-secondary tw:mb-1">Supplier</p>
          <SupplierSelectMenu v-model="form.supplierId" />
        </div>
      </div>

      <div>
        <p class="tw:text-xs tw:uppercase tw:font-bold tw:text-secondary tw:mb-1">Process Area</p>
        <BaseTextInput
          v-model="form.processArea"
          placeholder="e.g. Receiving Inspection / Calibration / 7.5 Production"
        />
      </div>

      <div class="tw:grid tw:grid-cols-2 tw:gap-3">
        <div>
          <p class="tw:text-xs tw:uppercase tw:font-bold tw:text-secondary tw:mb-1">Assignee</p>
          <UserSelectMenu v-model="form.assignedToUserId" />
        </div>
        <div>
          <p class="tw:text-xs tw:uppercase tw:font-bold tw:text-secondary tw:mb-1">Due Date</p>
          <BaseTextInput v-model="form.dueDate" type="date" />
        </div>
      </div>

      <div class="tw:grid tw:grid-cols-2 tw:gap-3">
        <div>
          <p class="tw:text-xs tw:uppercase tw:font-bold tw:text-secondary tw:mb-1">
            Severity (1–10)
          </p>
          <BaseTextInput v-model="form.severityScore" type="number" />
        </div>
        <div>
          <p class="tw:text-xs tw:uppercase tw:font-bold tw:text-secondary tw:mb-1">Risk (1–25)</p>
          <BaseTextInput v-model="form.riskScore" type="number" />
        </div>
      </div>
    </div>
    <template #footer>
      <BaseButton variant="outline" :disabled="saving" @click="close">Cancel</BaseButton>
      <BaseButton
        variant="primary"
        :loading="saving"
        :disabled="saving || !canSave"
        @click="handleSave"
      >
        {{ isEdit ? 'Save Changes' : 'Create Finding' }}
      </BaseButton>
    </template>
  </BaseDialog>
</template>
