<script setup>
/**
 * Single child sub-task card under a CR Implementation stage. Simpler
 * than the parent step — Mark Complete + Reassign + Cancel inline,
 * plus a Send Back menu for the assignee. No nested children.
 */
import {
  IconUserCheck,
  IconCheck,
  IconChevronDown,
  IconChevronRight,
  IconLoader2,
  IconAlertTriangle,
  IconArrowBackUp,
  IconBan,
} from '@tabler/icons-vue'
import { post } from '@/api'
import { currentSession } from '@/utils/currentSession.js'
import { DateTime } from 'luxon'
import WorkflowStepActionsMenu from '@/components/workflow/WorkflowStepActionsMenu.vue'
import { CR_MODULE } from '@/components/workflow/workflowModule.js'

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

const assignments = useLiveQueryWithDeps(
  [() => props.instanceStepId],
  async (db, [id]) => {
    if (!id) return []
    return db.UserOnWorkflowInstanceStep.where('workflowInstanceStepId', id).exec()
  },
  { initial: [] },
)
const activeAssigneeId = computed(() => {
  const active = assignments.value.find(
    (a) => a.statusId === 'ASSIGNED' || a.statusId === 'PENDING',
  )
  return active?.userId || null
})

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
const isAssignee = computed(() => !!currentUserTask.value)

const REASSIGNABLE = ['PENDING', 'IN_PROGRESS', 'SENT_BACK']
const canReassign = computed(
  () => props.isOwner && REASSIGNABLE.includes(instanceStep.value?.statusId),
)
const canCancelStep = computed(
  () => props.isOwner && REASSIGNABLE.includes(instanceStep.value?.statusId),
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
    toast.success('Sub-task cancelled')
    showCancelDialog.value = false
  } catch (e) {
    toast.error(e?.message || 'Failed to cancel sub-task')
  } finally {
    cancelling.value = false
  }
}

// Mark Complete
const requireEsignature = computed(() => !!instanceStep.value?.requireEsignature)
const showCompleteDialog = ref(false)
const showEsignDialog = ref(false)
const completing = ref(false)
const completeComment = ref('')

function onCompleteClick() {
  if (!isAssignee.value || completing.value) return
  completeComment.value = ''
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
    const body = {
      action: 'COMPLETE_AND_ADVANCE',
      outcomeId: 'COMPLETE_AND_ADVANCE',
    }
    if (completeComment.value.trim()) body.comment = completeComment.value.trim()
    if (esign?.method) body.method = esign.method
    if (esign?.token) body.token = esign.token
    if (esign?.provider) body.provider = esign.provider
    await post(`/v1/services/taskInstances/${currentUserTask.value.id}/action`, body)
    toast.success('Sub-task completed')
  } catch (e) {
    toast.error(e?.message || 'Failed to complete sub-task')
  } finally {
    completing.value = false
  }
}

// Due / overdue
const dueDate = computed(() => {
  const step = instanceStep.value
  if (!step?.startedAt || !step.slaDays) return null
  return step.startedAt.plus({ days: step.slaDays })
})
const overdue = computed(() => {
  if (instanceStep.value?.statusId !== 'IN_PROGRESS') return false
  return !!dueDate.value && dueDate.value < DateTime.now()
})

const expanded = ref(false)
watch(
  isAssignee,
  (v) => {
    if (v) expanded.value = true
  },
  { immediate: true },
)

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
    <!-- Header -->
    <div class="tw:flex tw:items-center tw:gap-3 tw:px-4 tw:py-2.5">
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
        <div
          v-else
          class="tw:size-6 tw:rounded-full tw:border-2 tw:border-gray-300 tw:bg-white"
        />
      </div>

      <button
        type="button"
        class="tw:flex tw:items-center tw:gap-2 tw:flex-1 tw:min-w-0 tw:text-left tw:bg-transparent tw:border-0 tw:cursor-pointer tw:py-0.5"
        @click="expanded = !expanded"
      >
        <IconChevronDown v-if="expanded" :size="14" class="tw:text-secondary tw:shrink-0" />
        <IconChevronRight v-else :size="14" class="tw:text-secondary tw:shrink-0" />
        <span class="tw:text-sm tw:font-semibold tw:text-on-main tw:truncate">
          {{ displayNumber }}. {{ instanceStep.name || 'Sub-task' }}
        </span>
        <BaseBadge class="tw:text-[10px]" :class="getStepStatusClass(instanceStep.statusId)">
          {{ getStatusLabel(instanceStep.statusId) }}
        </BaseBadge>
      </button>

      <div class="tw:flex tw:items-center tw:gap-2 tw:shrink-0">
        <UserAvatarById
          v-if="activeAssigneeId"
          :userId="activeAssigneeId"
          class="tw:size-7"
          @click.stop
        />
        <button
          v-if="isAssignee"
          class="tw:flex tw:items-center tw:gap-1 tw:text-xs tw:text-green-700 tw:hover:underline tw:cursor-pointer tw:font-medium tw:disabled:opacity-50"
          :disabled="completing"
          @click.stop="onCompleteClick"
        >
          <IconCheck :size="14" />
          {{ completing ? 'Completing…' : 'Mark Complete' }}
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
          v-if="canCancelStep"
          class="tw:flex tw:items-center tw:gap-1 tw:text-xs tw:text-red-600 tw:hover:underline tw:cursor-pointer tw:font-medium tw:disabled:opacity-50"
          :disabled="cancelling"
          @click.stop="openCancelDialog"
        >
          <IconBan :size="14" />
          {{ cancelling ? 'Cancelling…' : 'Cancel' }}
        </button>
        <div @click.stop>
          <WorkflowStepActionsMenu
            :module="CR_MODULE"
            :instanceStepId="instanceStepId"
            :resourceId="crId"
            :isOwner="isOwner"
            :requireEsignature="requireEsignature"
            :hideOutcomes="['COMPLETE_AND_ADVANCE']"
          />
        </div>
      </div>
    </div>

    <!-- Body: instructions only (no per-user form record for CR v2) -->
    <div
      v-if="expanded && instanceStep.description"
      class="tw:px-4 tw:pb-4 tw:pt-3 tw:border-t tw:border-divider"
    >
      <div
        class="tw:text-[11px] tw:text-secondary tw:font-medium tw:mb-1 tw:uppercase tw:tracking-wider"
      >
        Instructions
      </div>
      <div
        class="tw:text-sm tw:text-on-main tw:leading-relaxed"
        v-html="instanceStep.description"
      />
    </div>

    <BaseDialog v-model="showCompleteDialog" title="Mark Sub-task Complete" maxWidth="md">
      <p class="tw:text-sm tw:text-on-main tw:mb-3">
        Confirm completion of <strong>{{ instanceStep.name }}</strong
        >.
      </p>
      <label class="tw:block tw:text-xs tw:font-bold tw:text-secondary tw:uppercase tw:mb-1">
        Comment (optional)
      </label>
      <BaseTextarea v-model="completeComment" :rows="3" placeholder="What you did…" />
      <template #footer="{ close }">
        <BaseButton variant="outline" :disabled="completing" @click="close">Cancel</BaseButton>
        <BaseButton variant="primary" :loading="completing" @click="handleCompleteSubmit">
          {{ requireEsignature ? 'Sign & Complete' : 'Mark Complete' }}
        </BaseButton>
      </template>
    </BaseDialog>

    <WorkflowInstanceEsignAuthDialog v-model="showEsignDialog" @verified="onEsignVerified" />

    <BaseDialog v-model="showCancelDialog" title="Cancel Sub-task" maxWidth="md">
      <p class="tw:text-sm tw:text-on-main tw:mb-3">
        Cancel this sub-task? Any open assignment is closed; the parent
        stage's completion check will treat it as done.
      </p>
      <BaseTextarea v-model="cancelReason" :rows="3" placeholder="Reason (optional)" />
      <template #footer="{ close }">
        <BaseButton variant="secondary" :disabled="cancelling" @click="close">Back</BaseButton>
        <BaseButton variant="danger" :loading="cancelling" @click="handleCancelStep">
          Cancel Sub-task
        </BaseButton>
      </template>
    </BaseDialog>
  </div>
</template>
