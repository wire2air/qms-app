<script setup>
import { IconPlus } from '@tabler/icons-vue'

const props = defineProps({
  documentId: {
    type: String,
    required: true,
  },
  canEdit: {
    type: Boolean,
    default: false,
  },
})

const isUpdating = ref(false)

const allUsers = useLiveQuery(
  async (db) => (await db.User.where().exec()).filter((u) => u.userStatusId === 'ACTIVE'),
  { initial: [] },
)

const collaboratorRecords = useLiveQueryWithDeps(
  [() => props.documentId],
  async (db, [documentId]) => {
    const records = await db.UserOnDocument.where().exec()
    return records.filter((r) => r.documentId === documentId && !r.deletedAt)
  },
  { initial: [] },
)

const collaboratorUserIds = computed(() => collaboratorRecords.value.map((r) => r.userId))

const usersById = computed(() => {
  const map = {}
  for (const u of allUsers.value) map[u.id] = u
  return map
})

const collaborators = computed(() =>
  collaboratorRecords.value.map((r) => ({ ...r, user: usersById.value[r.userId] })),
)

// BaseSelectMenu requires items with { id, name }
const userItems = computed(() =>
  allUsers.value.map((u) => ({
    id: u.id,
    name: `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.email,
  })),
)

const addCollaborator = useLiveMutation(async (db, userId) => {
  const record = db.UserOnDocument.create({ documentId: props.documentId, userId })
  await record.save()
  return record
})

async function toggleCollaborator(userId) {
  if (isUpdating.value) return
  isUpdating.value = true
  try {
    const isCollaborator = collaboratorUserIds.value.includes(userId)
    if (isCollaborator) {
      const record = collaboratorRecords.value.find((r) => r.userId === userId)
      if (record) await record.delete()
    } else {
      await addCollaborator(userId)
    }
  } finally {
    isUpdating.value = false
  }
}
</script>

<template>
  <div class="tw:pt-4 tw:border-t tw:border-divider">
    <div class="tw:flex tw:items-center tw:justify-between tw:mb-2">
      <label class="ds-label tw:block">Collaborators</label>

      <BaseSelectMenu
        v-if="canEdit"
        :items="userItems"
        :modelValue="collaboratorUserIds"
        multiple
        required
      >
        <template #button>
          <button
            class="tw:flex tw:items-center tw:justify-center tw:w-6 tw:h-6 tw:rounded-md tw:hover:bg-sidebar-hover tw:text-secondary tw:transition-colors"
          >
            <IconPlus :size="14" />
          </button>
        </template>

        <template #items>
          <div class="tw:max-h-56 tw:overflow-y-auto tw:p-1">
            <button
              v-for="user in allUsers"
              :key="user.id"
              class="tw:w-full tw:flex tw:items-center tw:gap-3 tw:px-3 tw:py-2 tw:rounded-lg tw:transition-colors tw:text-left"
              :class="
                collaboratorUserIds.includes(user.id)
                  ? 'tw:bg-primary/10'
                  : 'tw:hover:bg-sidebar-hover'
              "
              @click.stop="toggleCollaborator(user.id)"
            >
              <UserAvatar :user="user" class="tw:size-7 tw:shrink-0" />
              <div class="tw:flex-1 tw:min-w-0">
                <p class="tw:text-sm tw:font-medium tw:text-on-sidebar tw:truncate">
                  {{ user.firstName }} {{ user.lastName }}
                </p>
                <p class="tw:text-xs tw:text-secondary tw:truncate">{{ user.email }}</p>
              </div>
              <div
                v-if="collaboratorUserIds.includes(user.id)"
                class="tw:w-1.5 tw:h-1.5 tw:rounded-full tw:bg-primary tw:shrink-0"
              />
            </button>
            <div
              v-if="allUsers.length === 0"
              class="tw:px-4 tw:py-6 tw:text-center tw:text-secondary tw:text-sm"
            >
              No users found
            </div>
          </div>
        </template>
      </BaseSelectMenu>
    </div>

    <div v-if="collaborators.length > 0" class="tw:flex tw:-space-x-2">
      <UserAvatar
        v-for="collab in collaborators"
        :key="collab.userId"
        :user="collab.user"
        class="tw:size-8"
      />
    </div>
    <p v-else class="tw:text-xs tw:text-secondary">No collaborators</p>
  </div>
</template>
