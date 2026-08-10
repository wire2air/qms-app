<script setup>
import { IconSearch, IconUserOff } from '@tabler/icons-vue'
import { isAllowed } from '@/utils/currentSession'

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
const selectedUserIds = ref([])
const saving = ref(false)
const searchTerm = ref('')

// The assignable roster, read through the syncEngine like every other entity
// list (CLAUDE.md rule #4). This used to be `get('/v1/services/users')`, which
// was the last consumer of that endpoint's ungated read — the route is now
// behind `user_management:read`, and a roles administrator does not necessarily
// hold it.
//
// Reading db.User instead is both the convention and the safer behaviour: the
// syncEngine's copy is populated over GraphQL, where `users_sel` decides
// visibility per caller (yourself, org-wide users, and anyone sharing one of
// your sites — plus the whole company with a tenant-scoped
// `user_management:read`). So an administrator sees exactly the people they are
// allowed to see rather than a 403 and an empty dialog.
//
// Supplier accounts are excluded for the same reason UsersHome excludes them:
// they are managed from Suppliers → Users, and they are not role subjects here.
// No `initial` — the undefined phase is what distinguishes "still loading" from
// "you can see nobody", and this dialog shows a different thing for each.
const allUsers = useLiveQuery(
  async (db) => {
    const rows = await db.User.where().exec()
    return rows.filter((u) => u.kind !== 'EXTERNAL_SUPPLIER')
  },
  { models: ['User'] },
)
const loading = computed(() => allUsers.value === undefined)

// Authoritative current assignments for this role (live). Used to compute the
// add/remove diff on save and to delete the right RoleOnUser rows.
const roleAssignments = useLiveQueryWithDeps(
  [() => props.roleId],
  async (db, [roleId]) => (roleId ? db.RoleOnUser.where('roleId', roleId).exec() : []),
  { initial: [] },
)

const addRoleOnUser = useLiveMutation(async (db, { userId, roleId }) => {
  const assignment = db.RoleOnUser.create({ userId, roleId })
  await assignment.save()
  return assignment
})

const filteredUsers = computed(() => {
  const rows = allUsers.value ?? []
  if (!searchTerm.value.trim()) {
    return rows
  }

  const search = searchTerm.value.toLowerCase()
  return rows.filter((user) => {
    const fullName = `${user.firstName} ${user.lastName}`.toLowerCase()
    const email = user.email?.toLowerCase() ?? ''
    return fullName.includes(search) || email.includes(search)
  })
})

const canUpdateRole = computed(() => isAllowed(['role_permission_management:update']))

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

// Save user assignments — diff the selection against the live RoleOnUser rows
// and apply via the syncEngine (create adds, soft-delete removes), matching the
// user page. One write path for the relationship.
async function saveUserAssignments() {
  if (!props.roleId) return
  saving.value = true
  try {
    const desired = new Set(selectedUserIds.value)
    const current = roleAssignments.value
    const currentIds = new Set(current.map((ra) => ra.userId))

    const toAdd = [...desired].filter((id) => !currentIds.has(id))
    const toRemove = current.filter((ra) => !desired.has(ra.userId))

    for (const userId of toAdd) await addRoleOnUser({ userId, roleId: props.roleId })
    for (const ra of toRemove) await ra.delete()

    toast.success('User assignments updated successfully')
    open.value = false
    emit('saved')
  } finally {
    saving.value = false
  }
}

// Initialize when dialog opens
watch(
  open,
  (val) => {
    if (val) {
      // Set currently assigned users as selected. The roster itself is a live
      // query — there is nothing to fetch on open.
      selectedUserIds.value = props.assignedUsers.map((u) => u.id)
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
        :disabled="saving"
        @click="saveUserAssignments"
      >
        <BaseSpinner v-if="saving" size="sm" color="white" class="tw:mr-2" />
        Save Assignments
      </button>
    </template>
  </BaseDialog>
</template>
