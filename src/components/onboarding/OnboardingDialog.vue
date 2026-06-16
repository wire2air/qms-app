<script setup>
import { IconUsersGroup, IconUserPlus, IconUsers, IconCheck } from '@tabler/icons-vue'
import { currentSession } from '@/utils/currentSession'

const open = defineModel({
  type: Boolean,
  default: false,
})

const users = useLiveQuery(
  async (db) => {
    return await db.User.where().exec()
  },

  { models: ['User'], initial: [] },
)
const showCreateUserDialog = ref(false)
const currentUserId = computed(() => currentSession.value?.userId)

function finish() {
  open.value = false
  // Remove onboarding query param from URL
  const url = new URL(window.location)
  url.searchParams.delete('onboarding')
  window.history.replaceState({}, '', url)
}
</script>

<template>
  <BaseDialog v-model="open" persistent maxWidth="2xl">
    <div class="tw:space-y-4">
      <!-- Header -->
      <div class="tw:flex tw:items-center tw:gap-3">
        <div
          class="tw:bg-primary tw:flex tw:items-center tw:justify-center tw:rounded-xl tw:size-12 tw:text-white tw:shrink-0"
        >
          <IconUsersGroup :size="28" />
        </div>
        <div>
          <div class="tw:text-2xl tw:font-bold tw:text-on-main">Invite Your Team</div>
          <div class="tw:text-sm tw:text-secondary">
            Add team members to get started. You can always add more later.
          </div>
        </div>
      </div>

      <!-- User List -->
      <div>
        <div class="tw:flex tw:items-center tw:justify-between tw:mb-3">
          <div class="tw:text-sm tw:font-semibold tw:text-secondary">
            Team Members ({{ users.length }})
          </div>
          <BaseButton @click="showCreateUserDialog = true">
            <IconUserPlus :size="16" class="tw:mr-1.5" />
            Add User
          </BaseButton>
        </div>

        <div
          v-if="users.length === 0"
          class="tw:flex tw:flex-col tw:items-center tw:py-8 tw:text-secondary"
        >
          <IconUsers :size="48" class="tw:mb-2 tw:opacity-40" />
          <div class="tw:text-sm">No team members added yet</div>
          <div class="tw:text-xs tw:mt-1">Click "Add User" to invite your first team member</div>
        </div>

        <div
          v-else
          class="tw:rounded-lg tw:border tw:border-divider tw:max-h-80 tw:overflow-auto tw:divide-y tw:divide-divider"
        >
          <div
            v-for="user in users"
            :key="user.id"
            class="tw:flex tw:items-center tw:gap-3 tw:px-4 tw:py-3"
          >
            <UserAvatar
              :user="{ ...user, fullName: `${user.firstName} ${user.lastName}` }"
              class="tw:size-10 tw:shrink-0"
            />
            <div class="tw:flex-1 tw:min-w-0">
              <div class="tw:font-medium tw:text-on-main tw:truncate">
                {{ user.firstName }} {{ user.lastName }}
              </div>
              <div class="tw:text-sm tw:text-secondary tw:truncate">{{ user.email }}</div>
            </div>
            <div v-if="user.id !== currentUserId" class="tw:shrink-0">
              <span
                v-if="user.inviteSent"
                class="tw:inline-flex tw:items-center tw:px-2 tw:py-0.5 tw:rounded-full tw:text-xs tw:font-medium tw:bg-green-100 tw:text-green-800"
              >
                Invited
              </span>
              <span
                v-else
                class="tw:inline-flex tw:items-center tw:px-2 tw:py-0.5 tw:rounded-full tw:text-xs tw:font-medium tw:bg-gray-100 tw:text-gray-600"
              >
                Not Invited
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- Actions -->
      <div class="tw:flex tw:justify-end tw:items-center tw:gap-2 tw:pt-2">
        <BaseButton variant="text" @click="finish">Skip for now</BaseButton>
        <BaseButton v-if="users.length > 0" @click="finish">
          <IconCheck :size="16" class="tw:mr-1.5" />
          Done
        </BaseButton>
      </div>

      <!-- Create User Dialog -->
      <UsersCreateUserDialog v-model="showCreateUserDialog" />
    </div>
  </BaseDialog>
</template>
