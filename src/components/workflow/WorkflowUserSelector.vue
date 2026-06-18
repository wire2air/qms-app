<script setup>
import { IconSearch } from '@tabler/icons-vue'

const props = defineProps({
  stepId: { type: String, required: true },
  canUpdate: { type: Boolean, default: false },
})

const search = ref('')

// Templates can only assign INTERNAL users — supplier-user assignment
// is a separate mechanism (resolved at submit time once we know the
// entity's supplier_id; see [[supplier-workflow-assignee design]]).
// Mixing them in this picker confuses authors.
const users = useLiveQuery(
  async (db) =>
    (await db.User.where().exec()).filter(
      (u) => u.userStatusId === 'ACTIVE' && u.kind !== 'EXTERNAL_SUPPLIER',
    ),

  { models: ['User'], initial: [] },
)

const stepUsers = useLiveQueryWithDeps(
  [() => props.stepId],
  async (db, [stepId]) => {
    if (!stepId) return []
    return await db.WorkflowStepUser.where('stepId', stepId).exec()
  },

  { models: ['WorkflowStepUser'], initial: [] },
)

const reviewerIds = computed(() => stepUsers.value.map((su) => su.userId))

const selectedUsers = computed(() => users.value.filter((u) => reviewerIds.value.includes(u.id)))

const filteredUsers = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return users.value
  return users.value.filter(
    (u) =>
      u.firstName?.toLowerCase().includes(q) ||
      u.lastName?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q),
  )
})

function getUserDisplayName(user) {
  const parts = [user.firstName, user.lastName].filter(Boolean)
  return parts.length > 0 ? parts.join(' ') : user.email
}

const addStepUser = useLiveMutation(async (db, { stepId, userId }) => {
  const existing = await db.WorkflowStepUser.where('stepId', stepId, { force: true })
    .where('userId', userId)
    .first()
  if (existing) {
    if (existing.deletedAt) await existing.restore()
    return existing
  }
  const su = db.WorkflowStepUser.create({ stepId, userId })
  await su.save()
  return su
})

async function toggleUser(userId) {
  if (!props.canUpdate) return
  const existing = stepUsers.value.find((su) => su.userId === userId)
  if (existing) {
    await existing.delete()
  } else {
    await addStepUser({ stepId: props.stepId, userId })
  }
}

async function removeUser(userId) {
  if (!props.canUpdate) return
  const existing = stepUsers.value.find((su) => su.userId === userId)
  if (existing) await existing.delete()
}
</script>

<template>
  <div class="tw:space-y-4">
    <!-- Search -->
    <BaseField v-slot="{ id: fieldId }" label="Select Users">
      <BaseTextInput
        :id="fieldId"
        v-model="search"
        placeholder="Search users by name or email..."
      >
        <template #icon>
          <IconSearch :size="18" class="tw:text-secondary" />
        </template>
      </BaseTextInput>
    </BaseField>

    <!-- Selected Chips -->
    <div v-if="selectedUsers.length > 0" class="tw:flex tw:flex-wrap tw:gap-2">
      <BaseBadge
        v-for="user in selectedUsers"
        :key="user.id"
        class="tw:bg-main-hover tw:border-divider tw:text-on-main"
        :clearable="canUpdate"
        :clearLabel="`Remove ${getUserDisplayName(user)}`"
        @clear="removeUser(user.id)"
      >
        {{ getUserDisplayName(user) }}
      </BaseBadge>
    </div>

    <!-- User List -->
    <div class="tw:max-h-48 tw:overflow-y-auto tw:space-y-1">
      <BaseClickableRow
        v-for="user in filteredUsers"
        :key="user.id"
        :disabled="!canUpdate"
        :aria-label="`Toggle user ${getUserDisplayName(user)}`"
        class="tw:flex tw:items-center tw:gap-3 tw:p-2 tw:rounded-lg tw:transition-colors"
        :class="[
          reviewerIds.includes(user.id)
            ? 'tw:bg-primary/10 tw:border tw:border-primary/20'
            : 'tw:hover:bg-main-hover',
        ]"
        @click="toggleUser(user.id)"
      >
        <BaseCheckbox
          :modelValue="reviewerIds.includes(user.id)"
          :disabled="!canUpdate"
          @click.stop
          @update:modelValue="canUpdate && toggleUser(user.id)"
        />
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
</template>
