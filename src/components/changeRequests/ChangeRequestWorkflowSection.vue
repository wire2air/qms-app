<script setup>
/**
 * Live workflow detail for a Change Request. Renders each step as a
 * generic WorkflowStep (module=CR_MODULE) — same component CAPA uses.
 * Inline action buttons (Mark Complete, Reopen, Reassign, Cancel) and
 * the secondary dropdown come from the generic component; CR-specific
 * child sub-tasks for the Implementation stage go through the
 * #childSteps slot.
 *
 * Reassign is owned by this section (owner clicks on a step → emits
 * to parent which mounts the shared picker dialog). Same pattern as
 * CapaWorkflowDetail.
 */
import { post } from '@/api'
import WorkflowStep from '@/components/workflow/WorkflowStep.vue'
import { CR_MODULE } from '@/components/workflow/workflowModule.js'

const props = defineProps({
  crId: { type: String, required: true },
  workflowInstanceId: { type: String, default: null },
  isOwner: { type: Boolean, default: false },
})

const toast = useToast()

const steps = useLiveQueryWithDeps(
  [() => props.workflowInstanceId],
  async (db, [id]) => {
    if (!id) return []
    const all = await db.WorkflowInstanceStep.where('workflowInstanceId', id)
      .orderBy('stepNumber', 'asc')
      .exec()
    // Collapse to latest instance per stepId (send-back churn) +
    // only roots — children render nested inside their parent.
    const latestByStepId = new Map()
    for (const s of all) {
      const existing = latestByStepId.get(s.stepId)
      if (!existing || s.createdAt > existing.createdAt) {
        latestByStepId.set(s.stepId, s)
      }
    }
    return [...latestByStepId.values()]
      .filter((s) => !s.parentInstanceStepId)
      .sort((a, b) => a.stepNumber - b.stepNumber)
  },
  { initial: [] },
)

// ─── Reassign dialog (owner) ─────────────────────────────────────────────────
const showReassignDialog = ref(false)
const reassignStepInstanceId = ref(null)
const reassignToUserId = ref(null)
const reassigning = ref(false)

const reassignInstanceStep = useLiveQueryWithDeps(
  [() => reassignStepInstanceId.value],
  async (db, [id]) => (id ? db.WorkflowInstanceStep.findByPk(id) : null),
)

const reassignTemplateRoles = useLiveQueryWithDeps(
  [() => reassignInstanceStep.value?.stepId],
  async (db, [stepId]) => {
    if (!stepId) return []
    return db.WorkflowStepRole.where('stepId', stepId).exec()
  },
  { initial: [] },
)
const reassignAdHocRoles = useLiveQueryWithDeps(
  [() => reassignStepInstanceId.value],
  async (db, [id]) => {
    if (!id) return []
    return db.RoleOnWorkflowInstanceStep.where('workflowInstanceStepId', id).exec()
  },
  { initial: [] },
)
const reassignEffectiveRoleIds = computed(() => {
  const set = new Set([
    ...reassignTemplateRoles.value.map((r) => r.roleId),
    ...reassignAdHocRoles.value.map((r) => r.roleId),
  ])
  return [...set]
})

// Role-less step → every active internal user is eligible (matches
// the role-optional rule the submit-time picker uses; see 7207844).
// With roles → union of users holding any of them.
const reassignCandidates = useLiveQueryWithDeps(
  [() => reassignEffectiveRoleIds.value.join(',')],
  async (db, [roleIdsStr]) => {
    if (!roleIdsStr) {
      const all = await db.User.where().exec()
      return all.filter((u) => u.userStatusId === 'ACTIVE' && u.kind !== 'EXTERNAL_SUPPLIER')
    }
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
    // Only ACTIVE assignments block a reassign. REJECTED / CANCELLED /
    // REASSIGNED are terminal history.
    const TERMINAL = new Set(['REASSIGNED', 'REJECTED', 'CANCELLED'])
    return assignments.filter((a) => !TERMINAL.has(a.statusId)).map((a) => a.userId)
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
    await post(`/v1/services/changeRequests/${props.crId}/reassignStepReviewer`, {
      workflowInstanceStepId: reassignStepInstanceId.value,
      toUserId: reassignToUserId.value,
    })
    showReassignDialog.value = false
    toast.success('Reviewer reassigned')
  } catch (e) {
    toast.error(e.message || 'Failed to reassign reviewer')
  } finally {
    reassigning.value = false
  }
}
</script>

<template>
  <div class="tw:contents">
    <template v-if="steps.length">
      <WorkflowStep
        v-for="(step, idx) in steps"
        :key="step.id"
        :module="CR_MODULE"
        :instanceStepId="step.id"
        :resourceId="crId"
        :isOwner="isOwner"
        :displayNumber="String(idx + 1)"
        @reassign="openReassignDialog"
      >
        <template
          #childSteps="{ instanceStep: parentStep, stepDefinition: parentDef, displayNumber: parentNum }"
        >
          <ChangeRequestWorkflowChildSteps
            v-if="parentStep && parentDef?.allowChildSteps && parentStep.workflowInstanceId"
            :parentInstanceStepId="parentStep.id"
            :parentStepNumber="parentNum"
            :workflowInstanceId="parentStep.workflowInstanceId"
            :crId="crId"
            :isOwner="isOwner"
            :allowChildSteps="!!parentDef?.allowChildSteps"
            class="tw:mt-4 tw:mb-4"
            @reassign="(childId) => openReassignDialog(childId)"
          />
        </template>
      </WorkflowStep>
    </template>
    <div
      v-else-if="workflowInstanceId"
      class="tw:bg-white tw:border tw:border-divider tw:rounded-lg tw:p-5 tw:text-sm tw:text-secondary tw:italic"
    >
      No workflow steps to show yet.
    </div>

    <!-- Reassign dialog -->
    <BaseDialog v-model="showReassignDialog" title="Reassign Task" maxWidth="md">
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
            {{
              reassignEffectiveRoleIds.length
                ? 'No users hold the role(s) required for this step.'
                : 'No active internal users in your company.'
            }}
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
  </div>
</template>
