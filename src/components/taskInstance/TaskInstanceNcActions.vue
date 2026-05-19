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
  taskInstanceId: { type: String, required: true },
  instanceStep: { type: Object, default: null },
  workflowStep: { type: Object, default: null },
  canActOnStep: { type: Boolean, default: false },
})

const emit = defineEmits(['done'])
const toast = useToast()

// Own ncRecord query — drives formSaveRequired
const ncRecord = useLiveQueryWithDeps(
  [() => props.taskInstanceId],
  async (db, [taskInstanceId]) => {
    if (!taskInstanceId) return null
    return db.NcRecord.where('taskInstanceId', taskInstanceId).first()
  },
  { models: ['NcRecord', 'TaskInstance', 'WorkflowInstance', 'WorkflowInstanceStep'] },
)

// Own allowedOutcomes and sendBackTargets queries
const allowedOutcomes = useLiveQueryWithDeps(
  [() => props.instanceStep?.stepId],
  async (db, [stepId]) => {
    if (!stepId) return []
    return db.AllowedOutcomeOnStep.where('stepId', stepId).exec()
  },
  { models: ['AllowedOutcomeOnStep', 'WorkflowStep'] },
)

const sendBackTargets = useLiveQueryWithDeps(
  [() => props.instanceStep?.stepId],
  async (db, [stepId]) => {
    if (!stepId) return []
    return db.StepSendBackTarget.where('stepId', stepId).exec()
  },
)

// ── Outcome → UI config ──────────────────────────────────────────────────────
const OUTCOME_CONFIG = {
  COMPLETE_AND_ADVANCE: {
    label: 'Approve & Advance',
    variant: 'primary',
    icon: IconCheck,
    needsComment: false,
  },
  SEND_BACK: {
    label: 'Send Back',
    variant: 'outline',
    icon: IconArrowBackUp,
    needsTarget: true,
    needsComment: true,
  },
  REQUEST_INFO: {
    label: 'Request Info',
    variant: 'outline',
    icon: IconInfoCircle,
    needsComment: true,
  },
  REASSIGN: {
    label: 'Reassign',
    variant: 'outline',
    icon: IconUserCheck,
    needsUser: true,
    needsComment: true,
  },
  CANCEL: {
    label: 'Cancel',
    variant: 'danger',
    icon: IconBan,
    needsComment: true,
  },
}

// ── State ────────────────────────────────────────────────────────────────────
const showConfirmDialog = ref(false)
const showEsignDialog = ref(false)
const pendingOutcomeId = ref(null)
const comment = ref('')
const sendBackTargetStepId = ref(null)
const reassignToUserId = ref(null)
const actionLoading = ref(false)

// Resolve send-back targets to WorkflowStep names
const sendBackSteps = useLiveQueryWithDeps([() => sendBackTargets.value], async (db, [targets]) => {
  if (!targets?.length) return []
  const steps = await Promise.all(targets.map((t) => db.WorkflowStep.findByPk(t.targetStepId)))
  return steps.filter(Boolean)
})

// Candidate users for reassignment (step roles → RoleOnUser → User, excluding current user)
const stepRoles = useLiveQueryWithDeps(
  [() => props.instanceStep?.stepId],
  async (db, [stepId]) => {
    if (!stepId) return []
    return db.WorkflowStepRole.where('stepId', stepId).exec()
  },
  { initial: [] },
)

const reassignCandidates = useLiveQueryWithDeps(
  [() => stepRoles.value.map((r) => r.roleId).join(',')],
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

const currentUserId = computed(() => currentSession.value?.id)

const filteredReassignCandidates = computed(() =>
  reassignCandidates.value.filter((u) => u.id !== currentUserId.value),
)

// Whether the step has a form that must be submitted (not just drafted) first.
// A draft NcRecord exists with submittedAt=null and must still block approval.
const formRequired = computed(
  () => Array.isArray(props.instanceStep?.formSchema) && props.instanceStep.formSchema.length > 0,
)
const formSaveRequired = computed(() => formRequired.value && !ncRecord.value?.submittedAt)

const pendingConfig = computed(() =>
  pendingOutcomeId.value ? (OUTCOME_CONFIG[pendingOutcomeId.value] ?? null) : null,
)

const confirmTitle = computed(() => pendingConfig.value?.label ?? 'Confirm')

// Check if a specific outcome should be disabled
function isOutcomeDisabled(outcomeId) {
  // Only COMPLETE_AND_ADVANCE requires the form to be saved first
  if (outcomeId === 'COMPLETE_AND_ADVANCE' && formSaveRequired.value) {
    return true
  }
  // All other outcomes can proceed regardless of form status
  return false
}

// ── Trigger flow ─────────────────────────────────────────────────────────────
function onOutcomeClick(outcomeId) {
  if (!props.canActOnStep) return
  pendingOutcomeId.value = outcomeId
  comment.value = ''
  sendBackTargetStepId.value = null
  reassignToUserId.value = null

  const config = OUTCOME_CONFIG[outcomeId]
  if (config?.needsComment || config?.needsTarget || config?.needsUser) {
    showConfirmDialog.value = true
  } else if (props.workflowStep?.requireEsignature) {
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
  if (props.workflowStep?.requireEsignature) {
    showEsignDialog.value = true
  } else {
    submitAction({})
  }
}

function onEsignVerified({ method, provider, token }) {
  submitAction({ method, provider, token })
}

async function submitAction({ method, provider, token } = {}) {
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

    await post(`/v1/services/taskInstances/${props.taskInstanceId}/action`, body)
    toast.success(`${pendingConfig.value?.label ?? 'Action'} completed`)
    showEsignDialog.value = false
    emit('done')
  } catch {
    // Dialogs stay open so user doesn't lose input
  } finally {
    actionLoading.value = false
  }
}
</script>

<template>
  <div class="tw:flex tw:items-center tw:gap-2">
    <template v-for="allowed in allowedOutcomes" :key="allowed.id">
      <div
        v-if="OUTCOME_CONFIG[allowed.outcomeId]"
        :title="
          allowed.outcomeId === 'COMPLETE_AND_ADVANCE' && formSaveRequired
            ? 'Submit the form first before approving'
            : undefined
        "
      >
        <BaseButton
          :variant="OUTCOME_CONFIG[allowed.outcomeId].variant"
          :disabled="!canActOnStep || actionLoading || isOutcomeDisabled(allowed.outcomeId)"
          @click="onOutcomeClick(allowed.outcomeId)"
        >
          <template #icon>
            <component :is="OUTCOME_CONFIG[allowed.outcomeId].icon" :size="16" />
          </template>
          {{ OUTCOME_CONFIG[allowed.outcomeId].label }}
        </BaseButton>
      </div>
    </template>

    <!-- Confirm / comment dialog -->
    <BaseDialog v-model="showConfirmDialog" :title="confirmTitle" maxWidth="md" persistent>
      <!-- Reassign user picker -->
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

      <!-- Send-back target picker -->
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

    <!-- E-sign dialog -->
    <WorkflowInstanceEsignAuthDialog v-model="showEsignDialog" @verified="onEsignVerified" />
  </div>
</template>
