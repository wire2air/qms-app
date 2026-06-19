<script setup>
import { IconUsers } from '@tabler/icons-vue'
import { isAllowed } from '@/utils/currentSession.js'

const showCreateDialog = ref(false)

const canCreateUser = computed(() => isAllowed(['users:create']))

// Filters + resolved content state (URL-synced). Declared before the live query
// because `total`/`empty`/`loading` are lazy getters that read `users`.
const list = useListLayout({
  filters: { search: '', userStatusId: null, roleId: null },
  total: () => users.value?.length ?? 0,
  loading: () => users.value === undefined,
  empty: () => users.value?.length === 0,
  syncUrl: true,
})

// Quick-filter status pills (single-select; null = "All").
const STATUS_PILLS = [
  { value: null, label: 'All' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'INVITED', label: 'Invited' },
  { value: 'INACTIVE', label: 'Inactive' },
]

// Live query for users — applies search, status, and role filters
const users = useLiveQueryWithDeps(
  [
    () => list.filters.value.search,
    () => list.filters.value.userStatusId,
    () => list.filters.value.roleId,
  ],

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
</script>

<template>
  <BaseListLayout
    title="Users"
    :icon="IconUsers"
    subtitle="Manage your organization's users."
    :state="list.state.value"
    :emptyIcon="IconUsers"
    :emptyTitle="list.hasActiveFilters.value ? 'No users match your filters' : 'No users found'"
  >
    <template #actions>
      <BaseButton v-if="canCreateUser" @click="showCreateDialog = true">Create User</BaseButton>
    </template>

    <template #filters>
      <UsersFilterToolbar v-model:filters="list.filters.value" />
    </template>

    <template #quick-filters>
      <BaseQuickFilterPills
        v-model="list.filters.value.userStatusId"
        ariaLabel="User status quick filters"
        :pills="STATUS_PILLS"
      />
    </template>

    <UsersList :users="users || []" />

    <UsersCreateUserDialog v-model="showCreateDialog" />
  </BaseListLayout>
</template>
