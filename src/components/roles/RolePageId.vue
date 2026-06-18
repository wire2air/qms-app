<script setup>
import {
  IconHistory,
  IconAlertCircle,
  IconArrowLeft,
  IconSearch,
  IconSquareCheck,
} from '@tabler/icons-vue'
import { getCompanyPath } from '@/utils/routeHelpers'
import { useRolePermissions } from '@/composables/useRolePermissions.js'
import { useRoles } from '@/composables/useRoles.js'
import { isAllowed } from '@/utils/currentSession.js'

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
</script>

<template>
  <BasePage width="standard" fullHeight>
    <!-- Loading State -->
    <div v-if="loading && !role" class="tw:flex tw:items-center tw:justify-center tw:h-full">
      <BaseSpinner size="lg" />
    </div>

    <!-- Error State -->
    <div
      v-else-if="error && !role"
      class="tw:flex tw:items-center tw:justify-center tw:h-full tw:flex-col tw:gap-4"
    >
      <IconAlertCircle :size="48" class="tw:text-red-500" />
      <div class="tw:text-lg tw:text-on-sidebar">{{ error }}</div>
      <button
        class="tw:flex tw:items-center tw:gap-2 tw:px-4 tw:py-2 tw:border tw:border-primary tw:text-primary tw:rounded-lg tw:bg-transparent tw:cursor-pointer tw:hover:bg-primary/5 tw:transition-colors"
        @click="goBack"
      >
        <IconArrowLeft :size="18" />
        Go Back
      </button>
    </div>

    <!-- Content -->
    <div v-else-if="role" class="tw:flex tw:flex-col tw:h-full tw:overflow-hidden">
      <PageHeader>
        <template #title>
          <nav class="tw:flex tw:items-center tw:gap-1 tw:text-sm">
            <RouterLink
              :to="breadcrumbItems[0].to"
              class="tw:text-secondary tw:hover:text-on-main"
              >{{ breadcrumbItems[0].label }}</RouterLink
            >
            <span class="tw:text-secondary tw:mx-1">/</span>
            <span class="tw:text-on-main tw:font-medium">{{ breadcrumbItems[1].label }}</span>
          </nav>
        </template>
        <template #actions>
          <template v-if="canUpdateRole">
            <button
              class="tw:px-4 tw:py-2 tw:text-sm tw:font-bold tw:text-secondary tw:bg-transparent tw:border tw:border-divider tw:rounded-lg tw:cursor-pointer tw:hover:bg-main-hover tw:transition-colors"
              @click="goBack"
            >
              Cancel
            </button>
            <button
              class="tw:flex tw:items-center tw:gap-2 tw:px-4 tw:py-2 tw:text-sm tw:font-bold tw:text-white tw:bg-primary tw:rounded-lg tw:cursor-pointer tw:hover:bg-primary/90 tw:transition-colors tw:border-0 tw:disabled:opacity-50"
              :disabled="loading"
              @click="saveChanges"
            >
              <BaseSpinner v-if="loading" size="sm" color="white" class="tw:mr-1" />
              Save Changes
            </button>
          </template>
          <button
            v-if="role && canUpdateRole && isInactive"
            class="tw:flex tw:items-center tw:gap-2 tw:px-4 tw:py-2 tw:text-sm tw:font-bold tw:text-green-700 tw:bg-transparent tw:border tw:border-green-600 tw:rounded-lg tw:cursor-pointer tw:hover:bg-green-50 tw:transition-colors"
            @click="handleActivate"
          >
            Activate
          </button>
          <button
            v-else-if="role && canUpdateRole && !isInactive"
            class="tw:flex tw:items-center tw:gap-2 tw:px-4 tw:py-2 tw:text-sm tw:font-bold tw:text-amber-700 tw:bg-transparent tw:border tw:border-amber-600 tw:rounded-lg tw:cursor-pointer tw:hover:bg-amber-50 tw:transition-colors"
            @click="handleDeactivate"
          >
            Deactivate
          </button>
        </template>
      </PageHeader>

      <!-- Scrollable Content -->
      <div
        class="tw:flex-1 tw:min-h-0 tw:overflow-y-auto custom-scrollbar tw:py-6 tw:space-y-6"
      >
        <!-- Role Info Card -->
        <section class="tw:bg-layer tw:rounded-xl tw:border tw:border-sidebar tw:p-6 tw:shadow-sm">
          <div class="tw:flex tw:flex-wrap tw:justify-between tw:items-start tw:gap-4">
            <div class="tw:space-y-1 tw:flex-1">
              <!-- Editable Name -->
              <div v-if="isEditingName" class="tw:flex tw:items-center tw:gap-2">
                <BaseTextInput
                  ref="nameInputRef"
                  v-model="editedName"
                  class="tw:text-3xl"
                  @blur="stopEditName"
                  @keyup.enter="stopEditName"
                  @keyup.escape="stopEditName"
                />
              </div>
              <h2
                v-else
                class="tw:text-3xl tw:font-black tw:tracking-tight tw:text-on-sidebar"
                :class="
                  canUpdateRole
                    ? 'tw:cursor-pointer tw:hover:text-primary tw:transition-colors'
                    : ''
                "
                @click="canUpdateRole && startEditName()"
              >
                {{ role.name }}
              </h2>

              <!-- Editable Description -->
              <div v-if="isEditingDescription" class="tw:flex tw:items-start tw:gap-2">
                <BaseTextarea
                  ref="descriptionInputRef"
                  v-model="editedDescription"
                  class="tw:flex-1"
                  rows="2"
                  @blur="stopEditDescription"
                  @keyup.escape="stopEditDescription"
                />
              </div>
              <p
                v-else
                class="tw:text-secondary tw:max-w-2xl tw:transition-colors"
                :class="canUpdateRole ? 'tw:cursor-pointer tw:hover:text-on-sidebar' : ''"
                @click="canUpdateRole && startEditDescription()"
              >
                {{
                  role.description ||
                  (canUpdateRole
                    ? 'No description provided (click to edit)'
                    : 'No description provided')
                }}
              </p>

              <div class="tw:flex tw:items-center tw:gap-4 tw:pt-2">
                <div class="tw:flex tw:items-center tw:gap-2">
                  <IconHistory :size="16" class="tw:text-secondary" />
                  <span class="tw:text-xs tw:text-secondary">
                    Last Modified: {{ role.updatedAt.formatDate('date') }}
                  </span>
                </div>

                <RoleStatusBadge :status="role.statusId" />
              </div>
            </div>
            <div class="tw:flex tw:flex-col tw:items-end tw:gap-3">
              <div class="ds-label tw:text-secondary">Assigned Users</div>
              <div class="tw:flex tw:items-center tw:gap-2">
                <div
                  class="tw:w-10 tw:h-10 tw:rounded-full tw:bg-primary/10 tw:flex tw:items-center tw:justify-center tw:text-sm tw:font-bold tw:text-primary"
                >
                  {{ usersCount }}
                </div>
              </div>
              <button
                class="tw:text-sm tw:font-semibold tw:text-primary tw:bg-transparent tw:border-0 tw:cursor-pointer tw:hover:underline"
                @click="openUsersDialog"
              >
                View All Users
              </button>
            </div>
          </div>
        </section>

        <!-- Permissions Section Header -->
        <div class="tw:flex tw:items-center tw:justify-between tw:pt-4">
          <h3 class="tw:text-xl tw:font-bold tw:text-on-sidebar">Permissions</h3>
          <div class="tw:flex tw:items-center tw:gap-4">
            <div class="tw:relative">
              <IconSearch
                :size="18"
                class="tw:absolute tw:left-3 tw:top-1/2 tw:-translate-y-1/2 tw:text-secondary tw:pointer-events-none"
              />
              <BaseTextInput
                v-model="searchTerm"
                placeholder="Search permissions..."
                class="tw:w-64 tw:pl-9"
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
          :getPermissionForAction="getPermissionForAction"
          :canUpdateRole="canUpdateRole"
        />
      </div>
    </div>

    <!-- Users Assignment Dialog -->
    <RoleUsersDialog
      v-if="showUsersDialog"
      v-model="showUsersDialog"
      :roleId="id"
      :roleName="role?.name"
      :assignedUsers="assignedUsers"
      @saved="fetchRoleData"
    />
  </BasePage>
</template>
