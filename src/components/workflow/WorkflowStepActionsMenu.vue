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
import { post } from '@/api'
import { currentSession } from '@/utils/currentSession.js'

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
const currentUserId = computed(() => currentSession.value?.id ?? currentSession.value?.userId)

const instanceStep = useLiveQueryWithDeps([() => props.instanceStepId], async (db, [id]) =>
  id ? db.WorkflowInstanceStep.findByPk(id) : null,
)

const isApprovalStep = computed(() => instanceStep.value?.stepType === 'APPROVAL')

const ACTIONABLE_STATUSES = ['ASSIGNED', 'FORM_SUBMITTED']

const currentUserTask = useLiveQueryWithDeps(
  [() => props.instanceStepId, () => currentUserId.value],
  async (db, [stepInstanceId, userId]) => {
    if (!stepInstanceId || !userId) return null
    const tasks = await db.TaskInstance.where('[sourceType+sourceId]', [
      'WorkflowInstanceStep',
      stepInstanceId,
    ]).exec()
    return (
      tasks.find(
        (t) => t.assignedTo === userId && ACTIONABLE_STATUSES.includes(t.statusId),
      ) || null
    )
  },
)

const allowedOutcomes = useLiveQueryWithDeps(
  [() => instanceStep.value?.stepId],
  async (db, [stepId]) => {
    if (!stepId) return []
    return db.AllowedOutcomeOnStep.where('stepId', stepId).exec()
  },
  { initial: [] },
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
const actionLoading = ref(false)

const pendingConfig = computed(() =>
  pendingOutcomeId.value ? OUTCOME_CONFIG.value[pendingOutcomeId.value] ?? null : null,
)
const isRejectAction = computed(() => pendingOutcomeId.value === 'SEND_BACK')
const confirmTitle = computed(() => pendingConfig.value?.label ?? 'Confirm')

// E-signature is gated by the step config (requireEsignature prop) and only
// applies to state-changing outcomes — completion / approval. Send-back +
// info-requests stay unsigned to match the parent-step inline buttons in
// WorkflowStep.vue. If product later wants SEND_BACK signed too, add it
// to this set.
const ESIGN_GATED_OUTCOMES = new Set(['COMPLETE_AND_ADVANCE'])
const needsEsignFor = (outcomeId) =>
  props.requireEsignature && ESIGN_GATED_OUTCOMES.has(outcomeId)

function onOutcomeClick(outcomeId) {
  if (!canActOnStep.value) return
  pendingOutcomeId.value = outcomeId
  comment.value = ''
  if (OUTCOME_CONFIG.value[outcomeId]?.needsComment) {
    showConfirmDialog.value = true
  } else if (needsEsignFor(outcomeId)) {
    showEsignDialog.value = true
  } else {
    submitAction()
  }
}

function onConfirmDialog() {
  if (pendingConfig.value?.commentRequired && !comment.value.trim()) {
    toast.warning('A comment is required')
    return
  }
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
      // Module-specific endpoint — rejects the task back to the owner.
      // Each module wires this to its own controller (NC's rejectStepTask
      // also flips the user-on-WIS row to REJECTED and may PEND the step;
      // see the per-module backend implementation).
      await post(
        `/v1/services/${props.module.apiPath}/${props.resourceId}/rejectStepTask`,
        {
          workflowInstanceStepId: props.instanceStepId,
          comment: comment.value,
        },
      )
      toast.success(
        isApprovalStep.value
          ? 'Approval rejected — the owner has been notified'
          : 'Task sent back — the owner has been notified',
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
</script>

<template>
  <div v-if="items.length" class="tw:contents">
    <BaseMenu :items="items" />

    <BaseDialog v-model="showConfirmDialog" :title="confirmTitle" maxWidth="md" persistent>
      <div>
        <label class="tw:block tw:text-sm tw:font-medium tw:text-on-main tw:mb-1">
          {{
            isRejectAction
              ? isApprovalStep
                ? 'Reason for rejection'
                : 'Reason for sending back'
              : 'Comment'
          }}
          <span v-if="pendingConfig?.commentRequired" class="tw:text-red-500">*</span>
        </label>
        <textarea
          v-model="comment"
          rows="3"
          class="tw:w-full tw:rounded-lg tw:border tw:border-divider tw:bg-main tw:text-on-main tw:text-sm tw:p-3 tw:resize-none tw:focus:outline-none tw:focus:ring-2 tw:focus:ring-primary/50"
          :placeholder="
            isRejectAction
              ? isApprovalStep
                ? 'Why are you rejecting?'
                : 'Why are you sending this back to the owner?'
              : 'Add a comment…'
          "
        />
      </div>
      <template #footer="{ close }">
        <BaseButton variant="outline" @click="close">Cancel</BaseButton>
        <BaseButton variant="primary" :isLoading="actionLoading" @click="onConfirmDialog">
          Confirm
        </BaseButton>
      </template>
    </BaseDialog>

    <WorkflowInstanceEsignAuthDialog v-model="showEsignDialog" @verified="onEsignVerified" />
  </div>
</template>
