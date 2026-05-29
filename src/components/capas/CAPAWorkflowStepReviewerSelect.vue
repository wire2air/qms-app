<script setup>
import { RadioGroup, RadioGroupOption } from '@headlessui/vue'

const props = defineProps({
  step: { type: Object, required: true },
  stepIndex: { type: Number, required: true },
  parentIndex: { type: Number, default: null },
  isChild: { type: Boolean, default: false },
  required: { type: Boolean, default: false },
  // Mirrors the NC equivalent — supplier-facing CAPAs route non-
  // APPROVAL steps to the supplier's users; APPROVAL stays internal
  // with owner-as-default.
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
const usesSupplierPicker = computed(
  () => props.isSupplierFacing && !isApprovalStep.value,
)

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

function getUserInitials(user) {
  return (user.firstName?.[0] ?? '') + (user.lastName?.[0] ?? '')
}

function getUserDisplayName(user) {
  const parts = [user.firstName, user.lastName].filter(Boolean)
  return parts.length > 0 ? parts.join(' ') : user.email
}
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
        title="Candidates are active users at this CAPA's supplier."
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

    <div
      v-if="usesSupplierPicker && !candidateUsers.length"
      class="tw:text-sm tw:text-secondary tw:italic tw:px-1"
    >
      No active users at this supplier yet. Invite a user under
      <strong>Suppliers → Users</strong> and have them accept before submitting this CAPA.
    </div>

    <div
      v-else-if="!usesSupplierPicker && !stepRoles.length"
      class="tw:text-sm tw:text-secondary tw:italic tw:px-1"
    >
      No roles configured for this step — no candidates available.
    </div>

    <div
      v-else-if="!usesSupplierPicker && stepRoles.length && !candidateUsers.length"
      class="tw:text-sm tw:text-secondary tw:italic tw:px-1"
    >
      No internal users hold the role(s) configured for this step.
    </div>

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
              <div
                class="tw:w-8 tw:h-8 tw:rounded-full tw:flex tw:items-center tw:justify-center tw:text-xs tw:font-bold tw:text-white tw:shrink-0"
                :style="{ backgroundColor: user.color || '#2563eb' }"
              >
                {{ getUserInitials(user) || user.email?.[0]?.toUpperCase() }}
              </div>

              <div class="tw:flex-1 tw:min-w-0">
                <div class="tw:text-sm tw:font-medium tw:text-on-main">
                  {{ getUserDisplayName(user) }}
                </div>
                <div class="tw:text-xs tw:text-secondary tw:truncate">{{ user.email }}</div>
              </div>

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

    <div
      v-if="required && !modelValue && candidateUsers.length > 0"
      class="tw:text-xs tw:text-red-500"
    >
      Please select a reviewer for this step.
    </div>
  </div>
</template>
