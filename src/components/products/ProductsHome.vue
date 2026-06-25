<script setup>
import { IconPackage, IconRestore } from '@tabler/icons-vue'
import { isAllowed } from '@/utils/currentSession.js'

const toast = useToast()

const showDialog = ref(false)
const selectedProductId = ref(null)
const { confirm } = useConfirm()
const confirmBulkDelete = ref({ open: false, rows: [] })
const showDeleted = ref(false)

// Products that have at least one (non-deleted) specification linked. Used to
// block deletion — a spec without its item would be an orphaned record.
const productIdsWithSpecs = useLiveQuery(
  async (db) => {
    const specs = await db.Specification.where().exec()
    return new Set(specs.filter((s) => s.productId).map((s) => s.productId))
  },
  { models: ['Specification'], initial: new Set() },
)

const canCreateProduct = computed(() => isAllowed(['products:create']))
const canUpdateProduct = computed(() => isAllowed(['products:update']))
const canDeleteProduct = computed(() => isAllowed(['products:delete']))

const list = useListLayout({
  // Multi-select dimensions (Linear-style filter menu) — arrays of ids.
  filters: { productTypeId: [], statusId: [], productFamilyId: [] },
  total: () => products.value.length,
  empty: () => products.value.length === 0,
  syncUrl: true,
})

const products = useLiveQueryWithDeps(
  [
    () => list.filters.value.productTypeId,
    () => list.filters.value.statusId,
    () => list.filters.value.productFamilyId,
  ],
  async (db, [productTypeIds, statusIds, productFamilyIds]) => {
    let results = await db.Product.where().exec()
    if (productTypeIds?.length)
      results = results.filter((p) => productTypeIds.includes(p.productTypeId))
    if (statusIds?.length) results = results.filter((p) => statusIds.includes(p.statusId))
    if (productFamilyIds?.length)
      results = results.filter((p) => productFamilyIds.includes(p.productFamilyId))
    return results.sort(
      (a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0),
    )
  },

  { models: ['Product', 'ProductFamily'], initial: [] },
)

function openDialog(id = null) {
  selectedProductId.value = id
  showDialog.value = true
}

function onEditProduct(row) {
  openDialog(row.id)
}

async function onDeleteProduct(row) {
  if (productIdsWithSpecs.value.has(row.id)) {
    toast.warning(`"${row.name}" has linked specification(s). Delete or supersede them first.`)
    return
  }
  const ok = await confirm({
    title: 'Delete Product',
    message: `Delete '${row.name}' (${row.sku})? You can restore it later from the Deleted items section.`,
    okLabel: 'Delete',
    danger: true,
  })
  if (ok) await row.delete()
}

function onBulkDelete(rows) {
  const blocked = rows.filter((p) => productIdsWithSpecs.value.has(p.id))
  const deletable = rows.filter((p) => !productIdsWithSpecs.value.has(p.id))
  if (blocked.length) {
    toast.warning(
      `${blocked.length} item(s) have linked specifications and were skipped. Delete or supersede those specs first.`,
    )
  }
  if (!deletable.length) return
  confirmBulkDelete.value = { open: true, rows: deletable }
}

async function confirmBulkDeleteProducts() {
  for (const product of confirmBulkDelete.value.rows) await product.delete()
  confirmBulkDelete.value = { open: false, rows: [] }
}

// Soft-deleted items — full scan with force=true (bypass paranoid), then keep
// only the ones with deletedAt set. Powers the "Deleted items" restore section.
// NB: pass undefined as the index field for a true full scan — `where('id', …)`
// would push a bogus equality condition (id !== undefined) that matches nothing.
const deletedProducts = useLiveQuery(
  async (db) => {
    const all = await db.Product.where(undefined, undefined, { force: true }).exec()
    return all
      .filter((p) => p.deletedAt)
      .sort((a, b) => (b.deletedAt?.toMillis?.() ?? 0) - (a.deletedAt?.toMillis?.() ?? 0))
  },
  { models: ['Product'], initial: [] },
)

async function restoreProduct(product) {
  try {
    await product.restore()
    toast.success(`"${product.name}" restored`)
  } catch (e) {
    toast.error(e?.message || 'Failed to restore item')
  }
}
</script>

<template>
  <BaseListLayout
    title="Item Master"
    :icon="IconPackage"
    subtitle="Manage your organization's items — raw materials, components, intermediates, and finished goods."
    :state="list.state.value"
    :emptyIcon="IconPackage"
    :emptyTitle="list.hasActiveFilters.value ? 'No items match your filters' : 'No items yet'"
  >
    <template #actions>
      <BaseButton v-if="canCreateProduct" @click="openDialog()"> Add New Item </BaseButton>
    </template>

    <template #filters>
      <ProductsFilterToolbar v-model:filters="list.filters.value" />
    </template>

    <ProductsTable
      :rows="products"
      :canUpdate="canUpdateProduct"
      :canDelete="canDeleteProduct"
      @delete="onDeleteProduct"
      @edit="onEditProduct"
      @bulkDelete="onBulkDelete"
    />

    <!-- Deleted items (collapsed) — restore soft-deleted products -->
    <div v-if="deletedProducts.length" class="tw:mt-2 tw:border-t tw:border-divider tw:pt-3">
      <button
        class="tw:text-xs tw:font-semibold tw:text-secondary tw:hover:text-on-sidebar"
        @click="showDeleted = !showDeleted"
      >
        {{ showDeleted ? '▾' : '▸' }} Deleted items ({{ deletedProducts.length }})
      </button>
      <div v-if="showDeleted" class="tw:mt-2 tw:flex tw:flex-col tw:gap-1">
        <div
          v-for="p in deletedProducts"
          :key="p.id"
          class="tw:flex tw:items-center tw:justify-between tw:px-3 tw:py-2 tw:rounded-lg tw:bg-main-hover/40 tw:text-sm"
        >
          <div class="tw:min-w-0">
            <span class="tw:font-medium tw:text-secondary tw:line-through">{{ p.name }}</span>
            <code class="tw:text-micro tw:px-1.5 tw:py-0.5 tw:ml-2 tw:rounded tw:bg-white tw:text-secondary">{{ p.sku }}</code>
            <span v-if="p.deletedAt" class="tw:text-xs tw:text-secondary tw:ml-2">
              deleted {{ p.deletedAt.formatDate('date') }}
            </span>
          </div>
          <button
            v-if="canDeleteProduct"
            class="tw:flex tw:items-center tw:gap-1 tw:text-xs tw:text-primary tw:hover:underline tw:shrink-0"
            @click="restoreProduct(p)"
          >
            <IconRestore :size="14" />
            Restore
          </button>
        </div>
      </div>
    </div>

    <!-- Create/Edit Product Dialog -->
    <ProductsCreateUpdateDialog v-if="showDialog" :id="selectedProductId" v-model="showDialog" />

    <!-- Bulk Delete Confirm Dialog -->
    <BaseConfirmDialog
      v-model="confirmBulkDelete.open"
      title="Delete Products"
      :message="`Delete ${confirmBulkDelete.rows.length} selected item${confirmBulkDelete.rows.length === 1 ? '' : 's'}? This cannot be undone.`"
      okLabel="Delete"
      @ok="confirmBulkDeleteProducts"
    />
  </BaseListLayout>
</template>
