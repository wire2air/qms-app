<script setup>
import { IconHistory, IconSearch, IconSquareCheck } from '@tabler/icons-vue'
import { getCompanyPath } from '@/utils/routeHelpers'
import { useRolePermissions } from '@/composables/useRolePermissions.js'
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

const canUpdateRole = computed(() => isAllowed(['roles:update']))

// Get useRoles composable
const { fetchRole, updateRole, deactivateRole, activateRole } = useRoles()

// Inline editing state
const isEditingName = ref(false)
const isEditingDescription = ref(false)
const editedName = ref('')
const editedDescription = ref('')
const nameInputRef = ref(null)
const descriptionInputRef = ref(null)

// User assignment dialog
const showUsersDialog = ref(false)

// Use the permissions composable
const {
  searchTerm,
  selectedPermissions,
  permissionActions,
  sectionedGroups,
  fetchPermissions,
  isSelected,
  togglePermission,
  isActionLocked,
  getPermissionForAction,
  selectAll,
  setSelectedPermissions,
} = useRolePermissions()

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
  if (!canUpdateRole.value) return
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
  if (!canUpdateRole.value) return
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

    // Extract and set selected permissions
    const permissionIds = fetchedRole.permissionAssignments?.map((pa) => pa.permission.id) || []
    setSelectedPermissions(permissionIds)
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
      permissionIds: selectedPermissions.value,
    }

    updateData.name = role.value.name
    updateData.description = role.value.description ?? ''

    const result = await updateRole(props.id, updateData)

    if (!result.success) {
      throw new Error(result.error || 'Failed to update role')
    }

    toast.success('Role updated successfully')

    // Update local role with response
    role.value = result.role

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

// Initialize
onMounted(() => {
  fetchRoleData()
  fetchPermissions()
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
      canUpdate: canUpdateRole.value,
      hasRole: !!role.value,
      isInactive: isInactive.value,
      saving: loading.value,
    },
    { save: saveChanges, cancel: goBack, activate: handleActivate, deactivate: handleDeactivate },
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
      <BaseClickableRow
        v-else
        class="tw:text-base tw:font-semibold tw:text-on-main"
        :class="canUpdateRole ? 'tw:hover:text-primary' : ''"
        :disabled="!canUpdateRole"
        aria-label="Edit role name"
        @click="canUpdateRole && startEditName()"
      >
        {{ role?.name }}
      </BaseClickableRow>
    </template>

    <template #status>
      <RoleStatusBadge v-if="role" :status="role.statusId" />
    </template>

    <template v-if="role" #meta>
      <span class="tw:inline-flex tw:items-center tw:gap-1.5">
        <IconHistory :size="14" />
        Last Modified {{ role.updatedAt.formatDate('date') }}
      </span>
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
          :class="canUpdateRole ? 'tw:hover:text-on-sidebar' : ''"
          :disabled="!canUpdateRole"
          aria-label="Edit role description"
          @click="canUpdateRole && startEditDescription()"
        >
          {{
            role.description ||
            (canUpdateRole ? 'No description provided (click to edit)' : 'No description provided')
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
              v-model="searchTerm"
              placeholder="Search permissions..."
              class="tw:w-full tw:pl-9"
            />
          </div>
          <button
            v-if="canUpdateRole"
            class="tw:flex tw:items-center tw:gap-1.5 tw:text-sm tw:font-semibold tw:text-primary tw:bg-transparent tw:border-0 tw:cursor-pointer tw:hover:underline"
            @click="selectAll"
          >
            <IconSquareCheck :size="18" />
            Select All
          </button>
        </div>
      </div>

      <!-- Permission Groups -->
      <RolePermissionsList
        v-model="sectionedGroups"
        :permissionActions="permissionActions"
        :isSelected="isSelected"
        :togglePermission="togglePermission"
        :isActionLocked="isActionLocked"
        :getPermissionForAction="getPermissionForAction"
        :canUpdateRole="canUpdateRole"
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
</template>
