<script setup>
import {
  IconCheck,
  IconArrowBackUp,
  IconInfoCircle,
  IconUserCheck,
  IconBan,
  IconCalendarTime,
} from '@tabler/icons-vue'
import { post } from '@/api'
import { currentSession } from '@/utils/currentSession.js'
import { DELAY_PRESETS } from '@/components/workflow/delayPresets.js'

const props = defineProps({
  taskInstanceId: { type: String, required: true },
  instanceStep: { type: Object, default: null },
  workflowStep: { type: Object, default: null },
  canActOnStep: { type: Boolean, default: false },
})

const emit = defineEmits(['done'])
const toast = useToast()

// Effective compliance flags: ad-hoc child steps (no template) carry their
// own `requireEsignature` / `requireComments` on the instance row; template-
// spawned steps leave those NULL and inherit from the WorkflowStep. Read
// the instance value first, fall back to the template.
const requireEsignature = computed(
  () => props.instanceStep?.requireEsignature ?? props.workflowStep?.requireEsignature ?? false,
)

const capaRecord = useLiveQueryWithDeps(
  [() => props.taskInstanceId],
  async (db, [taskInstanceId]) => {
    if (!taskInstanceId) return null
    return db.CapaRecord.where('taskInstanceId', taskInstanceId).first()
  },
  { models: ['CapaRecord', 'TaskInstance', 'WorkflowInstance', 'WorkflowInstanceStep'] },
)

const allowedOutcomes = useLiveQueryWithDeps(
  [() => props.instanceStep?.stepId],
  async (db, [stepId]) => {
    if (!stepId) return []
    return db.AllowedOutcomeOnStep.where('stepId', stepId).exec()
  },
  { models: ['AllowedOutcomeOnStep', 'WorkflowStep'] },
)

// CAPA-specific: if this step is a parent that has child stages, advance is
// only allowed when every child instance step is APPROVED. Hierarchy lives on
// the instance row — single indexed lookup, no WorkflowStep fetch.
const childInstanceSteps = useLiveQueryWithDeps(
  [() => props.instanceStep?.id],
  async (db, [parentInstanceStepId]) => {
    if (!parentInstanceStepId) return []
    return db.WorkflowInstanceStep.where('parentInstanceStepId', parentInstanceStepId).exec()
  },

  { models: ['WorkflowInstanceStep'], initial: [] },
)

const hasChildren = computed(() => childInstanceSteps.value.length > 0)
const allChildrenApproved = computed(
  () => hasChildren.value && childInstanceSteps.value.every((s) => s.statusId === 'APPROVED'),
)
const childrenBlock = computed(() => hasChildren.value && !allChildrenApproved.value)

const OUTCOME_CONFIG = {
  COMPLETE_AND_ADVANCE: {
    label: 'Approve & Advance',
    variant: 'primary',
    icon: IconCheck,
    needsComment: false,
  },
  SEND_BACK: {
    // Target is auto-derived by the engine: parent step → entity owner,
    // child task → parent step's assignee. No picker needed; the comment
    // is the only thing this dialog collects.
    label: 'Send Back',
    variant: 'outline',
    icon: IconArrowBackUp,
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
  // DELAY steps only (filtered in the render loop): push the step's wake-up
  // out by N days. The engine supersedes this task and re-assigns when the
  // new time arrives. No e-sign — it's a deferral, not a sign-off.
  EXTEND_DELAY: {
    label: 'Extend Delay',
    variant: 'outline',
    icon: IconCalendarTime,
    needsComment: true,
    commentRequired: true,
    needsDays: true,
  },
}

// EXTEND_DELAY renders only on DELAY steps with extension runway left.
const isDelayExtendable = computed(
  () =>
    props.instanceStep?.stepType === 'DELAY' &&
    (props.instanceStep?.delayExtensionCount ?? 0) <
      (props.instanceStep?.maxDelayExtensions ?? 1),
)

const showConfirmDialog = ref(false)
const showEsignDialog = ref(false)
const pendingOutcomeId = ref(null)
const comment = ref('')
const reassignToUserId = ref(null)
const extendByDays = ref(null)
const reassignError = ref('')
const daysError = ref('')
const commentError = ref('')
const actionLoading = ref(false)

const stepRoles = useLiveQueryWithDeps(
  [() => props.instanceStep?.stepId],
  async (db, [stepId]) => {
    if (!stepId) return []
    return db.WorkflowStepRole.where('stepId', stepId).exec()
  },

  { models: ['WorkflowStepRole'], initial: [] },
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

  { models: ['RoleOnUser', 'User'], initial: [] },
)

const currentUserId = computed(() => currentSession.value?.id)

const filteredReassignCandidates = computed(() =>
  reassignCandidates.value.filter((u) => u.id !== currentUserId.value),
)

const formRequired = computed(
  () => Array.isArray(props.instanceStep?.formSchema) && props.instanceStep.formSchema.length > 0,
)
const formSaveRequired = computed(() => formRequired.value && !capaRecord.value?.submittedAt)

const pendingConfig = computed(() =>
  pendingOutcomeId.value ? (OUTCOME_CONFIG[pendingOutcomeId.value] ?? null) : null,
)

const confirmTitle = computed(() => pendingConfig.value?.label ?? 'Confirm')

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

function onOutcomeClick(outcomeId) {
  if (!props.canActOnStep) return
  pendingOutcomeId.value = outcomeId
  comment.value = ''
  reassignToUserId.value = null
  extendByDays.value = null
  daysError.value = ''

  const config = OUTCOME_CONFIG[outcomeId]
  if (config?.needsComment || config?.needsUser || config?.needsDays) {
    showConfirmDialog.value = true
  } else if (requireEsignature.value) {
    showEsignDialog.value = true
  } else {
    submitAction({})
  }
}

function onConfirmDialog() {
  daysError.value = ''
  commentError.value = ''
  if (pendingConfig.value?.needsUser && !reassignToUserId.value) {
    reassignError.value = 'Please select a user to reassign to'
    return
  }
  if (pendingConfig.value?.needsDays && !(extendByDays.value >= 1)) {
    daysError.value = 'Enter the number of days to extend by'
    return
  }
  if (pendingConfig.value?.commentRequired && !comment.value.trim()) {
    commentError.value = 'A comment is required'
    return
  }
  showConfirmDialog.value = false
  // EXTEND_DELAY is a deferral, not a sign-off — no e-sign.
  if (pendingOutcomeId.value === 'EXTEND_DELAY') {
    submitAction({})
    return
  }
  if (requireEsignature.value) {
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
    if (reassignToUserId.value) body.reassignToUserId = reassignToUserId.value
    if (pendingConfig.value?.needsDays && extendByDays.value >= 1) {
      body.extendByDays = extendByDays.value
    }

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
        v-if="
          OUTCOME_CONFIG[allowed.outcomeId] &&
          (allowed.outcomeId !== 'EXTEND_DELAY' || isDelayExtendable)
        "
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

    <BaseDialog v-model="showConfirmDialog" :title="confirmTitle" maxWidth="md" persistent>
      <BaseField v-if="pendingConfig?.needsUser" label="Reassign to" required class="tw:mb-4">
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
              @change="reassignError = ''"
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
        <p v-if="reassignError" class="tw:text-sm tw:text-red-600 tw:mt-1">{{ reassignError }}</p>
      </BaseField>

      <!-- Extend-delay window picker (presets + custom days) -->
      <BaseField
        v-if="pendingConfig?.needsDays"
        v-slot="{ id: fieldId }"
        label="Extend by"
        required
        class="tw:mb-4"
      >
        <div class="tw:flex tw:flex-wrap tw:items-center tw:gap-2">
          <button
            v-for="preset in DELAY_PRESETS"
            :key="preset.days"
            type="button"
            class="tw:px-3 tw:py-1 tw:rounded-full tw:text-xs tw:font-medium tw:border tw:transition-colors"
            :class="
              extendByDays === preset.days
                ? 'tw:bg-primary tw:text-white tw:border-primary'
                : 'tw:bg-white tw:text-secondary tw:border-divider tw:hover:bg-main-hover'
            "
            @click="((extendByDays = preset.days), (daysError = ''))"
          >
            {{ preset.label }}
          </button>
          <BaseTextInput
            :id="fieldId"
            v-model.number="extendByDays"
            type="number"
            placeholder="Custom"
            inputClass="tw:w-24"
            :min="1"
            @input="daysError = ''"
          />
          <span class="tw:text-xs tw:font-medium tw:text-secondary">days from today</span>
        </div>
        <p v-if="daysError" class="tw:text-sm tw:text-red-600 tw:mt-1">{{ daysError }}</p>
      </BaseField>

      <BaseField
        v-slot="{ id: fieldId }"
        label="Comment"
        :optional="pendingConfig?.needsComment && !pendingConfig?.commentRequired"
        :required="pendingConfig?.commentRequired"
      >
        <textarea
          :id="fieldId"
          v-model="comment"
          rows="3"
          class="tw:w-full tw:rounded-lg tw:border tw:border-divider tw:bg-main tw:text-on-main tw:text-sm tw:p-3 tw:resize-none tw:focus:outline-none tw:focus:ring-2 tw:focus:ring-primary/50"
          placeholder="Add a comment…"
          @input="commentError = ''"
        />
        <p v-if="commentError" class="tw:text-sm tw:text-red-600 tw:mt-1">{{ commentError }}</p>
      </BaseField>

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
  </div>
</template>
