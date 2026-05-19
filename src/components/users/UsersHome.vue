<script setup>
import { IconUsers } from '@tabler/icons-vue'
import { isAllowed } from '@/utils/currentSession.js'

const showCreateDialog = ref(false)

const canCreateUser = computed(() => isAllowed(['users:create']))

// Filters
const filters = ref({ search: '', userStatusId: null, roleId: null })

// Live query for users — applies search, status, and role filters
const users = useLiveQueryWithDeps(
  [() => filters.value.search, () => filters.value.userStatusId, () => filters.value.roleId],
  async (db, [search, userStatusId, roleId]) => {
    let results = await db.User.where().exec()
    if (userStatusId) results = results.filter((u) => u.userStatusId === userStatusId)
    if (roleId) {
      const assignments = await db.RoleOnUser.where().exec()
      const idsForRole = new Set(assignments.filter((a) => a.roleId === roleId).map((a) => a.userId))
      results = results.filter((u) => idsForRole.has(u.id))
    }
    if (search) {
      const q = search.toLowerCase()
      results = results.filter(
        (u) =>
          u.firstName?.toLowerCase().includes(q) ||
          u.lastName?.toLowerCase().includes(q) ||
          u.email?.toLowerCase().includes(q),
      )
    }
    return results.sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))
  },
)

const loading = computed(() => users.value === undefined)
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-3 tw:overflow-hidden tw:h-full tw:p-5">
    <SafeTeleport to="#main-header-title">
      <div class="tw:flex tw:items-center tw:gap-2 tw:text-on-sidebar">
        <IconUsers class="tw:text-primary" :size="24" />
        <h2 class="tw:text-lg tw:font-bold tw:tracking-tight tw:text-nowrap">Users</h2>
      </div>
    </SafeTeleport>

    <SafeTeleport to="#main-header-actions">
      <BaseButton v-if="canCreateUser" @click="showCreateDialog = true"> Create User </BaseButton>
    </SafeTeleport>

    <div class="">
      <div class="tw:flex tw:flex-col tw:gap-3">
        <div class="tw:flex tw:flex-col tw:gap-1">
          <div class="tw:text-3xl tw:font-bold tw:text-on-sidebar">Users</div>
          <div class="tw:text-sm tw:text-secondary">Manage your organization's users.</div>
        </div>

        <UsersFilterToolbar v-model:filters="filters" />
      </div>
    </div>

    <div class="tw:flex tw:flex-col tw:flex-1 tw:gap-5 tw:overflow-auto">
      <UsersList :users="users || []" :loading="loading" />
    </div>

    <UsersCreateUserDialog v-model="showCreateDialog" />
  </div>
</template>
