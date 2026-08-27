<script setup>
import { humanizeFilter } from '@/composables/useListPrint.js'
/**
 * Submissions tab of the App Builder workspace — entries submitted against
 * standalone (non-module) form templates. Module records have their own
 * left-nav entries + lists, so they're excluded here.
 */
import { IconPlus } from '@tabler/icons-vue'
import { isAllowed, currentSession } from '@/utils/currentSession.js'

const toast = useToast()
const { confirm } = useConfirm()
const showAddDialog = ref(false)

const canCreateRecord = computed(() => isAllowed(['records:create']))

// ── Quick views ───────────────────────────────────────────────────────────────
// Plain ref synced to ?view= — this tab renders a table directly rather than
// going through useListLayout (same approach as AuditInstancesHome).
const route = useRoute()
const router = useRouter()

const RECORD_PILLS = [
  { value: 'all', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'draft', label: 'Draft' },
  { value: 'mine', label: 'Mine' },
  { value: 'closed', label: 'Closed' },
]
const PILL_VALUES = new Set(RECORD_PILLS.map((p) => p.value))
const OPEN_STATUSES = ['DRAFT', 'PENDING', 'OPEN']
const CLOSED_STATUSES = ['COMPLETE', 'APPROVED', 'CLOSED', 'REJECTED', 'CANCELLED']

const activeFilter = ref(PILL_VALUES.has(route.query.view) ? route.query.view : 'all')
watch(
  () => route.query.view,
  (v) => {
    if (v && PILL_VALUES.has(v)) activeFilter.value = v
  },
)
watch(activeFilter, (v) => {
  if (route.query.view !== v) router.replace({ query: { ...route.query, view: v } })
})

function applyActiveFilter(rows, af) {
  const userId = currentSession.value?.userId
  if (af === 'open') return rows.filter((r) => OPEN_STATUSES.includes(r.statusId))
  if (af === 'draft') return rows.filter((r) => r.statusId === 'DRAFT')
  if (af === 'mine') return rows.filter((r) => r.createdBy === userId || r.userId === userId)
  if (af === 'closed') return rows.filter((r) => CLOSED_STATUSES.includes(r.statusId))
  return rows // 'all'
}

const allRecords = useLiveQuery(
  async (db) => {
    const all = await db.Record.where().exec()
    return all.filter((r) => !r.moduleKey)
  },
  {
    models: ['Record'],
    initial: [],
  },
)

const records = computed(() => applyActiveFilter(allRecords.value ?? [], activeFilter.value))

const loading = computed(() => allRecords.value === undefined)

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
      <ListPrintButton
        entity="Record"
        title="Submission Register"
        :rows="records"
        :filterLabel="humanizeFilter(activeFilter)"
        size="sm"
      />
      <BaseButton v-if="canCreateRecord" variant="primary" size="sm" @click="showAddDialog = true">
        <template #icon><IconPlus :size="16" /></template>
        Add Submission
      </BaseButton>
    </div>

    <BaseQuickFilterPills
      v-model="activeFilter"
      :pills="RECORD_PILLS"
      ariaLabel="Submission quick views"
    />

    <!-- "No submissions yet" is only true when there are none at all. Filtering
         down to nothing is a different message, and the table renders its own. -->
    <BaseEmptyState v-if="!loading && (allRecords?.length ?? 0) === 0" title="No submissions yet">
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
