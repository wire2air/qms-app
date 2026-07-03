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
          <p class="tw:text-caption tw:uppercase tw:tracking-wider tw:font-semibold tw:text-secondary tw:mb-1">Product Family</p>
          <ProductFamilyBadgeById
            v-if="product.productFamilyId"
            :productFamilyId="product.productFamilyId"
          />
          <span v-else class="tw:text-sm tw:text-secondary">—</span>
        </div>
        <div>
          <p class="tw:text-caption tw:uppercase tw:tracking-wider tw:font-semibold tw:text-secondary tw:mb-1">Product Type</p>
          <ProductTypeBadgeById
            v-if="product.productTypeId"
            :productTypeId="product.productTypeId"
          />
          <span v-else class="tw:text-sm tw:text-secondary">—</span>
        </div>
        <div>
          <p class="tw:text-caption tw:uppercase tw:tracking-wider tw:font-semibold tw:text-secondary tw:mb-1">Status</p>
          <ProductStatusBadgeById v-if="product.statusId" :statusId="product.statusId" />
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
