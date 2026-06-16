<script setup>
import { IconSearch, IconUserOff } from '@tabler/icons-vue'
import { isAllowed } from '@/utils/currentSession'
import { get, put } from '@/api'

const props = defineProps({
  roleId: {
    type: String,
    required: true,
  },
  roleName: {
    type: String,
    default: '',
  },
  assignedUsers: {
    type: Array,
    default: () => [],
  },
})

const emit = defineEmits(['saved'])

const open = defineModel({
  type: Boolean,
  default: false,
})

const toast = useToast()
const allUsers = ref([])
const selectedUserIds = ref([])
const loading = ref(false)
const searchTerm = ref('')

const filteredUsers = computed(() => {
  if (!searchTerm.value.trim()) {
    return allUsers.value
  }

  const search = searchTerm.value.toLowerCase()
  return allUsers.value.filter((user) => {
    const fullName = `${user.firstName} ${user.lastName}`.toLowerCase()
    const email = user.email.toLowerCase()
    return fullName.includes(search) || email.includes(search)
  })
})

const canUpdateRole = computed(() => isAllowed(['roles:update']))

// Fetch all company users
async function fetchAllUsers() {
  const data = await get('/v1/services/users', {
    loader: loading,
  })
  allUsers.value = data.users || []
}

// Check if user is selected
function isUserSelected(userId) {
  return selectedUserIds.value.includes(userId)
}

// Toggle user selection
function toggleUserSelection(userId) {
  if (!canUpdateRole.value) return

  const index = selectedUserIds.value.indexOf(userId)
  if (index > -1) {
    selectedUserIds.value.splice(index, 1)
  } else {
    selectedUserIds.value.push(userId)
  }
}

// Save user assignments
async function saveUserAssignments() {
  if (!props.roleId) {
    return
  }

  await put(
    `/v1/services/roles/${props.roleId}/users`,
    {
      userIds: selectedUserIds.value,
    },
    {
      loader: loading,
    },
  )

  toast.success('User assignments updated successfully')

  open.value = false
  emit('saved')
}

// Initialize when dialog opens
watch(
  open,
  (val) => {
    if (val) {
      // Set currently assigned users as selected
      selectedUserIds.value = props.assignedUsers.map((u) => u.id)
      fetchAllUsers()
    } else {
      // Reset when closed
      searchTerm.value = ''
    }
  },
  { immediate: true },
)
</script>

<template>
  <BaseDialog v-model="open" title="Assign Users to Role" :loading="loading" @close="open = false">
    <div class="tw:flex tw:flex-col tw:gap-4 tw:p-4">
      <!-- Role Name -->
      <div class="tw:text-sm tw:text-secondary">
        {{ roleName }}
      </div>

      <!-- Search Bar -->
      <div class="tw:relative">
        <IconSearch
          :size="18"
          class="tw:absolute tw:left-3 tw:top-1/2 tw:-translate-y-1/2 tw:text-secondary tw:pointer-events-none"
        />
        <BaseTextInput
          v-model="searchTerm"
          placeholder="Search users by name or email..."
          class="tw:pl-9"
        />
      </div>

      <!-- User List -->
      <div
        class="tw:max-h-100 tw:overflow-y-auto custom-scrollbar tw:border tw:border-divider tw:rounded-lg"
      >
        <div v-if="loading" class="tw:flex tw:items-center tw:justify-center tw:py-12">
          <BaseSpinner size="md" />
        </div>

        <BaseEmptyState
          v-else-if="filteredUsers.length === 0"
          :icon="IconUserOff"
          title="No users found"
          dense
        />

        <div v-else class="tw:divide-y tw:divide-divider">
          <BaseClickableRow
            v-for="user in filteredUsers"
            :key="user.id"
            class="tw:flex tw:items-center tw:px-4 tw:py-3 tw:hover:bg-sidebar/20 tw:transition-colors"
            :aria-label="`Toggle selection for ${user.firstName} ${user.lastName}`"
            @click="toggleUserSelection(user.id)"
          >
            <BaseCheckbox
              :modelValue="isUserSelected(user.id)"
              class="tw:mr-3"
              @update:modelValue="toggleUserSelection(user.id)"
              @click.stop
            />
            <div class="tw:flex tw:flex-1 tw:gap-2">
              <UserAvatar :user="user" class="tw:size-10" />
              <div class="tw:flex-1">
                <div class="tw:font-semibold tw:text-on-sidebar">
                  {{ user.firstName }} {{ user.lastName }}
                </div>
                <div class="tw:text-sm tw:text-secondary">
                  {{ user.email }}
                </div>
              </div>
            </div>
            <div
              v-if="assignedUsers.some((u) => u.id === user.id)"
              class="tw:text-xs tw:px-2 tw:py-1 tw:rounded tw:bg-primary/10 tw:text-primary tw:font-semibold"
            >
              Currently Assigned
            </div>
          </BaseClickableRow>
        </div>
      </div>

      <!-- Selection Counter -->
      <div class="tw:text-sm tw:text-secondary">
        {{ selectedUserIds.length }} user{{ selectedUserIds.length !== 1 ? 's' : '' }} selected
      </div>
    </div>

    <template #footer>
      <button
        class="tw:px-4 tw:py-2 tw:text-sm tw:font-medium tw:text-primary tw:bg-transparent tw:border-0 tw:cursor-pointer tw:hover:bg-main-hover tw:rounded-lg tw:transition-colors"
        @click="open = false"
      >
        Cancel
      </button>
      <button
        v-if="canUpdateRole"
        class="tw:px-4 tw:py-2 tw:text-sm tw:font-bold tw:text-white tw:bg-primary tw:rounded-lg tw:cursor-pointer tw:hover:bg-primary/90 tw:transition-colors tw:border-0 tw:disabled:opacity-50 tw:disabled:cursor-not-allowed"
        :disabled="loading"
        @click="saveUserAssignments"
      >
        <BaseSpinner v-if="loading" size="sm" color="white" class="tw:mr-2" />
        Save Assignments
      </button>
    </template>
  </BaseDialog>
</template>
