<script setup>
import { IconChecklist, IconPlus } from '@tabler/icons-vue'
import { isAllowed } from '@/utils/currentSession.js'

const showCreateDialog = ref(false)
const selectedOptionSetId = ref(null)

const canCreateOptionSet = computed(() => isAllowed(['optionSets:create']))
const canDeleteOptionSet = computed(() => isAllowed(['optionSets:delete']))

// List layout — resolved content state + URL sync.
const list = useListLayout({
  filters: {},
  total: () => optionSets.value.length,
  empty: () => optionSets.value.length === 0,
  syncUrl: true,
})

// Live query for option sets
const optionSets = useLiveQuery(
  async (db) => {
    const results = await db.OptionSet.where().exec()
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
  <BaseListLayout
    title="Option Sets"
    :icon="IconChecklist"
    subtitle="Manage reusable sets of options for dropdowns, radios, and checklists."
    :state="list.state.value"
    :emptyIcon="IconChecklist"
    :emptyTitle="
      list.hasActiveFilters.value ? 'No option sets match your filters' : 'No option sets yet'
    "
  >
    <template #actions>
      <BaseButton v-if="canCreateOptionSet" @click="openDialog()">
        <IconPlus :size="16" />
        Create Option Set
      </BaseButton>
    </template>

    <template #empty-action>
      <BaseButton
        v-if="canCreateOptionSet && !list.hasActiveFilters.value"
        @click="openDialog()"
      >
        <IconPlus :size="16" />
        Create Option Set
      </BaseButton>
    </template>

    <OptionSetsTable :rows="optionSets" :canDelete="canDeleteOptionSet" />

    <!-- Create/Edit Option Set Dialog -->
    <OptionSetCreateDialog
      v-if="showCreateDialog"
      :id="selectedOptionSetId"
      v-model="showCreateDialog"
    />
  </BaseListLayout>
</template>
