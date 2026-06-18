<script setup>
/**
 * Generic per-user form responses for a workflow step. Replaces
 * CapaWorkflowStepForm + ChangeRequestWorkflowStepForm (and is built
 * to slot in for NC's currently-inline form when phase 3 lands).
 *
 * Module-specific bits — record model name, resource FK column,
 * resource lookup, context-field injection — come from the `module`
 * descriptor (see workflowModule.js). The remainder is identical
 * across modules: APPROVAL steps suppress the form entirely; assignees
 * see DynamicForm in edit mode with Save draft / Submit buttons;
 * everyone else sees FormSchemaReadonlyView grouped per-submitter.
 *
 * Two contracts the parent step card relies on:
 *   - `defineExpose({ submit, saving })` — lets the step card drive
 *     save + submit + approve in one shot when it renders its own
 *     Complete & Advance button (paired with `hideSubmit`).
 *   - `autoApprove` — when true, a successful submit also POSTs the
 *     COMPLETE_AND_ADVANCE outcome to /taskInstances/:id/action and
 *     emits `done` so the parent can close (used in child-step dialogs).
 */
import { IconDeviceFloppy, IconSend } from '@tabler/icons-vue'
import DynamicForm from '@/components/form/DynamicForm.js'
import FormSchemaReadonlyView from '@/components/form/FormSchemaReadonlyView.vue'
import { currentSession } from '@/utils/currentSession.js'
import { db } from '@models/index'
import { freezeOptionLabels } from '@/utils/freezeFormPayloadLabels.js'
import { DateTime } from 'luxon'
import { post } from '@/api'

const props = defineProps({
  module: { type: Object, required: true },
  instanceStepId: { type: String, required: true },
  resourceId: { type: String, required: true },
  // When true (child-step dialog usage), submit also fires the approve
  // action and emits `done`. The main step-card usage leaves this false
  // and lets WorkflowStepActionsMenu drive the approve action instead.
  autoApprove: { type: Boolean, default: false },
  // When true, the form hides its own Submit button. The parent renders
  // an external Complete & Advance button and calls submit() via the
  // exposed ref. Save draft stays so the assignee can still persist
  // mid-work without completing.
  hideSubmit: { type: Boolean, default: false },
})

const emit = defineEmits(['done'])

const toast = useToast()
const currentUserId = computed(() => currentSession.value?.userId ?? currentSession.value?.id)

const resource = useLiveQueryWithDeps([() => props.resourceId], async (db, [id]) =>
  id ? db[props.module.resourceModel.modelName].findByPk(id) : null,
)

const instanceStep = useLiveQueryWithDeps(
  [() => props.instanceStepId],
  async (db, [id]) => (id ? db.WorkflowInstanceStep.findByPk(id) : null),
  { models: ['WorkflowInstanceStep'] },
)

// APPROVAL steps render no form — pure approve/reject. Suppress here
// so any leftover schema from the old TASK-template auto-seed doesn't
// surface at runtime.
const isApprovalStep = computed(() => instanceStep.value?.stepType === 'APPROVAL')
const formSchema = computed(() =>
  isApprovalStep.value ? [] : instanceStep.value?.formSchema || [],
)
const hasForm = computed(() => formSchema.value.length > 0)

const records = useLiveQueryWithDeps(
  [() => props.instanceStepId, () => props.resourceId],
  async (db, [stepInstanceId, resourceId]) => {
    if (!stepInstanceId || !resourceId) return []
    const all = await db[props.module.recordModelName]
      .where('workflowInstanceStepId', stepInstanceId)
      .exec()
    return all.filter((r) => r[props.module.recordResourceFk] === resourceId)
  },
  { initial: [] },
)

const currentUserRecord = computed(
  () => records.value.find((r) => r.userId === currentUserId.value) || null,
)

const submittedRecords = computed(() => records.value.filter((r) => r.submittedAt))

// Pick the user's CURRENTLY-ACTIONABLE APPROVAL task on this step. A
// step can host multiple TaskInstances for the same user across its
// lifecycle: an old APPROVED row from a prior completion (reopen
// leaves it as-is and mints a fresh ASSIGNED one), plus our SENT_BACK
// marker tasks (kind=REVIEW). Without these filters the form's
// isEditable / persistRecord could lock onto a stale APPROVED row
// after a reopen and render read-only even though there's a live
// ASSIGNED task ready to edit.
const ACTIONABLE_TASK_STATUSES = ['ASSIGNED', 'FORM_SUBMITTED']
const currentUserTask = useLiveQueryWithDeps(
  [() => props.instanceStepId, () => currentUserId.value],

  async (db, [stepInstanceId, userId]) => {
    if (!stepInstanceId || !userId) return null
    const tasks = await db.TaskInstance.where('[sourceType+sourceId]', [
      'WorkflowInstanceStep',
      stepInstanceId,
    ]).exec()
    const userApprovalTasks = tasks.filter(
      (t) => t.assignedTo === userId && t.taskKindId === 'APPROVAL',
    )
    const actionable = userApprovalTasks.find((t) => ACTIONABLE_TASK_STATUSES.includes(t.statusId))
    return actionable ?? userApprovalTasks[0] ?? null
  },
  { models: ['TaskInstance'] },
)

const isEditable = computed(() => currentUserTask.value?.statusId === 'ASSIGNED')

const formData = ref({})
const saving = ref(false)
let formSeeded = false

// Auto-finalize registry. Field widgets that have a "Finalize" step
// (RcaField, RiskAssessmentField) inject this set on mount and register
// a callback that finalizes themselves if their current state is
// finalizable. Save Draft + Mark Complete iterate the registry before
// persisting so the user doesn't have to remember to click Finalize on
// every analysis field — easy-to-miss, was burning testers (silent
// downstream rca/ra derivation skip on submit).
const formFinalizers = new Set()
provide('formFinalizers', formFinalizers)

async function runFinalizers() {
  for (const fn of formFinalizers) {
    try {
      fn()
    } catch (err) {
      console.error('[WorkflowStepForm] finalize hook failed', err)
    }
  }
  // The finalize callbacks emit `update:modelValue` synchronously;
  // wait for Vue to flush the v-model setters into `formData` before
  // we read it inside persistRecord, otherwise the saved payload
  // would still hold the pre-finalize value.
  await nextTick()
}

// Seed form data once: prefer the user's existing record payload (so
// a draft can be edited), and overlay module-specific context fields
// (e.g. _parent_problem from the resource description). The watch fires
// again whenever `resource` changes so the context fields refresh, but
// we only seed the user payload once to avoid clobbering mid-edit input.
watch(
  [currentUserRecord, resource],
  ([record, resourceRow]) => {
    if (record && !formSeeded) {
      formData.value = {
        ...(record.payload || {}),
        ...props.module.getStepFormContextFields(resourceRow),
      }
      formSeeded = true
    }
  },
  { immediate: true },
)

watch(resource, (resourceRow) => {
  if (formSeeded) {
    Object.assign(formData.value, props.module.getStepFormContextFields(resourceRow))
  }
})

async function persistRecord({ submit, esign }) {
  if (saving.value) return
  if (!currentUserTask.value) {
    toast.error('No task assigned to you for this step')
    return
  }
  if (!instanceStep.value) return
  saving.value = true
  try {
    // Strip every key the module marks as context-only (prefixed with
    // _ by convention, e.g. _parent_problem). Anything not in the
    // context map is part of the persisted payload.
    const contextKeys = new Set(
      Object.keys(props.module.getStepFormContextFields(resource.value) ?? {}),
    )
    const rawPayload = Object.fromEntries(
      Object.entries(formData.value || {}).filter(([k]) => !contextKeys.has(k)),
    )
    // Freeze OptionSet labels onto the payload so saved records stay
    // readable as the admin originally meant them even if the source
    // OptionSet is later edited. See utils/freezeFormPayloadLabels.js.
    const payload = await freezeOptionLabels(db, formSchema.value, rawPayload)
    const existing = currentUserRecord.value
    const submittedAt = submit ? DateTime.now() : (existing?.submittedAt ?? null)
    if (existing) {
      existing.payload = payload
      if (submit) existing.submittedAt = submittedAt
      await existing.save()
    } else {
      const record = db[props.module.recordModelName].create({
        [props.module.recordResourceFk]: props.resourceId,
        workflowInstanceStepId: props.instanceStepId,
        taskInstanceId: currentUserTask.value.id,
        payload,
        submittedAt,
      })
      await record.save()
    }

    // When the parent renders an external Complete & Advance button it
    // sets autoApprove=true. Submitting the form then also approves the
    // reviewer's task in one round trip. Esign credentials, when needed,
    // are passed through from the parent's esign dialog.
    if (submit && props.autoApprove && currentUserTask.value.statusId === 'ASSIGNED') {
      try {
        const body = {
          action: 'COMPLETE_AND_ADVANCE',
          outcomeId: 'COMPLETE_AND_ADVANCE',
        }
        if (esign?.method) body.method = esign.method
        if (esign?.token) body.token = esign.token
        if (esign?.provider) body.provider = esign.provider
        await post(`/v1/services/taskInstances/${currentUserTask.value.id}/action`, body)
        toast.success(isApprovalStep.value ? 'Step approved' : 'Step completed')
        emit('done')
        return
      } catch (actionErr) {
        toast.error(
          actionErr.message ||
            (isApprovalStep.value
              ? 'Form saved but approval failed'
              : 'Form saved but completion failed'),
        )
        return
      }
    }

    toast.success(submit ? 'Form submitted' : 'Draft saved')
    if (submit && props.autoApprove) emit('done')
  } catch (e) {
    toast.error(e.message || 'Failed to save form')
  } finally {
    saving.value = false
  }
}

async function saveDraft() {
  // Auto-finalize any analysis widgets (RCA / Risk Assessment) that
  // are ready but not yet finalized — bundles "Save Draft" with the
  // Finalize click the user otherwise has to remember to do on each
  // analysis field. Drafts stay lenient on REQUIRED-field gates;
  // finalize-on-save is a convenience, not a hard validation.
  await runFinalizers()
  return persistRecord({ submit: false })
}

/**
 * "Filled" = has a meaningful value. Recurses into objects/arrays so
 * an unfilled RCA / Risk Assessment widget (which emits `{}` even
 * when nothing is selected) registers as empty — the surface symptom
 * of the silent-Mark-Complete bug we hit in testing.
 */
function isFieldFilled(value) {
  if (value === null || value === undefined) return false
  if (typeof value === 'string') return value.trim().length > 0
  if (Array.isArray(value)) return value.some(isFieldFilled)
  if (typeof value === 'object') return Object.values(value).some(isFieldFilled)
  return true // number, boolean — presence is enough
}

function getMissingRequiredFields() {
  const missing = []
  for (const field of formSchema.value || []) {
    if (!field?.required || !field?.name) continue
    if (!isFieldFilled(formData.value?.[field.name])) {
      missing.push(field.label || field.name)
    }
  }
  return missing
}

async function submitForm(esign) {
  // Same finalize-on-save bundling as saveDraft — Mark Complete also
  // benefits from this since a user is likely to hit it once they
  // think they're done, and a still-unfinalized RCA would otherwise
  // sail past the required-field check (the payload is truthy) and
  // then skip downstream BE rca/ra derivation on the approve.
  await runFinalizers()

  // Gate the submit on required-field completeness BEFORE persisting,
  // so the assignee gets a visible reason when Mark Complete refuses
  // to advance the step (the silent failure that bit testing today).
  // DynamicForm has vuelidate wired up internally for primitives, but
  // the workflow form widget bypasses its emit('submit') path and
  // builds the payload directly from v-model — so we re-do the gate
  // here, matching the schema's `required: true` flags. Deep check on
  // value covers complex widgets (rca / riskAssessment) where an empty
  // `{}` slips past a naive truthy test.
  const missing = getMissingRequiredFields()
  if (missing.length > 0) {
    toast.warning(
      `Please fill in the required field${missing.length === 1 ? '' : 's'}: ${missing.join(', ')}`,
    )
    return
  }
  return persistRecord({ submit: true, esign })
}

const usersMap = useLiveQueryWithDeps(
  [() => submittedRecords.value.map((r) => r.userId).join(',')],
  async (db, [idsStr]) => {
    if (!idsStr) return {}
    const ids = [...new Set(idsStr.split(','))]
    const users = await Promise.all(ids.map((id) => db.User.findByPk(id)))
    return Object.fromEntries(users.filter(Boolean).map((u) => [u.id, u]))
  },

  { models: ['User'], initial: {} },
)

function getUserName(userId) {
  const u = usersMap.value[userId]
  if (!u) return '—'
  return [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email
}

// Exposed so parents that render their own Complete & Advance button
// can trigger save + submit + approve in one shot — paired with
// `hideSubmit` to suppress the in-form Submit button.
defineExpose({ submit: submitForm, saving })
</script>

<template>
  <template v-if="hasForm">
    <template v-if="isEditable">
      <DynamicForm v-model="formData" :fields="formSchema" />
      <div class="tw:mt-4 tw:flex tw:justify-end tw:gap-2">
        <BaseButton variant="outline" :disabled="saving" @click="saveDraft">
          <template #icon><IconDeviceFloppy :size="16" /></template>
          {{ saving ? 'Saving…' : 'Save draft' }}
        </BaseButton>
        <BaseButton v-if="!hideSubmit" variant="primary" :disabled="saving" @click="submitForm">
          <template #icon><IconSend :size="16" /></template>
          Submit
        </BaseButton>
      </div>
    </template>

    <template v-else>
      <div v-for="record in submittedRecords" :key="record.id" class="tw:mb-3">
        <div
          v-if="submittedRecords.length > 1"
          class="tw:text-caption tw:text-secondary tw:font-medium tw:mb-2"
        >
          {{ getUserName(record.userId) }}
        </div>
        <FormSchemaReadonlyView :fields="formSchema" :values="record.payload || {}" />
      </div>

      <div v-if="currentUserRecord && !currentUserRecord.submittedAt">
        <div class="tw:text-caption tw:text-amber-600 tw:font-medium tw:mb-2">
          Your draft (not submitted)
        </div>
        <FormSchemaReadonlyView :fields="formSchema" :values="currentUserRecord.payload || {}" />
      </div>

      <DynamicForm
        v-if="!submittedRecords.length && !currentUserRecord"
        :fields="formSchema"
        :readonly="true"
        disabled
        :values="{}"
      />
    </template>
  </template>
</template>
