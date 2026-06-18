<script setup>
import { IconUsersGroup } from '@tabler/icons-vue'
import { isAllowed } from '@/utils/currentSession.js'

const showCreateDialog = ref(false)

const canCreateGroup = computed(() => isAllowed(['teams:create']))
const canDeleteGroup = computed(() => isAllowed(['teams:delete']))

const filters = ref({ search: '' })

const groups = useLiveQueryWithDeps(
  [() => filters.value.search],
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
  <BasePage width="standard">
    <PageHeader
      :icon="IconUsersGroup"
      title="Groups"
      subtitle="Manage your organization's groups and team assignments."
    >
      <template #actions>
        <BaseButton v-if="canCreateGroup" @click="showCreateDialog = true">
          Create Group
        </BaseButton>
      </template>
    </PageHeader>

    <GroupsFilterToolbar v-model:filters="filters" />

    <GroupsList :groups="groups" :loading="loading" :canDelete="canDeleteGroup" />

    <GroupsCreateDialog v-model="showCreateDialog" />
  </BasePage>
</template>
