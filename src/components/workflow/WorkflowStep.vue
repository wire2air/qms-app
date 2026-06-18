<script setup>
/**
 * Generic top-level workflow step card. Replaces CapaWorkflowStep +
 * ChangeRequestWorkflowStep (NC pending phase 3b).
 *
 * Renders:
 *   - Header: step number + name + status badge + active assignee badge
 *   - Inline action buttons: Mark Complete / Approve, Reopen, Reassign,
 *     Cancel
 *   - Dropdown (WorkflowStepActionsMenu): all the secondary outcomes
 *     including the reviewer's Send Back / Reject (target is computed
 *     by the engine: parent step → entity owner; child task → parent
 *     step's assignee — no per-template StepSendBackTarget config).
 *   - The step's form (WorkflowStepForm)
 *   - Optional #childSteps slot for the module-specific child-step list
 *     (CAPA's nested stages, CR's implementation sub-tasks)
 *
 * Module-specific URLs (reopenStep / cancelStep) are built from
 * `module.apiPath` so the call sites stay agnostic.
 *
 * Slots:
 *   #childSteps — rendered below the form. Used by CAPA for nested
 *     stages; CR for implementation sub-tasks. NC will not pass it.
 *   #beforeForm — content between the header and the form (e.g. CR's
 *     description / comment area).
 */
import { IconCheck, IconRefreshAlert, IconUserCheck, IconBan } from '@tabler/icons-vue'
import { post } from '@/api'
import { currentSession } from '@/utils/currentSession.js'
import WorkflowStepActionsMenu from '@/components/workflow/WorkflowStepActionsMenu.vue'
import WorkflowStepForm from '@/components/workflow/WorkflowStepForm.vue'

const props = defineProps({
  module: { type: Object, required: true },
  instanceStepId: { type: String, required: true },
  resourceId: { type: String, required: true },
  isOwner: { type: Boolean, default: false },
  // Override the step number shown in the header (e.g. CAPA stages
  // sometimes display "2a" for ordered sub-stages).
  displayNumber: { type: String, default: null },
})

const emit = defineEmits(['reassign'])
const toast = useToast()
const currentUserId = computed(() => currentSession.value?.id ?? currentSession.value?.userId)

// ─── Step + definition ───────────────────────────────────────────────────────
const instanceStep = useLiveQueryWithDeps(
  [() => props.instanceStepId],
  async (db, [id]) => (id ? db.WorkflowInstanceStep.findByPk(id) : null),
  { models: ['WorkflowInstanceStep'] },
)

const stepDefinition = useLiveQueryWithDeps(
  [() => instanceStep.value?.stepId],

  async (db, [stepId]) => (stepId ? db.WorkflowStep.findByPk(stepId) : null),
  { models: ['WorkflowStep'] },
)

const isApprovalStep = computed(() => instanceStep.value?.stepType === 'APPROVAL')

// ─── Resource (for terminal check) ───────────────────────────────────────────
const resource = useLiveQueryWithDeps([() => props.resourceId], async (db, [id]) =>
  id ? db[props.module.resourceModel.modelName].findByPk(id) : null,
)

// Resource is "terminal" → reopen / cancel gates close. Each module
// has its own terminal status set, but every module today uses CLOSED
// / VOID / CANCELLED as terminal flavours. Treat the union as terminal.
const resourceIsTerminal = computed(() =>
  ['CLOSED', 'VOID', 'CANCELLED'].includes(resource.value?.statusId),
)

// ─── Assignees ───────────────────────────────────────────────────────────────
const assignments = useLiveQueryWithDeps(
  [() => props.instanceStepId],
  async (db, [id]) => {
    if (!id) return []
    return db.UserOnWorkflowInstanceStep.where('workflowInstanceStepId', id).exec()
  },

  { models: ['UserOnWorkflowInstanceStep'], initial: [] },
)

const activeAssigneeId = computed(() => {
  const active = assignments.value.find((a) => a.statusId === 'ASSIGNED')
  return active?.userId || null
})

// ─── Children (for CAPA-style nested stages) ─────────────────────────────────
const childInstanceSteps = useLiveQueryWithDeps(
  [() => props.instanceStepId],
  async (db, [parentId]) => {
    if (!parentId) return []
    return db.WorkflowInstanceStep.where('parentInstanceStepId', parentId).exec()
  },

  { models: ['WorkflowInstanceStep'], initial: [] },
)

const allChildrenApproved = computed(
  () =>
    childInstanceSteps.value.length > 0 &&
    childInstanceSteps.value.every((s) => s.statusId === 'APPROVED'),
)
const childrenBlock = computed(
  () => childInstanceSteps.value.length > 0 && !allChildrenApproved.value,
)

// ─── Current user's task ─────────────────────────────────────────────────────
// Filter to APPROVAL tasks only — protects against the owner=assignee
// post-rejection edge case: when the owner rejects their own approval
// task, rejectStepTask creates a new ACTION task on the same step
// (owner-notification, not a reviewer task). Without the kind filter,
// the form would re-enable on that ACTION task. PENDING is included
// alongside ASSIGNED + FORM_SUBMITTED for the same reason — the owner
// task can land in PENDING before it's activated.
const ACTIONABLE_STATUSES = ['ASSIGNED', 'FORM_SUBMITTED', 'PENDING']

// All tasks ever created on this step — the current user's actionable
// one is filtered out below for the action gates; the full list also
// powers the activity panel (rejection comments, approvals with notes).
const stepTasks = useLiveQueryWithDeps(
  [() => props.instanceStepId],
  async (db, [stepInstanceId]) => {
    if (!stepInstanceId) return []
    return db.TaskInstance.where('[sourceType+sourceId]', [
      'WorkflowInstanceStep',
      stepInstanceId,
    ]).exec()
  },

  { models: ['TaskInstance'], initial: [] },
)

const currentUserTask = computed(() => {
  if (!currentUserId.value) return null
  return (
    stepTasks.value.find(
      (t) =>
        t.assignedTo === currentUserId.value &&
        t.taskKindId === 'APPROVAL' &&
        ACTIONABLE_STATUSES.includes(t.statusId),
    ) || null
  )
})

const canActOnStep = computed(() => !!currentUserTask.value)
const completeDisabled = computed(() => childrenBlock.value)
const completeDisabledReason = computed(() =>
  childrenBlock.value ? 'All sub-tasks must be completed before advancing' : '',
)

// ─── Mark Complete (Complete & Advance) ──────────────────────────────────────
const requireEsignature = computed(
  () => !!(instanceStep.value?.requireEsignature ?? stepDefinition.value?.requireEsignature),
)

const showEsignDialog = ref(false)
const completing = ref(false)
const formRef = ref(null)

const formRequired = computed(
  () => Array.isArray(instanceStep.value?.formSchema) && instanceStep.value.formSchema.length > 0,
)

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
      // Form's submit() saves the record, marks it submitted, AND posts
      // COMPLETE_AND_ADVANCE in a single pass via autoApprove. Esign
      // creds (when needed) flow through.
      await formRef.value?.submit(esign)
    } else {
      const body = {
        action: 'COMPLETE_AND_ADVANCE',
        outcomeId: 'COMPLETE_AND_ADVANCE',
      }
      if (esign?.method) body.method = esign.method
      if (esign?.token) body.token = esign.token
      if (esign?.provider) body.provider = esign.provider
      await post(`/v1/services/taskInstances/${currentUserTask.value.id}/action`, body)
      toast.success(isApprovalStep.value ? 'Step approved' : 'Step completed')
    }
  } catch (e) {
    toast.error(e?.message || 'Failed to complete step')
  } finally {
    completing.value = false
  }
}

// ─── Reopen step (owner, post-approval) ──────────────────────────────────────
const canReopen = computed(
  () => props.isOwner && instanceStep.value?.statusId === 'APPROVED' && !resourceIsTerminal.value,
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
    await post(`/v1/services/${props.module.apiPath}/${props.resourceId}/reopenStep`, {
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

// ─── Reassign + Cancel (owner) ───────────────────────────────────────────────
// Send back lives only in the reviewer-side dropdown now. The previous
// owner-driven "send back to step N" inline button is gone — when a
// reviewer sends a task back, the engine auto-targets the entity owner
// (for a parent step) or the parent step's assignee (for a child task),
// so there's no target picker the owner needs to drive.
const REASSIGNABLE_STATUSES = ['PENDING', 'IN_PROGRESS', 'SENT_BACK']
const canReassign = computed(
  () => props.isOwner && REASSIGNABLE_STATUSES.includes(instanceStep.value?.statusId),
)
const canCancelStep = computed(
  () => props.isOwner && REASSIGNABLE_STATUSES.includes(instanceStep.value?.statusId),
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
    await post(`/v1/services/${props.module.apiPath}/${props.resourceId}/cancelStep`, {
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

// ─── Display helpers ─────────────────────────────────────────────────────────
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

// ─── Step activity (per-step audit trail) ──────────────────────────
// Two data sources combined into one chronological feed:
//
//   1. TaskInstance rows with a comment — rejections (with reason),
//      approvals with notes, reopens. These carry free-text content.
//
//   2. UserOnWorkflowInstanceStep rows in REASSIGNED / REJECTED /
//      CANCELLED status — the per-reviewer assignment history.
//      Reassignments don't write a comment anywhere, so this is the
//      only place they surface inline.
//
// Both sources are projected to a uniform shape:
//   { id, kind, who, statusId, comment?, at }
// then merged + sorted newest-first.

const stepAssignments = useLiveQueryWithDeps(
  [() => props.instanceStepId],
  async (db, [stepInstanceId]) => {
    if (!stepInstanceId) return []
    return db.UserOnWorkflowInstanceStep.where('workflowInstanceStepId', stepInstanceId).exec()
  },

  { models: ['UserOnWorkflowInstanceStep'], initial: [] },
)

// History-only — terminal-ish statuses where something happened.
// ASSIGNED / PENDING / APPROVED rows aren't 'activity', they're the
// current-state record the step header already shows.
const HISTORY_ASSIGNMENT_STATUSES = new Set(['REASSIGNED', 'REJECTED', 'CANCELLED'])

const activity = computed(() => {
  const fromTasks = stepTasks.value
    .filter((t) => t.comment && String(t.comment).trim())
    .map((t) => ({
      id: `task-${t.id}`,
      kind: 'task',
      who: t.assignedTo,
      statusId: t.statusId,
      comment: t.comment,
      at: t.updatedAt,
    }))
  const fromAssignments = stepAssignments.value
    .filter((a) => HISTORY_ASSIGNMENT_STATUSES.has(a.statusId))
    .map((a) => ({
      id: `assignment-${a.id}`,
      kind: 'assignment',
      who: a.userId,
      statusId: a.statusId,
      comment: null,
      at: a.updatedAt,
    }))
  return [...fromTasks, ...fromAssignments].sort(
    (a, b) => (b.at?.toMillis?.() ?? 0) - (a.at?.toMillis?.() ?? 0),
  )
})

function activityChipClass(statusId) {
  return (
    {
      REJECTED: 'tw:bg-red-100 tw:text-red-700',
      APPROVED: 'tw:bg-green-100 tw:text-green-700',
      CANCELLED: 'tw:bg-gray-100 tw:text-gray-600',
      REASSIGNED: 'tw:bg-blue-100 tw:text-blue-700',
      SENT_BACK: 'tw:bg-orange-100 tw:text-orange-700',
      CHANGES_REQUESTED: 'tw:bg-amber-100 tw:text-amber-700',
    }[statusId] ?? 'tw:bg-blue-100 tw:text-blue-700'
  )
}

function activityLabel(statusId) {
  return (
    {
      REJECTED: 'Rejected',
      APPROVED: 'Approved',
      CANCELLED: 'Cancelled',
      REASSIGNED: 'Reassigned',
      SENT_BACK: 'Sent back',
      CHANGES_REQUESTED: 'Changes requested',
    }[statusId] ?? (statusId || '').replace('_', ' ')
  )
}
</script>

<template>
  <div v-if="instanceStep" class="tw:bg-white tw:border tw:border-divider tw:rounded-lg tw:p-5">
    <!-- Header: step number + name + status badge + active assignee + inline actions -->
    <div
      class="tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-2 tw:pb-3 tw:border-b tw:border-divider tw:mb-4"
    >
      <div class="tw:flex tw:items-center tw:gap-2 tw:min-w-0">
        <span class="tw:text-xs tw:font-semibold tw:text-secondary tw:uppercase tw:tracking-wider">
          {{ displayNumber ?? instanceStep.stepNumber }}. {{ instanceStep.name || 'Step' }}
        </span>
        <BaseBadge class="tw:text-micro" :class="getStepStatusClass(instanceStep.statusId)">
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
          {{
            completing
              ? isApprovalStep
                ? 'Approving…'
                : 'Completing…'
              : isApprovalStep
                ? 'Approve'
                : 'Mark Complete'
          }}
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
          v-if="canReassign"
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
        <!-- Dropdown for the rest: REQUEST_INFO, reviewer-side SEND_BACK, etc.
             COMPLETE_AND_ADVANCE is hidden here (rendered inline above). -->
        <WorkflowStepActionsMenu
          :module="module"
          :instanceStepId="instanceStepId"
          :resourceId="resourceId"
          :isOwner="isOwner"
          :requireEsignature="requireEsignature"
          :hideOutcomes="['COMPLETE_AND_ADVANCE']"
        />
      </div>
    </div>

    <!-- Activity — per-step audit trail. Merges TaskInstance rows
         with comments (rejection reasons, reviewer notes) with
         UserOnWorkflowInstanceStep history rows (REASSIGNED /
         REJECTED / CANCELLED) so reassignments surface here too,
         even though they don't carry a free-text comment. Most
         recent first. Full audit log lives on the entity detail
         page's 'Audit Log' button. -->
    <div
      v-if="activity.length"
      class="tw:flex tw:flex-col tw:gap-2 tw:mb-4 tw:pb-4 tw:border-b tw:border-divider"
    >
      <BaseText variant="overline">Activity</BaseText>
      <div v-for="row in activity" :key="row.id" class="tw:flex tw:items-start tw:gap-2">
        <UserBadgeById v-if="row.who" :userId="row.who" />
        <div class="tw:flex tw:flex-col tw:gap-1 tw:flex-1 tw:min-w-0">
          <div class="tw:flex tw:items-center tw:gap-2 tw:flex-wrap">
            <span
              class="tw:text-micro tw:font-semibold tw:uppercase tw:tracking-wide tw:rounded tw:px-2 tw:py-0.5"
              :class="activityChipClass(row.statusId)"
            >
              {{ activityLabel(row.statusId) }}
            </span>
            <span class="tw:text-micro tw:text-secondary">
              {{ row.at?.formatDate?.('date-time') ?? '' }}
            </span>
          </div>
          <p v-if="row.comment" class="tw:text-sm tw:text-on-main tw:whitespace-pre-line">
            {{ row.comment }}
          </p>
        </div>
      </div>
    </div>

    <WorkflowInstanceEsignAuthDialog v-model="showEsignDialog" @verified="onEsignVerified" />

    <slot name="beforeForm" />

    <WorkflowStepForm
      ref="formRef"
      :module="module"
      :instanceStepId="instanceStepId"
      :resourceId="resourceId"
      :autoApprove="true"
      :hideSubmit="true"
    />

    <!-- Scoped slot exposes everything the per-module child-step component
         needs so the call site doesn't have to re-fetch the step / definition. -->
    <slot
      name="childSteps"
      :instanceStep="instanceStep"
      :stepDefinition="stepDefinition"
      :displayNumber="displayNumber ?? instanceStep?.stepNumber"
    />

    <!-- Cancel dialog -->
    <BaseDialog v-model="showCancelDialog" title="Cancel Step" maxWidth="md">
      <div class="tw:flex tw:flex-col tw:gap-4 tw:p-1">
        <div
          class="tw:flex tw:items-start tw:gap-3 tw:p-3 tw:rounded-lg tw:bg-red-50 tw:border tw:border-red-200"
        >
          <div class="tw:text-red-600 tw:shrink-0 tw:mt-0.5">⨯</div>
          <div class="tw:text-sm tw:text-red-800">
            Cancels this step and all of its open assignments / tasks. The workflow stops here —
            downstream steps stay where they are. Use this when the step is no longer needed.
          </div>
        </div>
        <BaseField v-slot="{ id: fieldId }" label="Reason" optional>
          <BaseTextarea
            :id="fieldId"
            v-model="cancelReason"
            :rows="3"
            placeholder="Why is this step being cancelled?"
          />
        </BaseField>
      </div>
      <template #footer="{ close }">
        <BaseDialogFooter
          submitLabel="Cancel Step"
          submitVariant="danger"
          :loading="cancelling"
          :disabled="cancelling"
          @cancel="close"
          @submit="handleCancelStep"
        />
      </template>
    </BaseDialog>

    <!-- Reopen dialog -->
    <BaseDialog v-model="showReopenDialog" title="Reopen Step" maxWidth="md">
      <div class="tw:flex tw:flex-col tw:gap-4 tw:p-1">
        <div
          class="tw:flex tw:items-start tw:gap-3 tw:p-3 tw:rounded-lg tw:bg-amber-50 tw:border tw:border-amber-200"
        >
          <div class="tw:text-amber-600 tw:shrink-0 tw:mt-0.5">⤺</div>
          <div class="tw:text-sm tw:text-amber-800">
            Sends the step back to its assignee for revision. The previous assignee gets a new task
            on this step. Downstream steps are not affected. Your feedback is recorded in the audit
            log.
          </div>
        </div>
        <BaseField v-slot="{ id: fieldId }" label="Feedback / Reason">
          <BaseTextarea
            :id="fieldId"
            v-model="reopenReason"
            :rows="3"
            placeholder="What needs to be revised on this step?"
          />
        </BaseField>
      </div>
      <template #footer="{ close }">
        <BaseDialogFooter
          submitLabel="Reopen Step"
          :loading="reopening"
          :disabled="!reopenReason.trim() || reopening"
          @cancel="close"
          @submit="handleReopen"
        />
      </template>
    </BaseDialog>
  </div>
</template>
