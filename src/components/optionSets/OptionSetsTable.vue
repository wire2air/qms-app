<script setup>
import { getCompanyPath } from '@/utils/routeHelpers'
import { IconTrash } from '@tabler/icons-vue'

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

const router = useRouter()

const pendingDelete = shallowRef(null)
const openDeleteDialog = computed({
  get: () => pendingDelete.value !== null,
  set: (val) => {
    if (!val) pendingDelete.value = null
  },
})

const columns = [
  { name: 'name', label: 'NAME', field: 'name', align: 'left', sortable: true },
  {
    name: 'description',
    label: 'DESCRIPTION',
    field: 'description',
    align: 'left',
    sortable: false,
  },
  {
    name: 'optionsCount',
    label: 'OPTIONS',
    field: 'optionsCount',
    align: 'center',
    sortable: false,
  },
  { name: 'createdAt', label: 'CREATED', field: 'createdAt', align: 'left', sortable: true },
  { name: 'actions', label: '', field: 'actions', align: 'right' },
]

const pagination = ref({
  page: 1,
  rowsPerPage: 50,
  sortBy: 'createdAt',
  descending: true,
  total: null,
})

function rowMenuItems(row) {
  if (!props.canDelete) return []
  return [
    {
      name: 'Delete',
      icon: IconTrash,
      click: () => {
        pendingDelete.value = row
      },
    },
  ]
}

async function executeDelete() {
  await pendingDelete.value.delete()
  pendingDelete.value = null
}

function onRowClick(row) {
  router.push(getCompanyPath(`/option-sets/${row.id}`))
}
</script>

<template>
  <BaseTable
    v-model:pagination="pagination"
    :rows="rows"
    :columns="columns"
    :loading="loading"
    rowKey="id"
    @rowClick="onRowClick"
  >
    <template #body-cell-name="{ row }">
      <div class="tw:font-bold tw:text-on-main">{{ row.name }}</div>
    </template>

    <template #body-cell-description="{ row }">
      <span class="tw:text-sm tw:text-secondary tw:line-clamp-2">{{ row.description || '—' }}</span>
    </template>

    <template #body-cell-optionsCount="{ row }">
      <BaseBadge> {{ row.options?.length || 0 }} </BaseBadge>
    </template>

    <template #body-cell-createdAt="{ row }">
      <span class="tw:text-sm tw:text-secondary">{{ row.createdAt?.formatDate('date') }}</span>
    </template>

    <template #body-cell-actions="{ row }">
      <div v-if="canDelete" class="tw:flex tw:justify-end">
        <BaseMenu :items="rowMenuItems(row)" />
      </div>
    </template>
  </BaseTable>

  <BaseConfirmDialog
    :modelValue="openDeleteDialog"
    title="Delete Option Set"
    :message="`Are you sure you want to delete '${pendingDelete?.name}'? This cannot be undone.`"
    okLabel="Delete"
    @ok="executeDelete"
  />
</template>
