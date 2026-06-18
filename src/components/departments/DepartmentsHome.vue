<script setup>
import { IconBuilding } from '@tabler/icons-vue'
import { isAllowed } from '@/utils/currentSession.js'

const showDialog = ref(false)
const selectedDepartmentId = ref(null)

const { confirm } = useConfirm()

const canCreateDepartment = computed(() => isAllowed(['departments:create']))
const canUpdateDepartment = computed(() => isAllowed(['departments:update']))
const canDeleteDepartment = computed(() => isAllowed(['departments:delete']))

// Filters — drives live query re-run
const filters = ref({ search: '', siteId: null })

// Live query for departments
const departments = useLiveQueryWithDeps(
  [() => filters.value.search, () => filters.value.siteId],
  async (db, [search, siteId]) => {
    let results = await db.Department.where().exec()
    if (siteId) results = results.filter((d) => d.siteId === siteId)
    if (search) {
      const q = search.toLowerCase()
      results = results.filter((d) => d.name.toLowerCase().includes(q))
    }
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
  <BasePage width="standard">
    <PageHeader
      :icon="IconBuilding"
      title="Departments"
      subtitle="Manage departments within your organization's sites."
    >
      <template #actions>
        <BaseButton v-if="canCreateDepartment" @click="openDialog()">
          Create New Department
        </BaseButton>
      </template>
    </PageHeader>

    <DepartmentsFilterToolbar v-model:filters="filters" />

    <DepartmentsTable
      :rows="departments"
      :canUpdate="canUpdateDepartment"
      :canDelete="canDeleteDepartment"
      @delete="onDeleteDepartment"
      @edit="onEditDepartment"
    />
  </BasePage>

  <!-- Create/Edit Department Dialog -->
  <DepartmentsCreateUpdateDialog
    v-if="showDialog"
    :id="selectedDepartmentId"
    v-model="showDialog"
  />
</template>
