<script setup>
import { IconUsersPlus } from '@tabler/icons-vue'
import { getCompanyPath } from '@/utils/routeHelpers'
import { isAllowed } from '@/utils/currentSession.js'

defineProps({
  rows: {
    type: Array,
    default: () => [],
  },
  loading: {
    type: Boolean,
    default: false,
  },
})

const router = useRouter()

// Bulk role assignment (M2). Assigning a role INSERTs a roles_on_users row,
// whose RLS WITH CHECK requires `user_management:create` (same convention as
// roles_on_teams). Gate on `create` — NOT `update` — so the button/selection
// only appear when the write will actually succeed; gating on `update` let a
// role with update-but-not-create see the button and then hit "Something went
// wrong" on save.
const canAssignRoles = computed(() => isAllowed(['user_management:create']))
const selected = ref([])
const assignDialog = ref(false)
const assignTargetIds = ref([])

const bulkActions = computed(() =>
  canAssignRoles.value
    ? [
        {
          key: 'assign-role',
          label: 'Assign role',
          icon: IconUsersPlus,
          run: (ids) => {
            assignTargetIds.value = [...ids]
            assignDialog.value = true
          },
        },
      ]
    : [],
)

function onAssigned() {
  selected.value = []
}

// Search / status / role filtering is owned by UsersFilterToolbar + quick-filter
// pills on the page, so the table's own search/filter chrome is disabled — it
// just provides sortable columns + export over the already-filtered rows.
const columns = computed(() => [
  { name: 'name', label: 'NAME', field: 'firstName', align: 'left', sortable: true },
  { name: 'email', label: 'EMAIL', field: 'email', align: 'left', sortable: true },
  { name: 'roles', label: 'ROLES', field: 'roles', align: 'left' },
  { name: 'userStatusId', label: 'STATUS', field: 'userStatusId', align: 'left', sortable: true },
])

const pagination = ref({ page: 1, pageSize: 50 })
// Sort id must match the column id ('name'), not the underlying field
// ('firstName') — otherwise TanStack warns "Column with id 'firstName' does not
// exist". The 'name' column sorts by firstName via its field accessor.
const sort = ref([{ id: 'name', desc: false }])

function openUser(row) {
  router.push(getCompanyPath(`/users/${row.id}`))
}
</script>

<template>
  <DataTable
    v-model:pagination="pagination"
    v-model:sort="sort"
    v-model:selected="selected"
    :rows="rows"
    :columns="columns"
    :loading="loading"
    rowKey="id"
    :mobileCards="false"
    :searchable="false"
    :filterable="false"
    :selectable="canAssignRoles"
    :bulkActions="bulkActions"
    exportManager
    exportFilename="users.csv"
    @rowClick="openUser"
  >
    <template #body-cell-name="{ row }">
      <div class="tw:flex tw:items-center tw:gap-2.5">
        <UserAvatar :user="row" class="tw:size-8 tw:shrink-0" />
        <span class="tw:font-semibold tw:text-on-main">{{ row.firstName }} {{ row.lastName }}</span>
      </div>
    </template>

    <template #body-cell-email="{ row }">
      <span class="tw:text-sm tw:text-secondary">{{ row.email }}</span>
    </template>

    <template #body-cell-roles="{ row }">
      <UserRolesCell :userId="row.id" />
    </template>

    <template #body-cell-userStatusId="{ row }">
      <UserStatusBadgeById :statusId="row.userStatusId" />
    </template>
  </DataTable>

  <UsersBulkAssignRoleDialog
    v-model="assignDialog"
    :userIds="assignTargetIds"
    @assigned="onAssigned"
  />
</template>
