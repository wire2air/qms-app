<script setup>
import { IconUsersGroup } from '@tabler/icons-vue'
import { isAllowed } from '@/utils/currentSession.js'

const showCreateDialog = ref(false)

const canCreateGroup = computed(() => isAllowed(['teams:create']))
const canDeleteGroup = computed(() => isAllowed(['teams:delete']))

const { confirm } = useConfirm()

async function onDelete(group) {
  const ok = await confirm({
    title: 'Delete Group',
    message: `Are you sure you want to delete '${group.name}'? This action cannot be undone.`,
    okLabel: 'Delete',
    danger: true,
  })
  if (ok) await group.delete()
}

const list = useListLayout({
  filters: { search: '' },
  total: () => groups.value.length,
  empty: () => groups.value.length === 0,
  syncUrl: true,
})

const groups = useLiveQueryWithDeps(
  [() => list.filters.value.search],
  async (db, [search]) => {
    let results = await db.Team.where().exec()
    if (search) {
      const q = search.toLowerCase()
      results = results.filter((g) => g.name.toLowerCase().includes(q))
    }
    return results.sort(
      (a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0),
    )
  },

  { models: ['Team'], initial: [] },
)

const loading = computed(() => groups.value === undefined)
</script>

<template>
  <BaseListLayout
    title="Groups"
    :icon="IconUsersGroup"
    subtitle="Manage your organization's groups and team assignments."
    :state="list.state.value"
    :emptyIcon="IconUsersGroup"
    :emptyTitle="list.hasActiveFilters.value ? 'No groups match your filters' : 'No groups yet'"
  >
    <template #actions>
      <BaseButton v-if="canCreateGroup" @click="showCreateDialog = true">
        Create Group
      </BaseButton>
    </template>

    <template #filters>
      <GroupsFilterToolbar v-model:filters="list.filters.value" />
    </template>

    <GroupsTable
      :rows="groups"
      :loading="loading"
      :canDelete="canDeleteGroup"
      @delete="onDelete"
    />

  </BaseListLayout>

  <!-- Outside BaseListLayout so it stays mounted in the empty state (its
       default slot only renders when 'ready') — else you can't create the first. -->
  <GroupsCreateDialog v-model="showCreateDialog" />
</template>
