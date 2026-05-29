<script setup>
import { RadioGroup, RadioGroupOption } from '@headlessui/vue'

const props = defineProps({
  step: { type: Object, required: true },
  stepIndex: { type: Number, required: true },
  required: { type: Boolean, default: false },
  // Supplier-facing routing — when true AND this step is NOT APPROVAL,
  // candidates come from active supplier users (kind=EXTERNAL_SUPPLIER
  // scoped to supplierId) instead of the role-eligible internal pool.
  // Approval steps stay internal so the owner can attest CFR-21-Part-11
  // signatures even on supplier-facing NCs. Default auto-pick for the
  // approval step is the owner.
  isSupplierFacing: { type: Boolean, default: false },
  supplierId: { type: String, default: null },
  ownerId: { type: String, default: null },
})

// v-model binding for selected userId (local state, not IDB)
const modelValue = defineModel({ type: String, default: null })

const isApprovalStep = computed(() => props.step?.stepType === 'APPROVAL')
const usesSupplierPicker = computed(
  () => props.isSupplierFacing && !isApprovalStep.value,
)

// Internal-pool candidates: users holding at least one role this step
// declares. Same logic as before — used for non-supplier-facing NCs and
// for APPROVAL steps even on supplier-facing NCs.
const stepRoles = useLiveQueryWithDeps(
  [() => props.step.id],
  async (db, [stepId]) => {
    if (!stepId) return []
    return db.WorkflowStepRole.where('stepId', stepId).exec()
  },
  { initial: [] },
)

const internalCandidates = useLiveQueryWithDeps(
  [() => stepRoles.value.map((r) => r.roleId).join(',')],
  async (db, [roleIdsStr]) => {
    if (!roleIdsStr) return []
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

// Supplier-pool candidates: active users at the NC's supplier. No role
// gating — the supplier picks their own reviewer; the workflow step's
// label tells the supplier WHAT to do, not WHO does it.
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
  { initial: [] },
)

const candidateUsers = computed(() =>
  usesSupplierPicker.value ? supplierCandidates.value : internalCandidates.value,
)

// Auto-select the sensible default when required and no selection
// exists. For approval steps on a supplier-facing NC the owner is the
// default approver (per the regulatory-attestation rule). Otherwise the
// first available candidate.
let autoSelectDone = false
watch(
  [candidateUsers, modelValue, usesSupplierPicker, () => props.ownerId, internalCandidates],
  ([users, currentId, supplierMode, ownerId, internals]) => {
    if (!props.required || autoSelectDone) return
    if (currentId != null) {
      autoSelectDone = true
      return
    }
    // Approval on a supplier-facing NC: prefer the owner (who is
    // typically the internal QM submitting the NC). Fall back to first
    // role-eligible internal user if the owner isn't in the role pool.
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

function getUserInitials(user) {
  return (user.firstName?.[0] ?? '') + (user.lastName?.[0] ?? '')
}

function getUserDisplayName(user) {
  const parts = [user.firstName, user.lastName].filter(Boolean)
  return parts.length > 0 ? parts.join(' ') : user.email
}
</script>

<template>
  <div class="tw:bg-white tw:border tw:border-divider tw:rounded-lg tw:p-4 tw:space-y-3">
    <!-- Step header -->
    <div class="tw:flex tw:items-center tw:gap-2 tw:flex-wrap">
      <div
        class="tw:w-6 tw:h-6 tw:rounded-full tw:flex tw:items-center tw:justify-center tw:text-xs tw:font-bold tw:shrink-0"
        :class="modelValue ? 'tw:bg-primary tw:text-white' : 'tw:bg-main-hover tw:text-secondary'"
      >
        {{ stepIndex + 1 }}
      </div>
      <span class="tw:text-sm tw:font-semibold tw:text-on-main">
        {{ step.name }}
        <span v-if="required" class="tw:text-red-500">*</span>
      </span>
      <!-- Picker-pool chip — matches the inline draft-preview chips so
           the admin can tell at a glance which candidate pool each step
           is drawing from. -->
      <span
        v-if="usesSupplierPicker"
        class="tw:text-[10px] tw:rounded tw:bg-violet-100 tw:text-violet-700 tw:px-1.5 tw:py-0.5"
        title="Candidates are active users at this NC's supplier."
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

    <!-- Empty: supplier-facing but no active supplier users -->
    <div
      v-if="usesSupplierPicker && !candidateUsers.length"
      class="tw:text-sm tw:text-secondary tw:italic tw:px-1"
    >
      No active users at this supplier yet. Invite a user under
      <strong>Suppliers → Users</strong> and have them accept before submitting this NC.
    </div>

    <!-- Empty state when no roles configured (internal path) -->
    <div
      v-else-if="!usesSupplierPicker && !stepRoles.length"
      class="tw:text-sm tw:text-secondary tw:italic tw:px-1"
    >
      No roles configured for this step — no candidates available.
    </div>

    <!-- Empty state when roles exist but no users assigned to them (internal path) -->
    <div
      v-else-if="!usesSupplierPicker && stepRoles.length && !candidateUsers.length"
      class="tw:text-sm tw:text-secondary tw:italic tw:px-1"
    >
      No internal users hold the role(s) configured for this step.
    </div>

    <!-- Radio group of candidate users -->
    <RadioGroup v-else v-model="modelValue">
      <div class="tw:space-y-2">
        <RadioGroupOption
          v-for="user in candidateUsers"
          :key="user.id"
          :value="user.id"
          v-slot="{ checked }"
          as="template"
        >
          <div
            class="tw:relative tw:flex tw:cursor-pointer tw:rounded-lg tw:px-4 tw:py-3 tw:border tw:transition-colors tw:select-none"
            :class="
              checked
                ? 'tw:border-primary tw:bg-primary/5'
                : 'tw:border-divider tw:hover:bg-main-hover'
            "
          >
            <div class="tw:flex tw:items-center tw:gap-3 tw:w-full">
              <!-- Avatar circle -->
              <div
                class="tw:w-8 tw:h-8 tw:rounded-full tw:flex tw:items-center tw:justify-center tw:text-xs tw:font-bold tw:text-white tw:shrink-0"
                :style="{ backgroundColor: user.color || '#2563eb' }"
              >
                {{ getUserInitials(user) || user.email?.[0]?.toUpperCase() }}
              </div>

              <!-- Name & email -->
              <div class="tw:flex-1 tw:min-w-0">
                <div class="tw:text-sm tw:font-medium tw:text-on-main">
                  {{ getUserDisplayName(user) }}
                </div>
                <div class="tw:text-xs tw:text-secondary tw:truncate">{{ user.email }}</div>
              </div>

              <!-- Selected indicator -->
              <div
                class="tw:w-5 tw:h-5 tw:rounded-full tw:border-2 tw:shrink-0 tw:flex tw:items-center tw:justify-center tw:transition-colors"
                :class="
                  checked ? 'tw:border-primary tw:bg-primary' : 'tw:border-divider tw:bg-white'
                "
              >
                <div v-show="checked" class="tw:w-2 tw:h-2 tw:rounded-full tw:bg-white" />
              </div>
            </div>
          </div>
        </RadioGroupOption>
      </div>
    </RadioGroup>

    <!-- Validation message -->
    <div
      v-if="required && !modelValue && candidateUsers.length > 0"
      class="tw:text-xs tw:text-red-500"
    >
      Please select a reviewer for this step.
    </div>
  </div>
</template>
