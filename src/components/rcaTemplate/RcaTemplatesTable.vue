<script setup>
import { IconEdit, IconTrash } from '@tabler/icons-vue'

const props = defineProps({
  rows: { type: Array, default: () => [] },
  canUpdate: { type: Boolean, default: false },
  canDelete: { type: Boolean, default: false },
})

const emit = defineEmits(['edit', 'delete'])

const columns = computed(() => {
  const filterCfg = {
    createdAt: { filterType: 'date' },
  }
  return [
    { name: 'name', label: 'NAME', field: 'name', align: 'left', sortable: true },
    { name: 'description', label: 'DESCRIPTION', field: 'description', align: 'left' },
    { name: 'createdAt', label: 'CREATED', field: 'createdAt', align: 'left', sortable: true },
    { name: 'actions', label: '', field: 'actions', align: 'right' },
  ].map((c) => ({ ...c, ...(filterCfg[c.name] || {}) }))
})

const pagination = ref({ page: 1, pageSize: 50 })
const sort = ref([{ id: 'createdAt', desc: true }])

function rowMenuItems(row) {
  const items = []
  if (props.canUpdate) {
    items.push({ name: 'Edit', icon: IconEdit, click: () => emit('edit', row) })
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
    filterable
    searchable
    exportManager
    exportFilename="rca-templates.csv"
  >
    <template #body-cell-name="{ row }">
      <span class="tw:font-semibold tw:text-on-main">{{ row.name }}</span>
    </template>

    <template #body-cell-method="{ row }">
      <RcaMethodBadge :method="row.method" />
    </template>

    <template #body-cell-description="{ row }">
      <span class="tw:text-sm tw:text-secondary tw:line-clamp-1">
        {{ row.description || '—' }}
      </span>
    </template>

    <template #body-cell-createdAt="{ row }">
      <span class="tw:text-sm tw:text-secondary">{{ row.createdAt?.formatDate('date') }}</span>
    </template>

    <template #body-cell-actions="{ row }">
      <div class="tw:flex tw:justify-end">
        <BaseMenu v-if="rowMenuItems(row).length" :items="rowMenuItems(row)" />
      </div>
    </template>
  </DataTable>
</template>
