<script setup>
import { IconUsers } from '@tabler/icons-vue'
import { isAllowed } from '@/utils/currentSession.js'

const showCreateDialog = ref(false)

const canCreateUser = computed(() => isAllowed(['user_management:create']))

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
//
// `INVITED` is NOT a user status — `user_statuses` holds ACTIVE and INACTIVE and
// nothing has ever written a third value (the column is now FK-constrained to
// those two). This pill used to pass 'INVITED' straight through as a
// userStatusId and could therefore never match a row.
//
// The state it was reaching for is real, it is just spelled differently:
// invited-but-not-yet-accepted is INACTIVE with inviteSent = true. So the pill
// stays and is resolved below as a pseudo-status, and "Inactive" now means
// deliberately disabled rather than "disabled OR never onboarded", which is the
// distinction an administrator actually wants on this screen.
const PENDING_INVITE = 'PENDING_INVITE'
const STATUS_PILLS = [
  { value: null, label: 'All' },
  { value: 'ACTIVE', label: 'Active' },
  { value: PENDING_INVITE, label: 'Invited' },
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
    if (userStatusId === PENDING_INVITE) {
      // Invited and not yet accepted. Acceptance is what flips the row to
      // ACTIVE, so "not ACTIVE + we sent them a link" is exactly the set.
      results = results.filter((u) => u.userStatusId !== 'ACTIVE' && u.inviteSent)
    } else if (userStatusId === 'INACTIVE') {
      // Disabled, as distinct from never-onboarded — the pending invites above
      // are also INACTIVE and are listed under their own pill.
      results = results.filter((u) => u.userStatusId === 'INACTIVE' && !u.inviteSent)
    } else if (userStatusId) {
      results = results.filter((u) => u.userStatusId === userStatusId)
    }
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

    <UsersTable :rows="users || []" :loading="users === undefined" />

  </BaseListLayout>

  <!-- Outside BaseListLayout so it stays mounted in the empty state. -->
  <UsersCreateUserDialog v-model="showCreateDialog" />
</template>
