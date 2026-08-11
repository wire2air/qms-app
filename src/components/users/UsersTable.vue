<script setup>
import { IconUsersPlus, IconMapPinPlus } from '@tabler/icons-vue'
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

// Bulk role assignment (M2). Assigning a role INSERTs a roles_on_users row.
//
// Gate on the verb the write actually checks, so the action never appears for
// someone who would then be denied. That verb is now
// `role_permission_management:update`, not `user_management:create`.
//
// It changed underneath this gate. `role_on_user_insert_rls` originally required
// `user_management:create` — which was the CRITICAL escalation the Roles review
// found: "can onboard users" let a member self-assign any role in the tenant and
// inherit its entire grant set. The policy was raised to `rpm:update`; this gate
// and the comment justifying it were left behind, so a holder of
// `user_management:create` alone kept seeing the selection checkboxes and the
// "Assign role" action, and hit "Something went wrong" on save — the exact
// failure the old comment existed to prevent, just pointing the other way.
//
// Recorded as F-18 in docs/modules/roles. Two lessons worth keeping: a UI gate
// is a claim about a policy and goes stale when the policy moves, and this was
// listed in the cycle-1 pack as already aligned when it was not.
const canAssignRoles = computed(() => isAllowed(['role_permission_management:update']))
// Site assignment goes through PUT-shaped RLS on user_sites, which requires
// `user_management:update` (not :create like roles_on_users). Gate on the verb
// the write actually checks, so the action never appears for someone who would
// then be denied.
const canAssignSites = computed(() => isAllowed(['user_management:update']))
const selected = ref([])
const assignDialog = ref(false)
const assignTargetIds = ref([])
const sitesDialog = ref(false)
const sitesTargetIds = ref([])

const bulkActions = computed(() => {
  const actions = []
  if (canAssignRoles.value) {
    actions.push({
      key: 'assign-role',
      label: 'Assign role',
      icon: IconUsersPlus,
      run: (ids) => {
        assignTargetIds.value = [...ids]
        assignDialog.value = true
      },
    })
  }
  if (canAssignSites.value) {
    actions.push({
      key: 'assign-sites',
      label: 'Assign sites',
      icon: IconMapPinPlus,
      run: (ids) => {
        sitesTargetIds.value = [...ids]
        sitesDialog.value = true
      },
    })
  }
  return actions
})

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
    :selectable="canAssignRoles || canAssignSites"
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

  <UsersBulkAssignSitesDialog
    v-model="sitesDialog"
    :userIds="sitesTargetIds"
    @assigned="onAssigned"
  />
</template>
