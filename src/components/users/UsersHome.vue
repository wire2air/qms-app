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
    // Settings → Users is the internal-user admin page. Supplier users
    // are managed from the Suppliers → Users tab (a different entity
    // surface) so they shouldn't appear here.
    results = results.filter((u) => u.kind !== 'EXTERNAL_SUPPLIER')
    if (userStatusId) results = results.filter((u) => u.userStatusId === userStatusId)
    if (roleId) {
      const assignments = await db.RoleOnUser.where().exec()
      const idsForRole = new Set(
        assignments.filter((a) => a.roleId === roleId).map((a) => a.userId),
      )
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
    return results.sort(
      (a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0),
    )
  },
  { models: ['User', 'RoleOnUser'] },
)

const loading = computed(() => users.value === undefined)
</script>

<template>
  <BasePage width="standard">
    <PageHeader :icon="IconUsers" title="Users" subtitle="Manage your organization's users.">
      <template #actions>
        <BaseButton v-if="canCreateUser" @click="showCreateDialog = true">Create User</BaseButton>
      </template>
    </PageHeader>

    <UsersFilterToolbar v-model:filters="filters" />

    <UsersList :users="users || []" :loading="loading" />

    <UsersCreateUserDialog v-model="showCreateDialog" />
  </BasePage>
</template>
