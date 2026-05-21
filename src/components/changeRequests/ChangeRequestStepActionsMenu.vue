<script setup>
/**
 * Reviewer-side outcome menu for a Change Request workflow step.
 * Mirrors CapaStepActionsMenu — REASSIGN, CANCEL, REQUEST_INFO are
 * filtered out (handled by the owner's inline buttons or hidden).
 * The remaining surface is SEND_BACK (reject task back to owner with
 * required comment, no e-sign).
 */
import { IconArrowBackUp } from '@tabler/icons-vue'
import { post } from '@/api'
import { currentSession } from '@/utils/currentSession.js'

const props = defineProps({
  instanceStepId: { type: String, required: true },
  crId: { type: String, required: true },
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

// Per-stepType outcome flavoring: APPROVAL steps read as approve / reject;
// ACTION steps keep the CAPA-style "Send Back" wording so reviewers used to
// the existing NC / CAPA UX don't see a relabeling on those modules.
function buildOutcomeConfig(approvalFlavor) {
  return {
    COMPLETE_AND_ADVANCE: {
      label: approvalFlavor ? 'Approve' : 'Mark Complete',
      icon: IconArrowBackUp,
    },
    SEND_BACK: {
      label: approvalFlavor ? 'Reject' : 'Send Back',
      icon: IconArrowBackUp,
      needsComment: true,
      commentRequired: true,
    },
    REQUEST_INFO: { label: 'Request Info' },
    REASSIGN: { label: 'Reassign' },
    CANCEL: { label: 'Cancel' },
  }
}
const OUTCOME_CONFIG = computed(() => buildOutcomeConfig(isApprovalStep.value))

// Mirror NC + CAPA: REASSIGN / CANCEL / REQUEST_INFO live as owner
// inline buttons in the step header. The menu only renders SEND_BACK
// (reject task back to owner).
const ALWAYS_HIDDEN_OUTCOMES = new Set(['REASSIGN', 'CANCEL', 'REQUEST_INFO'])

const showConfirmDialog = ref(false)
const pendingOutcomeId = ref(null)
const comment = ref('')
const actionLoading = ref(false)

const pendingConfig = computed(() =>
  pendingOutcomeId.value ? OUTCOME_CONFIG.value[pendingOutcomeId.value] ?? null : null,
)
const isRejectAction = computed(() => pendingOutcomeId.value === 'SEND_BACK')
const confirmTitle = computed(() => pendingConfig.value?.label ?? 'Confirm')

function onOutcomeClick(outcomeId) {
  if (!canActOnStep.value) return
  pendingOutcomeId.value = outcomeId
  comment.value = ''
  if (OUTCOME_CONFIG.value[outcomeId]?.needsComment) {
    showConfirmDialog.value = true
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
  submitAction()
}

async function submitAction() {
  if (!currentUserTask.value) return
  actionLoading.value = true
  try {
    if (pendingOutcomeId.value === 'SEND_BACK') {
      await post(`/v1/services/changeRequests/${props.crId}/rejectStepTask`, {
        workflowInstanceStepId: props.instanceStepId,
        comment: comment.value,
      })
      toast.success(
        isApprovalStep.value
          ? 'Approval rejected — the CR owner has been notified'
          : 'Task sent back — the CR owner has been notified',
      )
      emit('done')
      return
    }
    // Other outcomes go through the generic task-action endpoint
    const body = {
      action: pendingOutcomeId.value,
      outcomeId: pendingOutcomeId.value,
    }
    if (comment.value) body.comment = comment.value
    await post(`/v1/services/taskInstances/${currentUserTask.value.id}/action`, body)
    toast.success(`${pendingConfig.value?.label ?? 'Action'} completed`)
    emit('done')
  } catch {
    // Dialog stays open so the user doesn't lose input
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
                ? 'Why are you rejecting this change?'
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
  </div>
</template>
