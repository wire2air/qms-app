<script setup>
import {
  IconUserCheck,
  IconArrowBackUp,
  IconDeviceFloppy,
  IconRefreshAlert,
  IconCheck,
  IconBan,
} from '@tabler/icons-vue'
import DynamicForm from '@/components/form/DynamicForm.js'
import FormSchemaReadonlyView from '@/components/form/FormSchemaReadonlyView.vue'
import { currentSession } from '@/utils/currentSession.js'
import { db } from '@models/index'
import { DateTime } from 'luxon'
import { post } from '@/api'
import { freezeOptionLabels } from '@/utils/freezeFormPayloadLabels.js'

const props = defineProps({
  instanceStepId: { type: String, required: true },
  ncId: { type: String, required: true },
  isOwner: { type: Boolean, default: false },
  hasSendBackTargets: { type: Boolean, default: false },
})

const emit = defineEmits(['reassign', 'sendBack'])

const toast = useToast()
const currentUserId = computed(() => currentSession.value?.userId)

// ─── Step instance + definition ──────────────────────────────────────────────
const nc = useLiveQueryWithDeps(
  [() => props.ncId],
  async (db, [id]) => (id ? db.Nonconformance.findByPk(id) : null),
)

const instanceStep = useLiveQueryWithDeps(
  [() => props.instanceStepId],
  async (db, [id]) => (id ? db.WorkflowInstanceStep.findByPk(id) : null),
)

const stepDefinition = useLiveQueryWithDeps(
  [() => instanceStep.value?.stepId],
  async (db, [stepId]) => (stepId ? db.WorkflowStep.findByPk(stepId) : null),
)

// APPROVAL steps don't render a form — they're pure approve/reject.
// Suppress regardless of what's stamped on instanceStep.formSchema so
// any leftover schema from the old auto-seed (WorkflowStepList /
// WorkflowCreateDialog used to pre-fill the TASK template on every
// new step) doesn't surface at runtime.
const isApprovalStep = computed(() => instanceStep.value?.stepType === 'APPROVAL')
const formSchema = computed(() =>
  isApprovalStep.value ? [] : instanceStep.value?.formSchema || [],
)
const hasForm = computed(() => formSchema.value.length > 0)

// ─── Assignments + users ─────────────────────────────────────────────────────
const assignments = useLiveQueryWithDeps(
  [() => props.instanceStepId],
  async (db, [id]) => {
    if (!id) return []
    return db.UserOnWorkflowInstanceStep.where('workflowInstanceStepId', id).exec()
  },
  { initial: [] },
)

const usersMap = useLiveQueryWithDeps(
  [() => assignments.value.map((a) => a.userId).join(',')],
  async (db, [userIdsStr]) => {
    if (!userIdsStr) return {}
    const userIds = [...new Set(userIdsStr.split(','))]
    const users = await Promise.all(userIds.map((id) => db.User.findByPk(id)))
    return Object.fromEntries(users.filter(Boolean).map((u) => [u.id, u]))
  },
  { initial: {} },
)

// ─── NC records for this step ────────────────────────────────────────────────
const records = useLiveQueryWithDeps(
  [() => props.instanceStepId, () => props.ncId],
  async (db, [stepInstanceId, ncId]) => {
    if (!stepInstanceId || !ncId) return []
    const all = await db.NcRecord.where('workflowInstanceStepId', stepInstanceId).exec()
    return all.filter((r) => r.ncId === ncId)
  },
  { initial: [] },
)

const currentUserRecord = computed(
  () => records.value.find((r) => r.userId === currentUserId.value) || null,
)

const submittedRecords = computed(() => records.value.filter((r) => r.submittedAt))

// ─── Current user's task on this step ────────────────────────────────────────
// Only ACTIVE task statuses qualify. A REJECTED / APPROVED / REASSIGNED /
// CANCELLED row is history — picking it up would make the form lock and
// disable all the action buttons even though the user has no live task.
// Critical for the owner=assignee case: after rejecting their own task,
// the owner still needs the step's owner-side controls (Reassign etc.).
const ACTIVE_TASK_STATUSES = ['ASSIGNED', 'FORM_SUBMITTED', 'PENDING']
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
          ACTIVE_TASK_STATUSES.includes(t.statusId),
      ) || null
    )
  },
)

// Editability: user can create / update the NcRecord while their task is
// still in ASSIGNED state. Once the task transitions (submitted, approved,
// rejected, reassigned, cancelled), the form locks.
const isEditable = computed(() => currentUserTask.value?.statusId === 'ASSIGNED')
const canActOnStep = computed(() => isEditable.value)

// ─── Form state — local working copy, seeded once from the IDB record ────────
const formData = ref({})
const saving = ref(false)
let formSeeded = false

watch(
  [currentUserRecord, nc],
  ([record, ncRecord]) => {
    if (record && !formSeeded) {
      formData.value = {
        ...(record.payload || {}),
        _parent_problem: ncRecord?.description ?? '',
      }
      formSeeded = true
    }
  },
  { immediate: true },
)

// Keep the NC description in sync if the NC is updated after the form is seeded
watch(nc, (ncRecord) => {
  if (formSeeded) {
    formData.value._parent_problem = ncRecord?.description ?? ''
  }
})

async function persistRecord({ submit, esign }) {
  if (saving.value) return false
  if (!currentUserTask.value) {
    toast.error('No task assigned to you for this step')
    return false
  }
  if (!instanceStep.value) return false
  saving.value = true
  try {
    // Strip context-only keys (prefixed with _nc_) before persisting
    const { _parent_problem: _1, ...rawPayload } = formData.value || {}
    // Freeze OptionSet labels onto the payload so the saved record
    // displays the label that was current at submit time even if an
    // admin later edits the underlying OptionSet (see
    // utils/freezeFormPayloadLabels.js). Skipped if the form schema
    // has no option-set-backed fields.
    const payload = await freezeOptionLabels(db, formSchema.value, rawPayload)
    const existing = currentUserRecord.value
    const submittedAt = submit ? DateTime.now() : (existing?.submittedAt ?? null)
    if (existing) {
      existing.payload = payload
      if (submit) existing.submittedAt = submittedAt
      await existing.save()
    } else {
      const record = db.NcRecord.create({
        ncId: props.ncId,
        workflowInstanceStepId: props.instanceStepId,
        taskInstanceId: currentUserTask.value.id,
        payload,
        submittedAt,
      })
      await record.save()
    }

    // autoApprove flow: when the header's Mark Complete drives the
    // submit, fire the COMPLETE_AND_ADVANCE action immediately after the
    // record save so save+submit+approve happen in a single click.
    if (submit && currentUserTask.value.statusId === 'ASSIGNED') {
      const body = {
        action: 'COMPLETE_AND_ADVANCE',
        outcomeId: 'COMPLETE_AND_ADVANCE',
      }
      if (esign?.method) body.method = esign.method
      if (esign?.token) body.token = esign.token
      if (esign?.provider) body.provider = esign.provider
      await post(`/v1/services/taskInstances/${currentUserTask.value.id}/action`, body)
      toast.success('Step marked complete')
      return true
    }

    toast.success('Draft saved')
    return true
  } catch (e) {
    toast.error(e.message || 'Failed to save form')
    return false
  } finally {
    saving.value = false
  }
}

function saveDraft() {
  return persistRecord({ submit: false })
}

// ─── Mark Complete (per-step Complete & Advance) ─────────────────────────────
// The form's Submit button is gone — Mark Complete in the header drives
// save + submit + COMPLETE_AND_ADVANCE in a single round trip. Mirrors
// CapaWorkflowStep's autoApprove pattern. When the step's form is empty
// we skip persistRecord and go straight to the action endpoint.
const requireEsignature = computed(
  () => !!(instanceStep.value?.requireEsignature ?? stepDefinition.value?.requireEsignature),
)

const showEsignDialog = ref(false)
const completing = ref(false)

function onMarkCompleteClick() {
  if (!canActOnStep.value || completing.value) return
  if (requireEsignature.value) {
    showEsignDialog.value = true
  } else {
    submitMarkComplete()
  }
}

function onEsignVerified({ method, provider, token }) {
  showEsignDialog.value = false
  submitMarkComplete({ method, provider, token })
}

async function submitMarkComplete(esign = null) {
  if (!currentUserTask.value || completing.value) return
  completing.value = true
  try {
    if (hasForm.value) {
      await persistRecord({ submit: true, esign })
    } else {
      const body = {
        action: 'COMPLETE_AND_ADVANCE',
        outcomeId: 'COMPLETE_AND_ADVANCE',
      }
      if (esign?.method) body.method = esign.method
      if (esign?.token) body.token = esign.token
      if (esign?.provider) body.provider = esign.provider
      await post(`/v1/services/taskInstances/${currentUserTask.value.id}/action`, body)
      toast.success('Step marked complete')
    }
  } catch (e) {
    toast.error(e?.message || 'Failed to mark complete')
  } finally {
    completing.value = false
  }
}

// ─── Reopen approved step (NC-owner feedback loop) ───────────────────────────
// Mirrors CapaWorkflowStep.canReopen — owner can push a completed step
// back to its assignee with a reason. Downstream steps untouched; the
// gate refuses when the NC itself is terminal.
const ncIsTerminal = computed(
  () => nc.value?.statusId === 'CLOSED' || nc.value?.statusId === 'VOID',
)
const canReopen = computed(
  () => props.isOwner && instanceStep.value?.statusId === 'APPROVED' && !ncIsTerminal.value,
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
    await post(`/v1/services/nonconformances/${props.ncId}/reopenStep`, {
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

// ─── Display helpers ─────────────────────────────────────────────────────────
function getUserName(userId) {
  const u = usersMap.value[userId]
  if (!u) return '—'
  return [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email
}

function getUserEmail(userId) {
  return usersMap.value[userId]?.email || '—'
}

function getStepStatusClass(statusId) {
  return {
    'tw:bg-blue-100 tw:text-blue-700': statusId === 'IN_PROGRESS',
    'tw:bg-gray-100 tw:text-gray-600': statusId === 'PENDING',
    'tw:bg-green-100 tw:text-green-700': statusId === 'APPROVED',
    'tw:bg-red-100 tw:text-red-700': statusId === 'CANCELLED',
    'tw:bg-orange-100 tw:text-orange-700': statusId === 'SENT_BACK',
  }
}

function getUserStatusClass(statusId) {
  return {
    'tw:bg-gray-100 tw:text-gray-600': statusId === 'PENDING',
    'tw:bg-blue-100 tw:text-blue-700': statusId === 'ASSIGNED',
    'tw:bg-green-100 tw:text-green-700': statusId === 'APPROVED',
    'tw:bg-red-100 tw:text-red-700': statusId === 'REJECTED',
    'tw:bg-orange-100 tw:text-orange-700': statusId === 'REASSIGNED',
    'tw:bg-yellow-100 tw:text-yellow-700': statusId === 'CANCELLED',
  }
}

function getStatusLabel(statusId) {
  if (!statusId) return '—'
  if (statusId === 'APPROVED') return 'Completed'
  return statusId.replace('_', ' ')
}

const canReassign = computed(() => {
  const status = instanceStep.value?.statusId
  return (
    props.isOwner && (status === 'PENDING' || status === 'IN_PROGRESS' || status === 'SENT_BACK')
  )
})

const canSendBack = computed(
  () => props.isOwner && instanceStep.value?.statusId === 'IN_PROGRESS' && props.hasSendBackTargets,
)

// ─── Cancel step (NC owner) ──────────────────────────────────────────────────
// Owner can terminate a step that's no longer relevant — cancels all
// active assignments + their tasks. Distinct from a reviewer-side
// CANCEL outcome (which we now hide) because the owner generally isn't
// the assignee and needs an entity-level path.
const canCancelStep = computed(
  () =>
    props.isOwner &&
    ['PENDING', 'IN_PROGRESS', 'SENT_BACK'].includes(instanceStep.value?.statusId),
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
    await post(`/v1/services/nonconformances/${props.ncId}/cancelStep`, {
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
</script>

<template>
  <div
    v-if="instanceStep"
    class="tw:bg-white tw:border tw:border-divider tw:rounded-lg tw:p-5"
  >
    <!-- Step header -->
    <div
      class="tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-2 tw:pb-3 tw:border-b tw:border-divider tw:mb-4"
    >
      <div class="tw:flex tw:items-center tw:gap-2 tw:min-w-0">
        <span
          class="tw:text-xs tw:font-semibold tw:text-secondary tw:uppercase tw:tracking-wider"
        >
          {{ instanceStep.stepNumber }}. {{ instanceStep.name || 'Step' }}
        </span>
        <BaseBadge class="tw:text-[10px]" :class="getStepStatusClass(instanceStep.statusId)">
          {{ getStatusLabel(instanceStep.statusId) }}
        </BaseBadge>
      </div>
      <div class="tw:flex tw:items-center tw:gap-2">
        <button
          v-if="canActOnStep"
          class="tw:flex tw:items-center tw:gap-1 tw:text-xs tw:text-green-700 tw:hover:underline tw:cursor-pointer tw:font-medium tw:disabled:opacity-50 tw:disabled:cursor-not-allowed"
          :disabled="completing || saving"
          @click="onMarkCompleteClick"
        >
          <IconCheck :size="14" />
          {{
            completing || saving
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
          v-if="canSendBack"
          class="tw:flex tw:items-center tw:gap-1 tw:text-xs tw:text-amber-600 tw:hover:text-amber-700 tw:cursor-pointer tw:font-medium"
          @click="emit('sendBack')"
        >
          <IconArrowBackUp :size="14" />
          {{ isApprovalStep ? 'Reject' : 'Send back' }}
        </button>
        <!-- Owner step-level actions. Always available to the owner on
             a live step, regardless of whether the owner also happens to
             be the current assignee. REASSIGN / CANCEL are intentionally
             hidden from TaskInstanceNcActions so they live in exactly
             one place here. -->
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
        <TaskInstanceNcActions
          v-if="currentUserTask"
          :taskInstanceId="currentUserTask.id"
          :instanceStep="instanceStep"
          :workflowStep="stepDefinition"
          :canActOnStep="canActOnStep"
          :ncId="ncId"
          :isOwner="isOwner"
          :hideOutcomes="['COMPLETE_AND_ADVANCE', 'REASSIGN', 'CANCEL']"
        />
      </div>
    </div>
    <WorkflowInstanceEsignAuthDialog v-model="showEsignDialog" @verified="onEsignVerified" />

    <!-- Assignees -->
    <div class="tw:mb-4">
      <div class="tw:text-[11px] tw:text-secondary tw:font-medium tw:mb-2">Assignees</div>
      <div v-if="assignments.length" class="tw:flex tw:flex-col tw:gap-2">
        <div
          v-for="assignment in assignments"
          :key="assignment.id"
          class="tw:flex tw:items-center tw:gap-2"
        >
          <UserAvatarById :userId="assignment.userId" class="tw:size-8" />
          <div class="tw:flex tw:flex-col tw:gap-1 tw:min-w-0">
            <div>
              <span class="tw:text-xs tw:text-on-main tw:font-medium">
                {{ getUserName(assignment.userId) }}
              </span>
              <span
                class="tw:text-[9px] tw:px-1.5 tw:py-0.5 tw:rounded tw:font-medium tw:shrink-0 tw:ml-1"
                :class="getUserStatusClass(assignment.statusId)"
              >
                {{ getStatusLabel(assignment.statusId) }}
              </span>
            </div>
            <span class="tw:text-xs tw:text-secondary tw:truncate">
              {{ getUserEmail(assignment.userId) }}
            </span>
          </div>
        </div>
      </div>
      <span v-else class="tw:text-sm tw:text-secondary">—</span>
    </div>

    <!-- Step form -->
    <template v-if="formSchema.length">
      <!-- Editable: current user has an ASSIGNED task on this step.
           Submit is now driven by the header's "Mark Complete" button
           (save + submit + COMPLETE_AND_ADVANCE in one shot), so we only
           render Save Draft here. -->
      <template v-if="isEditable">
        <DynamicForm v-model="formData" :fields="formSchema" />
        <div class="tw:mt-4 tw:flex tw:justify-end tw:gap-2">
          <BaseButton variant="outline" :disabled="saving || completing" @click="saveDraft">
            <template #icon><IconDeviceFloppy :size="16" /></template>
            {{ saving && !completing ? 'Saving…' : 'Save draft' }}
          </BaseButton>
        </div>
      </template>

      <!-- Readonly: render every submitted record, plus the current user's draft if any. -->
      <template v-else>
        <div v-for="record in submittedRecords" :key="record.id" class="tw:mb-3">
          <div
            v-if="submittedRecords.length > 1"
            class="tw:text-[11px] tw:text-secondary tw:font-medium tw:mb-2"
          >
            {{ getUserName(record.userId) }}
          </div>
          <FormSchemaReadonlyView
            :fields="formSchema"
            :values="record.payload || {}"
          />
        </div>

        <div v-if="currentUserRecord && !currentUserRecord.submittedAt">
          <div class="tw:text-[11px] tw:text-amber-600 tw:font-medium tw:mb-2">
            Your draft (not submitted)
          </div>
          <FormSchemaReadonlyView
            :fields="formSchema"
            :values="currentUserRecord.payload || {}"
          />
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

    <BaseDialog v-model="showCancelDialog" title="Cancel Step" maxWidth="md">
      <div class="tw:flex tw:flex-col tw:gap-4 tw:p-1">
        <div
          class="tw:flex tw:items-start tw:gap-3 tw:p-3 tw:rounded-lg tw:bg-red-50 tw:border tw:border-red-200"
        >
          <div class="tw:text-red-600 tw:shrink-0 tw:mt-0.5">⨯</div>
          <div class="tw:text-sm tw:text-red-800">
            Cancels this step and all of its open assignments / tasks.
            The workflow stops here — downstream steps stay where they
            are. Use this when the step is no longer needed.
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
        <div
          class="tw:flex tw:items-start tw:gap-3 tw:p-3 tw:rounded-lg tw:bg-amber-50 tw:border tw:border-amber-200"
        >
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
