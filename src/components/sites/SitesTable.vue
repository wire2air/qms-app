<script setup>
import { IconEdit, IconTrash } from '@tabler/icons-vue'

const props = defineProps({
  rows: {
    type: Array,
    default: () => [],
  },
  loading: {
    type: Boolean,
    default: false,
  },
  canUpdate: {
    type: Boolean,
    default: false,
  },
  canDelete: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['delete', 'edit'])

const columns = computed(() => {
  const filterCfg = {
    createdAt: { filterType: 'date' },
  }
  return [
    { name: 'name', label: 'SITE NAME', field: 'name', align: 'left', sortable: true },
    { name: 'code', label: 'CODE', field: 'code', align: 'left', sortable: true },
    { name: 'address', label: 'ADDRESS', field: 'address', align: 'left', sortable: true },
    { name: 'timezone', label: 'TIMEZONE', field: 'timezone', align: 'left', sortable: true },
    { name: 'createdAt', label: 'CREATED', field: 'createdAt', align: 'left', sortable: true },
    { name: 'actions', label: '', field: 'actions', align: 'right' },
  ].map((c) => ({ ...c, ...(filterCfg[c.name] || {}) }))
})

const pagination = ref({ page: 1, pageSize: 50 })
const sort = ref([{ id: 'createdAt', desc: true }])

function onEdit(row) {
  emit('edit', row)
}

function confirmDelete(row) {
  emit('delete', row)
}

function rowMenuItems(row) {
  const items = []
  if (props.canUpdate) {
    items.push({ name: 'Edit', icon: IconEdit, click: () => onEdit(row) })
  }
  if (props.canDelete) {
    items.push({ name: 'Delete', icon: IconTrash, click: () => confirmDelete(row) })
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
    :loading="loading"
    rowKey="id"
    :mobileCards="false"
    searchable
    filterable
    exportManager
    exportFilename="sites.csv"
  >
    <template #body-cell-name="{ row }">
      <div class="tw:font-bold tw:text-on-main">{{ row.name }}</div>
    </template>

    <template #body-cell-code="{ row }">
      <span
        class="tw:inline-flex tw:items-center tw:rounded tw:border tw:border-primary tw:px-2 tw:py-0.5 tw:text-xs tw:font-medium tw:text-primary"
        >{{ row.code }}</span
      >
    </template>

    <template #body-cell-address="{ row }">
      <span class="tw:text-sm tw:text-secondary">{{ row.address || '—' }}</span>
    </template>

    <template #body-cell-timezone="{ row }">
      <span class="tw:text-xs tw:text-secondary">{{ row.timezone }}</span>
    </template>

    <template #body-cell-createdAt="{ row }">
      <span class="tw:text-sm tw:text-secondary">{{ row.createdAt?.formatDate('date') }}</span>
    </template>

    <template #body-cell-actions="{ row }">
      <div v-if="canUpdate || canDelete" class="tw:flex tw:justify-end">
        <BaseMenu :items="rowMenuItems(row)" />
      </div>
    </template>
  </DataTable>
</template>
