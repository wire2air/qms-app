<script setup>
import { post } from '@/api'

const props = defineProps({
  capaId: { type: String, required: true },
  workflowInstanceId: { type: String, default: null },
  isOwner: { type: Boolean, default: false },
})

const toast = useToast()

const workflowInstanceSteps = useLiveQueryWithDeps(
  [() => props.workflowInstanceId],
  async (db, [instanceId]) => {
    if (!instanceId) return []
    const all = await db.WorkflowInstanceStep.where('workflowInstanceId', instanceId)
      .orderBy('stepNumber', 'asc')
      .exec()
    // Collapse to the latest instance per stepId (handles send-back churn).
    const latestByStepId = new Map()
    for (const step of all) {
      const existing = latestByStepId.get(step.stepId)
      if (!existing || step.createdAt > existing.createdAt) {
        latestByStepId.set(step.stepId, step)
      }
    }
    const latest = [...latestByStepId.values()]
    // Only show root-level instance steps at this depth — children are rendered
    // nested inside their parent stage by CapaWorkflowStep.
    const stepIds = latest.map((s) => s.stepId)
    if (stepIds.length === 0) return []
    const defs = await Promise.all(stepIds.map((id) => db.WorkflowStep.findByPk(id)))
    const isRoot = new Map(defs.filter(Boolean).map((d) => [d.id, !d.parentStepId]))
    return latest
      .filter((s) => isRoot.get(s.stepId))
      .sort((a, b) => a.stepNumber - b.stepNumber)
  },
  { initial: [] },
)

const currentStep = computed(() =>
  workflowInstanceSteps.value.find((s) => s.statusId === 'IN_PROGRESS'),
)

const sendBackTargets = useLiveQueryWithDeps(
  [() => currentStep.value?.stepId],
  async (db, [stepId]) => {
    if (!stepId) return []
    return db.StepSendBackTarget.where('stepId', stepId).exec()
  },
  { initial: [] },
)

const sendBackTargetNames = useLiveQueryWithDeps(
  [() => sendBackTargets.value.map((t) => t.targetStepId).join(',')],
  async (db, [idsStr]) => {
    if (!idsStr) return {}
    const ids = [...new Set(idsStr.split(','))]
    const steps = await Promise.all(ids.map((id) => db.WorkflowStep.findByPk(id)))
    return Object.fromEntries(steps.filter(Boolean).map((s) => [s.id, s.name]))
  },
  { initial: {} },
)

// ─── Reassign dialog ─────────────────────────────────────────────────────────
const showReassignDialog = ref(false)
const reassignStepInstanceId = ref(null)
const reassignToUserId = ref(null)
const reassigning = ref(false)

const reassignInstanceStep = useLiveQueryWithDeps(
  [() => reassignStepInstanceId.value],
  async (db, [id]) => (id ? db.WorkflowInstanceStep.findByPk(id) : null),
)

const reassignStepRoles = useLiveQueryWithDeps(
  [() => reassignInstanceStep.value?.stepId],
  async (db, [stepId]) => {
    if (!stepId) return []
    return db.WorkflowStepRole.where('stepId', stepId).exec()
  },
  { initial: [] },
)

const reassignCandidates = useLiveQueryWithDeps(
  [() => reassignStepRoles.value.map((r) => r.roleId).join(',')],
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

const currentlyAssignedUserIds = useLiveQueryWithDeps(
  [() => reassignStepInstanceId.value],
  async (db, [id]) => {
    if (!id) return []
    const assignments = await db.UserOnWorkflowInstanceStep.where(
      'workflowInstanceStepId',
      id,
    ).exec()
    // Mirror the backend's "active" semantics (statusId != 'REASSIGNED') so a
    // PENDING reviewer isn't offered as a reassign candidate — otherwise the
    // server rejects with "Cannot reassign to the same user".
    return assignments.filter((a) => a.statusId !== 'REASSIGNED').map((a) => a.userId)
  },
  { initial: [] },
)

function isUserAlreadyAssigned(userId) {
  return currentlyAssignedUserIds.value.includes(userId)
}

function openReassignDialog(instanceStepId) {
  reassignStepInstanceId.value = instanceStepId
  reassignToUserId.value = null
  showReassignDialog.value = true
}

async function handleReassign() {
  if (!reassignStepInstanceId.value || !reassignToUserId.value) return
  reassigning.value = true
  try {
    await post(`/v1/services/capas/${props.capaId}/reassignStepReviewer`, {
      workflowInstanceStepId: reassignStepInstanceId.value,
      toUserId: reassignToUserId.value,
    })
    showReassignDialog.value = false
    toast.success('Reviewer reassigned successfully')
  } catch (e) {
    toast.error(e.message || 'Failed to reassign reviewer')
  } finally {
    reassigning.value = false
  }
}

// ─── Send back dialog ────────────────────────────────────────────────────────
const showSendBackDialog = ref(false)
const sendBackTargetStepId = ref(null)
const sendingBack = ref(false)

function openSendBackDialog() {
  sendBackTargetStepId.value = null
  showSendBackDialog.value = true
}

async function handleSendBack() {
  if (!sendBackTargetStepId.value) return
  sendingBack.value = true
  try {
    await post(`/v1/services/capas/${props.capaId}/sendBack`, {
      targetStepId: sendBackTargetStepId.value,
    })
    showSendBackDialog.value = false
    toast.success('Step sent back successfully')
  } catch (e) {
    toast.error(e.message || 'Failed to send back step')
  } finally {
    sendingBack.value = false
  }
}
</script>

<template>
  <template v-if="workflowInstanceSteps.length">
    <CapaWorkflowStep
      v-for="(step, idx) in workflowInstanceSteps"
      :key="step.id"
      :instanceStepId="step.id"
      :capaId="capaId"
      :isOwner="isOwner"
      :hasSendBackTargets="step.statusId === 'IN_PROGRESS' && sendBackTargets.length > 0"
      :displayNumber="String(idx + 1)"
      @reassign="openReassignDialog"
      @sendBack="openSendBackDialog"
    />
  </template>

  <BaseDialog v-model="showReassignDialog" title="Reassign Step Reviewer" maxWidth="md">
    <div class="tw:mb-4">
      <label class="tw:block tw:text-sm tw:font-medium tw:text-on-main tw:mb-2">
        Select new reviewer <span class="tw:text-red-500">*</span>
      </label>
      <div class="tw:flex tw:flex-col tw:gap-2">
        <label
          v-for="user in reassignCandidates"
          :key="user.id"
          class="tw:flex tw:items-center tw:gap-3 tw:rounded-lg tw:px-3 tw:py-2 tw:border tw:transition-colors"
          :class="[
            isUserAlreadyAssigned(user.id)
              ? 'tw:border-divider tw:bg-main-hover/40 tw:opacity-70 tw:cursor-not-allowed'
              : reassignToUserId === user.id
                ? 'tw:border-primary tw:bg-primary/5 tw:cursor-pointer'
                : 'tw:border-divider tw:hover:bg-main-hover tw:cursor-pointer',
          ]"
        >
          <input
            v-model="reassignToUserId"
            type="radio"
            :value="user.id"
            :disabled="isUserAlreadyAssigned(user.id)"
            class="tw:accent-primary"
          />
          <div class="tw:flex-1 tw:min-w-0">
            <div class="tw:text-sm tw:font-medium tw:text-on-main">
              {{ [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email }}
              <span
                v-if="isUserAlreadyAssigned(user.id)"
                class="tw:text-[10px] tw:font-medium tw:text-secondary tw:ml-1"
              >
                (Currently assigned)
              </span>
            </div>
            <div class="tw:text-xs tw:text-secondary tw:truncate">{{ user.email }}</div>
          </div>
        </label>
        <p v-if="!reassignCandidates.length" class="tw:text-sm tw:text-secondary">
          No users hold the role(s) required for this step.
        </p>
      </div>
    </div>
    <div class="tw:flex tw:justify-end tw:gap-2 tw:pt-3 tw:border-t tw:border-divider">
      <BaseButton variant="outline" @click="showReassignDialog = false">Cancel</BaseButton>
      <BaseButton
        variant="primary"
        :disabled="!reassignToUserId || reassigning"
        @click="handleReassign"
      >
        {{ reassigning ? 'Reassigning…' : 'Reassign' }}
      </BaseButton>
    </div>
  </BaseDialog>

  <BaseDialog v-model="showSendBackDialog" title="Send Back Step" maxWidth="md">
    <div class="tw:mb-4">
      <label class="tw:block tw:text-sm tw:font-medium tw:text-on-main tw:mb-2">
        Select target step to send back to <span class="tw:text-red-500">*</span>
      </label>
      <div class="tw:flex tw:flex-col tw:gap-2">
        <label
          v-for="target in sendBackTargets"
          :key="target.id"
          class="tw:flex tw:items-center tw:gap-3 tw:cursor-pointer tw:rounded-lg tw:px-3 tw:py-2 tw:border tw:transition-colors"
          :class="
            sendBackTargetStepId === target.targetStepId
              ? 'tw:border-primary tw:bg-primary/5'
              : 'tw:border-divider tw:hover:bg-main-hover'
          "
        >
          <input
            v-model="sendBackTargetStepId"
            type="radio"
            :value="target.targetStepId"
            class="tw:accent-primary"
          />
          <span class="tw:text-sm tw:font-medium tw:text-on-main">
            {{ sendBackTargetNames[target.targetStepId] || target.targetStepId }}
          </span>
        </label>
        <p v-if="!sendBackTargets.length" class="tw:text-sm tw:text-secondary">
          No send-back targets configured for this step.
        </p>
      </div>
    </div>
    <div class="tw:flex tw:justify-end tw:gap-2 tw:pt-3 tw:border-t tw:border-divider">
      <BaseButton variant="outline" @click="showSendBackDialog = false">Cancel</BaseButton>
      <BaseButton
        variant="primary"
        :disabled="!sendBackTargetStepId || sendingBack"
        @click="handleSendBack"
      >
        {{ sendingBack ? 'Sending…' : 'Send back' }}
      </BaseButton>
    </div>
  </BaseDialog>
</template>
