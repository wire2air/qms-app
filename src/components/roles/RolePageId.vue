<script setup>
import { IconHistory, IconSearch, IconLock } from '@tabler/icons-vue'
import { getCompanyPath } from '@/utils/routeHelpers'
import { useRoles } from '@/composables/useRoles.js'
import { isAllowed } from '@/utils/currentSession.js'
import { buildRoleSections, buildRoleActions } from './roleDetailConfig.js'

const props = defineProps({
  id: {
    type: String,
    required: true,
  },
})

const toast = useToast()
const router = useRouter()
const { confirm } = useConfirm()
const role = ref(null)
const loading = ref(false)
const error = ref(null)

// Snapshot of the last-saved name/description, to detect unsaved edits (M4).
const savedMeta = ref({ name: '', description: '' })
const metaDirty = computed(
  () =>
    !!role.value &&
    (role.value.name !== savedMeta.value.name ||
      (role.value.description ?? '') !== savedMeta.value.description),
)

const canUpdateRole = computed(() => isAllowed(['role_permission_management:update']))
// A locked role is protected — editing controls are disabled until it's unlocked.
const isLocked = computed(() => !!role.value?.locked)
const canEdit = computed(() => canUpdateRole.value && !isLocked.value)

// Get useRoles composable
const { fetchRole, updateRole, deactivateRole, activateRole, setRoleLock } = useRoles()

// Inline editing state
const isEditingName = ref(false)
const isEditingDescription = ref(false)
const editedName = ref('')
const editedDescription = ref('')
const nameInputRef = ref(null)
const descriptionInputRef = ref(null)

// User assignment dialog
const showUsersDialog = ref(false)
// Access-history drawer (M5)
const showAudit = ref(false)

// Permission matrix (self-contained; persisted via its exposed save()).
const matrixRef = ref(null)
const permSearch = ref('')

const breadcrumbItems = computed(() => [
  { label: 'Roles', to: getCompanyPath('/roles') },
  { label: role.value?.name || 'Role Details' },
])

const usersCount = computed(() => role.value?.userAssignments?.length || 0)

const assignedUsers = computed(() => {
  return role.value?.userAssignments?.map((ua) => ua.user) || []
})

// Open users dialog
function openUsersDialog() {
  showUsersDialog.value = true
}

// Inline editing functions
async function startEditName() {
  if (!canEdit.value) return
  editedName.value = role.value.name
  isEditingName.value = true
  await nextTick()
  nameInputRef.value?.focus()
}

function stopEditName() {
  if (editedName.value.trim()) {
    role.value = { ...role.value, name: editedName.value.trim() }
  }
  isEditingName.value = false
}

async function startEditDescription() {
  if (!canEdit.value) return
  editedDescription.value = role.value.description || ''
  isEditingDescription.value = true
  await nextTick()
  descriptionInputRef.value?.focus()
}

function stopEditDescription() {
  role.value = { ...role.value, description: editedDescription.value.trim() }
  isEditingDescription.value = false
}

const isInactive = computed(() => role.value?.statusId === 'INACTIVE')

async function handleDeactivate() {
  if (
    !(await confirm({
      title: 'Deactivate role',
      message: `Are you sure you want to deactivate the role "${role.value.name}"?\n\nDeactivating a role will set its status to Inactive.`,
      okLabel: 'Deactivate',
      danger: true,
    }))
  )
    return
  const success = await deactivateRole(props.id)
  if (success) {
    role.value = { ...role.value, statusId: 'INACTIVE' }
    toast.success('Role deactivated successfully')
  } else {
    toast.error('Failed to deactivate role')
  }
}

async function handleLock() {
  await setRoleLock(props.id, true)
  role.value = { ...role.value, locked: true }
  toast.success('Role locked — it is now protected from edits')
}

async function handleUnlock() {
  await setRoleLock(props.id, false)
  role.value = { ...role.value, locked: false }
  toast.success('Role unlocked')
}

async function handleActivate() {
  if (
    !(await confirm({
      title: 'Activate role',
      message: `Are you sure you want to activate the role "${role.value.name}"?`,
      okLabel: 'Activate',
    }))
  )
    return
  const success = await activateRole(props.id)
  if (success) {
    role.value = { ...role.value, statusId: 'ACTIVE' }
    toast.success('Role activated successfully')
  } else {
    toast.error('Failed to activate role')
  }
}

// Fetch role details
async function fetchRoleData() {
  if (!props.id) {
    return
  }

  loading.value = true
  error.value = null

  try {
    const fetchedRole = await fetchRole(props.id)

    if (!fetchedRole) {
      throw new Error('Role not found')
    }

    role.value = fetchedRole
    savedMeta.value = { name: fetchedRole.name, description: fetchedRole.description ?? '' }
  } finally {
    loading.value = false
  }
}

// Save changes
async function saveChanges() {
  if (!props.id) {
    return
  }

  loading.value = true
  error.value = null

  try {
    const updateData = {
      name: role.value.name,
      description: role.value.description ?? '',
    }

    const result = await updateRole(props.id, updateData)

    if (!result.success) {
      throw new Error(result.error || 'Failed to update role')
    }

    // Persist the permission matrix via its own audited endpoint.
    await matrixRef.value?.save()

    toast.success('Role updated successfully')

    // Update local role with response + refresh the saved snapshot so the
    // route-leave guard doesn't fire on the goBack() below.
    role.value = result.role
    savedMeta.value = { name: result.role.name, description: result.role.description ?? '' }

    // Stop editing modes
    isEditingName.value = false
    isEditingDescription.value = false

    goBack()
  } finally {
    loading.value = false
  }
}

// Cancel and go back
function goBack() {
  router.back()
}

// Warn before leaving with unsaved name/description or permission-matrix edits
// (M4 — the two are persisted by separate calls, so losing either is easy).
onBeforeRouteLeave(async () => {
  const dirty = metaDirty.value || matrixRef.value?.hasUnsavedChanges?.()
  if (!dirty) return true
  return await confirm({
    title: 'Discard unsaved changes?',
    message: 'This role has unsaved changes. Leave without saving them?',
    okLabel: 'Leave',
    danger: true,
  })
})

// Initialize
onMounted(() => {
  fetchRoleData()
})

// Watch for id changes
watch(
  () => props.id,
  () => {
    if (props.id) {
      fetchRoleData()
    }
  },
)

// ─── BaseDetailLayout config ──────────────────────────────────────────────────
const roleActions = computed(() =>
  buildRoleActions(
    {
      canUpdate: canEdit.value,
      canLock: canUpdateRole.value,
      locked: isLocked.value,
      hasRole: !!role.value,
      isInactive: isInactive.value,
      saving: loading.value,
    },
    {
      save: saveChanges,
      cancel: goBack,
      activate: handleActivate,
      deactivate: handleDeactivate,
      lock: handleLock,
      unlock: handleUnlock,
    },
  ),
)
const roleDetailConfig = computed(() =>
  defineDetailConfig({
    variant: 'standard',
    width: 'standard',
    breadcrumbs: breadcrumbItems.value,
    actions: roleActions.value,
    sections: buildRoleSections(role.value),
  }),
)
</script>

<template>
  <BaseDetailLayout
    :config="roleDetailConfig"
    :record="role"
    :loading="loading && !role"
    :notFound="error && !role"
    notFoundTitle="Role not found"
    notFoundDescription="This role could not be found."
  >
    <template #title>
      <BaseTextInput
        v-if="isEditingName"
        ref="nameInputRef"
        v-model="editedName"
        size="sm"
        @blur="stopEditName"
        @keyup.enter="stopEditName"
        @keyup.escape="stopEditName"
      />
      <div v-else class="tw:flex tw:items-center tw:gap-2">
        <BaseClickableRow
          class="tw:text-base tw:font-semibold tw:text-on-main"
          :class="canEdit ? 'tw:hover:text-primary' : ''"
          :disabled="!canEdit"
          aria-label="Edit role name"
          @click="canEdit && startEditName()"
        >
          {{ role?.name }}
        </BaseClickableRow>
        <span
          v-if="isLocked"
          class="tw:inline-flex tw:items-center tw:gap-1 tw:rounded-full tw:bg-amber-100 tw:px-2 tw:py-0.5 tw:text-xs tw:font-semibold tw:text-amber-700"
          title="This role is locked — unlock it to make changes"
        >
          <IconLock :size="12" /> Locked
        </span>
      </div>
    </template>

    <template #status>
      <RoleStatusBadge v-if="role" :status="role.statusId" />
    </template>

    <template v-if="role" #meta>
      <button
        type="button"
        class="tw:inline-flex tw:items-center tw:gap-1.5 tw:bg-transparent tw:border-0 tw:cursor-pointer tw:text-inherit tw:hover:text-primary"
        title="View access history"
        @click="showAudit = true"
      >
        <IconHistory :size="14" />
        Last Modified {{ role.updatedAt.formatDate('date') }}
      </button>
    </template>

    <template #actions>
      <DetailActionBar :actions="roleActions" :maxVisible="4" />
    </template>

    <template v-if="role" #rail>
      <!-- Description -->
      <BaseRailCard title="Description">
        <BaseTextarea
          v-if="isEditingDescription"
          ref="descriptionInputRef"
          v-model="editedDescription"
          rows="3"
          @blur="stopEditDescription"
          @keyup.escape="stopEditDescription"
        />
        <BaseClickableRow
          v-else
          class="tw:text-sm tw:text-secondary tw:leading-relaxed"
          :class="canEdit ? 'tw:hover:text-on-sidebar' : ''"
          :disabled="!canEdit"
          aria-label="Edit role description"
          @click="canEdit && startEditDescription()"
        >
          {{
            role.description ||
            (canEdit ? 'No description provided (click to edit)' : 'No description provided')
          }}
        </BaseClickableRow>
      </BaseRailCard>

      <!-- Assigned Users -->
      <BaseRailCard title="Assigned Users">
        <div class="tw:flex tw:items-center tw:gap-3">
          <div
            class="tw:w-10 tw:h-10 tw:rounded-full tw:bg-primary/10 tw:flex tw:items-center tw:justify-center tw:text-sm tw:font-bold tw:text-primary"
          >
            {{ usersCount }}
          </div>
          <button
            class="tw:text-sm tw:font-semibold tw:text-primary tw:bg-transparent tw:border-0 tw:cursor-pointer tw:hover:underline"
            @click="openUsersDialog"
          >
            View All Users
          </button>
        </div>
      </BaseRailCard>
    </template>

    <template v-if="role" #section-permissions>
      <!-- Permissions Section Header -->
      <div class="tw:flex tw:items-center tw:justify-between tw:mb-4">
        <h3 class="tw:text-section-title tw:font-semibold tw:text-on-sidebar">Permissions</h3>
        <div class="tw:flex tw:items-center tw:gap-4">
          <div class="tw:relative">
            <IconSearch
              :size="18"
              class="tw:absolute tw:left-3 tw:top-1/2 tw:-translate-y-1/2 tw:text-secondary tw:pointer-events-none"
            />
            <BaseTextInput
              v-model="permSearch"
              placeholder="Search modules..."
              class="tw:w-full tw:pl-9"
            />
          </div>
        </div>
      </div>

      <!-- Module × action × scope matrix -->
      <RolePermissionMatrix
        ref="matrixRef"
        :roleId="id"
        :canUpdate="canEdit"
        :search="permSearch"
      />
    </template>
  </BaseDetailLayout>

  <!-- Users Assignment Dialog -->
  <RoleUsersDialog
    v-if="showUsersDialog"
    v-model="showUsersDialog"
    :roleId="id"
    :roleName="role?.name"
    :assignedUsers="assignedUsers"
    @saved="fetchRoleData"
  />

  <!-- Access history (permission + membership changes) -->
  <RoleAuditDrawer v-model="showAudit" :roleId="id" />
</template>
