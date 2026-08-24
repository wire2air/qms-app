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
import { canUseAi } from '@/utils/currentSession'
import { required } from '@shared/components/form/validators.js'

const props = defineProps({
  defaultTypeId: { type: String, default: 'MINOR_NC' },
  auditInstance: { type: Object, required: true },
  // When passed: the response the user is escalating into a finding.
  // Drives the auditRequirementResponseId binding + the prefilled
  // processArea (clause title).
  requirementResponse: { type: Object, default: null },
  // When passed: edit-existing mode.
  finding: { type: Object, default: null },
})
const emit = defineEmits(['created'])

const open = defineModel({ type: Boolean, default: false })

const toast = useToast()

const FINDING_TYPES = [
  { id: 'MAJOR_NC', name: 'Major NC' },
  { id: 'MINOR_NC', name: 'Minor NC' },
  { id: 'OBSERVATION', name: 'Observation' },
  { id: 'OFI', name: 'OFI' },
]

function defaultForm() {
  return {
    findingTypeId: props.defaultTypeId,
    detailsHtml: '',
    categoryId: null,
    departmentId: props.auditInstance?.departmentId ?? null,
    severityScore: 1,
    riskScore: 1,
  }
}

// The finding body is rich HTML (detailsHtml); description stays a derived
// plain-text summary for lists / search / CAPA spawn.
function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}
function textToHtml(t) {
  const s = String(t ?? '')
  if (!s.trim()) return ''
  return s
    .split(/\n{2,}/)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('')
}
function htmlToText(html) {
  if (!html) return ''
  return String(html)
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, ' ')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

const isEdit = computed(() => !!props.finding)
const form = ref(defaultForm())
const formRef = ref(null)
const isSubmitting = ref(false)
const saveError = ref(null)

watch(open, (isOpen) => {
  if (!isOpen) {
    saveError.value = null
    return
  }
  if (props.finding) {
    // Pre-fill from the existing finding row.
    form.value = {
      findingTypeId: props.finding.findingTypeId,
      // Prefer the rich body; fall back to the plain description (older
      // findings) wrapped as HTML so it's editable in the rich editor.
      detailsHtml: props.finding.detailsHtml || textToHtml(props.finding.description ?? ''),
      categoryId: props.finding.categoryId ?? null,
      departmentId: props.finding.departmentId ?? null,
      severityScore: props.finding.severityScore ?? 1,
      riskScore: props.finding.riskScore ?? 1,
    }
  } else {
    form.value = defaultForm()
  }
})

function close() {
  open.value = false
}

const descriptionText = computed(() => htmlToText(form.value.detailsHtml))

async function onSubmit() {
  if (isSubmitting.value) return
  isSubmitting.value = true
  saveError.value = null
  try {
    const payload = {
      findingTypeId: form.value.findingTypeId,
      description: descriptionText.value.trim(),
      detailsHtml: form.value.detailsHtml || null,
      categoryId: form.value.categoryId || null,
      departmentId: form.value.departmentId || null,
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
    saveError.value = e?.message || 'Failed to save finding'
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <BaseDialog v-model="open" :title="isEdit ? 'Edit Finding' : 'New Finding'" maxWidth="3xl">
    <BaseForm ref="formRef" hideFooter @submit="onSubmit">
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
          {{ requirementResponse.requirementSnapshot.title
          }}{{
            requirementResponse.requirementSnapshot.question
              ? `: ${requirementResponse.requirementSnapshot.question}`
              : ''
          }}
        </div>

        <div class="tw:grid tw:grid-cols-1 tw:sm:grid-cols-2 tw:gap-3">
          <BaseField label="Type" required :value="form.findingTypeId" :rules="[required()]">
            <template #default="field">
              <BaseInlineSelect
                v-bind="field"
                v-model="form.findingTypeId"
                :items="FINDING_TYPES"
                :required="true"
              />
            </template>
          </BaseField>
          <BaseField label="Category">
            <AuditFindingCategorySelectMenu v-model="form.categoryId" />
          </BaseField>
        </div>

        <BaseField label="Description" required :value="descriptionText" :rules="[required()]">
          <template #default="field">
            <BaseRichTextEditor
              v-bind="field"
              :modelValue="form.detailsHtml"
              placeholder="What was observed? Include the requirement reference + evidence summary."
              class="tw:[&_.ProseMirror]:min-h-32 tw:[&_.ProseMirror]:max-h-80 tw:[&_.ProseMirror]:overflow-y-auto"
              @update:modelValue="(v) => (form.detailsHtml = v)"
            >
              <template #toolbar-extra="{ editor, append }">
                <AiTextAssistButton v-if="canUseAi && editor" :editor="editor" />
                <AiVoiceToTextButton v-if="canUseAi" :append="append" />
              </template>
            </BaseRichTextEditor>
          </template>
        </BaseField>

        <BaseField label="Department">
          <DepartmentSelectMenu v-model="form.departmentId" />
        </BaseField>

        <div class="tw:grid tw:grid-cols-1 tw:sm:grid-cols-2 tw:gap-3">
          <BaseField v-slot="{ id: fieldId }" label="Severity (1–10)">
            <BaseTextInput :id="fieldId" v-model="form.severityScore" type="number" />
          </BaseField>
          <BaseField v-slot="{ id: fieldId }" label="Risk (1–25)">
            <BaseTextInput :id="fieldId" v-model="form.riskScore" type="number" />
          </BaseField>
        </div>
      </div>
    </BaseForm>

    <template #footer>
      <BaseDialogFooter
        :submitLabel="isEdit ? 'Save Changes' : 'Create Finding'"
        :loading="isSubmitting"
        :error="saveError"
        @cancel="close"
        @submit="formRef?.submit()"
      />
    </template>
  </BaseDialog>
</template>
