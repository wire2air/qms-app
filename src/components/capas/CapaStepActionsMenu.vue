<script setup>
import {
  IconCheck,
  IconArrowBackUp,
  IconInfoCircle,
  IconUserCheck,
  IconBan,
} from '@tabler/icons-vue'
import { post } from '@/api'
import { currentSession } from '@/utils/currentSession.js'

const props = defineProps({
  instanceStepId: { type: String, required: true },
  capaId: { type: String, required: true },
  isOwner: { type: Boolean, default: false },
  hasSendBackTargets: { type: Boolean, default: false },
  requireEsignature: { type: Boolean, default: false },
  // Child sub-step rendering. Filters SEND_BACK out of the menu (children
  // don't initiate workflow send-back) and unlocks the ad-hoc fallback that
  // assumes COMPLETE_AND_ADVANCE is always allowed when no template
  // AllowedOutcomeOnStep rows exist.
  isChild: { type: Boolean, default: false },
})

const emit = defineEmits(['reassign', 'sendBack', 'done'])
const toast = useToast()
const currentUserId = computed(() => currentSession.value?.id ?? currentSession.value?.userId)

// ─── Resolve the step + current user's task + supporting data ───────────────
const instanceStep = useLiveQueryWithDeps([() => props.instanceStepId], async (db, [id]) =>
  id ? db.WorkflowInstanceStep.findByPk(id) : null,
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
    return (
      tasks.find((t) => t.assignedTo === userId && ACTIONABLE_STATUSES.includes(t.statusId)) || null
    )
  },
)

const capaRecord = useLiveQueryWithDeps([() => currentUserTask.value?.id], async (db, [taskId]) => {
  if (!taskId) return null
  return db.CapaRecord.where('taskInstanceId', taskId).first()
})

const allowedOutcomes = useLiveQueryWithDeps(
  [() => instanceStep.value?.stepId],
  async (db, [stepId]) => {
    if (!stepId) return []
    return db.AllowedOutcomeOnStep.where('stepId', stepId).exec()
  },
  { initial: [] },
)

const sendBackTargets = useLiveQueryWithDeps(
  [() => instanceStep.value?.stepId],
  async (db, [stepId]) => {
    if (!stepId) return []
    return db.StepSendBackTarget.where('stepId', stepId).exec()
  },
  { initial: [] },
)

const sendBackSteps = useLiveQueryWithDeps(
  [() => sendBackTargets.value.map((t) => t.targetStepId).join(',')],
  async (db, [idsStr]) => {
    if (!idsStr) return []
    const ids = [...new Set(idsStr.split(','))]
    const steps = await Promise.all(ids.map((id) => db.WorkflowStep.findByPk(id)))
    return steps.filter(Boolean)
  },
  { initial: [] },
)

const childInstanceSteps = useLiveQueryWithDeps(
  [() => props.instanceStepId],
  async (db, [parentId]) => {
    if (!parentId) return []
    return db.WorkflowInstanceStep.where('parentInstanceStepId', parentId).exec()
  },
  { initial: [] },
)

const hasChildren = computed(() => childInstanceSteps.value.length > 0)
const allChildrenApproved = computed(
  () => hasChildren.value && childInstanceSteps.value.every((s) => s.statusId === 'APPROVED'),
)
const childrenBlock = computed(() => hasChildren.value && !allChildrenApproved.value)

const formRequired = computed(
  () => Array.isArray(instanceStep.value?.formSchema) && instanceStep.value.formSchema.length > 0,
)
const formSaveRequired = computed(() => formRequired.value && !capaRecord.value?.submittedAt)

// Reassign candidates for the reviewer-side REASSIGN outcome — users holding
// any of the step's eligible roles, minus the current user. Template-spawned
// steps source roles from WorkflowStepRole; ad-hoc steps (no stepId) carry
// them in the RoleOnWorkflowInstanceStep pivot.
const stepRoles = useLiveQueryWithDeps(
  [() => instanceStep.value?.stepId],
  async (db, [stepId]) => {
    if (!stepId) return []
    return db.WorkflowStepRole.where('stepId', stepId).exec()
  },
  { initial: [] },
)

const instanceStepRoles = useLiveQueryWithDeps(
  [() => props.instanceStepId],
  async (db, [id]) => {
    if (!id) return []
    return db.RoleOnWorkflowInstanceStep.where('workflowInstanceStepId', id).exec()
  },
  { initial: [] },
)

const effectiveRoleIds = computed(() => {
  const set = new Set([
    ...stepRoles.value.map((r) => r.roleId),
    ...instanceStepRoles.value.map((r) => r.roleId),
  ])
  return [...set]
})

const reassignCandidates = useLiveQueryWithDeps(
  [() => effectiveRoleIds.value.join(',')],
  async (db, [roleIdsStr]) => {
    if (!roleIdsStr) return []
    const roleIds = roleIdsStr.split(',')
    const rolesOnUsers = await Promise.all(
      roleIds.map((id) => db.RoleOnUser.where('roleId', id).exec()),
    )
    const userIds = [...new Set(rolesOnUsers.flat().map((r) => r.userId))]
    const users = await Promise.all(userIds.map((id) => db.User.findByPk(id)))
    return users.filter(Boolean)
  },
  { initial: [] },
)

const filteredReassignCandidates = computed(() =>
  reassignCandidates.value.filter((u) => u.id !== currentUserId.value),
)

// ─── Outcome configuration + gating ─────────────────────────────────────────
// Per-stepType flavoring mirrors ChangeRequestStepActionsMenu: APPROVAL
// steps read as "Approve" / "Reject", ACTION steps keep the
// "Complete & Advance" / "Send Back" wording reviewers are used to.
const isApprovalStep = computed(() => instanceStep.value?.stepType === 'APPROVAL')
const OUTCOME_CONFIG = computed(() => ({
  COMPLETE_AND_ADVANCE: {
    label: isApprovalStep.value ? 'Approve' : 'Complete & Advance',
    icon: IconCheck,
  },
  SEND_BACK: {
    label: isApprovalStep.value ? 'Reject' : 'Send Back',
    icon: IconArrowBackUp,
    needsTarget: true,
    needsComment: true,
  },
  REQUEST_INFO: { label: 'Request Info', icon: IconInfoCircle, needsComment: true },
  REASSIGN: { label: 'Reassign', icon: IconUserCheck, needsUser: true, needsComment: true },
  CANCEL: { label: 'Cancel', icon: IconBan, needsComment: true },
}))

const canActOnStep = computed(() => ACTIONABLE_STATUSES.includes(currentUserTask.value?.statusId))

function isOutcomeDisabled(outcomeId) {
  if (outcomeId === 'COMPLETE_AND_ADVANCE') {
    if (formSaveRequired.value) return true
    if (childrenBlock.value) return true
  }
  return false
}

function outcomeTitle(outcomeId) {
  if (outcomeId !== 'COMPLETE_AND_ADVANCE') return undefined
  if (formSaveRequired.value) return 'Submit the form first before approving'
  if (childrenBlock.value) return 'All sub-tasks must be approved before advancing'
  return undefined
}

// Owner gating mirrors the inline buttons we're replacing.
const REASSIGNABLE_STATUSES = ['PENDING', 'IN_PROGRESS', 'SENT_BACK']
const isOwnerReassignable = computed(() =>
  REASSIGNABLE_STATUSES.includes(instanceStep.value?.statusId),
)
const canOwnerSendBack = computed(
  () => instanceStep.value?.statusId === 'IN_PROGRESS' && props.hasSendBackTargets,
)

// ─── Dialog state for reviewer outcomes ─────────────────────────────────────
const showConfirmDialog = ref(false)
const showEsignDialog = ref(false)
const pendingOutcomeId = ref(null)
const comment = ref('')
const sendBackTargetStepId = ref(null)
const reassignToUserId = ref(null)
const actionLoading = ref(false)

const pendingConfig = computed(() =>
  pendingOutcomeId.value ? (OUTCOME_CONFIG.value[pendingOutcomeId.value] ?? null) : null,
)
const confirmTitle = computed(() => pendingConfig.value?.label ?? 'Confirm')

function onOutcomeClick(outcomeId) {
  if (!canActOnStep.value) return
  if (isOutcomeDisabled(outcomeId)) return
  pendingOutcomeId.value = outcomeId
  comment.value = ''
  sendBackTargetStepId.value = null
  reassignToUserId.value = null

  const config = OUTCOME_CONFIG.value[outcomeId]
  if (config?.needsComment || config?.needsTarget || config?.needsUser) {
    showConfirmDialog.value = true
  } else if (props.requireEsignature) {
    showEsignDialog.value = true
  } else {
    submitAction({})
  }
}

function onConfirmDialog() {
  if (pendingConfig.value?.needsTarget && !sendBackTargetStepId.value) {
    toast.warning('Please select a target step to send back to')
    return
  }
  if (pendingConfig.value?.needsUser && !reassignToUserId.value) {
    toast.warning('Please select a user to reassign to')
    return
  }
  showConfirmDialog.value = false
  if (props.requireEsignature) {
    showEsignDialog.value = true
  } else {
    submitAction({})
  }
}

function onEsignVerified({ method, provider, token }) {
  submitAction({ method, provider, token })
}

async function submitAction({ method, provider, token } = {}) {
  if (!currentUserTask.value) return
  actionLoading.value = true
  try {
    const body = {
      action: pendingOutcomeId.value,
      outcomeId: pendingOutcomeId.value,
    }
    if (method) body.method = method
    if (token) body.token = token
    if (provider) body.provider = provider
    if (comment.value) body.comment = comment.value
    if (sendBackTargetStepId.value) body.sendBackTargetStepId = sendBackTargetStepId.value
    if (reassignToUserId.value) body.reassignToUserId = reassignToUserId.value

    await post(`/v1/services/taskInstances/${currentUserTask.value.id}/action`, body)
    toast.success(`${pendingConfig.value?.label ?? 'Action'} completed`)
    showEsignDialog.value = false
    emit('done')
  } catch {
    // Dialogs stay open so user doesn't lose input
  } finally {
    actionLoading.value = false
  }
}

// Ad-hoc child steps (stepId === null) have no AllowedOutcomeOnStep rows.
// Fall back to "COMPLETE_AND_ADVANCE only" so the reviewer always has a way
// to approve. Filter SEND_BACK out for child rows (they don't initiate
// workflow send-back).
const effectiveAllowedOutcomes = computed(() => {
  const isAdHoc = instanceStep.value && !instanceStep.value.stepId
  let list = allowedOutcomes.value
  if (isAdHoc && list.length === 0) {
    list = [{ outcomeId: 'COMPLETE_AND_ADVANCE' }]
  }
  if (props.isChild) {
    list = list.filter((o) => o.outcomeId !== 'SEND_BACK')
  }
  return list
})

// ─── Standalone "Complete & Advance" button (rendered beside the menu) ──────
// Surfaced as its own button because it's the most-used reviewer action.
// The menu skips this outcome so it doesn't appear twice.
const hasApproveAction = computed(
  () =>
    canActOnStep.value &&
    effectiveAllowedOutcomes.value.some((o) => o.outcomeId === 'COMPLETE_AND_ADVANCE'),
)

const approveDisabled = computed(
  () => isOutcomeDisabled('COMPLETE_AND_ADVANCE') || actionLoading.value,
)

const approveTitle = computed(() => outcomeTitle('COMPLETE_AND_ADVANCE'))

// ─── Menu items ─────────────────────────────────────────────────────────────
const items = computed(() => {
  const list = []
  if (canActOnStep.value) {
    for (const o of effectiveAllowedOutcomes.value) {
      if (o.outcomeId === 'COMPLETE_AND_ADVANCE') continue // rendered as a standalone button
      const cfg = OUTCOME_CONFIG.value[o.outcomeId]
      if (!cfg) continue
      list.push({
        name: cfg.label,
        icon: cfg.icon,
        disabled: isOutcomeDisabled(o.outcomeId),
        title: outcomeTitle(o.outcomeId),
        click: () => onOutcomeClick(o.outcomeId),
      })
    }
  }
  if (props.isOwner && isOwnerReassignable.value) {
    list.push({
      name: 'Reassign reviewer (owner)',
      icon: IconUserCheck,
      click: () => emit('reassign', props.instanceStepId),
    })
  }
  if (props.isOwner && canOwnerSendBack.value) {
    list.push({
      name: 'Send step back (owner)',
      icon: IconArrowBackUp,
      click: () => emit('sendBack', props.instanceStepId),
    })
  }
  return list
})
</script>

<template>
  <template v-if="hasApproveAction || items.length">
    <BaseButton
      v-if="hasApproveAction"
      variant="primary"
      size="sm"
      :disabled="approveDisabled"
      :title="approveTitle"
      @click="onOutcomeClick('COMPLETE_AND_ADVANCE')"
    >
      <template #icon><IconCheck :size="14" /></template>
      Complete & Advance
    </BaseButton>

    <BaseMenu v-if="items.length" :items="items" />

    <BaseDialog v-model="showConfirmDialog" :title="confirmTitle" maxWidth="md" persistent>
      <div v-if="pendingConfig?.needsUser" class="tw:mb-4">
        <label class="tw:block tw:text-sm tw:font-medium tw:text-on-main tw:mb-1">
          Reassign to <span class="tw:text-red-500">*</span>
        </label>
        <div class="tw:flex tw:flex-col tw:gap-2">
          <label
            v-for="user in filteredReassignCandidates"
            :key="user.id"
            class="tw:flex tw:items-center tw:gap-3 tw:cursor-pointer tw:rounded-lg tw:px-3 tw:py-2 tw:border tw:transition-colors"
            :class="
              reassignToUserId === user.id
                ? 'tw:border-primary tw:bg-primary/5'
                : 'tw:border-divider tw:hover:bg-main-hover'
            "
          >
            <input
              v-model="reassignToUserId"
              type="radio"
              :value="user.id"
              class="tw:accent-primary"
            />
            <div class="tw:flex-1 tw:min-w-0">
              <div class="tw:text-sm tw:font-medium tw:text-on-main">
                {{ [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email }}
              </div>
              <div class="tw:text-xs tw:text-secondary tw:truncate">{{ user.email }}</div>
            </div>
          </label>
          <p v-if="!filteredReassignCandidates.length" class="tw:text-sm tw:text-secondary">
            No eligible users available for reassignment.
          </p>
        </div>
      </div>

      <div v-if="pendingConfig?.needsTarget" class="tw:mb-4">
        <label class="tw:block tw:text-sm tw:font-medium tw:text-on-main tw:mb-1">
          Send back to step <span class="tw:text-red-500">*</span>
        </label>
        <div class="tw:flex tw:flex-col tw:gap-2">
          <label
            v-for="step in sendBackSteps"
            :key="step.id"
            class="tw:flex tw:items-center tw:gap-2 tw:cursor-pointer"
          >
            <input
              v-model="sendBackTargetStepId"
              type="radio"
              :value="step.id"
              class="tw:accent-primary"
            />
            <span class="tw:text-sm tw:text-on-main">{{ step.name }}</span>
          </label>
          <p v-if="!sendBackSteps?.length" class="tw:text-sm tw:text-secondary">
            No send-back targets configured for this step.
          </p>
        </div>
      </div>

      <div>
        <label class="tw:block tw:text-sm tw:font-medium tw:text-on-main tw:mb-1">
          Comment {{ pendingConfig?.needsComment ? '(optional)' : '' }}
        </label>
        <textarea
          v-model="comment"
          rows="3"
          class="tw:w-full tw:rounded-lg tw:border tw:border-divider tw:bg-main tw:text-on-main tw:text-sm tw:p-3 tw:resize-none tw:focus:outline-none tw:focus:ring-2 tw:focus:ring-primary/50"
          placeholder="Add a comment…"
        />
      </div>

      <template #footer="{ close }">
        <BaseButton variant="outline" @click="close">Cancel</BaseButton>
        <BaseButton
          :variant="pendingOutcomeId === 'CANCEL' ? 'danger' : 'primary'"
          :isLoading="actionLoading"
          @click="onConfirmDialog"
        >
          Confirm
        </BaseButton>
      </template>
    </BaseDialog>

    <WorkflowInstanceEsignAuthDialog v-model="showEsignDialog" @verified="onEsignVerified" />
  </template>
</template>
