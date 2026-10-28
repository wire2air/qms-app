<script setup>
/**
 * Generic reviewer-side outcome menu for any module's workflow step
 * (NC / CAPA / CR). Replaces CapaStepActionsMenu +
 * ChangeRequestStepActionsMenu + TaskInstanceNcActions. Behaviour
 * differences across modules are captured by the `module` descriptor
 * prop (see src/components/workflow/workflowModule.js).
 *
 * Rendered outcomes are filtered to the step's AllowedOutcomeOnStep
 * rows, minus REASSIGN / CANCEL / REQUEST_INFO (those live as the
 * owner's inline buttons on the step header) and minus anything in
 * `hideOutcomes` (parent decides what's already rendered elsewhere).
 *
 * COMPLETE_AND_ADVANCE and SEND_BACK auto-relabel as "Approve" /
 * "Reject" when stepType === 'APPROVAL'.
 */
import { IconArrowBackUp } from '@tabler/icons-vue'
import { pickActionableTask, mayActOnStepType } from '@/components/workflow/stepTakeover.js'
import { post } from '@/api'
import { currentSession } from '@/utils/currentSession.js'
import { required } from '@shared/components/form/validators.js'

const props = defineProps({
  module: { type: Object, required: true },
  instanceStepId: { type: String, required: true },
  resourceId: { type: String, required: true },
  isOwner: { type: Boolean, default: false },
  requireEsignature: { type: Boolean, default: false },
  hideOutcomes: { type: Array, default: () => [] },
})

const emit = defineEmits(['done'])
const toast = useToast()
const currentUserId = computed(() => currentSession.value?.userId ?? currentSession.value?.id)

const instanceStep = useLiveQueryWithDeps(
  [() => props.instanceStepId],
  async (db, [id]) => (id ? db.WorkflowInstanceStep.findByPk(id) : null),
  { models: ['WorkflowInstanceStep'] },
)

const isApprovalStep = computed(() => instanceStep.value?.stepType === 'APPROVAL')

// The record behind this workflow, needed to ask whether a non-assignee may
// act. The step card already loads it; this menu is also used standalone.
const resource = useLiveQueryWithDeps([() => props.resourceId], async (db, [id]) =>
  id ? db[props.module.resourceModel.modelName].findByPk(id) : null,
)
const mayTakeOverStep = computed(() =>
  mayActOnStepType({
    module: props.module,
    record: resource.value,
    stepType: instanceStep.value?.stepType,
  }),
)

const ACTIONABLE_STATUSES = ['ASSIGNED', 'FORM_SUBMITTED']

const currentUserTask = useLiveQueryWithDeps(
  [() => props.instanceStepId, () => currentUserId.value],

  async (db, [stepInstanceId, userId]) => {
    if (!stepInstanceId || !userId) return null
    const tasks = await db.TaskInstance.where('[sourceType+sourceId]', [
      'WorkflowInstanceStep',
      stepInstanceId,
    ]).exec()
    // Whoever may act on the step, not only its assignee — see stepTakeover.js.
    return (
      pickActionableTask({
        tasks,
        userId,
        mayAct: mayTakeOverStep.value,
    matrixApplies: !!props.module.authzModule,
        kind: null, // this menu drives every outcome, not just APPROVAL tasks
        statuses: ACTIONABLE_STATUSES,
      }).task || null
    )
  },
  { models: ['TaskInstance'] },
)

const allowedOutcomes = useLiveQueryWithDeps(
  [() => instanceStep.value?.stepId],
  async (db, [stepId]) => {
    if (!stepId) return []
    return db.AllowedOutcomeOnStep.where('stepId', stepId).exec()
  },

  { models: ['AllowedOutcomeOnStep'], initial: [] },
)

const canActOnStep = computed(() => ACTIONABLE_STATUSES.includes(currentUserTask.value?.statusId))

const OUTCOME_CONFIG = computed(() => ({
  COMPLETE_AND_ADVANCE: {
    label: isApprovalStep.value ? 'Approve' : 'Mark Complete',
    icon: IconArrowBackUp,
  },
  SEND_BACK: {
    label: isApprovalStep.value ? 'Reject' : 'Send Back',
    icon: IconArrowBackUp,
    needsComment: true,
    commentRequired: true,
  },
  REQUEST_INFO: { label: 'Request Info' },
  REASSIGN: { label: 'Reassign' },
  CANCEL: { label: 'Cancel' },
}))

// Owner's inline header buttons own these; hide here so they don't
// duplicate in the dropdown.
const ALWAYS_HIDDEN_OUTCOMES = new Set(['REASSIGN', 'CANCEL', 'REQUEST_INFO'])

const showConfirmDialog = ref(false)
const showEsignDialog = ref(false)
const pendingOutcomeId = ref(null)
const comment = ref('')

// ── Rejecting an APPROVAL step: two outcomes in one dialog (2026-10-25) ──────
//   'reject'  the whole record: the workflow ends REJECTED, the owner gets a
//             task with the reason and decides which steps to reopen (or, for a
//             workflow with one working step, it reopens by itself).
//   'rework'  send back: the approver picks the completed steps to redo, with a
//             comment on each; the workflow stays in progress and this approval
//             comes round again once the work is done.
const rejectMode = ref('reject')
/** The completed root steps of this workflow the approver may send back (not the approval gates). */
const reworkCandidates = useLiveQueryWithDeps(
  [() => instanceStep.value?.workflowInstanceId, () => props.instanceStepId],
  async (db, [workflowInstanceId, selfId]) => {
    if (!workflowInstanceId) return []
    const rows = await db.WorkflowInstanceStep.where('workflowInstanceId', workflowInstanceId).exec()
    return rows
      .filter(
        (r) =>
          r.id !== selfId &&
          !r.parentInstanceStepId &&
          r.stepType !== 'APPROVAL' &&
          ['APPROVED', 'COMPLETED'].includes(r.statusId),
      )
      .sort((a, b) => a.stepOrder - b.stepOrder || a.stepNumber - b.stepNumber)
  },
  { models: ['WorkflowInstanceStep'], initial: [] },
)
/** instanceStepId → { picked, comment } */
const reworkPicks = ref({})
const reworkSelection = computed(() =>
  reworkCandidates.value
    .filter((r) => reworkPicks.value[r.id]?.picked)
    .map((r) => ({ instanceStepId: r.id, comment: (reworkPicks.value[r.id]?.comment ?? '').trim() })),
)
function togglePick(id, on) {
  reworkPicks.value = { ...reworkPicks.value, [id]: { ...(reworkPicks.value[id] ?? { comment: '' }), picked: on } }
}
function setPickComment(id, text) {
  reworkPicks.value = { ...reworkPicks.value, [id]: { ...(reworkPicks.value[id] ?? { picked: true }), comment: text } }
}
const isRework = computed(() => isRejectAction.value && isApprovalStep.value && rejectMode.value === 'rework')
/** Rework needs at least one step, and a comment on each picked step (or one for all). */
const reworkProblem = computed(() => {
  if (!isRework.value) return ''
  if (!reworkSelection.value.length) return 'Pick at least one step to send back.'
  if (!comment.value.trim() && reworkSelection.value.some((r) => !r.comment)) return 'Say what to rework on each step, or in the comment below.'
  return ''
})
const actionLoading = ref(false)
const confirmFormRef = ref(null)

const pendingConfig = computed(() =>
  pendingOutcomeId.value ? (OUTCOME_CONFIG.value[pendingOutcomeId.value] ?? null) : null,
)
const isRejectAction = computed(() => pendingOutcomeId.value === 'SEND_BACK')
const confirmTitle = computed(() => pendingConfig.value?.label ?? 'Confirm')

// E-signature is gated by the step config (requireEsignature prop) and applies
// to the outcomes that actually resolve an approval gate.
//
// SEND_BACK is the subtle one: it is the SAME outcome id on both step types but
// two different endpoints (see submitAction below). On an APPROVAL step it is
// labelled "Reject" and routes to `rejectStepTask` — which the backend now
// requires a signature for (F-16), because that path reaches the same core as
// API-15's signed REJECTED action. On a non-approval step it routes to
// `sendBackStepTask`, which is deliberately left unsigned: it resolves no
// approval gate and cannot act on an APPROVAL step at all.
//
// So the gate is conditional on the step type, not on the outcome id alone.
// Without this, rejecting an e-sign-required approval returns 400
// ESIGNATURE_REQUIRED with no prompt shown.
const ESIGN_GATED_OUTCOMES = new Set(['COMPLETE_AND_ADVANCE'])
function needsEsignFor(outcomeId) {
  if (!props.requireEsignature) return false
  if (ESIGN_GATED_OUTCOMES.has(outcomeId)) return true
  return outcomeId === 'SEND_BACK' && isApprovalStep.value
}

function onOutcomeClick(outcomeId) {
  if (!canActOnStep.value) return
  pendingOutcomeId.value = outcomeId
  comment.value = ''
  rejectMode.value = 'reject'
  reworkPicks.value = {}
  if (OUTCOME_CONFIG.value[outcomeId]?.needsComment) {
    showConfirmDialog.value = true
  } else if (needsEsignFor(outcomeId)) {
    showEsignDialog.value = true
  } else {
    submitAction()
  }
}

function onConfirmDialog() {
  if (reworkProblem.value) return toast.error(reworkProblem.value)
  showConfirmDialog.value = false
  if (needsEsignFor(pendingOutcomeId.value)) {
    showEsignDialog.value = true
  } else {
    submitAction()
  }
}

function onEsignVerified({ method, provider, token }) {
  showEsignDialog.value = false
  submitAction({ method, provider, token })
}

async function submitAction(esign = null) {
  if (!currentUserTask.value) return
  actionLoading.value = true
  try {
    if (pendingOutcomeId.value === 'SEND_BACK') {
      // Two different backend semantics here, picked by step type:
      //
      //   APPROVAL step + "Reject" → /rejectStepTask
      //     Terminates the workflow_instance, fires handler.onRejection,
      //     resource flips to its rejected state (Audit → REJECTED,
      //     NC/CAPA/CR → DRAFT). Owner edits + resubmits for a fresh
      //     approval cycle (21 CFR 11 — each cycle owns its e-signature
      //     thread).
      //
      //   Non-APPROVAL step + "Send Back" → /sendBackStepTask
      //     Lightweight: reviewer's ASSIGNED task is UNTOUCHED, a marker
      //     SENT_BACK task is minted on the step carrying the comment
      //     so it surfaces in the step activity panel, and the owner
      //     gets a WORKFLOW_ACTION_REQUIRED notification. No workflow
      //     termination, no resource status change. Reviewer can still
      //     complete their original task once the owner responds.
      const endpoint = isApprovalStep.value ? 'rejectStepTask' : 'sendBackStepTask'
      const sendBackBody = {
        workflowInstanceStepId: props.instanceStepId,
        comment: comment.value,
        // "Send back for rework": the steps to reopen, each with its comment. Empty: reject the record.
        ...(isRework.value ? { reopen: reworkSelection.value } : {}),
      }
      // F-16: /rejectStepTask now enforces the e-signature on an e-sign-required
      // APPROVAL step and returns 400 ESIGNATURE_REQUIRED without credentials.
      // needsEsignFor() has already collected them via the PIN dialog for exactly
      // this branch — they must be forwarded here, not only on the API-15 path
      // below. /sendBackStepTask is deliberately NOT signed, so the credentials
      // are attached only when they were actually demanded.
      if (esign?.method) sendBackBody.method = esign.method
      if (esign?.token) sendBackBody.token = esign.token
      if (esign?.provider) sendBackBody.provider = esign.provider
      await post(
        `/v1/services/${props.module.apiPath}/${props.resourceId}/${endpoint}`,
        sendBackBody,
      )
      toast.success(
        isRework.value
          ? 'Sent back for rework — the approval will come round again once the work is done'
          : isApprovalStep.value
            ? 'Approval rejected — the owner has been notified'
            : 'Sent back — the owner has been notified',
      )
      emit('done')
      return
    }
    // Other outcomes (COMPLETE_AND_ADVANCE, etc.) go through the generic
    // task-action endpoint — module-agnostic, lives on taskInstances.
    // Esign creds (when needed) flow through to /taskInstances/:id/action
    // so the backend verifies the signature before transitioning state.
    const body = {
      action: pendingOutcomeId.value,
      outcomeId: pendingOutcomeId.value,
    }
    if (comment.value) body.comment = comment.value
    if (esign?.method) body.method = esign.method
    if (esign?.token) body.token = esign.token
    if (esign?.provider) body.provider = esign.provider
    await post(`/v1/services/taskInstances/${currentUserTask.value.id}/action`, body)
    toast.success(`${pendingConfig.value?.label ?? 'Action'} completed`)
    emit('done')
  } catch {
    // Dialog stays open so the user doesn't lose input.
  } finally {
    actionLoading.value = false
  }
}

const items = computed(() => {
  const list = []
  if (!canActOnStep.value) return list
  for (const o of allowedOutcomes.value) {
    if (props.hideOutcomes.includes(o.outcomeId)) continue
    if (ALWAYS_HIDDEN_OUTCOMES.has(o.outcomeId)) continue
    const cfg = OUTCOME_CONFIG.value[o.outcomeId]
    if (!cfg) continue
    list.push({
      name: cfg.label,
      icon: cfg.icon,
      click: () => onOutcomeClick(o.outcomeId),
    })
  }
  return list
})

/** A button outside this menu (WorkflowStep's inline Reject) starts an outcome through the same dialogs. */
defineExpose({ start: onOutcomeClick })
</script>

<template>
  <!-- The dialogs stay mounted whatever the dropdown offers: a button outside
       (WorkflowStep's inline Reject, `start()`) opens them while every item is hidden. -->
  <div class="tw:contents">
    <!--
      `flip` — this menu is the reported off-screen case. Step cards sit low on
      a long workflow page, and without it the panel opens below the fold and
      every item is unclickable. See the prop's own comment in
      resource/js/shared/components/BaseMenu.vue.

      This component is SHARED: every module's root steps (WorkflowStep.vue /
      WorkflowStepGroup.vue), the generic sub-task card (WorkflowChildStep.vue)
      and CAPA's richer one (CapaWorkflowChildStep.vue) all render it, so this
      fixes the same defect everywhere at once.
    -->
    <BaseMenu v-if="items.length" :items="items" flip />

    <BaseDialog v-model="showConfirmDialog" :title="confirmTitle" maxWidth="md" persistent>
      <BaseForm ref="confirmFormRef" hideFooter @submit="onConfirmDialog">
        <template v-if="isRejectAction && isApprovalStep">
          <div class="tw:flex tw:flex-col tw:gap-2 tw:mb-4" role="radiogroup" aria-label="What happens to the record">
            <BaseRadio v-model="rejectMode" value="reject" name="reject-mode">
              <span class="tw:font-medium">Reject the record</span>
              <span class="tw:block tw:text-xs tw:text-secondary">
                The workflow ends as rejected. The owner is told why and decides which steps to reopen.
              </span>
            </BaseRadio>
            <BaseRadio v-model="rejectMode" value="rework" name="reject-mode" :disabled="!reworkCandidates.length">
              <span class="tw:font-medium">Send back for rework</span>
              <span class="tw:block tw:text-xs tw:text-secondary">
                Pick the steps to redo. The workflow stays open and this approval comes round again once they are done.
              </span>
            </BaseRadio>
          </div>
          <div v-if="isRework" class="tw:flex tw:flex-col tw:gap-3 tw:mb-4" data-rework-picker>
            <div
              v-for="r in reworkCandidates"
              :key="r.id"
              class="tw:rounded-lg tw:border tw:border-divider tw:p-3"
              :class="reworkPicks[r.id]?.picked ? 'tw:bg-main' : ''"
            >
              <div class="tw:flex tw:items-center tw:gap-2">
                <BaseCheckbox
                  :modelValue="!!reworkPicks[r.id]?.picked"
                  :aria-label="`Send back ${r.name}`"
                  @update:modelValue="(on) => togglePick(r.id, on)"
                />
                <span class="tw:text-sm tw:font-medium">{{ r.name }}</span>
                <WorkflowInstanceStepStatusBadgeById :statusId="r.statusId" :stepType="r.stepType" size="sm" class="tw:ml-auto" />
              </div>
              <textarea
                v-if="reworkPicks[r.id]?.picked"
                :value="reworkPicks[r.id]?.comment ?? ''"
                rows="2"
                class="tw:mt-2 tw:w-full tw:rounded-lg tw:border tw:border-divider tw:bg-card tw:text-on-main tw:text-sm tw:p-2 tw:resize-none tw:focus:outline-none tw:focus:ring-2 tw:focus:ring-primary/50"
                :placeholder="`What to rework in ${r.name}`"
                :aria-label="`What to rework in ${r.name}`"
                @input="setPickComment(r.id, $event.target.value)"
              />
            </div>
            <p v-if="reworkProblem" class="tw:text-xs tw:text-amber-700">{{ reworkProblem }}</p>
          </div>
        </template>
        <BaseField
          :required="!!pendingConfig?.commentRequired && !isRework"
          :value="comment"
          :rules="pendingConfig?.commentRequired && !isRework ? [required()] : []"
        >
          <template #label>
            {{
              isRework
                ? 'Comment for every step (optional)'
                : isRejectAction
                  ? isApprovalStep
                    ? 'Reason for rejection'
                    : 'Reason for sending back'
                  : 'Comment'
            }}
          </template>
          <template #default="{ id: fieldId }">
            <textarea
              :id="fieldId"
              v-model="comment"
              rows="3"
              class="tw:w-full tw:rounded-lg tw:border tw:border-divider tw:bg-main tw:text-on-main tw:text-sm tw:p-3 tw:resize-none tw:focus:outline-none tw:focus:ring-2 tw:focus:ring-primary/50"
              :placeholder="
                isRework
                  ? 'Anything that applies to all the steps you picked'
                  : isRejectAction
                    ? isApprovalStep
                      ? 'Why are you rejecting?'
                      : 'Why are you sending this back to the owner?'
                    : 'Add a comment…'
              "
            />
          </template>
        </BaseField>
      </BaseForm>
      <template #footer="{ close }">
        <BaseDialogFooter
          :submitLabel="isRework ? 'Send back for rework' : isRejectAction && isApprovalStep ? 'Reject the record' : 'Confirm'"
          :loading="actionLoading"
          @cancel="close"
          @submit="confirmFormRef?.submit()"
        />
      </template>
    </BaseDialog>

    <WorkflowInstanceEsignAuthDialog v-model="showEsignDialog" @verified="onEsignVerified" />
  </div>
</template>
