<script setup>
import { IconEdit, IconTrash } from '@tabler/icons-vue'
import { getCompanyPath } from '@/utils/routeHelpers'

const props = defineProps({
  rows: { type: Array, default: () => [] },
  canUpdate: { type: Boolean, default: false },
  canDelete: { type: Boolean, default: false },
})

const emit = defineEmits(['delete'])

const columns = [
  { name: 'title', label: 'TITLE', field: 'title', align: 'left', sortable: true },
  { name: 'status', label: 'STATUS', field: 'status', align: 'left', sortable: false },
  { name: 'passingScore', label: 'PASS SCORE', field: 'passingScore', align: 'left', sortable: true },
  { name: 'createdAt', label: 'CREATED', field: 'createdAt', align: 'left', sortable: true },
  { name: 'actions', label: '', field: 'actions', align: 'right' },
]

const pagination = ref({ page: 1, pageSize: 50 })
const sort = ref([{ id: 'createdAt', desc: true }])

function rowMenuItems(row) {
  const items = []
  if (props.canUpdate) {
    items.push({ name: 'Edit', icon: IconEdit, click: () => {} })
  }
  if (props.canDelete) {
    items.push({ name: 'Delete', icon: IconTrash, click: () => emit('delete', row) })
  }
  return items
}
</script>

<template>
  <DataTable
    v-model:pagination="pagination"
    v-model:sort="sort"
    :rows="rows"
    :columns="columns"
    rowKey="id"
    :mobileCards="false"
  >
    <template #body-cell-title="{ row }">
      <RouterLink
        :to="getCompanyPath(`/trainings/${row.id}`)"
        class="tw:flex tw:items-center tw:gap-2 tw:text-on-main tw:hover:text-primary"
      >
        <span class="tw:font-medium">{{ row.title }}</span>
      </RouterLink>
    </template>

    <template #body-cell-status="{ row }">
      <TrainingStatusBadgeById :statusId="row.status" />
    </template>

    <template #body-cell-passingScore="{ row }">
      <span class="tw:text-sm tw:text-secondary">{{ row.passingScore }}%</span>
    </template>

    <template #body-cell-createdAt="{ row }">
      <span class="tw:text-sm tw:text-secondary">{{ row.createdAt?.formatDate('date') }}</span>
    </template>

    <template #body-cell-actions="{ row }">
      <BaseRowMenu :items="rowMenuItems(row)" />
    </template>
  </DataTable>
</template>
