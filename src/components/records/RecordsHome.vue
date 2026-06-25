<script setup>
import { IconFolderOpen, IconPlus } from '@tabler/icons-vue'
import { isAllowed } from '@/utils/currentSession.js'

const toast = useToast()
const { confirm } = useConfirm()
const showAddDialog = ref(false)

const canCreateRecord = computed(() => isAllowed(['records:create']))

// Filters + resolved content state (URL-synced). Declared before the live query
// because `total`/`empty`/`loading` are lazy getters that read `records`.
const list = useListLayout({
  filters: {},
  total: () => records.value.length,
  empty: () => records.value.length === 0,
  loading: () => records.value === undefined,
  syncUrl: true,
})

const records = useLiveQuery((db) => db.Record.where().exec(), {
  models: ['Record'],
  initial: [],
})

const loading = computed(() => records.value === undefined)

const deleteRecord = useLiveMutation(async (db, id) => {
  const record = await db.Record.findByPk(id)
  if (!record) throw new Error('Record not found')
  await record.delete()
})

async function onDeleteRecord(row) {
  if (
    !(await confirm({
      title: 'Delete Record',
      message: `Are you sure you want to delete record "${row.recordNumber}"? This action cannot be undone.`,
      okLabel: 'Delete',
      danger: true,
    }))
  )
    return
  try {
    await deleteRecord(row.id)
    toast.success('Record deleted successfully')
  } catch (err) {
    toast.error(err.message || 'Failed to delete record')
  }
}

function onRecordCreated() {
  showAddDialog.value = false
  toast.success('Record created successfully')
}
</script>

<template>
  <BaseListLayout
    title="Records"
    :icon="IconFolderOpen"
    subtitle="View and manage submitted records."
    :state="list.state.value"
    :emptyTitle="list.hasActiveFilters.value ? 'No records match your filters' : 'No records yet'"
  >
    <template #actions>
      <button
        v-if="canCreateRecord"
        class="tw:flex tw:items-center tw:gap-2 tw:px-4 tw:py-2 tw:bg-primary tw:text-white tw:font-bold tw:rounded-lg tw:hover:bg-primary/90 tw:transition-colors tw:border-0 tw:cursor-pointer"
        @click="showAddDialog = true"
      >
        <IconPlus :size="18" />
        Add Record
      </button>
    </template>

    <template #filters>
      <!-- Standalone records (legacy `records` table) -->
      <div class="tw:flex tw:items-center tw:justify-between tw:mt-2">
        <h3 class="tw:text-sm tw:font-semibold tw:text-on-sidebar tw:uppercase tw:tracking-wide">
          Standalone Records
        </h3>
        <span class="tw:text-xs tw:text-secondary">
          UTILITY-classified form templates (legacy path)
        </span>
      </div>
    </template>

    <div>
      <RecordsTable :rows="records" :loading="loading" @delete="onDeleteRecord" />
    </div>

    <!-- Add Record Dialog -->
    <AddRecordDialog v-model="showAddDialog" @created="onRecordCreated" />
  </BaseListLayout>
</template>
