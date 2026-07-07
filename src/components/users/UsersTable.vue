<script setup>
import { getCompanyPath } from '@/utils/routeHelpers'

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
const sort = ref([{ id: 'firstName', desc: false }])

function openUser(row) {
  router.push(getCompanyPath(`/users/${row.id}`))
}
</script>

<template>
  <DataTable
    v-model:pagination="pagination"
    v-model:sort="sort"
    :rows="rows"
    :columns="columns"
    :loading="loading"
    rowKey="id"
    :mobileCards="false"
    :searchable="false"
    :filterable="false"
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
</template>
