<script setup>
import { IconTrash } from '@tabler/icons-vue'
import { getCompanyPath } from '@/utils/routeHelpers'

const props = defineProps({
  rows: {
    type: Array,
    default: () => [],
  },
  loading: {
    type: Boolean,
    default: false,
  },
  canDelete: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['delete'])

const router = useRouter()

// Search is owned by GroupsFilterToolbar on the page; the table adds sortable
// columns + export over the already-filtered rows.
const columns = computed(() => [
  { name: 'name', label: 'GROUP NAME', field: 'name', align: 'left', sortable: true },
  { name: 'members', label: 'MEMBERS', field: 'members', align: 'left' },
  { name: 'isLeadership', label: 'TYPE', field: 'isLeadership', align: 'left', sortable: true },
  { name: 'actions', label: '', field: 'actions', align: 'right' },
])

const pagination = ref({ page: 1, pageSize: 50 })
const sort = ref([{ id: 'name', desc: false }])

function openGroup(row) {
  router.push(getCompanyPath(`/groups/${row.id}`))
}

function rowMenuItems(row) {
  if (!props.canDelete) return []
  return [{ name: 'Delete', icon: IconTrash, click: () => emit('delete', row) }]
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
    exportFilename="groups.csv"
    @rowClick="openGroup"
  >
    <template #body-cell-name="{ row }">
      <div class="tw:flex tw:items-center tw:gap-2.5">
        <TeamAvatar :team="row" class="tw:size-8 tw:shrink-0" />
        <span class="tw:font-semibold tw:text-on-main">{{ row.name }}</span>
      </div>
    </template>

    <template #body-cell-members="{ row }">
      <GroupMembersCell :teamId="row.id" />
    </template>

    <template #body-cell-isLeadership="{ row }">
      <span
        v-if="row.isLeadership"
        class="tw:inline-flex tw:items-center tw:rounded-full tw:bg-primary/10 tw:px-2.5 tw:py-0.5 tw:text-xs tw:font-semibold tw:text-primary"
        >Leadership</span
      >
      <span v-else class="tw:text-sm tw:text-secondary">Group</span>
    </template>

    <template #body-cell-actions="{ row }">
      <div v-if="canDelete" class="tw:flex tw:justify-end">
        <BaseMenu :items="rowMenuItems(row)" />
      </div>
    </template>
  </DataTable>
</template>
