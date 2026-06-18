<script setup>
import {
  IconUserCheck,
  IconCheck,
  IconChevronDown,
  IconChevronRight,
  IconLoader2,
  IconAlertTriangle,
  IconArrowBackUp,
  IconRefreshAlert,
  IconBan,
} from '@tabler/icons-vue'
import { post } from '@/api'
import { currentSession } from '@/utils/currentSession.js'
import { DateTime } from 'luxon'
import WorkflowStepActionsMenu from '@/components/workflow/WorkflowStepActionsMenu.vue'
import WorkflowStepForm from '@/components/workflow/WorkflowStepForm.vue'
import { CAPA_MODULE } from '@/components/workflow/workflowModule.js'

/**
 * Single ad-hoc / template-spawned child task card under a parent CAPA stage.
 * Mirrors the main CAPA step card (CapaWorkflowStep) but with a narrower
 * action surface — only "Complete & Advance" and "Reassign" in the header,
 * per product ask. Body holds the form, collapsed by default for everyone
 * except the assignee with an actionable task on this row.
 */

const props = defineProps({
  instanceStepId: { type: String, required: true },
  capaId: { type: String, required: true },
  isOwner: { type: Boolean, default: false },
  displayNumber: { type: String, default: null },
})

const emit = defineEmits(['reassign'])

const toast = useToast()
const currentUserId = computed(() => currentSession.value?.id ?? currentSession.value?.userId)

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

const formSchema = computed(() => instanceStep.value?.formSchema || [])
const hasForm = computed(() => formSchema.value.length > 0)

const assignments = useLiveQueryWithDeps(
  [() => props.instanceStepId],
  async (db, [id]) => {
    if (!id) return []
    return db.UserOnWorkflowInstanceStep.where('workflowInstanceStepId', id).exec()
  },

  { models: ['UserOnWorkflowInstanceStep'], initial: [] },
)

const activeAssigneeId = computed(() => {
  const active = assignments.value.find(
    (a) => a.statusId === 'ASSIGNED' || a.statusId === 'PENDING',
  )
  return active?.userId || null
})

// Current user's task on this child step — needed to decide whether the
// "Complete & Advance" header button shows and what payload to send.
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
  { models: ['TaskInstance'] },
)

const isAssignee = computed(() => !!currentUserTask.value)

const REASSIGNABLE_STATUSES = ['PENDING', 'IN_PROGRESS', 'SENT_BACK']
const canReassign = computed(
  () => props.isOwner && REASSIGNABLE_STATUSES.includes(instanceStep.value?.statusId),
)

// CAPA status — reopen is blocked once the CAPA is terminal.
const capa = useLiveQueryWithDeps(
  [() => props.capaId],
  async (db, [id]) => (id ? db.Capa.findByPk(id) : null),
  { models: ['Capa'] },
)
const capaIsTerminal = computed(
  () => capa.value?.statusId === 'CLOSED' || capa.value?.statusId === 'CANCELLED',
)

// Permission for reopen on a child step: CAPA owner OR anyone who held
// the parent step's reviewer assignment (currently ASSIGNED or formerly
// APPROVED). The backend re-checks; this is just UI gating.
const parentReviewerAssignment = useLiveQueryWithDeps(
  [() => instanceStep.value?.parentInstanceStepId, () => currentUserId.value],

  async (db, [parentInstanceStepId, userId]) => {
    if (!parentInstanceStepId || !userId) return null
    const rows = await db.UserOnWorkflowInstanceStep.where(
      'workflowInstanceStepId',
      parentInstanceStepId,
    ).exec()
    return (
      rows.find(
        (r) => r.userId === userId && (r.statusId === 'ASSIGNED' || r.statusId === 'APPROVED'),
      ) ?? null
    )
  },
  { models: ['UserOnWorkflowInstanceStep'] },
)
const isParentReviewer = computed(() => !!parentReviewerAssignment.value)
const canReopen = computed(
  () =>
    (props.isOwner || isParentReviewer.value) &&
    instanceStep.value?.statusId === 'APPROVED' &&
    !capaIsTerminal.value,
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

// ─── Cancel child task (CAPA owner) ──────────────────────────────────────────
// A cancelled child sub-task no longer blocks its parent stage — the
// backend's assertChildStepsApproved treats CANCELLED + SKIPPED as
// terminal alongside APPROVED.
const canCancelStep = computed(
  () =>
    props.isOwner && ['PENDING', 'IN_PROGRESS', 'SENT_BACK'].includes(instanceStep.value?.statusId),
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
    toast.success('Task cancelled')
    showCancelDialog.value = false
  } catch (e) {
    toast.error(e?.message || 'Failed to cancel task')
  } finally {
    cancelling.value = false
  }
}

// E-signature: ad-hoc children carry the flag on the instance row, template-
// spawned ones inherit via stepId. Same fallback the main step card uses.
const requireEsignature = computed(
  () => !!(instanceStep.value?.requireEsignature ?? stepDefinition.value?.requireEsignature),
)

// ─── Due / overdue ───────────────────────────────────────────────────────────
// Effective SLA falls back to `company.settings.defaultSla` when the step
// doesn't carry its own value. This is display-only — the backend persists
// whatever slaDays was provided at addChildStep time; if the controller
// later starts defaulting from company settings the column would already
// be populated and the fallback would never kick in.
const company = useLiveQuery(
  async (db) => {
    const all = await db.Company.where().exec()
    return all[0] ?? null
  },
  { models: ['Company'] },
)

const effectiveSlaDays = computed(
  () => instanceStep.value?.slaDays ?? company.value?.settings?.defaultSla ?? null,
)

const dueDate = computed(() => {
  const step = instanceStep.value
  if (!step?.startedAt || !effectiveSlaDays.value) return null
  return step.startedAt.plus({ days: effectiveSlaDays.value })
})

const overdue = computed(() => {
  if (instanceStep.value?.statusId !== 'IN_PROGRESS') return false
  return !!dueDate.value && dueDate.value < DateTime.now()
})

const daysOverdue = computed(() => {
  if (!overdue.value || !dueDate.value) return 0
  return Math.floor(DateTime.now().diff(dueDate.value, 'days').days)
})

// ─── Status display ──────────────────────────────────────────────────────────
// Status badge now reflects the literal step status — overdue is conveyed
// via the separate due-date chip so the two signals don't collide.
function getStepStatusClass(statusId) {
  return {
    IN_PROGRESS: 'tw:bg-blue-100 tw:text-blue-700',
    PENDING: 'tw:bg-gray-100 tw:text-gray-600',
    APPROVED: 'tw:bg-green-100 tw:text-green-700',
    CANCELLED: 'tw:bg-red-100 tw:text-red-700',
    SENT_BACK: 'tw:bg-orange-100 tw:text-orange-700',
  }[statusId]
}
function getStatusLabel(statusId) {
  if (!statusId) return '—'
  if (statusId === 'APPROVED') return 'Done'
  if (statusId === 'IN_PROGRESS') return 'In progress'
  if (statusId === 'SENT_BACK') return 'Sent back'
  if (statusId === 'PENDING') return 'Pending'
  return statusId.replace('_', ' ')
}

// ─── Expand / collapse ───────────────────────────────────────────────────────
// Default: expand for the user who actually has an actionable task on this
// step (they need to fill the form). Collapsed for everyone else so the
// parent stage stays scannable; click the chevron to drill in.
const expanded = ref(false)
watch(
  isAssignee,
  (v) => {
    if (v) expanded.value = true
  },
  { immediate: true },
)

// ─── Complete & Advance flow ─────────────────────────────────────────────────
const formRef = ref(null)
const submitting = ref(false)
const showEsignDialog = ref(false)

function onCompleteClick() {
  if (!currentUserTask.value) return
  if (requireEsignature.value) {
    showEsignDialog.value = true
  } else {
    performComplete()
  }
}

function onEsignVerified({ method, provider, token }) {
  showEsignDialog.value = false
  performComplete({ method, provider, token })
}

async function performComplete(esign = null) {
  if (submitting.value || !currentUserTask.value) return
  submitting.value = true
  try {
    if (hasForm.value) {
      // Form's submit(esign) (autoApprove=true) saves + submits + completes
      // the task in one round trip. Forward the esign payload so the backend
      // verifies the signature when the child step requires it — matching
      // the parent-step path in WorkflowStep.vue.
      await formRef.value?.submit(esign)
    } else {
      // No form to fill — go straight to the action endpoint.
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
    submitting.value = false
  }
}
</script>

<template>
  <div
    v-if="instanceStep"
    class="tw:bg-white tw:border tw:rounded-lg"
    :class="
      overdue
        ? 'tw:border-red-200 tw:bg-red-50/40'
        : instanceStep.statusId === 'IN_PROGRESS'
          ? 'tw:border-blue-200 tw:bg-blue-50/30'
          : 'tw:border-divider'
    "
  >
    <!-- Header — always visible -->
    <div class="tw:flex tw:items-center tw:gap-3 tw:px-4 tw:py-2.5">
      <!-- Status icon -->
      <div class="tw:shrink-0">
        <div
          v-if="instanceStep.statusId === 'APPROVED'"
          class="tw:size-6 tw:rounded-full tw:bg-green-500 tw:flex tw:items-center tw:justify-center"
        >
          <IconCheck :size="14" class="tw:text-white" stroke-width="3" />
        </div>
        <div
          v-else-if="overdue"
          class="tw:size-6 tw:rounded-full tw:bg-red-100 tw:flex tw:items-center tw:justify-center"
        >
          <IconAlertTriangle :size="14" class="tw:text-red-600" />
        </div>
        <div
          v-else-if="instanceStep.statusId === 'IN_PROGRESS'"
          class="tw:size-6 tw:rounded-full tw:border-2 tw:border-blue-400 tw:flex tw:items-center tw:justify-center"
        >
          <IconLoader2 :size="14" class="tw:text-blue-600 tw:animate-spin" />
        </div>
        <div
          v-else-if="instanceStep.statusId === 'SENT_BACK'"
          class="tw:size-6 tw:rounded-full tw:border-2 tw:border-amber-400 tw:flex tw:items-center tw:justify-center"
        >
          <IconArrowBackUp :size="14" class="tw:text-amber-600" />
        </div>
        <div v-else class="tw:size-6 tw:rounded-full tw:border-2 tw:border-gray-300 tw:bg-white" />
      </div>

      <!-- Title block -->
      <button
        type="button"
        class="tw:flex tw:items-center tw:gap-2 tw:flex-1 tw:min-w-0 tw:text-left tw:bg-transparent tw:border-0 tw:cursor-pointer tw:py-0.5"
        @click="expanded = !expanded"
      >
        <IconChevronDown v-if="expanded" :size="14" class="tw:text-secondary tw:shrink-0" />
        <IconChevronRight v-else :size="14" class="tw:text-secondary tw:shrink-0" />
        <span class="tw:text-sm tw:font-semibold tw:text-on-main tw:truncate">
          {{ displayNumber }}. {{ instanceStep.name || 'Step' }}
        </span>
        <BaseBadge class="tw:text-micro" :class="getStepStatusClass(instanceStep.statusId)">
          {{ getStatusLabel(instanceStep.statusId) }}
        </BaseBadge>
        <BaseBadge
          v-if="dueDate && instanceStep.statusId === 'IN_PROGRESS'"
          class="tw:text-micro"
          :class="
            overdue
              ? 'tw:bg-red-100 tw:text-red-700 tw:font-semibold'
              : 'tw:bg-gray-100 tw:text-gray-600'
          "
        >
          <template v-if="overdue"> Overdue · {{ daysOverdue }}d </template>
          <template v-else> Due {{ dueDate.formatDate('date') }} </template>
        </BaseBadge>
      </button>

      <!-- Right cluster: assignee + Complete & Advance + Reassign -->
      <div class="tw:flex tw:items-center tw:gap-2 tw:shrink-0">
        <UserAvatarById
          v-if="activeAssigneeId"
          :userId="activeAssigneeId"
          :showCardOnClick="true"
          class="tw:size-7"
          @click.stop
        />
        <button
          v-if="isAssignee"
          class="tw:flex tw:items-center tw:gap-1 tw:text-xs tw:text-green-700 tw:hover:underline tw:cursor-pointer tw:font-medium tw:disabled:opacity-50 tw:disabled:cursor-not-allowed"
          :disabled="submitting"
          @click.stop="onCompleteClick"
        >
          <IconCheck :size="14" />
          {{ submitting ? 'Completing…' : 'Mark Complete' }}
        </button>
        <button
          v-if="canReassign"
          class="tw:flex tw:items-center tw:gap-1 tw:text-xs tw:text-primary tw:hover:underline tw:cursor-pointer tw:font-medium"
          @click.stop="emit('reassign', instanceStepId)"
        >
          <IconUserCheck :size="14" />
          Reassign
        </button>
        <button
          v-if="canReopen"
          class="tw:flex tw:items-center tw:gap-1 tw:text-xs tw:text-amber-700 tw:hover:underline tw:cursor-pointer tw:font-medium"
          title="Reopen this task and send it back to the assignee with feedback"
          @click.stop="openReopenDialog"
        >
          <IconRefreshAlert :size="14" />
          Reopen
        </button>
        <button
          v-if="canCancelStep"
          class="tw:flex tw:items-center tw:gap-1 tw:text-xs tw:text-red-600 tw:hover:underline tw:cursor-pointer tw:font-medium tw:disabled:opacity-50"
          :disabled="cancelling"
          @click.stop="openCancelDialog"
        >
          <IconBan :size="14" />
          {{ cancelling ? 'Cancelling…' : 'Cancel' }}
        </button>
        <!-- Assignee-side outcomes for child tasks. SEND_BACK is the only
             one rendered now (REASSIGN / CANCEL / REQUEST_INFO are hidden
             at the menu level), so this is effectively the "reject task
             back to owner" entry point for child sub-tasks. -->
        <div @click.stop>
          <WorkflowStepActionsMenu
            :module="CAPA_MODULE"
            :instanceStepId="instanceStepId"
            :resourceId="capaId"
            :isOwner="isOwner"
            :requireEsignature="requireEsignature"
            :hideOutcomes="['COMPLETE_AND_ADVANCE']"
          />
        </div>
      </div>
    </div>

    <!-- Body — collapsible. Holds the instructions + form (editable for the
         assignee, readonly for everyone else). -->
    <div v-if="expanded" class="tw:px-4 tw:pb-4 tw:pt-3 tw:border-t tw:border-divider">
      <!-- Instructions: stored on instanceStep.description. Dialog-added
           steps emit HTML (Tiptap); template-authored steps emit plain
           text from the BaseTextarea. v-html handles both — plain text
           with no tags renders as-is. -->
      <div v-if="instanceStep.description" class="tw:mb-3">
        <BaseText variant="overline" class="tw:block tw:mb-1">Instructions</BaseText>
        <div
          class="tw:text-sm tw:text-on-main tw:leading-relaxed"
          v-html="instanceStep.description"
        />
      </div>
      <WorkflowStepForm
        ref="formRef"
        :module="CAPA_MODULE"
        :instanceStepId="instanceStepId"
        :resourceId="capaId"
        :autoApprove="true"
        :hideSubmit="true"
      />
      <div
        v-if="!hasForm && !instanceStep.description"
        class="tw:text-xs tw:text-secondary tw:italic tw:py-1"
      >
        No form on this task — clicking "Complete &amp; Advance" closes it.
      </div>
    </div>

    <WorkflowInstanceEsignAuthDialog v-model="showEsignDialog" @verified="onEsignVerified" />

    <BaseDialog v-model="showCancelDialog" title="Cancel Task" maxWidth="md">
      <div class="tw:flex tw:flex-col tw:gap-4 tw:p-1">
        <div
          class="tw:flex tw:items-start tw:gap-3 tw:p-3 tw:rounded-lg tw:bg-red-50 tw:border tw:border-red-200"
        >
          <div class="tw:text-red-600 tw:shrink-0 tw:mt-0.5">⨯</div>
          <div class="tw:text-sm tw:text-red-800">
            Cancels this sub-task. Any open assignment and task instance for it is closed. The
            parent stage's "all sub-tasks done" check will then treat this one as completed.
          </div>
        </div>
        <BaseField v-slot="{ id: fieldId }" label="Reason" optional>
          <BaseTextarea
            :id="fieldId"
            v-model="cancelReason"
            :rows="3"
            placeholder="Why is this sub-task being cancelled?"
          />
        </BaseField>
      </div>
      <template #footer="{ close }">
        <BaseDialogFooter
          submitLabel="Cancel Task"
          submitVariant="danger"
          :loading="cancelling"
          @cancel="close"
          @submit="handleCancelStep"
        />
      </template>
    </BaseDialog>

    <BaseDialog v-model="showReopenDialog" title="Reopen Task" maxWidth="md">
      <div class="tw:flex tw:flex-col tw:gap-4 tw:p-1">
        <div
          class="tw:flex tw:items-start tw:gap-3 tw:p-3 tw:rounded-lg tw:bg-amber-50 tw:border tw:border-amber-200"
        >
          <div class="tw:text-amber-600 tw:shrink-0 tw:mt-0.5">⤺</div>
          <div class="tw:text-sm tw:text-amber-800">
            Sends this task back to its assignee for revision. They get a fresh task on this step
            and can edit their existing answers. Other tasks are not affected. Your feedback is
            recorded in the audit log.
          </div>
        </div>
        <BaseField v-slot="{ id: fieldId }" label="Feedback / Reason">
          <BaseTextarea
            :id="fieldId"
            v-model="reopenReason"
            :rows="3"
            placeholder="What needs to be revised on this task?"
          />
        </BaseField>
      </div>
      <template #footer="{ close }">
        <BaseDialogFooter
          submitLabel="Reopen Task"
          :loading="reopening"
          :disabled="!reopenReason.trim()"
          @cancel="close"
          @submit="handleReopen"
        />
      </template>
    </BaseDialog>
  </div>
</template>
