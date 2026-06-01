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
  // NC id is required for the new SEND_BACK (task-reject) endpoint; the
  // generic /taskInstances/:id/action route doesn't know the entity.
  ncId: { type: String, default: null },
  // Outcomes the parent renders inline (e.g. COMPLETE_AND_ADVANCE on the
  // step card's own Mark Complete button). Mirrors CapaStepActionsMenu's
  // `hideOutcomes` — keeps the same action from appearing in two places.
  hideOutcomes: { type: Array, default: () => [] },
  // CANCEL is intentionally restricted to NC owners — a regular reviewer
  // shouldn't be able to terminate the workflow from their task view.
  isOwner: { type: Boolean, default: false },
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

const allowedOutcomes = useLiveQueryWithDeps(
  [() => props.instanceStep?.stepId],
  async (db, [stepId]) => {
    if (!stepId) return []
    return db.AllowedOutcomeOnStep.where('stepId', stepId).exec()
  },
  { models: ['AllowedOutcomeOnStep', 'WorkflowStep'] },
)

// ── Outcome → UI config ──────────────────────────────────────────────────────
// Per-stepType flavoring mirrors CR + CAPA: APPROVAL steps relabel
// COMPLETE_AND_ADVANCE / SEND_BACK as "Approve" / "Reject" so the
// reviewer sees the right verb.
const isApprovalStep = computed(() => props.instanceStep?.stepType === 'APPROVAL')
const OUTCOME_CONFIG = computed(() => ({
  COMPLETE_AND_ADVANCE: {
    label: isApprovalStep.value ? 'Approve' : 'Mark Complete',
    variant: 'primary',
    icon: IconCheck,
    needsComment: false,
  },
  // SEND_BACK = assignee rejects the task back. Target is auto-derived
  // by the engine: parent step → entity owner; child task → parent
  // step's assignee. Comment is required so the recipient has context.
  SEND_BACK: {
    label: isApprovalStep.value ? 'Reject' : 'Send Back',
    variant: 'outline',
    icon: IconArrowBackUp,
    needsComment: true,
    commentRequired: true,
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
}))

// ── State ────────────────────────────────────────────────────────────────────
const showConfirmDialog = ref(false)
const showEsignDialog = ref(false)
const pendingOutcomeId = ref(null)
const comment = ref('')
const reassignToUserId = ref(null)
const actionLoading = ref(false)

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

// NC-level closure gates (disposition / CAPA-required / cost-of-NC) live
// on the NC-level Mark Complete button at the top of the page — they're
// closure invariants, not per-step concerns. The step approve only gates
// on the per-step form being submitted (below).

const pendingConfig = computed(() =>
  pendingOutcomeId.value ? (OUTCOME_CONFIG.value[pendingOutcomeId.value] ?? null) : null,
)

const confirmTitle = computed(() => pendingConfig.value?.label ?? 'Confirm')

// Per-step form-saved gate. NC-level concerns (disposition/CAPA/cost) are
// validated at the NC Mark Complete button instead.
function isOutcomeDisabled(outcomeId) {
  if (outcomeId === 'COMPLETE_AND_ADVANCE' && formSaveRequired.value) return true
  return false
}

function outcomeTitle(outcomeId) {
  if (outcomeId !== 'COMPLETE_AND_ADVANCE') return undefined
  if (formSaveRequired.value) return 'Submit the form first before approving'
  return undefined
}

// ── Trigger flow ─────────────────────────────────────────────────────────────
// REQUEST_INFO bypasses the workflow-action machinery — it routes to
// the generic Information Request dialog. The dialog handles the
// create-RFI POST and spawns the recipient's respond-task; no esign,
// no comment-dialog handshake needed here.
const showRfiDialog = ref(false)

function onOutcomeClick(outcomeId) {
  if (!props.canActOnStep) return
  if (outcomeId === 'REQUEST_INFO') {
    showRfiDialog.value = true
    return
  }
  pendingOutcomeId.value = outcomeId
  comment.value = ''
  reassignToUserId.value = null

  const config = OUTCOME_CONFIG.value[outcomeId]
  if (config?.needsComment || config?.needsUser) {
    showConfirmDialog.value = true
  } else if (props.workflowStep?.requireEsignature) {
    showEsignDialog.value = true
  } else {
    submitAction({})
  }
}

function onConfirmDialog() {
  if (pendingConfig.value?.needsUser && !reassignToUserId.value) {
    toast.warning('Please select a user to reassign to')
    return
  }
  if (pendingConfig.value?.commentRequired && !comment.value.trim()) {
    toast.warning('A comment is required')
    return
  }
  showConfirmDialog.value = false
  // SEND_BACK on NC = reject task back to owner. No e-sign needed for a
  // rejection — semantically it's the assignee bowing out, not an
  // attested decision.
  if (pendingOutcomeId.value === 'SEND_BACK') {
    submitAction({})
    return
  }
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
    // SEND_BACK on NC uses a dedicated reject endpoint (rejects the
    // task, notifies owner via a new ACTION task) — not the generic
    // task-action route. All other outcomes still go through it.
    if (pendingOutcomeId.value === 'SEND_BACK' && props.ncId && props.instanceStep?.id) {
      await post(`/v1/services/nonconformances/${props.ncId}/rejectStepTask`, {
        workflowInstanceStepId: props.instanceStep.id,
        comment: comment.value,
      })
      toast.success('Task sent back — the NC owner has been notified')
      showEsignDialog.value = false
      emit('done')
      return
    }

    const body = {
      action: pendingOutcomeId.value,
      outcomeId: pendingOutcomeId.value,
    }
    if (method) body.method = method
    if (token) body.token = token
    if (provider) body.provider = provider
    if (comment.value) body.comment = comment.value
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
    <template v-for="allowed in allowedOutcomes">
      <div
        v-if="
          OUTCOME_CONFIG[allowed.outcomeId] &&
          !hideOutcomes.includes(allowed.outcomeId) &&
          (allowed.outcomeId !== 'CANCEL' || isOwner)
        "
        :key="allowed.id"
        :title="outcomeTitle(allowed.outcomeId)"
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

      <div>
        <label class="tw:block tw:text-sm tw:font-medium tw:text-on-main tw:mb-1">
          {{ pendingOutcomeId === 'SEND_BACK' ? 'Reason for sending back' : 'Comment' }}
          <span v-if="pendingConfig?.commentRequired" class="tw:text-red-500">*</span>
        </label>
        <textarea
          v-model="comment"
          rows="3"
          class="tw:w-full tw:rounded-lg tw:border tw:border-divider tw:bg-main tw:text-on-main tw:text-sm tw:p-3 tw:resize-none tw:focus:outline-none tw:focus:ring-2 tw:focus:ring-primary/50"
          :placeholder="
            pendingOutcomeId === 'SEND_BACK'
              ? 'Why are you sending this back to the owner?'
              : 'Add a comment…'
          "
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

    <!-- RFI dialog (REQUEST_INFO outcome) -->
    <InformationRequestDialog
      v-if="ncId"
      v-model="showRfiDialog"
      mode="create"
      entityType="Nonconformance"
      :entityId="ncId"
    />
  </div>
</template>
