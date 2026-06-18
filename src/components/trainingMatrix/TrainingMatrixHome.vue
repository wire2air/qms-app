<script setup>
import { IconPlus } from '@tabler/icons-vue'
import { isAllowed } from '@/utils/currentSession.js'

const canCreate = computed(() => isAllowed(['trainingMatrix:create']))
const canDelete = computed(() => isAllowed(['trainingMatrix:delete']))

const toast = useToast()

const rules = useLiveQuery((db) => db.TrainingMatrix.where().exec(), {
  models: ['TrainingMatrix'],
  initial: [],
})

const groupedRows = computed(() => {
  const map = new Map()
  for (const rule of rules.value) {
    if (!map.has(rule.trainingId)) map.set(rule.trainingId, [])
    map.get(rule.trainingId).push(rule)
  }
  return [...map.entries()].map(([trainingId, ruleList]) => ({ trainingId, rules: ruleList }))
})

const showAddDialog = ref(false)
const presetTrainingId = ref(null)

function openAddNew() {
  presetTrainingId.value = null
  showAddDialog.value = true
}

function openAddForTraining(trainingId) {
  presetTrainingId.value = trainingId
  showAddDialog.value = true
}

async function handleRemoveRole(rule) {
  if (!canDelete.value) return
  try {
    await rule.delete()
  } catch (err) {
    toast.notify({ type: 'negative', message: err?.message || 'Failed to remove role' })
  }
}
</script>

<template>
  <BasePage width="standard">
    <PageHeader
      title="Training Matrix"
      subtitle="Define which trainings are automatically assigned when a user gets a role."
    >
      <template #actions>
        <BaseButton v-if="canCreate" variant="primary" @click="openAddNew">
          <IconPlus :size="16" class="tw:mr-1" /> Add Rule
        </BaseButton>
      </template>
    </PageHeader>

    <div
      v-if="!groupedRows.length"
      class="tw:text-sm tw:text-secondary tw:italic tw:p-6 tw:text-center"
    >
      No rules yet. Click "Add Rule" to create one.
    </div>

    <div v-else class="tw:flex tw:flex-col tw:gap-2">
      <div
        v-for="group in groupedRows"
        :key="group.trainingId"
        class="tw:grid tw:grid-cols-[minmax(220px,1fr)_2fr] tw:items-start tw:gap-4 tw:px-4 tw:py-3 tw:rounded-lg tw:border tw:border-divider tw:bg-white"
      >
        <div class="tw:flex tw:items-center">
          <TrainingBadgeById :trainingId="group.trainingId" />
        </div>
        <div class="tw:flex tw:flex-wrap tw:items-center tw:gap-2">
          <RoleBadgeById
            v-for="rule in group.rules"
            :key="rule.id"
            :roleId="rule.roleId"
            :clearable="canDelete"
            @clear="handleRemoveRole(rule)"
          />
          <button
            v-if="canCreate"
            class="tw:inline-flex tw:items-center tw:gap-1 tw:text-xs tw:font-medium tw:text-primary tw:hover:underline"
            @click="openAddForTraining(group.trainingId)"
          >
            <IconPlus :size="12" /> Add Role
          </button>
        </div>
      </div>
    </div>

    <TrainingMatrixAddDialog v-model="showAddDialog" :trainingId="presetTrainingId" />
  </BasePage>
</template>
