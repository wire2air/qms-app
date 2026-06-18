<script setup>
import { IconChecklist } from '@tabler/icons-vue'
import { isAllowed } from '@/utils/currentSession.js'

const showCreateDialog = ref(false)
const selectedOptionSetId = ref(null)

const canCreateOptionSet = computed(() => isAllowed(['optionSets:create']))
const canDeleteOptionSet = computed(() => isAllowed(['optionSets:delete']))

// Filters — drives live query re-run
const filters = ref({ search: '' })

// Live query for option sets
const optionSets = useLiveQueryWithDeps(
  [() => filters.value.search],
  async (db, [search]) => {
    let results = await db.OptionSet.where().exec()
    if (search) {
      const q = search.toLowerCase()
      results = results.filter(
        (os) =>
          os.name.toLowerCase().includes(q) || (os.description || '').toLowerCase().includes(q),
      )
    }
    return results.sort(
      (a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0),
    )
  },

  { models: ['OptionSet'], initial: [] },
)

function openDialog(id = null) {
  selectedOptionSetId.value = id
  showCreateDialog.value = true
}
</script>

<template>
  <BasePage width="standard">
    <PageHeader
      :icon="IconChecklist"
      title="Option Sets"
      subtitle="Manage reusable sets of options for dropdowns, radios, and checklists."
    >
      <template #actions>
        <BaseButton v-if="canCreateOptionSet" @click="openDialog()"> Create Option Set </BaseButton>
      </template>
    </PageHeader>

    <OptionSetsFilterToolbar v-model:filters="filters" />

    <OptionSetsTable :rows="optionSets" :canDelete="canDeleteOptionSet" />
  </BasePage>

  <!-- Create/Edit Option Set Dialog -->
  <OptionSetCreateDialog
    v-if="showCreateDialog"
    :id="selectedOptionSetId"
    v-model="showCreateDialog"
  />
</template>
