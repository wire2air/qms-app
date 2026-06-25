<script setup>
import { IconBuilding } from '@tabler/icons-vue'
import { isAllowed } from '@/utils/currentSession.js'

const showDialog = ref(false)
const selectedDepartmentId = ref(null)

const { confirm } = useConfirm()

const canCreateDepartment = computed(() => isAllowed(['departments:create']))
const canUpdateDepartment = computed(() => isAllowed(['departments:update']))
const canDeleteDepartment = computed(() => isAllowed(['departments:delete']))

// Filters + resolved content state (URL-synced). Declared before the live query
// because `total`/`empty` are lazy getters that read `departments`.
const list = useListLayout({
  filters: { siteId: null },
  total: () => departments.value.length,
  empty: () => departments.value.length === 0,
  syncUrl: true,
})

// Live query for departments
const departments = useLiveQueryWithDeps(
  [() => list.filters.value.siteId],
  async (db, [siteId]) => {
    let results = await db.Department.where().exec()
    if (siteId) results = results.filter((d) => d.siteId === siteId)
    return results.sort(
      (a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0),
    )
  },

  { models: ['Department'], initial: [] },
)

function openDialog(id = null) {
  selectedDepartmentId.value = id
  showDialog.value = true
}

function onEditDepartment(row) {
  openDialog(row.id)
}

async function onDeleteDepartment(row) {
  const ok = await confirm({
    title: 'Delete Department',
    message: `Are you sure you want to delete '${row.name}' (${row.code})? This cannot be undone.`,
    okLabel: 'Delete',
    danger: true,
  })
  if (ok) await row.delete()
}
</script>

<template>
  <BaseListLayout
    title="Departments"
    :icon="IconBuilding"
    subtitle="Manage departments within your organization's sites."
    :state="list.state.value"
    :emptyTitle="list.hasActiveFilters.value ? 'No departments match your filters' : 'No departments yet'"
  >
    <template #actions>
      <BaseButton v-if="canCreateDepartment" @click="openDialog()">
        Create New Department
      </BaseButton>
    </template>

    <template #filters>
      <DepartmentsFilterToolbar v-model:filters="list.filters.value" />
    </template>

    <DepartmentsTable
      :rows="departments"
      :canUpdate="canUpdateDepartment"
      :canDelete="canDeleteDepartment"
      @delete="onDeleteDepartment"
      @edit="onEditDepartment"
    />

    <!-- Create/Edit Department Dialog -->
    <DepartmentsCreateUpdateDialog
      v-if="showDialog"
      :id="selectedDepartmentId"
      v-model="showDialog"
    />
  </BaseListLayout>
</template>
