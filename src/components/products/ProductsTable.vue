<script setup>
import { IconEdit, IconTrash, IconUpload } from '@tabler/icons-vue'
import { getCompanyPath } from '@/utils/routeHelpers.js'

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

const router = useRouter()

function openDetail(row) {
  router.push(getCompanyPath(`/products/${row.id}`))
}

const families = useLiveQuery(async (db) => db.ProductFamily.where().exec(), {
  models: ['ProductFamily'],
  initial: [],
})

// Option sources for the advanced filter's entity-column dropdowns.
const productTypes = useLiveQuery(async (db) => db.ProductType.where().exec(), {
  models: ['ProductType'],
  initial: [],
})
const productStatuses = useLiveQuery(async (db) => db.ProductStatus.where().exec(), {
  models: ['ProductStatus'],
  initial: [],
})
function selectOpts(list) {
  return list.map((x) => ({ value: x.id, label: x.name }))
}

const selected = ref([])
const selectedRows = computed(() => props.rows.filter((r) => selected.value.includes(r.id)))

const columns = computed(() => {
  const filterCfg = {
    family: { filterType: 'select', filterOptions: selectOpts(families.value) },
    productType: { filterType: 'select', filterOptions: selectOpts(productTypes.value) },
    status: { filterType: 'select', filterOptions: selectOpts(productStatuses.value) },
    createdAt: { filterType: 'date' },
  }
  return [
    { name: 'name', label: 'NAME', field: 'name', align: 'left', sortable: true, hideable: false },
    { name: 'sku', label: 'SKU', field: 'sku', align: 'left', sortable: true },
    { name: 'family', label: 'FAMILY', field: 'productFamilyId', align: 'left', sortable: false },
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

const showImportDialog = ref(false)
</script>

<template>
  <div>
    <div class="tw:flex tw:justify-end tw:gap-2 tw:mb-3">
      <BaseButton variant="outline" size="sm" @click="showImportDialog = true">
        <template #icon><IconUpload :size="16" /></template>
        Import CSV
      </BaseButton>
    </div>

    <ProductsImportCsvDialog v-model="showImportDialog" :columns="columns" />

    <DataTable
      v-model:pagination="pagination"
      v-model:sort="sort"
      v-model:selected="selected"
      :rows="rows"
      :columns="columns"
      :loading="loading"
      rowKey="id"
      :mobileCards="false"
      searchable
      selectable
      filterable
      exportManager
      exportFilename="products.csv"
      persistKey="products"
      @rowClick="openDetail"
    >
      <template #bulk-actions="{ clear }">
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
        <ProductFamilyBadgeById v-if="row.productFamilyId" :productFamilyId="row.productFamilyId" />
        <span v-else class="tw:text-sm tw:text-secondary">—</span>
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
    </DataTable>
  </div>
</template>
