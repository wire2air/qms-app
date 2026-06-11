<script setup>
/**
 * Generic owner-side reassign-this-step dialog for NC / CAPA / CR.
 * Replaces the three duplicated copies that previously lived in
 * CapaWorkflowDetail, NcWorkflowDetail, and ChangeRequestWorkflowSection
 * (~250 lines of mirror code per file before this).
 *
 * Self-contained: parent gets a ref and calls .open(instanceStepId) to
 * pop the dialog. Selecting a candidate + Confirm POSTs to
 * /{module.apiPath}/{resourceId}/reassignStepReviewer with the standard
 * `{ workflowInstanceStepId, toUserId }` body all three controllers
 * expect.
 *
 * Candidate-pool semantics match WorkflowStepReviewerSelect — kept in
 * sync so reassign sees the same pool the submit-time picker drew
 * from:
 *   - Step has roles      → union of users holding any of them
 *   - Step has no roles   → every active internal user
 *                            (role-optional rule, see 7207844)
 *   - Step roles loading  → empty pool (no flash)
 *
 * Inactive + supplier users are filtered out on both branches; reassign
 * doesn't yet respect supplier-facing routing on supplier-facing
 * non-APPROVAL steps — flagged but out of scope for this unification.
 *
 * Currently-assigned users still render in the list but are disabled
 * with a "(Currently assigned)" hint. REJECTED / CANCELLED / REASSIGNED
 * history rows don't block the picker — the owner can put a rejecter
 * back on the step (e.g. they want to give them another shot, or the
 * rejection was a mistake).
 */
import { post } from '@/api'

const props = defineProps({
  module: { type: Object, required: true },
  resourceId: { type: String, required: true },
})

const toast = useToast()

const showDialog = ref(false)
const reassignStepInstanceId = ref(null)
const reassignToUserId = ref(null)
const reassigning = ref(false)

function open(instanceStepId) {
  reassignStepInstanceId.value = instanceStepId
  reassignToUserId.value = null
  showDialog.value = true
}

// ─── Step + role lookups ─────────────────────────────────────────────────────
const reassignInstanceStep = useLiveQueryWithDeps(
  [() => reassignStepInstanceId.value],
  async (db, [id]) => (id ? db.WorkflowInstanceStep.findByPk(id) : null),
)

// Eligible reviewers come from two unioned sources: template-side
// WorkflowStepRole (for template-spawned steps) AND the
// RoleOnWorkflowInstanceStep pivot (for ad-hoc steps added via
// addChildStep). No `initial: []` on either query so we can distinguish
// "loading" from "no roles configured" — same fix as
// WorkflowStepReviewerSelect (a0cfa8d).
const reassignStepRoles = useLiveQueryWithDeps(
  [() => reassignInstanceStep.value?.stepId],
  async (db, [stepId]) => {
    if (!stepId) return []
    return db.WorkflowStepRole.where('stepId', stepId).exec()
  },
)

const reassignInstanceStepRoles = useLiveQueryWithDeps(
  [() => reassignStepInstanceId.value],
  async (db, [id]) => {
    if (!id) return []
    return db.RoleOnWorkflowInstanceStep.where('workflowInstanceStepId', id).exec()
  },
)

const reassignRolesLoaded = computed(
  () =>
    reassignStepRoles.value !== undefined && reassignInstanceStepRoles.value !== undefined,
)

const reassignEffectiveRoleIds = computed(() => {
  const set = new Set([
    ...(reassignStepRoles.value ?? []).map((r) => r.roleId),
    ...(reassignInstanceStepRoles.value ?? []).map((r) => r.roleId),
  ])
  return [...set]
})

const reassignEffectiveRoleNames = useLiveQueryWithDeps(
  [() => reassignEffectiveRoleIds.value.join(',')],
  async (db, [idsStr]) => {
    if (!idsStr) return []
    const ids = idsStr.split(',')
    const roles = await Promise.all(ids.map((id) => db.Role.findByPk(id)))
    return roles.filter(Boolean).map((r) => r.name)
  },
  { initial: [] },
)

// ─── Candidate pool ──────────────────────────────────────────────────────────
const reassignCandidates = useLiveQueryWithDeps(
  [() => reassignRolesLoaded.value, () => reassignEffectiveRoleIds.value.join(',')],
  async (db, [loaded, roleIdsStr]) => {
    if (!loaded) return []
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
    return users.filter((u) => u && u.userStatusId === 'ACTIVE' && u.kind !== 'EXTERNAL_SUPPLIER')
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
    const TERMINAL = new Set(['REASSIGNED', 'REJECTED', 'CANCELLED'])
    return assignments.filter((a) => !TERMINAL.has(a.statusId)).map((a) => a.userId)
  },
  { initial: [] },
)

function isUserAlreadyAssigned(userId) {
  return currentlyAssignedUserIds.value.includes(userId)
}

async function handleReassign() {
  if (!reassignStepInstanceId.value || !reassignToUserId.value) return
  reassigning.value = true
  try {
    await post(
      `/v1/services/${props.module.apiPath}/${props.resourceId}/reassignStepReviewer`,
      {
        workflowInstanceStepId: reassignStepInstanceId.value,
        toUserId: reassignToUserId.value,
      },
    )
    showDialog.value = false
    toast.success('Reviewer reassigned successfully')
  } catch (e) {
    toast.error(e.message || 'Failed to reassign reviewer')
  } finally {
    reassigning.value = false
  }
}

// Parent gets a ref → calls .open(instanceStepId) to pop the dialog.
// `vue/define-macros-order` wants defineExpose to be the last statement
// in <script setup>, so it sits down here instead of next to `open()`.
defineExpose({ open })
</script>

<template>
  <BaseDialog v-model="showDialog" title="Reassign Task" maxWidth="md">
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

        <!-- Empty-state hints gate on reassignRolesLoaded so neither
             flashes during the initial query, and the role-gated copy
             names the role(s) so the owner knows exactly which one
             needs members. -->
        <p
          v-if="
            reassignRolesLoaded && reassignEffectiveRoleIds.length && !reassignCandidates.length
          "
          class="tw:text-sm tw:text-secondary"
        >
          No users assigned to role{{ reassignEffectiveRoleNames.length > 1 ? 's' : '' }}:
          <strong>
            {{ reassignEffectiveRoleNames.join(', ') || 'configured for this step' }}
          </strong>
          . Assign a user to the role before reassigning.
        </p>
        <p
          v-else-if="
            reassignRolesLoaded && !reassignEffectiveRoleIds.length && !reassignCandidates.length
          "
          class="tw:text-sm tw:text-secondary"
        >
          No active internal users in your company.
        </p>
      </div>
    </div>
    <div class="tw:flex tw:justify-end tw:gap-2 tw:pt-3 tw:border-t tw:border-divider">
      <BaseButton variant="outline" @click="showDialog = false">Cancel</BaseButton>
      <BaseButton
        variant="primary"
        :disabled="!reassignToUserId || reassigning"
        @click="handleReassign"
      >
        {{ reassigning ? 'Reassigning…' : 'Reassign' }}
      </BaseButton>
    </div>
  </BaseDialog>
</template>
