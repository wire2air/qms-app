<script setup>
/**
 * CR workflow step header + inline action buttons. Mirrors
 * CapaWorkflowStep but without per-user form records (no CrRecord
 * entity exists yet). The Mark Complete action posts the standard
 * COMPLETE_AND_ADVANCE outcome to the generic task-action endpoint,
 * with optional comment and e-sign when the step requires it.
 */

import {
  IconCheck,
  IconRefreshAlert,
  IconUserCheck,
  IconBan,
  IconX,
} from '@tabler/icons-vue'
import { post } from '@/api'
import { currentSession } from '@/utils/currentSession.js'

const props = defineProps({
  instanceStepId: { type: String, required: true },
  crId: { type: String, required: true },
  isOwner: { type: Boolean, default: false },
  displayNumber: { type: String, default: null },
})

const emit = defineEmits(['reassign'])

const toast = useToast()
const currentUserId = computed(() => currentSession.value?.id ?? currentSession.value?.userId)

const instanceStep = useLiveQueryWithDeps([() => props.instanceStepId], async (db, [id]) =>
  id ? db.WorkflowInstanceStep.findByPk(id) : null,
)

const stepDefinition = useLiveQueryWithDeps(
  [() => instanceStep.value?.stepId],
  async (db, [stepId]) => (stepId ? db.WorkflowStep.findByPk(stepId) : null),
)

const assignments = useLiveQueryWithDeps(
  [() => props.instanceStepId],
  async (db, [id]) => {
    if (!id) return []
    return db.UserOnWorkflowInstanceStep.where('workflowInstanceStepId', id).exec()
  },
  { initial: [] },
)

const activeAssigneeId = computed(() => {
  const active = assignments.value.find((a) => a.statusId === 'ASSIGNED')
  return active?.userId || null
})

const cr = useLiveQueryWithDeps([() => props.crId], async (db, [id]) =>
  id ? db.ChangeRequest.findByPk(id) : null,
)
const crIsTerminal = computed(() =>
  ['CLOSED', 'CANCELLED', 'REJECTED'].includes(cr.value?.statusId),
)

const childStepCount = useLiveQueryWithDeps(
  [() => props.instanceStepId],
  async (db, [parentInstanceStepId]) => {
    if (!parentInstanceStepId) return 0
    const children = await db.WorkflowInstanceStep.where(
      'parentInstanceStepId',
      parentInstanceStepId,
    ).exec()
    return children.length
  },
  { initial: 0 },
)
const hasChildren = computed(() => childStepCount.value > 0)
const showChildSection = computed(
  () => hasChildren.value || !!stepDefinition.value?.allowChildSteps,
)

// ─── Reopen ──────────────────────────────────────────────────────────────────
// APPROVAL-typed steps are mandatory gates — once an approver has signed
// the change off, the owner can't reopen the approval and re-collect
// signatures behind the scenes. To redo an approval, cancel the CR and
// raise a new one. ACTION steps stay reopenable.
const canReopen = computed(
  () =>
    props.isOwner &&
    instanceStep.value?.statusId === 'APPROVED' &&
    !crIsTerminal.value &&
    instanceStep.value?.stepType !== 'APPROVAL',
)
const showReopenDialog = ref(false)
const reopenReason = ref('')
const reopening = ref(false)

function openReopenDialog() {
  reopenReason.value = ''
  showReopenDialog.value = true
}

async function handleReopen() {
  if (!reopenReason.value.trim() || reopening.value) return
  reopening.value = true
  try {
    await post(`/v1/services/changeRequests/${props.crId}/reopenStep`, {
      workflowInstanceStepId: props.instanceStepId,
      reason: reopenReason.value.trim(),
    })
    toast.success('Step reopened')
    showReopenDialog.value = false
  } catch (e) {
    toast.error(e?.message || 'Failed to reopen step')
  } finally {
    reopening.value = false
  }
}

// ─── Owner Cancel step ───────────────────────────────────────────────────────
// APPROVAL-typed steps can't be cancelled either — they're the mandatory
// gate. The right way to abandon an approval mid-flight is Cancel CR
// (which terminates the workflow as a whole) or Reject from an approver.
const REASSIGNABLE = ['PENDING', 'IN_PROGRESS', 'SENT_BACK']
const canCancelStep = computed(
  () =>
    props.isOwner &&
    REASSIGNABLE.includes(instanceStep.value?.statusId) &&
    instanceStep.value?.stepType !== 'APPROVAL',
)
const showCancelDialog = ref(false)
const cancelReason = ref('')
const cancelling = ref(false)

function openCancelDialog() {
  cancelReason.value = ''
  showCancelDialog.value = true
}

async function handleCancelStep() {
  if (cancelling.value) return
  cancelling.value = true
  try {
    await post(`/v1/services/changeRequests/${props.crId}/cancelStep`, {
      workflowInstanceStepId: props.instanceStepId,
      reason: cancelReason.value.trim() || null,
    })
    toast.success('Step cancelled')
    showCancelDialog.value = false
  } catch (e) {
    toast.error(e?.message || 'Failed to cancel step')
  } finally {
    cancelling.value = false
  }
}

// ─── Owner Reassign ──────────────────────────────────────────────────────────
const canReassignStep = computed(
  () => props.isOwner && REASSIGNABLE.includes(instanceStep.value?.statusId),
)

// ─── Mark Complete (reviewer) ────────────────────────────────────────────────
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
        (t) =>
          t.assignedTo === userId &&
          t.taskKindId === 'APPROVAL' &&
          ACTIONABLE_STATUSES.includes(t.statusId),
      ) || null
    )
  },
)

const canActOnStep = computed(() => !!currentUserTask.value)

const childInstanceSteps = useLiveQueryWithDeps(
  [() => props.instanceStepId],
  async (db, [parentId]) => {
    if (!parentId) return []
    return db.WorkflowInstanceStep.where('parentInstanceStepId', parentId).exec()
  },
  { initial: [] },
)

const allChildrenTerminal = computed(
  () =>
    childInstanceSteps.value.length > 0 &&
    childInstanceSteps.value.every((s) =>
      ['APPROVED', 'CANCELLED', 'SKIPPED'].includes(s.statusId),
    ),
)
const childrenBlock = computed(
  () => childInstanceSteps.value.length > 0 && !allChildrenTerminal.value,
)

const requireEsignature = computed(
  () =>
    !!(instanceStep.value?.requireEsignature ?? stepDefinition.value?.requireEsignature),
)

// APPROVAL-typed steps use approve / reject phrasing instead of the
// CAPA-style "Mark Complete" / "Send Back". Approval-step UX is gated
// on the denormalized stepType on the WorkflowInstanceStep row so the
// renderer doesn't need to wait on the template join.
const isApprovalStep = computed(() => instanceStep.value?.stepType === 'APPROVAL')
const primaryActionLabel = computed(() => {
  if (isApprovalStep.value) {
    return requireEsignature.value ? 'Sign & Approve' : 'Approve'
  }
  return requireEsignature.value ? 'Sign & Complete' : 'Mark Complete'
})
const primaryActionInProgressLabel = computed(() =>
  isApprovalStep.value ? 'Approving…' : 'Completing…',
)
const ctaCopy = computed(() => {
  if (isApprovalStep.value) {
    return `Review the analysis and ${requireEsignature.value ? 'sign off to approve' : 'approve'} to advance.`
  }
  return `Add your ${requireEsignature.value ? 'sign-off' : 'notes'} and complete to advance.`
})

const showCompleteDialog = ref(false)
const showEsignDialog = ref(false)
const completing = ref(false)
const completeComment = ref('')

// Mount the step form for ACTION steps that have a schema. APPROVAL
// steps never mount it (comment-only). The form exposes submit() so
// "Mark Complete" can persist + autoApprove in one round trip.
const stepFormRef = ref(null)
const hasStepForm = computed(
  () => !isApprovalStep.value && (instanceStep.value?.formSchema?.length ?? 0) > 0,
)

// ─── Inline Reject (APPROVAL steps only) ─────────────────────────────────────
// Surface Reject as a primary header button next to Approve so the gate
// outcome is one click away. For ACTION steps the "Send Back" verb is
// still available through the three-dot actions menu since rejecting
// work-step output is a less common path.
const showRejectDialog = ref(false)
const rejectReason = ref('')
const rejecting = ref(false)

function openRejectDialog() {
  if (!canActOnStep.value || rejecting.value) return
  rejectReason.value = ''
  showRejectDialog.value = true
}

async function handleRejectSubmit() {
  if (!rejectReason.value.trim() || rejecting.value) return
  rejecting.value = true
  try {
    await post(`/v1/services/changeRequests/${props.crId}/rejectStepTask`, {
      workflowInstanceStepId: props.instanceStepId,
      comment: rejectReason.value.trim(),
    })
    toast.success('Approval rejected — the CR owner has been notified')
    showRejectDialog.value = false
  } catch (e) {
    toast.error(e?.message || 'Failed to reject')
  } finally {
    rejecting.value = false
  }
}

function onCompleteClick() {
  if (!canActOnStep.value || childrenBlock.value || completing.value) return
  completeComment.value = ''
  // ACTION step with a form: the form fields ARE the capture, so skip
  // the "any comment?" dialog. Esign still routes through its own
  // dialog when required.
  if (hasStepForm.value) {
    if (requireEsignature.value) {
      showEsignDialog.value = true
    } else {
      submitComplete()
    }
    return
  }
  showCompleteDialog.value = true
}

function handleCompleteSubmit() {
  showCompleteDialog.value = false
  if (requireEsignature.value) {
    showEsignDialog.value = true
  } else {
    submitComplete()
  }
}

function onEsignVerified({ method, provider, token }) {
  showEsignDialog.value = false
  submitComplete({ method, provider, token })
}

async function submitComplete(esign = null) {
  if (!currentUserTask.value || completing.value) return
  completing.value = true
  try {
    // ACTION step with a form: delegate to the form's submit() so the
    // CrRecord persists first, then it auto-approves the task in the
    // same round trip. We pass esign through so Sign & Complete flows
    // still work when the step requires Part-11 sign-off.
    if (hasStepForm.value && stepFormRef.value?.submit) {
      await stepFormRef.value.submit(esign ?? undefined)
      return
    }
    // Comment-only flow (APPROVAL steps and form-less ACTION steps).
    const body = {
      action: 'COMPLETE_AND_ADVANCE',
      outcomeId: 'COMPLETE_AND_ADVANCE',
    }
    if (completeComment.value.trim()) body.comment = completeComment.value.trim()
    if (esign?.method) body.method = esign.method
    if (esign?.token) body.token = esign.token
    if (esign?.provider) body.provider = esign.provider
    await post(`/v1/services/taskInstances/${currentUserTask.value.id}/action`, body)
    toast.success(isApprovalStep.value ? 'Step approved' : 'Step marked complete')
  } catch (e) {
    toast.error(e?.message || 'Failed to complete step')
  } finally {
    completing.value = false
  }
}

// ─── Display ─────────────────────────────────────────────────────────────────
function getStepStatusClass(statusId) {
  return {
    'tw:bg-blue-100 tw:text-blue-700': statusId === 'IN_PROGRESS',
    'tw:bg-gray-100 tw:text-gray-600': statusId === 'PENDING',
    'tw:bg-green-100 tw:text-green-700': statusId === 'APPROVED',
    'tw:bg-red-100 tw:text-red-700': statusId === 'CANCELLED',
    'tw:bg-orange-100 tw:text-orange-700': statusId === 'SENT_BACK',
  }
}
function getStatusLabel(statusId) {
  if (!statusId) return '—'
  if (statusId === 'APPROVED') return 'Completed'
  return statusId.replace('_', ' ')
}
</script>

<template>
  <div v-if="instanceStep" class="tw:bg-white tw:border tw:border-divider tw:rounded-lg tw:p-5">
    <!-- Header -->
    <div
      class="tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-2 tw:pb-3 tw:border-b tw:border-divider tw:mb-4"
    >
      <div class="tw:flex tw:items-center tw:gap-2 tw:min-w-0">
        <span class="tw:text-xs tw:font-semibold tw:text-secondary tw:uppercase tw:tracking-wider">
          {{ displayNumber ?? instanceStep.stepNumber }}. {{ instanceStep.name || 'Step' }}
        </span>
        <BaseBadge class="tw:text-[10px]" :class="getStepStatusClass(instanceStep.statusId)">
          {{ getStatusLabel(instanceStep.statusId) }}
        </BaseBadge>
      </div>
      <div class="tw:flex tw:items-center tw:gap-2">
        <UserBadgeById v-if="activeAssigneeId" :userId="activeAssigneeId" />
        <button
          v-if="canActOnStep"
          class="tw:flex tw:items-center tw:gap-1 tw:text-xs tw:text-green-700 tw:hover:underline tw:cursor-pointer tw:font-medium tw:disabled:opacity-50 tw:disabled:cursor-not-allowed"
          :disabled="completing || childrenBlock"
          :title="childrenBlock ? 'All sub-tasks must be completed first' : undefined"
          @click="onCompleteClick"
        >
          <IconCheck :size="14" />
          {{ completing ? primaryActionInProgressLabel : primaryActionLabel }}
        </button>
        <button
          v-if="isApprovalStep && canActOnStep"
          class="tw:flex tw:items-center tw:gap-1 tw:text-xs tw:text-red-600 tw:hover:underline tw:cursor-pointer tw:font-medium tw:disabled:opacity-50"
          :disabled="rejecting"
          @click="openRejectDialog"
        >
          <IconX :size="14" />
          {{ rejecting ? 'Rejecting…' : 'Reject' }}
        </button>
        <button
          v-if="canReopen"
          class="tw:flex tw:items-center tw:gap-1 tw:text-xs tw:text-amber-700 tw:hover:underline tw:cursor-pointer tw:font-medium"
          @click="openReopenDialog"
        >
          <IconRefreshAlert :size="14" />
          Reopen
        </button>
        <button
          v-if="canReassignStep"
          class="tw:flex tw:items-center tw:gap-1 tw:text-xs tw:text-primary tw:hover:underline tw:cursor-pointer tw:font-medium"
          @click="emit('reassign', instanceStepId)"
        >
          <IconUserCheck :size="14" />
          Reassign
        </button>
        <button
          v-if="canCancelStep"
          class="tw:flex tw:items-center tw:gap-1 tw:text-xs tw:text-red-600 tw:hover:underline tw:cursor-pointer tw:font-medium tw:disabled:opacity-50"
          :disabled="cancelling"
          @click="openCancelDialog"
        >
          <IconBan :size="14" />
          {{ cancelling ? 'Cancelling…' : 'Cancel' }}
        </button>
        <ChangeRequestStepActionsMenu
          :instanceStepId="instanceStepId"
          :crId="crId"
          :isOwner="isOwner"
          :requireEsignature="requireEsignature"
          :hideOutcomes="
            isApprovalStep
              ? ['COMPLETE_AND_ADVANCE', 'SEND_BACK']
              : ['COMPLETE_AND_ADVANCE']
          "
        />
      </div>
    </div>

    <!-- Description -->
    <div
      v-if="instanceStep.description"
      class="tw:text-sm tw:text-secondary tw:leading-relaxed tw:mb-3"
      v-html="instanceStep.description"
    />

    <!-- Per-user step form (ACTION + non-empty formSchema only).
         APPROVAL steps and form-less ACTION steps fall through to the
         comment-only inline CTA below. The form exposes submit() via
         ref so the Mark Complete CTA can drive save + autoApprove in
         one click. -->
    <div v-if="hasStepForm" class="tw:mb-3">
      <ChangeRequestWorkflowStepForm
        ref="stepFormRef"
        :instanceStepId="instanceStepId"
        :crId="crId"
        :autoApprove="true"
        :hideSubmit="true"
      />
    </div>

    <!-- Assignee call-to-action: form-less ACTION + every APPROVAL step
         falls through here. Mark Complete dialog (comment + optional
         e-sign) is the single advance action. -->
    <div
      v-if="canActOnStep"
      class="tw:flex tw:items-center tw:justify-between tw:gap-3 tw:px-4 tw:py-3 tw:rounded-lg tw:border tw:border-primary/20 tw:bg-primary/5 tw:mb-3"
    >
      <div class="tw:text-sm tw:text-on-main">
        <span class="tw:font-semibold">You're the assignee on this step.</span>
        <span class="tw:text-secondary tw:ml-1">{{ ctaCopy }}</span>
      </div>
      <BaseButton
        variant="primary"
        size="sm"
        :disabled="completing || childrenBlock"
        :title="childrenBlock ? 'All sub-tasks must be completed first' : undefined"
        @click="onCompleteClick"
      >
        <template #icon><IconCheck :size="14" /></template>
        {{ completing ? primaryActionInProgressLabel : primaryActionLabel }}
      </BaseButton>
    </div>

    <!-- Child sub-tasks list when this stage allows them -->
    <ChangeRequestWorkflowChildSteps
      v-if="showChildSection && instanceStep.workflowInstanceId"
      :parentInstanceStepId="instanceStep.id"
      :parentStepNumber="displayNumber ?? instanceStep.stepNumber"
      :workflowInstanceId="instanceStep.workflowInstanceId"
      :crId="crId"
      :isOwner="isOwner"
      :allowChildSteps="!!stepDefinition?.allowChildSteps"
      @reassign="(childId) => emit('reassign', childId)"
    />

    <!-- Approve / Mark Complete dialog (optional comment) -->
    <BaseDialog
      v-model="showCompleteDialog"
      :title="isApprovalStep ? 'Approve Step' : 'Mark Step Complete'"
      maxWidth="md"
    >
      <div>
        <p class="tw:text-sm tw:text-on-main tw:mb-3">
          {{ isApprovalStep ? 'Confirm approval of' : 'Confirm completion of' }}
          <strong>{{ instanceStep.name }}</strong>.
          <span v-if="requireEsignature">
            This step requires an e-signature; you'll be prompted on the next screen.
          </span>
        </p>
        <label class="tw:block tw:text-xs tw:font-bold tw:text-secondary tw:uppercase tw:mb-1">
          {{ isApprovalStep ? 'Approval comment (optional)' : 'Comment (optional)' }}
        </label>
        <BaseTextarea
          v-model="completeComment"
          :rows="3"
          :placeholder="
            isApprovalStep
              ? 'Why are you approving this change?'
              : 'Notes about how you completed this step…'
          "
        />
      </div>
      <template #footer="{ close }">
        <BaseButton variant="outline" :disabled="completing" @click="close">Cancel</BaseButton>
        <BaseButton variant="primary" :loading="completing" @click="handleCompleteSubmit">
          {{ primaryActionLabel }}
        </BaseButton>
      </template>
    </BaseDialog>

    <WorkflowInstanceEsignAuthDialog v-model="showEsignDialog" @verified="onEsignVerified" />

    <!-- Cancel Step dialog -->
    <BaseDialog v-model="showCancelDialog" title="Cancel Step" maxWidth="md">
      <div class="tw:flex tw:flex-col tw:gap-3 tw:p-1">
        <div
          class="tw:flex tw:items-start tw:gap-3 tw:p-3 tw:rounded-lg tw:bg-red-50 tw:border tw:border-red-200"
        >
          <div class="tw:text-red-600 tw:shrink-0 tw:mt-0.5">⨯</div>
          <div class="tw:text-sm tw:text-red-800">
            Cancels this step and all open tasks under it. Downstream
            steps stay where they are.
          </div>
        </div>
        <BaseTextarea v-model="cancelReason" :rows="3" placeholder="Reason (optional)" />
      </div>
      <template #footer="{ close }">
        <BaseButton variant="secondary" :disabled="cancelling" @click="close">Cancel</BaseButton>
        <BaseButton variant="danger" :loading="cancelling" @click="handleCancelStep">
          Cancel Step
        </BaseButton>
      </template>
    </BaseDialog>

    <!-- Reject dialog (APPROVAL steps; reuses rejectStepTask endpoint) -->
    <BaseDialog v-model="showRejectDialog" title="Reject Step" maxWidth="md">
      <div class="tw:flex tw:flex-col tw:gap-3 tw:p-1">
        <div
          class="tw:flex tw:items-start tw:gap-3 tw:p-3 tw:rounded-lg tw:bg-red-50 tw:border tw:border-red-200"
        >
          <div class="tw:text-red-600 tw:shrink-0 tw:mt-0.5">⨯</div>
          <div class="tw:text-sm tw:text-red-800">
            Rejecting <strong>{{ instanceStep.name }}</strong> sends the CR back to the owner
            with your feedback. The CR drops to DRAFT and the owner can revise and resubmit.
          </div>
        </div>
        <label class="tw:block tw:text-xs tw:font-bold tw:text-secondary tw:uppercase tw:mb-1">
          Reason for rejection <span class="tw:text-red-500">*</span>
        </label>
        <BaseTextarea
          v-model="rejectReason"
          :rows="3"
          placeholder="Why are you rejecting this change?"
        />
      </div>
      <template #footer="{ close }">
        <BaseButton variant="outline" :disabled="rejecting" @click="close">Cancel</BaseButton>
        <BaseButton
          variant="danger"
          :loading="rejecting"
          :disabled="!rejectReason.trim() || rejecting"
          @click="handleRejectSubmit"
        >
          Reject
        </BaseButton>
      </template>
    </BaseDialog>

    <!-- Reopen Step dialog -->
    <BaseDialog v-model="showReopenDialog" title="Reopen Step" maxWidth="md">
      <div class="tw:flex tw:flex-col tw:gap-3 tw:p-1">
        <p class="tw:text-sm tw:text-on-main">
          Reopens <strong>{{ instanceStep.name }}</strong> and creates a fresh task for the
          original assignee.
        </p>
        <label class="tw:block tw:text-xs tw:font-bold tw:text-secondary tw:uppercase tw:mb-1">
          Reason <span class="tw:text-red-500">*</span>
        </label>
        <BaseTextarea
          v-model="reopenReason"
          :rows="3"
          placeholder="Why is this step being reopened?"
        />
      </div>
      <template #footer="{ close }">
        <BaseButton variant="outline" :disabled="reopening" @click="close">Cancel</BaseButton>
        <BaseButton
          variant="primary"
          :loading="reopening"
          :disabled="!reopenReason.trim() || reopening"
          @click="handleReopen"
        >
          Reopen Step
        </BaseButton>
      </template>
    </BaseDialog>
  </div>
</template>
