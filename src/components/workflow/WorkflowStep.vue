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
import {
  IconCheck,
  IconRefreshAlert,
  IconUserCheck,
  IconBan,
  IconClock,
  IconCalendarTime,
  IconCalendarX,
  IconInfoCircle,
  IconDeviceFloppy,
} from '@tabler/icons-vue'
import { post } from '@/api'
import { currentSession } from '@/utils/currentSession.js'
import { DELAY_PRESETS } from '@/components/workflow/delayPresets.js'
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
const currentUserId = computed(() => currentSession.value?.userId ?? currentSession.value?.id)

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

// A DELAY step is DESIGNED to outlive the record's close — that is the whole
// point of a deferred effectiveness check, and stepBlocksClose lets an armed
// one through for exactly that reason. So its own controls must not be gated on
// `resourceIsTerminal`: doing so hid Extend / Skip / Reschedule in precisely the
// situation they exist for, leaving a woken check on a closed CAPA with no way
// to push its date out (reported 2026-08-18).
//
// Abandonment is different from completion. A VOID or CANCELLED record means
// the work was dropped and there is nothing left to verify; a CLOSED one means
// the work finished and the check is the last outstanding piece of it.
const resourceAbandoned = computed(() =>
  ['VOID', 'CANCELLED'].includes(resource.value?.statusId),
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
  if (active) return active.userId
  // A not-yet-activated step still knows its planned reviewer — the PENDING
  // assignment row parked at submit. Without this fallback a "Final Approval ·
  // PENDING" step reads as anonymous (user report 2026-08-10).
  const pending = assignments.value.find((a) => a.statusId === 'PENDING')
  return pending?.userId || null
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
// ── Effectiveness verdict (DELAY steps) ──────────────────────────────────────
// A DELAY step is a deferred verification — "did the corrective action work?".
// When the template sets capturesEffectiveness the answer is a first-class field
// on the step (workflow_instance_steps.effectiveness_outcome), not a form field,
// so it is asked for HERE on the card rather than inside the step form. The
// server refuses to complete such a step without it.
const capturesEffectiveness = computed(() => !!instanceStep.value?.capturesEffectiveness)
const EFFECTIVENESS_OPTIONS = [
  { label: 'Effective', value: 'EFFECTIVE' },
  { label: 'Not effective', value: 'NOT_EFFECTIVE' },
]
const effectivenessOutcome = ref(null)
// Prefill when revisiting a step that already recorded one.
watch(
  () => instanceStep.value?.effectivenessOutcome,
  (v) => {
    if (v) effectivenessOutcome.value = v
  },
  { immediate: true },
)
const effectivenessMissing = computed(
  () => capturesEffectiveness.value && !effectivenessOutcome.value,
)

const completeDisabled = computed(() => childrenBlock.value || effectivenessMissing.value)
const completeDisabledReason = computed(() => {
  if (childrenBlock.value) return 'All sub-tasks must be completed before advancing'
  if (effectivenessMissing.value) return 'Record the effectiveness outcome first'
  return ''
})

// Instructions the template author wrote for this step. Plain text: the field
// is a single-line input in the builder, and rendering it as HTML would let
// authored content inject markup for no benefit.
const stepInstructions = computed(() => (instanceStep.value?.description ?? '').trim())

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

const savingDraft = ref(false)

/** Drive the form's own saveDraft from the step card's action row. */
async function onSaveDraftClick() {
  if (savingDraft.value) return
  savingDraft.value = true
  try {
    await formRef.value?.saveDraft()
  } finally {
    savingDraft.value = false
  }
}

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
      await formRef.value?.submit(
        esign,
        capturesEffectiveness.value
          ? { effectivenessOutcome: effectivenessOutcome.value }
          : null,
      )
    } else {
      const body = {
        action: 'COMPLETE_AND_ADVANCE',
        outcomeId: 'COMPLETE_AND_ADVANCE',
        ...(capturesEffectiveness.value
          ? { effectivenessOutcome: effectivenessOutcome.value }
          : {}),
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

// ─── Delay step (stepType DELAY) ─────────────────────────────────────────────
// A DELAY step parks SCHEDULED when the workflow reaches it. Like a CAPA
// effectiveness check, the record OWNER decides at runtime: schedule a wake-up
// date (or accept the template default), or SKIP the step (advance). When
// delayUntil is null the step is "awaiting scheduling" — no timer runs until
// the owner sets a date. Once the date arrives the worker mints the tasks and
// the step behaves like an ACTION step; from then it can be EXTENDED (capped
// by maxDelayExtensions) by the assignee (their task) or the owner.
const isDelayStep = computed(() => instanceStep.value?.stepType === 'DELAY')
const isScheduled = computed(() => instanceStep.value?.statusId === 'SCHEDULED')
const delayUntil = computed(() => instanceStep.value?.delayUntil ?? null)
const awaitingScheduling = computed(() => isScheduled.value && !delayUntil.value)
const delayCap = computed(() => instanceStep.value?.maxDelayExtensions ?? 1)
const delayExtensionsUsed = computed(() => instanceStep.value?.delayExtensionCount ?? 0)

// Pre-fire (SCHEDULED): owner sets/changes the wake date.
const canRescheduleDelay = computed(
  () => isDelayStep.value && isScheduled.value && props.isOwner && !resourceAbandoned.value,
)
// Skip ("check isn't needed") is valid pre-fire (SCHEDULED) AND post-fire
// (IN_PROGRESS) — the owner can drop the effectiveness step even after its
// task has opened.
const canSkipDelay = computed(
  () =>
    isDelayStep.value &&
    ['SCHEDULED', 'IN_PROGRESS'].includes(instanceStep.value?.statusId) &&
    props.isOwner &&
    !resourceAbandoned.value,
)
// Post-fire (IN_PROGRESS): owner or the assignee can extend, capped.
const canExtendDelay = computed(
  () =>
    isDelayStep.value &&
    instanceStep.value?.statusId === 'IN_PROGRESS' &&
    delayExtensionsUsed.value < delayCap.value &&
    !resourceAbandoned.value &&
    (props.isOwner || !!currentUserTask.value),
)

const delayApiPath = computed(
  () => `/v1/services/${props.module.apiPath}/${props.resourceId}/delayStepAction`,
)

// Schedule / reschedule dialog (owner, pre-fire)
const showScheduleDialog = ref(false)
const scheduleDays = ref(null)
const scheduleDate = ref(null)
const scheduling = ref(false)

function openScheduleDialog() {
  scheduleDays.value = null
  scheduleDate.value = null
  showScheduleDialog.value = true
}

async function handleSchedule() {
  if (scheduling.value || (!(scheduleDays.value >= 1) && !scheduleDate.value)) return
  scheduling.value = true
  try {
    await post(delayApiPath.value, {
      workflowInstanceStepId: props.instanceStepId,
      intent: 'SCHEDULE',
      delayDays: scheduleDate.value ? undefined : scheduleDays.value,
      delayUntilDate: scheduleDate.value ? scheduleDate.value.toFormat('yyyy-LL-dd') : undefined,
    })
    toast.success('Delay scheduled')
    showScheduleDialog.value = false
  } catch (e) {
    toast.error(e?.message || 'Failed to schedule delay')
  } finally {
    scheduling.value = false
  }
}

// Skip dialog (owner, pre-fire)
const showSkipDialog = ref(false)
const skipping = ref(false)

async function handleSkipDelay() {
  if (skipping.value) return
  skipping.value = true
  try {
    await post(delayApiPath.value, {
      workflowInstanceStepId: props.instanceStepId,
      intent: 'SKIP',
    })
    toast.success('Delay step skipped')
    showSkipDialog.value = false
  } catch (e) {
    toast.error(e?.message || 'Failed to skip delay step')
  } finally {
    skipping.value = false
  }
}

// Extend dialog (post-fire — owner step action or assignee task action)
const showExtendDialog = ref(false)
const extendDays = ref(null)
// Extend by a window OR to a fixed date — "push it 30 days" and "push it to the
// next management review" are both real answers. Mutually exclusive, date wins,
// same rule as scheduling.
const extendDate = ref(null)
const extendReason = ref('')
const extending = ref(false)

const extendTargetChosen = computed(() => !!extendDate.value || extendDays.value >= 1)

function openExtendDialog() {
  extendDays.value = null
  extendDate.value = null
  extendReason.value = ''
  showExtendDialog.value = true
}

async function handleExtendDelay() {
  if (extending.value || !extendTargetChosen.value || !extendReason.value.trim()) return
  extending.value = true
  try {
    // Assignee path: extend through the fired task (only ASSIGNED /
    // FORM_SUBMITTED tasks are actionable on the endpoint). Owner path:
    // the module's step action.
    const myTask = stepTasks.value.find(
      (t) =>
        t.assignedTo === currentUserId.value &&
        t.taskKindId === 'APPROVAL' &&
        ['ASSIGNED', 'FORM_SUBMITTED'].includes(t.statusId),
    )
    if (myTask) {
      await post(`/v1/services/taskInstances/${myTask.id}/action`, {
        action: 'EXTEND_DELAY',
        outcomeId: 'EXTEND_DELAY',
        extendByDays: extendDate.value ? undefined : extendDays.value,
        extendUntilDate: extendDate.value ? extendDate.value.toFormat('yyyy-LL-dd') : undefined,
        comment: extendReason.value.trim(),
      })
    } else {
      await post(delayApiPath.value, {
        workflowInstanceStepId: props.instanceStepId,
        intent: 'EXTEND',
        extendByDays: extendDate.value ? undefined : extendDays.value,
        extendUntilDate: extendDate.value ? extendDate.value.toFormat('yyyy-LL-dd') : undefined,
        reason: extendReason.value.trim(),
      })
    }
    toast.success('Delay extended')
    showExtendDialog.value = false
  } catch (e) {
    toast.error(e?.message || 'Failed to extend delay')
  } finally {
    extending.value = false
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
// Delay steps carry none of the routing actions (2026-08-18). A delay is not
// work anyone is doing yet — it is a timer waiting for a date — so Reassign,
// Cancel and Send back are noise on it. The only decisions that mean anything
// are Schedule / Extend / Skip, and Complete once it wakes. Reassigning is
// pointless too: the assignee defaults to the record owner, who is the person
// who would set the date anyway.
const canReassign = computed(
  () =>
    props.isOwner &&
    !isDelayStep.value &&
    REASSIGNABLE_STATUSES.includes(instanceStep.value?.statusId),
)
// Cancel likewise — Skip (advance the workflow) is the delay-step equivalent,
// and Cancel is a confusing near-duplicate for an effectiveness check.
const canCancelStep = computed(
  () =>
    props.isOwner &&
    !isDelayStep.value &&
    REASSIGNABLE_STATUSES.includes(instanceStep.value?.statusId),
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
    'tw:bg-indigo-100 tw:text-indigo-700': statusId === 'SCHEDULED',
    'tw:bg-green-100 tw:text-green-700': statusId === 'APPROVED',
    'tw:bg-red-100 tw:text-red-700': statusId === 'CANCELLED',
    'tw:bg-orange-100 tw:text-orange-700': statusId === 'SENT_BACK',
    'tw:bg-gray-100 tw:text-gray-500': statusId === 'SKIPPED',
  }
}

function getStatusLabel(statusId) {
  if (!statusId) return '—'
  if (statusId === 'APPROVED') return 'Completed'
  if (statusId === 'SKIPPED') return 'Skipped'
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
  <BaseCard v-if="instanceStep">
    <!-- Header: step number + name + status badge + active assignee + inline actions -->
    <div
      class="tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-2 tw:pb-3 tw:border-b tw:border-divider tw:mb-4"
    >
      <div class="tw:flex tw:items-center tw:gap-2 tw:min-w-0">
        <!-- Step title reads as a SECTION heading (user request 2026-08-14):
             it was `text-caption` uppercase secondary — the same weight as a
             field caption — so a step didn't stand out from the fields it
             contains. `subheading` is what FormSection/BaseSectionHeader give
             "CAPA Details" / "Disposition", so a step now sits at the same
             level as the page's other sections. -->
        <BaseHeading :level="3" as="subheading" truncate class="tw:min-w-0">
          {{ displayNumber ?? instanceStep.stepNumber }}. {{ instanceStep.name || 'Step' }}
        </BaseHeading>
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
          v-if="canRescheduleDelay"
          class="tw:flex tw:items-center tw:gap-1 tw:text-xs tw:text-indigo-700 tw:hover:underline tw:cursor-pointer tw:font-medium"
          :title="
            awaitingScheduling
              ? 'Set when this delay step should activate'
              : 'Change the activation date of this delay step'
          "
          @click="openScheduleDialog"
        >
          <IconCalendarTime :size="14" />
          {{ awaitingScheduling ? 'Schedule' : 'Reschedule' }}
        </button>
        <button
          v-if="canSkipDelay"
          class="tw:flex tw:items-center tw:gap-1 tw:text-xs tw:text-secondary tw:hover:underline tw:cursor-pointer tw:font-medium"
          title="Skip this delay step — the check isn't needed; advance the workflow"
          @click="showSkipDialog = true"
        >
          <IconCalendarX :size="14" />
          Skip
        </button>
        <button
          v-if="canExtendDelay"
          class="tw:flex tw:items-center tw:gap-1 tw:text-xs tw:text-indigo-700 tw:hover:underline tw:cursor-pointer tw:font-medium"
          title="Push this delay step's activation out by a number of days"
          @click="openExtendDialog"
        >
          <IconCalendarTime :size="14" />
          Extend
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
          :hideOutcomes="
            isDelayStep
              ? ['COMPLETE_AND_ADVANCE', 'SEND_BACK', 'REQUEST_INFO', 'REASSIGN', 'CANCEL']
              : ['COMPLETE_AND_ADVANCE']
          "
        />
      </div>
    </div>

    <!-- Delay banner — the step is parked. Either awaiting the owner's
         scheduling decision (no timer yet) or scheduled with a wake date. -->
    <div
      v-if="isScheduled && awaitingScheduling"
      class="tw:flex tw:items-start tw:gap-3 tw:p-3 tw:mb-4 tw:rounded-lg tw:bg-amber-50 tw:border tw:border-amber-200"
    >
      <IconClock :size="16" class="tw:text-amber-600 tw:shrink-0 tw:mt-0.5" />
      <div class="tw:text-sm tw:text-amber-900">
        <strong>Awaiting scheduling.</strong>
        This delay step won't activate until a date is set.
        <span v-if="isOwner"
          >Use <strong>Schedule</strong> to pick when its task is assigned, or
          <strong>Skip</strong> if the check isn't needed.</span
        >
        <span v-else>The record owner needs to schedule or skip it.</span>
      </div>
    </div>
    <div
      v-else-if="isScheduled"
      class="tw:flex tw:items-start tw:gap-3 tw:p-3 tw:mb-4 tw:rounded-lg tw:bg-indigo-50 tw:border tw:border-indigo-200"
    >
      <IconClock :size="16" class="tw:text-indigo-600 tw:shrink-0 tw:mt-0.5" />
      <div class="tw:text-sm tw:text-indigo-900">
        Scheduled — this step activates
        <strong>{{ delayUntil?.formatDate?.('date') ?? '…' }}</strong>
        and assigns its task then.
        <span class="tw:text-indigo-700">
          Extension {{ delayExtensionsUsed }}/{{ delayCap }} used.
        </span>
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

    <!-- The step's instructions, authored on the template. Snapshotted onto
         the instance at submit, and until now never rendered here — only the
         CAPA child step showed them, so instructions written for an NC or
         Change Control task were invisible to the person doing the work
         (reported 2026-08-16).

         Reads from the INSTANCE, not the live template: the snapshot is
         deliberate (F-05), so a step already in flight keeps the guidance it
         started under. A template edited today therefore shows on new
         submissions, not on runs already open. -->
    <div
      v-if="stepInstructions"
      class="tw:flex tw:items-start tw:gap-2 tw:rounded-lg tw:border tw:border-primary/20 tw:bg-primary/5 tw:p-3"
    >
      <IconInfoCircle :size="16" class="tw:text-primary tw:shrink-0 tw:mt-0.5" />
      <div class="tw:text-sm tw:text-on-main tw:min-w-0">{{ stepInstructions }}</div>
    </div>

    <!-- Chain of custody for this step: assigned → reassigned → completed,
         with the e-signature where there was one. Collapsed by default so it
         does not crowd an active step, but always present — a finished step
         used to show nothing at all about how it got there. -->
    <WorkflowStepHistory :instanceStepId="instanceStepId" />

    <slot name="beforeForm" />

    <!-- Effectiveness verdict. Sits on the CARD, not in the step form, because
         it is a first-class field on the step
         (workflow_instance_steps.effectiveness_outcome) rather than a form
         answer — which is what makes it queryable for the CAPA register. The
         server refuses to complete the step without it; completeDisabled
         mirrors that so the button explains itself instead of erroring. -->
    <div
      v-if="capturesEffectiveness"
      class="tw:flex tw:flex-col tw:gap-2 tw:rounded-lg tw:border tw:border-divider tw:bg-main-hover/30 tw:p-3"
    >
      <BaseLabel required>Was it effective?</BaseLabel>
      <SegmentedControl
        v-if="canActOnStep"
        v-model="effectivenessOutcome"
        :options="EFFECTIVENESS_OPTIONS"
      />
      <div v-else-if="instanceStep.effectivenessOutcome" class="tw:text-sm tw:text-on-main">
        {{
          instanceStep.effectivenessOutcome === 'EFFECTIVE' ? 'Effective' : 'Not effective'
        }}
      </div>
      <BaseText v-else color="secondary" class="tw:text-sm">Not yet recorded</BaseText>
      <BaseCaption>
        Recorded against the step itself, so it reports on the record list.
      </BaseCaption>
    </div>

    <WorkflowStepForm
      ref="formRef"
      :module="module"
      :instanceStepId="instanceStepId"
      :resourceId="resourceId"
      :autoApprove="true"
      :hideSubmit="true"
    />

    <!-- Second Complete/Approve, below the form (user request 2026-08-16).
         The header one stays — it is where you look to see whether the step is
         actionable at all — but after filling a long form the action is off
         screen, and scrolling back up to finish reads as a dead end. Same
         handler, same disabled state and reason, so the two can never disagree
         about whether the step can be completed. -->
    <div v-if="canActOnStep" class="tw:flex tw:justify-end tw:gap-2 tw:pt-1">
      <!-- Save draft lives here, not inside the form, so the two actions read
           as one row rather than stacking (user request 2026-08-18). The form
           still owns the behaviour — this calls its exposed saveDraft(). -->
      <BaseButton
        v-if="formRequired && formRef?.canSaveDraft"
        variant="outline"
        :disabled="savingDraft || completing"
        :isLoading="savingDraft"
        @click="onSaveDraftClick"
      >
        <template #icon><IconDeviceFloppy :size="16" /></template>
        Save draft
      </BaseButton>
      <BaseButton
        :disabled="completeDisabled || completing"
        :isLoading="completing"
        :title="completeDisabledReason || undefined"
        @click="onCompleteAndAdvanceClick"
      >
        <template #icon><IconCheck :size="16" /></template>
        {{
          completing
            ? isApprovalStep
              ? 'Approving…'
              : 'Completing…'
            : isApprovalStep
              ? 'Approve'
              : 'Mark Complete'
        }}
      </BaseButton>
    </div>

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

    <!-- Schedule / reschedule delay dialog (owner, pre-fire) -->
    <BaseDialog
      v-model="showScheduleDialog"
      :title="awaitingScheduling ? 'Schedule Delay Step' : 'Reschedule Delay Step'"
      maxWidth="md"
    >
      <div class="tw:flex tw:flex-col tw:gap-4 tw:p-1">
        <div
          class="tw:flex tw:items-start tw:gap-3 tw:p-3 tw:rounded-lg tw:bg-indigo-50 tw:border tw:border-indigo-200"
        >
          <IconCalendarTime :size="16" class="tw:text-indigo-600 tw:shrink-0 tw:mt-0.5" />
          <div class="tw:text-sm tw:text-indigo-900">
            Choose when this step activates and assigns its task — a window from today or a specific
            date. Nothing is assigned until then.
          </div>
        </div>
        <BaseField v-slot="{ id: fieldId }" label="Activate after">
          <div class="tw:flex tw:flex-wrap tw:items-center tw:gap-2">
            <button
              v-for="preset in DELAY_PRESETS"
              :key="preset.days"
              type="button"
              class="tw:px-3 tw:py-1 tw:rounded-full tw:text-xs tw:font-medium tw:border tw:transition-colors"
              :class="
                scheduleDays === preset.days && !scheduleDate
                  ? 'tw:bg-primary tw:text-white tw:border-primary'
                  : 'tw:bg-white tw:text-secondary tw:border-divider tw:hover:bg-main-hover'
              "
              @click="((scheduleDays = preset.days), (scheduleDate = null))"
            >
              {{ preset.label }}
            </button>
            <BaseTextInput
              :id="fieldId"
              v-model.number="scheduleDays"
              type="number"
              placeholder="Custom"
              inputClass="tw:w-24"
              :min="1"
              @input="scheduleDate = null"
            />
            <span class="tw:text-xs tw:font-medium tw:text-secondary">days from today</span>
          </div>
        </BaseField>
        <BaseField label="…or on a specific date">
          <BaseDateField
            v-model="scheduleDate"
            mode="date"
            clearable
            @update:modelValue="(v) => v && (scheduleDays = null)"
          />
        </BaseField>
      </div>
      <template #footer="{ close }">
        <BaseDialogFooter
          :submitLabel="awaitingScheduling ? 'Schedule' : 'Reschedule'"
          :loading="scheduling"
          :disabled="scheduling || (!(scheduleDays >= 1) && !scheduleDate)"
          @cancel="close"
          @submit="handleSchedule"
        />
      </template>
    </BaseDialog>

    <!-- Skip delay dialog (owner, pre-fire) -->
    <BaseDialog v-model="showSkipDialog" title="Skip Delay Step" maxWidth="md">
      <div class="tw:flex tw:flex-col tw:gap-4 tw:p-1">
        <div
          class="tw:flex tw:items-start tw:gap-3 tw:p-3 tw:rounded-lg tw:bg-amber-50 tw:border tw:border-amber-200"
        >
          <IconCalendarX :size="16" class="tw:text-amber-600 tw:shrink-0 tw:mt-0.5" />
          <div class="tw:text-sm tw:text-amber-900">
            Skips this delay step and advances the workflow to the next step.
            <template v-if="instanceStep?.statusId === 'IN_PROGRESS'">
              The open effectiveness-check task will be cancelled.
            </template>
            Use this when the deferred check (e.g. an effectiveness check) isn't needed for this
            record.
          </div>
        </div>
      </div>
      <template #footer="{ close }">
        <BaseDialogFooter
          submitLabel="Skip Step"
          :loading="skipping"
          :disabled="skipping"
          @cancel="close"
          @submit="handleSkipDelay"
        />
      </template>
    </BaseDialog>

    <!-- Extend delay dialog -->
    <BaseDialog v-model="showExtendDialog" title="Extend Delay" maxWidth="md">
      <div class="tw:flex tw:flex-col tw:gap-4 tw:p-1">
        <div
          class="tw:flex tw:items-start tw:gap-3 tw:p-3 tw:rounded-lg tw:bg-indigo-50 tw:border tw:border-indigo-200"
        >
          <IconClock :size="16" class="tw:text-indigo-600 tw:shrink-0 tw:mt-0.5" />
          <div class="tw:text-sm tw:text-indigo-900">
            Pushes this step's activation out from today by the number of days you choose. Any open
            task on the step is superseded and a fresh one is assigned when the new time arrives.
            <strong>Extension {{ delayExtensionsUsed }}/{{ delayCap }} used.</strong>
          </div>
        </div>
        <BaseField v-slot="{ id: fieldId }" label="Extend by">
          <div class="tw:flex tw:flex-wrap tw:items-center tw:gap-2">
            <button
              v-for="preset in DELAY_PRESETS"
              :key="preset.days"
              type="button"
              class="tw:px-3 tw:py-1 tw:rounded-full tw:text-xs tw:font-medium tw:border tw:transition-colors"
              :class="
                extendDays === preset.days
                  ? 'tw:bg-primary tw:text-white tw:border-primary'
                  : 'tw:bg-white tw:text-secondary tw:border-divider tw:hover:bg-main-hover'
              "
              @click="((extendDays = preset.days), (extendDate = null))"
            >
              {{ preset.label }}
            </button>
            <BaseTextInput
              :id="fieldId"
              v-model.number="extendDays"
              type="number"
              placeholder="Custom"
              inputClass="tw:w-24"
              :min="1"
              @input="extendDate = null"
            />
            <span class="tw:text-xs tw:font-medium tw:text-secondary">days from today</span>
          </div>
        </BaseField>
        <BaseField label="…or extend to a specific date">
          <div class="tw:flex tw:items-center tw:gap-2">
            <BaseDateField
              v-model="extendDate"
              mode="date"
              clearable
              @update:modelValue="(v) => v && (extendDays = null)"
            />
            <span class="tw:text-xs tw:font-medium tw:text-secondary">
              Fixed calendar date (overrides the window)
            </span>
          </div>
        </BaseField>
        <BaseField v-slot="{ id: fieldId }" label="Reason">
          <BaseTextarea
            :id="fieldId"
            v-model="extendReason"
            :rows="3"
            placeholder="Why is the delay being extended?"
          />
        </BaseField>
      </div>
      <template #footer="{ close }">
        <BaseDialogFooter
          submitLabel="Extend Delay"
          :loading="extending"
          :disabled="!extendTargetChosen || !extendReason.trim() || extending"
          @cancel="close"
          @submit="handleExtendDelay"
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
  </BaseCard>
</template>
