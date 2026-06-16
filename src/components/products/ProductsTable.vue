<script setup>
import { IconEdit, IconTrash, IconDownload, IconUpload } from '@tabler/icons-vue'

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

const emit = defineEmits(['delete', 'edit', 'bulkDelete'])

const selected = ref([])
const selectedRows = computed(() => props.rows.filter((r) => selected.value.includes(r.id)))

const columns = [
  { name: 'name', label: 'NAME', field: 'name', align: 'left', sortable: true, hideable: false },
  { name: 'sku', label: 'SKU', field: 'sku', align: 'left', sortable: true },
  { name: 'family', label: 'FAMILY', field: 'family', align: 'left', sortable: true },
  {
    name: 'productType',
    label: 'PRODUCT TYPE',
    field: 'productTypeId',
    align: 'left',
    sortable: false,
  },
  { name: 'status', label: 'STATUS', field: 'statusId', align: 'left', sortable: false },
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

const showImportDialog = ref(false)

function escapeCsvValue(value) {
  if (value === null || value === undefined) return ''
  const str = String(value)
  if (str.includes('"') || str.includes(',') || str.includes('\n')) {
    return `"${str.replaceAll('"', '""')}"`
  }
  return str
}

function downloadCsv(rows, cols) {
  const exportCols = cols.filter((c) => c.name !== 'actions' && c.label)

  const header = exportCols.map((c) => escapeCsvValue(c.label)).join(',')
  const body = rows
    .map((row) => exportCols.map((c) => escapeCsvValue(row[c.field])).join(','))
    .join('\n')

  const csv = `${header}\n${body}`
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'products.csv'
  link.click()
  URL.revokeObjectURL(url)
}
</script>

<template>
  <div>
    <div class="tw:flex tw:justify-end tw:gap-2 tw:mb-3">
      <BaseButton variant="outline" size="sm" @click="showImportDialog = true">
        <template #icon><IconUpload :size="16" /></template>
        Import CSV
      </BaseButton>
      <BaseButton
        variant="outline"
        size="sm"
        :disabled="!rows.length"
        @click="downloadCsv(rows, columns)"
      >
        <template #icon><IconDownload :size="16" /></template>
        Export CSV
      </BaseButton>
    </div>

    <ProductsImportCsvDialog v-model="showImportDialog" :columns="columns" />

    <BaseTable
      v-model:pagination="pagination"
      v-model:selected="selected"
      :rows="rows"
      :columns="columns"
      :loading="loading"
      rowKey="id"
      selectable
      columnToggle
      showDensityToggle
    >
      <template #bulk-actions="{ clear }">
        <BaseButton variant="outline" size="sm" @click="downloadCsv(selectedRows, columns)">
          <template #icon><IconDownload :size="14" /></template>
          Export
        </BaseButton>
        <BaseButton
          v-if="canDelete"
          variant="danger"
          size="sm"
          @click="
            () => {
              emit('bulkDelete', selectedRows)
              clear()
            }
          "
        >
          <template #icon><IconTrash :size="14" /></template>
          Delete
        </BaseButton>
      </template>

      <template #body-cell-name="{ row }">
        <div class="tw:font-bold tw:text-on-main">{{ row.name }}</div>
      </template>

      <template #body-cell-createdAt="{ row }">
        <span class="tw:text-sm tw:text-secondary">{{ row.createdAt?.formatDate('date') }}</span>
      </template>

      <template #body-cell-sku="{ row }">
        <span
          class="tw:inline-flex tw:items-center tw:rounded tw:border tw:border-primary tw:px-2 tw:py-0.5 tw:text-xs tw:font-medium tw:text-primary"
          >{{ row.sku }}</span
        >
      </template>

      <template #body-cell-family="{ row }">
        <span class="tw:text-sm tw:text-secondary">{{ row.family || '—' }}</span>
      </template>

      <template #body-cell-productType="{ row }">
        <ProductTypeBadgeById v-if="row.productTypeId" :productTypeId="row.productTypeId" />
        <span v-else class="tw:text-sm tw:text-secondary">—</span>
      </template>

      <template #body-cell-status="{ row }">
        <ProductStatusBadgeById v-if="row.statusId" :statusId="row.statusId" />
        <span v-else class="tw:text-sm tw:text-secondary">—</span>
      </template>

      <template #body-cell-actions="{ row }">
        <div v-if="canUpdate || canDelete" class="tw:flex tw:justify-end">
          <BaseMenu :items="rowMenuItems(row)" />
        </div>
      </template>
    </BaseTable>
  </div>
</template>
