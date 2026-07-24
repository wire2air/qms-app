<script setup>
/**
 * Submissions tab of the App Builder workspace — entries submitted against
 * standalone (non-module) form templates. Module records have their own
 * left-nav entries + lists, so they're excluded here.
 */
import { IconPlus } from '@tabler/icons-vue'
import { isAllowed } from '@/utils/currentSession.js'

const toast = useToast()
const { confirm } = useConfirm()
const showAddDialog = ref(false)

const canCreateRecord = computed(() => isAllowed(['records:create']))

const records = useLiveQuery(
  async (db) => {
    const all = await db.Record.where().exec()
    return all.filter((r) => !r.moduleKey)
  },
  {
    models: ['Record'],
    initial: [],
  },
)

const loading = computed(() => records.value === undefined)

const deleteRecord = useLiveMutation(async (db, id) => {
  const record = await db.Record.findByPk(id)
  if (!record) throw new Error('Record not found')
  await record.delete()
})

async function onDeleteRecord(row) {
  if (
    !(await confirm({
      title: 'Delete Submission',
      message: `Are you sure you want to delete "${row.recordNumber}"? This action cannot be undone.`,
      okLabel: 'Delete',
      danger: true,
    }))
  ) {
    return
  }
  try {
    await deleteRecord(row.id)
    toast.success('Submission deleted')
  } catch (err) {
    toast.error(err?.message || 'Failed to delete submission')
  }
}

function onRecordCreated() {
  showAddDialog.value = false
  toast.success('Submission created successfully')
}
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-3">
    <div class="tw:flex tw:items-center tw:justify-between">
      <span class="tw:text-xs tw:text-secondary">
        Entries submitted against your standalone forms. Modules keep their own lists in the left
        menu.
      </span>
      <BaseButton v-if="canCreateRecord" variant="primary" size="sm" @click="showAddDialog = true">
        <template #icon><IconPlus :size="16" /></template>
        Add Submission
      </BaseButton>
    </div>

    <BaseEmptyState v-if="!loading && records.length === 0" title="No submissions yet">
      <template v-if="canCreateRecord" #action>
        <BaseButton variant="primary" size="sm" @click="showAddDialog = true">
          <template #icon><IconPlus :size="16" /></template>
          Add Submission
        </BaseButton>
      </template>
    </BaseEmptyState>

    <RecordsTable v-else :rows="records" :loading="loading" @delete="onDeleteRecord" />

    <AddRecordDialog v-model="showAddDialog" @created="onRecordCreated" />
  </div>
</template>
