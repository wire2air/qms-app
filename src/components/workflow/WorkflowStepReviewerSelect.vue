<script setup>
/**
 * Single-row reviewer picker for a workflow step at submit time.
 * Replaces NCWorkflowStepReviewerSelect + CAPAWorkflowStepReviewerSelect
 * (line-for-line near-mirrors before the unification). Behaviour:
 *
 *  - Step has roles configured → candidate pool = union of users
 *    holding any of those roles.
 *  - Step has no roles → candidate pool = every active internal user
 *    (the no-friction rule for small teams; see 6730625 / 7207844).
 *  - Supplier-facing entity + non-APPROVAL step → swap the pool for
 *    active supplier users at the entity's supplierId. APPROVAL stays
 *    internal (CFR-21 attestation; can't be delegated to a supplier).
 *  - On a supplier-facing entity, APPROVAL steps auto-default the
 *    owner as the approver if the owner is in the role pool.
 *
 * Child-step rendering is always-on but benign for modules whose
 * templates don't define children (NC) — `isChild` defaults to false
 * and the parent indent / numeric prefix logic short-circuits.
 *
 * Empty-state hints use `module.displayName` so the wording reads
 * naturally per module ('… before submitting this NC' vs 'this CAPA').
 */
const props = defineProps({
  module: { type: Object, required: true },
  step: { type: Object, required: true },
  stepIndex: { type: Number, required: true },
  parentIndex: { type: Number, default: null },
  isChild: { type: Boolean, default: false },
  required: { type: Boolean, default: false },
  // Supplier-facing routing — when true AND this step is NOT APPROVAL,
  // candidates come from active supplier users (kind=EXTERNAL_SUPPLIER
  // scoped to supplierId) instead of the role / all-internal pool.
  isSupplierFacing: { type: Boolean, default: false },
  supplierId: { type: String, default: null },
  ownerId: { type: String, default: null },
})

const modelValue = defineModel({ type: String, default: null })

const numberLabel = computed(() => {
  if (props.isChild) {
    const parent = props.parentIndex != null ? props.parentIndex + 1 : '?'
    return `${parent}.${props.stepIndex + 1}`
  }
  return `${props.stepIndex + 1}`
})

const isApprovalStep = computed(() => props.step?.stepType === 'APPROVAL')
const usesSupplierPicker = computed(() => props.isSupplierFacing && !isApprovalStep.value)

// No `initial: []` here on purpose: we need to distinguish
//   stepRoles === undefined → IDB query still loading
//   stepRoles === []        → confirmed: step has no roles configured
//                              (role-optional path → all-users branch)
//   stepRoles === [{...}]   → step has roles; filter the pool
// Without the distinction, the role-less branch raced the initial paint
// for role-gated steps and auto-selected a user who shouldn't have been
// eligible (see the LogBook submit-dialog regression report).
const stepRoles = useLiveQueryWithDeps(
  [() => props.step.id],

  async (db, [stepId]) => {
    if (!stepId) return []
    return db.WorkflowStepRole.where('stepId', stepId).exec()
  },
  { models: ['WorkflowStepRole'] },
)

const stepRolesLoaded = computed(() => stepRoles.value !== undefined)
const stepRoleIds = computed(() => (stepRoles.value ?? []).map((r) => r.roleId))

// Resolve role names for the empty-state hint — when a step has roles
// and no eligible users hold them, the hint reads "No users assigned
// to role(s): X, Y" instead of the generic "No internal users hold the
// role(s) configured for this step", so the author knows exactly which
// role needs members.
const stepRoleNames = useLiveQueryWithDeps(
  [() => stepRoleIds.value.join(',')],
  async (db, [idsStr]) => {
    if (!idsStr) return []
    const ids = idsStr.split(',')
    const roles = await Promise.all(ids.map((id) => db.Role.findByPk(id)))
    return roles.filter(Boolean).map((r) => r.name)
  },

  { models: ['Role'], initial: [] },
)

// Role-less step → all active internal users (no-friction rule for
// small teams). Otherwise union of users holding any configured role.
// While stepRoles is still loading we return [] so the auto-select
// watch below doesn't fire on a transient empty role state.
const internalCandidates = useLiveQueryWithDeps(
  [() => stepRolesLoaded.value, () => stepRoleIds.value.join(',')],
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

  { models: ['User', 'RoleOnUser'], initial: [] },
)

const supplierCandidates = useLiveQueryWithDeps(
  [() => props.supplierId, () => props.isSupplierFacing],
  async (db, [supplierId, isSupplierFacing]) => {
    if (!isSupplierFacing || !supplierId) return []
    const all = await db.User.where().exec()
    return all.filter(
      (u) =>
        u.kind === 'EXTERNAL_SUPPLIER' &&
        u.supplierId === supplierId &&
        u.userStatusId === 'ACTIVE',
    )
  },

  { models: ['User'], initial: [] },
)

const candidateUsers = computed(() =>
  usesSupplierPicker.value ? supplierCandidates.value : internalCandidates.value,
)

// Auto-select sensible default on the first required step:
//  - Approval on a supplier-facing entity → prefer the owner (CFR-21
//    attestation rule). Falls back to first role-eligible internal
//    user if the owner isn't in the pool.
//  - Anywhere else → first available candidate.
let autoSelectDone = false
watch(
  [candidateUsers, modelValue, usesSupplierPicker, () => props.ownerId, internalCandidates],
  ([users, currentId, supplierMode, ownerId, internals]) => {
    if (!props.required || autoSelectDone) return
    if (currentId != null) {
      autoSelectDone = true
      return
    }
    if (!supplierMode && props.isSupplierFacing && isApprovalStep.value && ownerId) {
      const ownerCandidate = internals.find((u) => u.id === ownerId)
      if (ownerCandidate) {
        autoSelectDone = true
        modelValue.value = ownerCandidate.id
        return
      }
    }
    if (!users.length) return
    autoSelectDone = true
    modelValue.value = users[0].id
  },
  { immediate: true },
)
</script>

<template>
  <div
    class="tw:border tw:border-divider tw:rounded-lg tw:space-y-3"
    :class="
      isChild
        ? 'tw:bg-main-hover/40 tw:ml-8 tw:p-3 tw:border-l-2 tw:border-l-primary/40'
        : 'tw:bg-white tw:p-4'
    "
  >
    <div class="tw:flex tw:items-center tw:gap-3">
      <div
        class="tw:rounded-full tw:flex tw:items-center tw:justify-center tw:font-bold tw:shrink-0"
        :class="[
          isChild ? 'tw:w-5 tw:h-5 tw:text-[10px]' : 'tw:w-6 tw:h-6 tw:text-xs',
          modelValue ? 'tw:bg-primary tw:text-white' : 'tw:bg-main-hover tw:text-secondary',
        ]"
      >
        {{ numberLabel }}
      </div>
      <span class="tw:font-semibold tw:text-on-main" :class="isChild ? 'tw:text-xs' : 'tw:text-sm'">
        {{ step.name }}
        <span v-if="required" class="tw:text-red-500">*</span>
      </span>
      <span
        v-if="usesSupplierPicker"
        class="tw:text-[10px] tw:rounded tw:bg-violet-100 tw:text-violet-700 tw:px-1.5 tw:py-0.5"
        :title="`Candidates are active users at this ${module.displayName}'s supplier.`"
      >
        Supplier picker
      </span>
      <span
        v-else-if="isSupplierFacing && isApprovalStep"
        class="tw:text-[10px] tw:rounded tw:bg-amber-50 tw:text-amber-700 tw:px-1.5 tw:py-0.5"
        title="Approval steps stay internal even on supplier-facing records."
      >
        Approval · Internal only
      </span>
    </div>

    <!-- Picker — :required="true" always so the "All" null option
         never shows on a reviewer picker. The parent's `required`
         drives the "must pick before submit" rule on the first step. -->
    <UserSelectMenu
      v-if="usesSupplierPicker"
      v-model="modelValue"
      kind="EXTERNAL_SUPPLIER"
      :supplierId="supplierId"
      :required="true"
    />
    <UserSelectMenu
      v-else
      v-model="modelValue"
      kind="INTERNAL"
      :roleIdsFilter="stepRoleIds.length ? stepRoleIds : null"
      :required="true"
    />

    <div
      v-if="usesSupplierPicker && !candidateUsers.length"
      class="tw:text-xs tw:text-secondary tw:italic tw:px-1"
    >
      No active users at this supplier yet. Invite a user under
      <strong>Suppliers → Users</strong> and have them accept before submitting this
      {{ module.displayName }}.
    </div>
    <!-- Empty-state hints only fire after stepRoles has loaded, so we
         don't flash the wrong copy during the initial query. -->
    <div
      v-else-if="
        !usesSupplierPicker && stepRolesLoaded && stepRoleIds.length && !candidateUsers.length
      "
      class="tw:text-xs tw:text-secondary tw:italic tw:px-1"
    >
      No users assigned to role{{ stepRoleNames.length > 1 ? 's' : '' }}:
      <strong>{{ stepRoleNames.join(', ') || 'configured for this step' }}</strong
      >. Assign a user to the role before submitting.
    </div>
    <div
      v-else-if="
        !usesSupplierPicker && stepRolesLoaded && !stepRoleIds.length && !candidateUsers.length
      "
      class="tw:text-xs tw:text-secondary tw:italic tw:px-1"
    >
      No active internal users in your company.
    </div>

    <div
      v-if="required && !modelValue && candidateUsers.length > 0"
      class="tw:text-xs tw:text-red-500"
    >
      Please select a reviewer for this step.
    </div>
  </div>
</template>
