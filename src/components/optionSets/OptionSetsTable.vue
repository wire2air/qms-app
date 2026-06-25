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

const { confirm } = useConfirm()

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

const pagination = ref({ page: 1, pageSize: 50 })
const sort = ref([{ id: 'createdAt', desc: true }])

function rowMenuItems(row) {
  if (!props.canDelete) return []
  return [
    {
      name: 'Delete',
      icon: IconTrash,
      click: async () => {
        const ok = await confirm({
          title: 'Delete Option Set',
          message: `Are you sure you want to delete '${row.name}'? This cannot be undone.`,
          okLabel: 'Delete',
          danger: true,
        })
        if (ok) await row.delete()
      },
    },
  ]
}

function onRowClick(row) {
  router.push(getCompanyPath(`/option-sets/${row.id}`))
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
  </DataTable>
</template>
