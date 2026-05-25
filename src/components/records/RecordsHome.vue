<script setup>
import { IconFolderOpen, IconPlus } from '@tabler/icons-vue'
import { isAllowed } from '@/utils/currentSession.js'
import { getCompanyPath } from '@/utils/routeHelpers.js'

const toast = useToast()
const showAddDialog = ref(false)

const filters = ref({ search: '' })

const canCreateRecord = computed(() => isAllowed(['records:create']))

const records = useLiveQueryWithDeps(
  [() => filters.value.search],
  async (db, [search]) => {
    const all = await db.Record.where().exec()
    if (!search) return all
    const s = search.toLowerCase()
    return all.filter((r) => r.recordNumber?.toLowerCase().includes(s))
  },
  { initial: [] },
)

const loading = computed(() => records.value === undefined)

const deleteRecord = useLiveMutation(async (db, id) => {
  const record = await db.Record.findByPk(id)
  if (!record) throw new Error('Record not found')
  await record.delete()
})

async function onDeleteRecord(row) {
  if (
    !confirm(
      `Are you sure you want to delete record "${row.recordNumber}"? This action cannot be undone.`,
    )
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
  <div class="tw:flex tw:flex-col tw:gap-3 tw:h-full tw:p-5">
    <SafeTeleport to="#main-header-title">
      <div class="tw:flex tw:items-center tw:gap-2 tw:text-on-sidebar">
        <IconFolderOpen :size="24" class="tw:text-primary" />
        <h2 class="tw:text-lg tw:font-bold tw:tracking-tight tw:text-nowrap">Records</h2>
      </div>
    </SafeTeleport>

    <!-- Page Header -->
    <div class="tw:flex tw:items-center tw:justify-between">
      <div class="tw:flex tw:flex-col tw:gap-1">
        <div class="tw:text-3xl tw:font-bold tw:text-on-sidebar">Records</div>
        <div class="tw:text-sm tw:text-secondary">View and manage submitted records.</div>
      </div>
      <button
        v-if="canCreateRecord"
        class="tw:flex tw:items-center tw:gap-2 tw:px-4 tw:py-2 tw:bg-primary tw:text-white tw:font-bold tw:rounded-lg tw:hover:bg-primary/90 tw:transition-colors tw:border-0 tw:cursor-pointer"
        @click="showAddDialog = true"
      >
        <IconPlus :size="18" />
        Add Record
      </button>
    </div>

    <!-- Standalone records (legacy `records` table) -->
    <div class="tw:flex tw:items-center tw:justify-between tw:mt-2">
      <h3 class="tw:text-sm tw:font-semibold tw:text-on-sidebar tw:uppercase tw:tracking-wide">
        Standalone Records
      </h3>
      <span class="tw:text-xs tw:text-secondary">
        UTILITY-classified form templates (legacy path)
      </span>
    </div>
    <RecordsFilterToolbar v-model:filters="filters" />
    <div>
      <RecordsTable :rows="records" :loading="loading" @delete="onDeleteRecord" />
    </div>

    <!-- Inspections & Logs records (new field_records table) -->
    <div class="tw:flex tw:items-center tw:justify-between tw:mt-6">
      <h3 class="tw:text-sm tw:font-semibold tw:text-on-sidebar tw:uppercase tw:tracking-wide">
        Inspections &amp; Logs Records
      </h3>
      <RouterLink
        :to="getCompanyPath('/inspections-logs/records')"
        class="tw:text-xs tw:text-primary tw:hover:underline"
      >
        Open the dedicated page →
      </RouterLink>
    </div>
    <FieldRecordsList :compact="true" />

    <!-- Add Record Dialog -->
    <AddRecordDialog v-model="showAddDialog" @created="onRecordCreated" />
  </div>
</template>

<style scoped lang="scss">
.text-slate-800 {
  color: #1e293b;
}
</style>
