<script setup>
import { IconSearch, IconCheck } from '@tabler/icons-vue'

const props = defineProps({
  trainingId: { type: String, required: true },
  canUpdate: { type: Boolean, default: false },
})

const isOpen = defineModel({ type: Boolean, default: false })

const toast = useToast()
const tab = ref('roles')

// ─── Roles ────────────────────────────────────────────────────────────────────

const roleSearch = ref('')
const roles = useLiveQuery((db) => db.Role.where('statusId', 'ACTIVE').exec(), {
  models: ['Role'],
  initial: [],
})

const trainingRoles = useLiveQueryWithDeps(
  [() => props.trainingId],
  async (db, [trainingId]) => {
    if (!trainingId) return []
    return db.TrainingRole.where('trainingId', trainingId).exec()
  },

  { models: ['TrainingRole'], initial: [] },
)

const assignedRoleIds = computed(() => trainingRoles.value.map((r) => r.roleId))

const filteredRoles = computed(() => {
  const q = roleSearch.value.trim().toLowerCase()
  if (!q) return roles.value
  return roles.value.filter((r) => r.name.toLowerCase().includes(q))
})

const createTrainingRole = useLiveMutation(async (db, { trainingId, roleId }) => {
  const record = db.TrainingRole.create({ trainingId, roleId })
  await record.save()
})

const togglingRole = ref(null)

async function toggleRole(roleId) {
  if (!props.canUpdate || togglingRole.value === roleId) return
  togglingRole.value = roleId
  try {
    const existing = trainingRoles.value.find((r) => r.roleId === roleId)
    if (existing) {
      await existing.delete()
    } else {
      await createTrainingRole({ trainingId: props.trainingId, roleId })
    }
  } catch (err) {
    toast.notify({ type: 'negative', message: err?.message || 'Failed to update role assignment' })
  } finally {
    togglingRole.value = null
  }
}

// ─── Users ────────────────────────────────────────────────────────────────────

const userSearch = ref('')
const users = useLiveQuery(
  async (db) => (await db.User.where().exec()).filter((u) => u.userStatusId === 'ACTIVE'),

  { models: ['User'], initial: [] },
)

const trainingUsers = useLiveQueryWithDeps(
  [() => props.trainingId],
  async (db, [trainingId]) => {
    if (!trainingId) return []
    return db.TrainingUser.where('trainingId', trainingId).exec()
  },

  { models: ['TrainingUser'], initial: [] },
)

const assignedUserIds = computed(() => trainingUsers.value.map((u) => u.userId))

const filteredUsers = computed(() => {
  const q = userSearch.value.trim().toLowerCase()
  if (!q) return users.value
  return users.value.filter(
    (u) =>
      u.firstName?.toLowerCase().includes(q) ||
      u.lastName?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q),
  )
})

const createTrainingUser = useLiveMutation(async (db, { trainingId, userId }) => {
  const record = db.TrainingUser.create({ trainingId, userId })
  await record.save()
})

const togglingUser = ref(null)

async function toggleUser(userId) {
  if (!props.canUpdate || togglingUser.value === userId) return
  togglingUser.value = userId
  try {
    const existing = trainingUsers.value.find((u) => u.userId === userId)
    if (existing) {
      await existing.delete()
    } else {
      await createTrainingUser({ trainingId: props.trainingId, userId })
    }
  } catch (err) {
    toast.notify({ type: 'negative', message: err?.message || 'Failed to update user assignment' })
  } finally {
    togglingUser.value = null
  }
}

function getUserDisplayName(user) {
  const parts = [user.firstName, user.lastName].filter(Boolean)
  return parts.length > 0 ? parts.join(' ') : user.email
}
</script>

<template>
  <BaseDialog v-model="isOpen" title="Manage Assignees" maxWidth="2xl">
    <div class="tw:border tw:border-divider tw:rounded-xl tw:overflow-hidden">
      <!-- Tabs -->
      <div class="tw:flex tw:border-b tw:border-divider tw:bg-main-hover">
        <button
          class="tw:px-6 tw:py-3 tw:text-xs tw:font-bold tw:transition-colors"
          :class="
            tab === 'roles'
              ? 'tw:text-primary tw:border-b-2 tw:border-primary tw:bg-main'
              : 'tw:text-secondary tw:hover:text-on-main'
          "
          @click="tab = 'roles'"
        >
          BY ROLE
        </button>
        <button
          class="tw:px-6 tw:py-3 tw:text-xs tw:font-bold tw:transition-colors"
          :class="
            tab === 'users'
              ? 'tw:text-primary tw:border-b-2 tw:border-primary tw:bg-main'
              : 'tw:text-secondary tw:hover:text-on-main'
          "
          @click="tab = 'users'"
        >
          BY USER
        </button>
      </div>

      <div class="tw:p-6">
        <!-- Role Selector -->
        <div v-show="tab === 'roles'" class="tw:space-y-4">
          <BaseField v-slot="{ id: fieldId }" label="Select Roles">
            <BaseTextInput :id="fieldId" v-model="roleSearch" placeholder="Search roles...">
              <template #icon>
                <IconSearch :size="18" class="tw:text-secondary" />
              </template>
            </BaseTextInput>
          </BaseField>

          <div class="tw:max-h-48 tw:overflow-y-auto tw:space-y-1">
            <BaseClickableRow
              v-for="role in filteredRoles"
              :key="role.id"
              :disabled="!canUpdate"
              :aria-label="`Toggle role ${role.name}`"
              class="tw:flex tw:items-center tw:gap-3 tw:p-2 tw:rounded-lg tw:transition-colors"
              :class="[
                assignedRoleIds.includes(role.id)
                  ? 'tw:bg-primary/10 tw:border tw:border-primary/20'
                  : 'tw:hover:bg-main-hover',
              ]"
              @click="toggleRole(role.id)"
            >
              <div
                class="tw:w-4 tw:h-4 tw:rounded tw:border tw:flex tw:items-center tw:justify-center tw:shrink-0 tw:transition-colors"
                :class="
                  assignedRoleIds.includes(role.id)
                    ? 'tw:bg-primary tw:border-primary'
                    : 'tw:border-divider'
                "
              >
                <IconCheck
                  v-if="assignedRoleIds.includes(role.id)"
                  :size="10"
                  class="tw:text-white"
                />
              </div>
              <div class="tw:flex-1 tw:min-w-0">
                <div class="tw:text-sm tw:font-medium tw:text-on-main">{{ role.name }}</div>
                <div v-if="role.description" class="tw:text-xs tw:text-secondary tw:truncate">
                  {{ role.description }}
                </div>
              </div>
            </BaseClickableRow>
            <BaseEmptyState v-if="filteredRoles.length === 0" dense title="No roles found" />
          </div>
        </div>

        <!-- User Selector -->
        <div v-show="tab === 'users'" class="tw:space-y-4">
          <BaseField v-slot="{ id: fieldId }" label="Select Users">
            <BaseTextInput
              :id="fieldId"
              v-model="userSearch"
              placeholder="Search users by name or email..."
            >
              <template #icon>
                <IconSearch :size="18" class="tw:text-secondary" />
              </template>
            </BaseTextInput>
          </BaseField>

          <div class="tw:max-h-48 tw:overflow-y-auto tw:space-y-1">
            <BaseClickableRow
              v-for="user in filteredUsers"
              :key="user.id"
              :disabled="!canUpdate"
              :aria-label="`Toggle user ${getUserDisplayName(user)}`"
              class="tw:flex tw:items-center tw:gap-3 tw:p-2 tw:rounded-lg tw:transition-colors"
              :class="[
                assignedUserIds.includes(user.id)
                  ? 'tw:bg-primary/10 tw:border tw:border-primary/20'
                  : 'tw:hover:bg-main-hover',
              ]"
              @click="toggleUser(user.id)"
            >
              <div
                class="tw:w-4 tw:h-4 tw:rounded tw:border tw:flex tw:items-center tw:justify-center tw:shrink-0 tw:transition-colors"
                :class="
                  assignedUserIds.includes(user.id)
                    ? 'tw:bg-primary tw:border-primary'
                    : 'tw:border-divider'
                "
              >
                <IconCheck
                  v-if="assignedUserIds.includes(user.id)"
                  :size="10"
                  class="tw:text-white"
                />
              </div>
              <div class="tw:flex-1 tw:min-w-0">
                <div class="tw:text-sm tw:font-medium tw:text-on-main">
                  {{ getUserDisplayName(user) }}
                </div>
                <div class="tw:text-xs tw:text-secondary tw:truncate">{{ user.email }}</div>
              </div>
            </BaseClickableRow>
            <BaseEmptyState v-if="filteredUsers.length === 0" dense title="No users found" />
          </div>
        </div>
      </div>
    </div>

    <template #footer="{ close }">
      <BaseButton variant="primary" @click="close">Done</BaseButton>
    </template>
  </BaseDialog>
</template>
