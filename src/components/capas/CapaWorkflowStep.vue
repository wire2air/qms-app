<script setup>
import { IconCheck, IconRefreshAlert, IconUserCheck, IconBan } from '@tabler/icons-vue'
import { post } from '@/api'
import { currentSession } from '@/utils/currentSession.js'

const props = defineProps({
  instanceStepId: { type: String, required: true },
  capaId: { type: String, required: true },
  isOwner: { type: Boolean, default: false },
  hasSendBackTargets: { type: Boolean, default: false },
  displayNumber: { type: String, default: null },
})

const emit = defineEmits(['reassign', 'sendBack'])

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

// CAPA nested stages: whether this step has children (drives form vs. sub-step list).
// Hierarchy lives on the instance row — count rows that point at us.
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
// Render the child-step section whenever this stage already has children OR
// is configured to accept them — the section hosts the "Add child step" button
// even when the list is empty.
const showChildSection = computed(
  () => hasChildren.value || !!stepDefinition.value?.allowChildSteps,
)

const activeAssigneeId = computed(() => {
  const active = assignments.value.find((a) => a.statusId === 'ASSIGNED')
  return active?.userId || null
})

// CAPA status for the reopen gate — reopen is blocked once the CAPA is
// terminal (CLOSED / CANCELLED).
const capa = useLiveQueryWithDeps([() => props.capaId], async (db, [id]) =>
  id ? db.Capa.findByPk(id) : null,
)
const capaIsTerminal = computed(
  () => capa.value?.statusId === 'CLOSED' || capa.value?.statusId === 'CANCELLED',
)

// ─── Reopen step (feedback loop for approved steps) ──────────────────────────
const canReopen = computed(
  () => props.isOwner && instanceStep.value?.statusId === 'APPROVED' && !capaIsTerminal.value,
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
    await post(`/v1/services/capas/${props.capaId}/reopenStep`, {
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

// ─── Cancel step (CAPA owner) ────────────────────────────────────────────────
// Mirrors NC's owner-cancel. Cancels all active assignments + open tasks
// on this step and marks the step CANCELLED. Parent's child-completion
// check now treats CANCELLED as terminal, so cancelling a child no longer
// blocks the parent stage from advancing.
const REASSIGNABLE_STATUSES_FOR_CANCEL = ['PENDING', 'IN_PROGRESS', 'SENT_BACK']
const canCancelStep = computed(
  () =>
    props.isOwner &&
    REASSIGNABLE_STATUSES_FOR_CANCEL.includes(instanceStep.value?.statusId),
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
    await post(`/v1/services/capas/${props.capaId}/cancelStep`, {
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

// ─── Reassign step (CAPA owner) ──────────────────────────────────────────────
// Step header emits to the parent which mounts a single shared dialog
// for both parent stages and children. Same pattern as NC.
const canReassignStep = computed(
  () =>
    props.isOwner &&
    REASSIGNABLE_STATUSES_FOR_CANCEL.includes(instanceStep.value?.statusId),
)

// ─── Inline "Complete & Advance" action ──────────────────────────────────────
// The dropdown menu (CapaStepActionsMenu) hides this outcome so we surface
// it as a primary inline button on the parent step's header. The gating
// mirrors what the menu used: form must be submitted, every child task
// must be APPROVED before the user can advance.
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
      tasks.find((t) => t.assignedTo === userId && ACTIONABLE_STATUSES.includes(t.statusId)) || null
    )
  },
)

const childInstanceSteps = useLiveQueryWithDeps(
  [() => props.instanceStepId],
  async (db, [parentId]) => {
    if (!parentId) return []
    return db.WorkflowInstanceStep.where('parentInstanceStepId', parentId).exec()
  },
  { initial: [] },
)

const formRequired = computed(
  () => Array.isArray(instanceStep.value?.formSchema) && instanceStep.value.formSchema.length > 0,
)

const allChildrenApproved = computed(
  () =>
    childInstanceSteps.value.length > 0 &&
    childInstanceSteps.value.every((s) => s.statusId === 'APPROVED'),
)
const childrenBlock = computed(
  () => childInstanceSteps.value.length > 0 && !allChildrenApproved.value,
)

const canActOnStep = computed(() => !!currentUserTask.value)
// Form-not-yet-submitted no longer disables the button — Complete & Advance
// now uses the form's autoApprove flow to save + submit + approve in a
// single click. Children-not-yet-complete is the only blocker left.
const completeDisabled = computed(() => childrenBlock.value)
const completeDisabledReason = computed(() =>
  childrenBlock.value ? 'All sub-tasks must be completed before advancing' : '',
)

const requireEsignature = computed(
  () => !!(instanceStep.value?.requireEsignature ?? stepDefinition.value?.requireEsignature),
)

const showEsignDialog = ref(false)
const completing = ref(false)
const formRef = ref(null)

function onCompleteAndAdvanceClick() {
  if (!canActOnStep.value || completeDisabled.value) return
  if (requireEsignature.value) {
    showEsignDialog.value = true
  } else {
    submitCompleteAndAdvance()
  }
}

function onEsignVerified({ method, provider, token }) {
  showEsignDialog.value = false
  submitCompleteAndAdvance({ method, provider, token })
}

async function submitCompleteAndAdvance(esign = null) {
  if (!currentUserTask.value || completing.value) return
  completing.value = true
  try {
    if (formRequired.value) {
      // Form's submit() with autoApprove=true saves the record, marks it
      // submitted, AND posts the COMPLETE_AND_ADVANCE action in a single
      // pass. Esign creds (when needed) flow through.
      await formRef.value?.submit(esign)
    } else {
      // No form on this step — go straight to the action endpoint.
      const body = {
        action: 'COMPLETE_AND_ADVANCE',
        outcomeId: 'COMPLETE_AND_ADVANCE',
      }
      if (esign?.method) body.method = esign.method
      if (esign?.token) body.token = esign.token
      if (esign?.provider) body.provider = esign.provider
      await post(`/v1/services/taskInstances/${currentUserTask.value.id}/action`, body)
      toast.success('Step completed')
    }
  } catch (e) {
    toast.error(e?.message || 'Failed to complete step')
  } finally {
    completing.value = false
  }
}
</script>

<template>
  <div v-if="instanceStep" class="tw:bg-white tw:border tw:border-divider tw:rounded-lg tw:p-5">
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
          class="tw:flex tw:items-center tw:gap-1 tw:text-xs tw:text-green-700 tw:hover:underline tw:cursor-pointer tw:font-medium tw:disabled:opacity-50 tw:disabled:cursor-not-allowed tw:disabled:hover:no-underline"
          :disabled="completeDisabled || completing"
          :title="completeDisabledReason || undefined"
          @click="onCompleteAndAdvanceClick"
        >
          <IconCheck :size="14" />
          {{ completing ? 'Completing…' : 'Mark Complete' }}
        </button>
        <button
          v-if="canReopen"
          class="tw:flex tw:items-center tw:gap-1 tw:text-xs tw:text-amber-700 tw:hover:underline tw:cursor-pointer tw:font-medium"
          title="Reopen this step and send it back to the assignee with feedback"
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
        <CapaStepActionsMenu
          :instanceStepId="instanceStepId"
          :capaId="capaId"
          :isOwner="isOwner"
          :hasSendBackTargets="hasSendBackTargets"
          :requireEsignature="requireEsignature"
          :hideOutcomes="['COMPLETE_AND_ADVANCE']"
        />
      </div>
    </div>
    <WorkflowInstanceEsignAuthDialog v-model="showEsignDialog" @verified="onEsignVerified" />

    <CapaWorkflowStepForm
      ref="formRef"
      :instanceStepId="instanceStepId"
      :capaId="capaId"
      :autoApprove="true"
      :hideSubmit="true"
    />

    <div class="tw:my-5 tw:border-t tw:border-divider"></div>

    <!-- Sub-tasks list (parent stages with nested children) -->
    <CapaWorkflowChildSteps
      v-if="showChildSection && instanceStep.workflowInstanceId"
      :parentInstanceStepId="instanceStep.id"
      :parentStepNumber="displayNumber ?? instanceStep.stepNumber"
      :workflowInstanceId="instanceStep.workflowInstanceId"
      :capaId="capaId"
      :isOwner="isOwner"
      :allowChildSteps="!!stepDefinition?.allowChildSteps"
      class="tw:mb-4"
      @reassign="(childInstanceStepId) => emit('reassign', childInstanceStepId)"
    />

    <BaseDialog v-model="showCancelDialog" title="Cancel Step" maxWidth="md">
      <div class="tw:flex tw:flex-col tw:gap-4 tw:p-1">
        <div
          class="tw:flex tw:items-start tw:gap-3 tw:p-3 tw:rounded-lg tw:bg-red-50 tw:border tw:border-red-200"
        >
          <div class="tw:text-red-600 tw:shrink-0 tw:mt-0.5">⨯</div>
          <div class="tw:text-sm tw:text-red-800">
            Cancels this step and all of its open assignments / tasks. The
            workflow stops at this step — downstream steps stay where they
            are. If this step had children, the parent stage's "all
            children done" check will treat this one as completed.
          </div>
        </div>
        <div>
          <p class="tw:text-xs tw:uppercase tw:font-bold tw:text-secondary tw:mb-1">
            Reason (optional)
          </p>
          <BaseTextarea
            v-model="cancelReason"
            :rows="3"
            placeholder="Why is this step being cancelled?"
          />
        </div>
      </div>
      <template #footer="{ close }">
        <BaseButton variant="secondary" :disabled="cancelling" @click="close">Cancel</BaseButton>
        <BaseButton
          variant="danger"
          :loading="cancelling"
          :disabled="cancelling"
          @click="handleCancelStep"
        >
          Cancel Step
        </BaseButton>
      </template>
    </BaseDialog>

    <BaseDialog v-model="showReopenDialog" title="Reopen Step" maxWidth="md">
      <div class="tw:flex tw:flex-col tw:gap-4 tw:p-1">
        <div class="tw:flex tw:items-start tw:gap-3 tw:p-3 tw:rounded-lg tw:bg-amber-50 tw:border tw:border-amber-200">
          <div class="tw:text-amber-600 tw:shrink-0 tw:mt-0.5">⤺</div>
          <div class="tw:text-sm tw:text-amber-800">
            Sends the step back to its assignee for revision. The previous
            assignee gets a new task on this step. Downstream steps are not
            affected. Your feedback is recorded in the audit log.
          </div>
        </div>
        <div>
          <p class="tw:text-xs tw:uppercase tw:font-bold tw:text-secondary tw:mb-1">
            Feedback / Reason
          </p>
          <BaseTextarea
            v-model="reopenReason"
            :rows="3"
            placeholder="What needs to be revised on this step?"
          />
        </div>
      </div>
      <template #footer="{ close }">
        <BaseButton variant="secondary" :disabled="reopening" @click="close">Cancel</BaseButton>
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
