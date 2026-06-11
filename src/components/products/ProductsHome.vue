<script setup>
import { IconPackage } from '@tabler/icons-vue'
import { isAllowed } from '@/utils/currentSession.js'

const showDialog = ref(false)
const selectedProductId = ref(null)
const confirmDelete = ref({ open: false, product: null })

const canCreateProduct = computed(() => isAllowed(['products:create']))
const canUpdateProduct = computed(() => isAllowed(['products:update']))
const canDeleteProduct = computed(() => isAllowed(['products:delete']))

const filters = ref({ search: '', productTypeId: null, statusId: null })

const products = useLiveQueryWithDeps(
  [() => filters.value.search, () => filters.value.productTypeId, () => filters.value.statusId],
  async (db, [search, productTypeId, statusId]) => {
    let results = await db.Product.where().exec()
    if (productTypeId) results = results.filter((p) => p.productTypeId === productTypeId)
    if (statusId) results = results.filter((p) => p.statusId === statusId)
    if (search) {
      const q = search.toLowerCase()
      results = results.filter(
        (p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q),
      )
    }
    return results.sort(
      (a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0),
    )
  },
  { initial: [] },
)

function openDialog(id = null) {
  selectedProductId.value = id
  showDialog.value = true
}

function onEditProduct(row) {
  openDialog(row.id)
}

function onDeleteProduct(row) {
  confirmDelete.value = { open: true, product: row }
}

async function confirmDeleteProduct() {
  await confirmDelete.value.product.delete()
  confirmDelete.value = { open: false, product: null }
}
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-3 tw:h-full tw:p-5">
    <SafeTeleport to="#main-header-title">
      <div class="tw:flex tw:items-center tw:gap-2 tw:text-on-sidebar">
        <IconPackage class="tw:text-primary" :size="24" />
        <h2 class="tw:text-lg tw:font-bold tw:tracking-tight tw:text-nowrap">Item Master</h2>
      </div>
    </SafeTeleport>

    <SafeTeleport to="#main-header-actions">
      <BaseButton v-if="canCreateProduct" data-testid="product-create-button" @click="openDialog()">
        Add New Item
      </BaseButton>
    </SafeTeleport>

    <!-- Page Header -->
    <div class="tw:flex tw:items-center tw:justify-between">
      <div class="tw:flex tw:flex-col tw:gap-1">
        <div class="tw:text-3xl tw:font-bold tw:text-on-sidebar">Item Master</div>
        <div class="tw:text-sm tw:text-secondary">
          Manage your organization's items — raw materials, components, intermediates, and finished
          goods.
        </div>
      </div>
    </div>

    <ProductsFilterToolbar v-model:filters="filters" />

    <ProductsTable
      :rows="products"
      :canUpdate="canUpdateProduct"
      :canDelete="canDeleteProduct"
      @delete="onDeleteProduct"
      @edit="onEditProduct"
    />
  </div>

  <!-- Create/Edit Product Dialog -->
  <ProductsCreateUpdateDialog v-if="showDialog" :id="selectedProductId" v-model="showDialog" />

  <!-- Delete Confirm Dialog -->
  <ConfirmDialog
    v-model="confirmDelete.open"
    title="Delete Product"
    :message="`Are you sure you want to delete '${confirmDelete.product?.name}' (${confirmDelete.product?.sku})? This cannot be undone.`"
    okLabel="Delete"
    @ok="confirmDeleteProduct"
  />
</template>
