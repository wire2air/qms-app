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

// Option sources for the advanced filter's entity-column dropdowns.
const sites = useLiveQuery((db) => db.Site.where().exec(), { models: ['Site'], initial: [] })
function selectOpts(list) {
  return list.map((x) => ({ value: x.id, label: x.name }))
}

const columns = computed(() => {
  const filterCfg = {
    site: { filterType: 'select', filterOptions: selectOpts(sites.value) },
    createdAt: { filterType: 'date' },
  }
  return [
    { name: 'name', label: 'DEPARTMENT NAME', field: 'name', align: 'left', sortable: true },
    { name: 'code', label: 'CODE', field: 'code', align: 'left', sortable: true },
    { name: 'site', label: 'SITE', field: 'site', align: 'left', sortable: false },
    {
      name: 'description',
      label: 'DESCRIPTION',
      field: 'description',
      align: 'left',
      sortable: false,
    },
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
    exportFilename="departments.csv"
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

    <template #body-cell-site="{ row }">
      <SiteBadgeById v-if="row.siteId" :siteId="row.siteId" />
      <span v-else class="tw:text-sm tw:text-secondary">—</span>
    </template>

    <template #body-cell-description="{ row }">
      <span class="tw:text-sm tw:text-secondary tw:line-clamp-2">{{ row.description || '—' }}</span>
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
