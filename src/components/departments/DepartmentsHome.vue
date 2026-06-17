<script setup>
import { IconBuilding } from '@tabler/icons-vue'
import { isAllowed } from '@/utils/currentSession.js'

const showDialog = ref(false)
const selectedDepartmentId = ref(null)

const confirmDelete = ref({ open: false, department: null })

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

function onDeleteDepartment(row) {
  confirmDelete.value = { open: true, department: row }
}

async function confirmDeleteDepartment() {
  await confirmDelete.value.department.delete()
  confirmDelete.value = { open: false, department: null }
}
</script>

<template>
  <BasePage width="standard" density="compact">
    <PageHeader :icon="IconBuilding" title="Departments" />

    <SafeTeleport to="#main-header-actions">
      <BaseButton v-if="canCreateDepartment" @click="openDialog()">
        Create New Department
      </BaseButton>
    </SafeTeleport>

    <!-- Page Header -->
    <div class="tw:flex tw:items-center tw:justify-between">
      <div class="tw:flex tw:flex-col tw:gap-1">
        <div class="tw:text-3xl tw:font-bold tw:text-on-sidebar">Departments</div>
        <div class="tw:text-sm tw:text-secondary">
          Manage departments within your organization's sites.
        </div>
      </div>
    </div>

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

  <!-- Delete Confirm Dialog -->
  <ConfirmDialog
    v-model="confirmDelete.open"
    title="Delete Department"
    :message="`Are you sure you want to delete '${confirmDelete.department?.name}' (${confirmDelete.department?.code})? This cannot be undone.`"
    okLabel="Delete"
    @ok="confirmDeleteDepartment"
  />
</template>
