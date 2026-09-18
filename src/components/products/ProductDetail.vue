<script setup>
/**
 * Product (Item Master) detail page. Two tabs:
 *   - Overview: the item's core fields (name, SKU, family, type, status, description).
 *     Edit opens the existing create/update dialog.
 *   - Specifications: the QC specifications scoped to this item, defined and
 *     approved right here (ProductSpecificationsTab).
 */
import { isAllowed } from '@/utils/currentSession.js'
import { getCompanyPath } from '@/utils/routeHelpers.js'
import { buildProductTabs, buildProductActions } from './productDetailConfig.js'

const props = defineProps({
  id: { type: String, required: true },
})

const router = useRouter()
const route = useRoute()

const canUpdate = computed(() => isAllowed(['products:update']))

const product = useLiveQueryWithDeps(
  [() => props.id],
  async (db, [id]) => (id ? db.Product.findByPk(id) : null),
  { models: ['Product'] },
)
const loading = computed(() => product.value === undefined)

// UOM name (blank = N/A) + linked suppliers for the read-only overview.
const uom = useLiveQueryWithDeps(
  [() => product.value?.uomId],
  async (db, [uomId]) => (uomId ? db.Uom.findByPk(uomId) : null),
  { models: ['Uom'] },
)
const uomName = computed(() => uom.value?.name ?? '')
const itemCategory = useLiveQueryWithDeps(
  [() => product.value?.itemCategoryId],
  async (db, [id]) => (id ? db.ItemCategory.findByPk(id) : null),
  { models: ['ItemCategory'] },
)
const itemCategoryName = computed(() => itemCategory.value?.name ?? '')
const supplierLinks = useLiveQueryWithDeps(
  [() => props.id],
  async (db, [id]) => (id ? db.ProductSupplier.where('productId', id).exec() : []),
  { models: ['ProductSupplier'], initial: [] },
)

const VALID_TABS = ['overview', 'specifications']
const activeTab = ref(VALID_TABS.includes(route.query.tab) ? route.query.tab : 'overview')
watch(activeTab, (tab) => {
  router.replace({ query: { ...route.query, tab } })
})

const showEdit = ref(false)

// ─── BaseDetailLayout config ──────────────────────────────────────────────────
const breadcrumbs = computed(() => [
  { label: 'Item Master', to: getCompanyPath('/products') },
  { label: product.value?.name || 'Item' },
])
const productActions = computed(() =>
  buildProductActions(
    { canUpdate: canUpdate.value },
    {
      edit() {
        showEdit.value = true
      },
    },
  ),
)
const productDetailConfig = computed(() =>
  defineDetailConfig({
    variant: 'standard',
    width: 'standard',
    breadcrumbs: breadcrumbs.value,
    actions: productActions.value,
    tabs: buildProductTabs(product.value),
  }),
)
</script>

<template>
  <BaseDetailLayout
    v-model:tab="activeTab"
    :config="productDetailConfig"
    :record="product"
    :loading="loading"
    :notFound="!loading && !product"
    notFoundTitle="Item not found"
    notFoundDescription="This item could not be found."
  >
    <template #title>
      <span class="tw:text-base tw:font-semibold tw:text-on-main">{{ product?.name }}</span>
    </template>

    <template #status>
      <ProductStatusBadgeById v-if="product?.statusId" :statusId="product.statusId" />
    </template>

    <template v-if="product" #meta>
      <span class="">{{ product.sku }}</span>
    </template>

    <template #actions>
      <DetailActionBar :actions="productActions" />
    </template>

    <template v-if="product" #tab-overview>
      <div class="tw:grid tw:grid-cols-1 tw:md:grid-cols-2 tw:gap-5 tw:max-w-3xl">
        <div>
          <p class="tw:text-caption tw:uppercase tw:tracking-wider tw:font-semibold tw:text-secondary tw:mb-1">Name</p>
          <p class="tw:text-on-sidebar">{{ product.name }}</p>
        </div>
        <div>
          <p class="tw:text-caption tw:uppercase tw:tracking-wider tw:font-semibold tw:text-secondary tw:mb-1">SKU</p>
          <p class="tw:text-on-sidebar">{{ product.sku }}</p>
        </div>
        <div>
          <p class="tw:text-caption tw:uppercase tw:tracking-wider tw:font-semibold tw:text-secondary tw:mb-1">ERP Item Code</p>
          <p class="tw:text-on-sidebar">{{ product.erpItemCode || '—' }}</p>
        </div>
        <div>
          <p class="tw:text-caption tw:uppercase tw:tracking-wider tw:font-semibold tw:text-secondary tw:mb-1">Unit of Measure</p>
          <p class="tw:text-on-sidebar">{{ uomName || 'N/A' }}</p>
        </div>
        <div>
          <p class="tw:text-caption tw:uppercase tw:tracking-wider tw:font-semibold tw:text-secondary tw:mb-1">Item Type</p>
          <ProductTypeBadgeById
            v-if="product.productTypeId"
            :productTypeId="product.productTypeId"
          />
          <span v-else class="tw:text-sm tw:text-secondary">—</span>
        </div>
        <div>
          <p class="tw:text-caption tw:uppercase tw:tracking-wider tw:font-semibold tw:text-secondary tw:mb-1">Item Category</p>
          <p class="tw:text-on-sidebar">{{ itemCategoryName || '—' }}</p>
        </div>
        <div>
          <p class="tw:text-caption tw:uppercase tw:tracking-wider tw:font-semibold tw:text-secondary tw:mb-1">Item Group</p>
          <ProductFamilyBadgeById
            v-if="product.productFamilyId"
            :productFamilyId="product.productFamilyId"
          />
          <span v-else class="tw:text-sm tw:text-secondary">—</span>
        </div>
        <div>
          <p class="tw:text-caption tw:uppercase tw:tracking-wider tw:font-semibold tw:text-secondary tw:mb-1">Revision</p>
          <p class="tw:text-on-sidebar">{{ product.revision || '—' }}</p>
        </div>
        <div>
          <p class="tw:text-caption tw:uppercase tw:tracking-wider tw:font-semibold tw:text-secondary tw:mb-1">Status</p>
          <ProductStatusBadgeById v-if="product.statusId" :statusId="product.statusId" />
          <span v-else class="tw:text-sm tw:text-secondary">—</span>
        </div>
        <div>
          <p class="tw:text-caption tw:uppercase tw:tracking-wider tw:font-semibold tw:text-secondary tw:mb-1">Criticality</p>
          <p class="tw:text-on-sidebar">{{ product.criticality || '—' }}</p>
        </div>
        <div class="tw:md:col-span-2">
          <p class="tw:text-caption tw:uppercase tw:tracking-wider tw:font-semibold tw:text-secondary tw:mb-1">Controls</p>
          <div class="tw:flex tw:flex-wrap tw:gap-1.5">
            <BaseChip v-if="product.lotControlled" size="sm">Lot controlled</BaseChip>
            <BaseChip v-if="product.serialControlled" size="sm">Serial controlled</BaseChip>
            <BaseChip v-if="product.inspectionRequired" size="sm">Inspection required</BaseChip>
            <BaseChip v-if="product.isHazardous" size="sm" color="red">Hazardous</BaseChip>
            <span
              v-if="product.shelfLifeDays"
              class="tw:text-sm tw:text-secondary"
            >Shelf life: {{ product.shelfLifeDays }} days</span>
            <span
              v-if="!product.lotControlled && !product.serialControlled && !product.inspectionRequired && !product.isHazardous && !product.shelfLifeDays"
              class="tw:text-sm tw:text-secondary"
            >—</span>
          </div>
        </div>
        <div v-if="product.defaultAql">
          <p class="tw:text-caption tw:uppercase tw:tracking-wider tw:font-semibold tw:text-secondary tw:mb-1">Default AQL</p>
          <p class="tw:text-on-sidebar">{{ product.defaultAql }}</p>
        </div>
        <div v-if="product.countryOfOrigin">
          <p class="tw:text-caption tw:uppercase tw:tracking-wider tw:font-semibold tw:text-secondary tw:mb-1">Country of Origin</p>
          <p class="tw:text-on-sidebar">{{ product.countryOfOrigin }}</p>
        </div>
        <div v-if="product.storageConditions" class="tw:md:col-span-2">
          <p class="tw:text-caption tw:uppercase tw:tracking-wider tw:font-semibold tw:text-secondary tw:mb-1">Storage Conditions</p>
          <p class="tw:text-on-sidebar tw:whitespace-pre-wrap">{{ product.storageConditions }}</p>
        </div>
        <div class="tw:md:col-span-2">
          <p class="tw:text-caption tw:uppercase tw:tracking-wider tw:font-semibold tw:text-secondary tw:mb-1">Suppliers</p>
          <div v-if="supplierLinks.length" class="tw:flex tw:flex-wrap tw:gap-1">
            <SupplierBadgeById v-for="l in supplierLinks" :key="l.id" :supplierId="l.supplierId" />
          </div>
          <span v-else class="tw:text-sm tw:text-secondary">—</span>
        </div>
        <div class="tw:md:col-span-2">
          <p class="tw:text-caption tw:uppercase tw:tracking-wider tw:font-semibold tw:text-secondary tw:mb-1">Description</p>
          <p class="tw:text-on-sidebar tw:whitespace-pre-wrap">{{ product.description || '—' }}</p>
        </div>
      </div>
    </template>

    <template v-if="product" #tab-specifications>
      <ProductSpecificationsTab :productId="product.id" :productName="product.name" />
    </template>
  </BaseDetailLayout>

  <ProductsCreateUpdateDialog v-if="showEdit" :id="props.id" v-model="showEdit" />
</template>
