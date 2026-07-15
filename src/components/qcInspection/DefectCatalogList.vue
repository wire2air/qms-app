<script setup>
/**
 * Test Library admin — the per-tenant master list of inspection tests, each with
 * a default severity (CRITICAL/MAJOR/MINOR), type, method and limits. Picking one
 * in the spec builder pre-fills a characteristic. Synced model (DefectCatalog) —
 * list live (via the shared DataTable), edits via the dialog.
 */
import { IconPlus, IconPencil, IconTrash } from '@tabler/icons-vue'

defineProps({ canManage: { type: Boolean, default: false } })
const toast = useToast()
const { confirm } = useConfirm()

const showDialog = ref(false)
const editDefect = ref(null)

const SEVERITY_ORDER = { CRITICAL: 0, MAJOR: 1, MINOR: 2 }
const defects = useLiveQuery(
  async (db) => {
    const rows = await db.DefectCatalog.where().exec()
    return rows.sort(
      (a, b) =>
        (SEVERITY_ORDER[a.defaultSeverity] ?? 9) - (SEVERITY_ORDER[b.defaultSeverity] ?? 9) ||
        (a.name || '').localeCompare(b.name || ''),
    )
  },
  { initial: [] },
)

const SEVERITY_OPTIONS = [
  { value: 'CRITICAL', label: 'Critical' },
  { value: 'MAJOR', label: 'Major' },
  { value: 'MINOR', label: 'Minor' },
]
const STATUS_OPTIONS = [
  { value: true, label: 'Active' },
  { value: false, label: 'Inactive' },
]

const columns = [
  { name: 'name', label: 'Test', field: 'name', align: 'left', sortable: true },
  { name: 'code', label: 'Code', field: 'code', align: 'left', sortable: true },
  { name: 'testType', label: 'Type', field: 'testType', align: 'left', sortable: true },
  {
    name: 'severity',
    label: 'Severity',
    field: 'defaultSeverity',
    align: 'left',
    filterType: 'select',
    filterOptions: SEVERITY_OPTIONS,
  },
  {
    name: 'status',
    label: 'Status',
    field: 'active',
    align: 'left',
    filterType: 'select',
    filterOptions: STATUS_OPTIONS,
  },
  { name: 'actions', label: '', field: 'actions', align: 'right' },
]

function openCreate() {
  editDefect.value = null
  showDialog.value = true
}
function openEdit(d) {
  editDefect.value = d
  showDialog.value = true
}
async function removeDefect(d) {
  if (
    !(await confirm({
      title: 'Delete test',
      message: `Delete test "${d.name}"? Specs already built keep their copy.`,
      okLabel: 'Delete',
      danger: true,
    }))
  )
    return
  try {
    await d.delete()
    toast.success('Test deleted')
  } catch (err) {
    toast.error(err?.message || 'Failed to delete test')
  }
}
</script>

<template>
  <DataTable
    :rows="defects"
    :columns="columns"
    rowKey="id"
    :mobileCards="false"
    searchable
    filterable
    densitySelector
    columnManager
    exportManager
    exportFilename="tests.csv"
    persistKey="qcInspection:defectCatalog"
    noDataLabel="No tests defined yet."
  >
    <template #toolbar-left>
      <p class="tw:text-sm tw:text-secondary tw:max-w-xl">
        Reusable inspection tests with a default severity class. Pick one when building a
        specification to pre-fill the test (type, severity, method, limits — all overridable).
      </p>
      <BaseButton v-if="canManage" variant="primary" size="sm" @click="openCreate">
        <template #icon><IconPlus :size="16" /></template>
        Add test
      </BaseButton>
    </template>

    <template #body-cell-name="{ row }">
      <div class="tw:font-medium tw:text-on-main">{{ row.name }}</div>
      <div v-if="row.description" class="tw:text-xs tw:text-secondary tw:line-clamp-1">
        {{ row.description }}
      </div>
    </template>

    <template #body-cell-code="{ row }">
      <span class="tw:text-xs tw:text-secondary">{{ row.code }}</span>
    </template>

    <template #body-cell-testType="{ row }">
      <span class="tw:text-xs tw:text-secondary">{{ row.testType }}</span>
    </template>

    <template #body-cell-severity="{ row }">
      <DefectSeverityBadgeById :severityId="row.defaultSeverity" />
    </template>

    <template #body-cell-status="{ row }">
      <span
        class="tw:text-micro tw:font-semibold tw:px-2 tw:py-0.5 tw:rounded-full"
        :class="row.active ? 'tw:bg-green-100 tw:text-green-700' : 'tw:bg-gray-100 tw:text-gray-500'"
      >
        {{ row.active ? 'Active' : 'Inactive' }}
      </span>
    </template>

    <template #body-cell-actions="{ row }">
      <div v-if="canManage" class="tw:flex tw:items-center tw:justify-end tw:gap-3">
        <button
          type="button"
          class="tw:text-secondary tw:hover:text-primary tw:bg-transparent tw:border-0 tw:cursor-pointer"
          title="Edit"
          @click="openEdit(row)"
        >
          <IconPencil :size="16" />
        </button>
        <button
          type="button"
          class="tw:text-secondary tw:hover:text-bad tw:bg-transparent tw:border-0 tw:cursor-pointer"
          title="Delete"
          @click="removeDefect(row)"
        >
          <IconTrash :size="16" />
        </button>
      </div>
    </template>
  </DataTable>

  <DefectCatalogCreateDialog v-model="showDialog" :editDefect="editDefect" />
</template>
