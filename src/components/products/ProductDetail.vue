<script setup>
/**
 * Product (Item Master) detail page. Two tabs:
 *   - Overview: the item's core fields (name, SKU, family, type, status,
 *     description). Edit opens the existing create/update dialog.
 *   - Specifications: the QC specifications scoped to this item, defined
 *     and approved right here (ProductSpecificationsTab).
 */
import { IconArrowLeft, IconPackage, IconPencil } from '@tabler/icons-vue'
import { getCompanyPath } from '@/utils/routeHelpers.js'
import { isAllowed } from '@/utils/currentSession.js'

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

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'specifications', label: 'Specifications' },
]
const validTabIds = new Set(TABS.map((t) => t.id))
const activeTab = ref(validTabIds.has(route.query.tab) ? route.query.tab : 'overview')
watch(activeTab, (tab) => {
  router.replace({ query: { ...route.query, tab } })
})

const showEdit = ref(false)

function goBack() {
  router.push(getCompanyPath('/products'))
}
</script>

<template>
  <BasePage width="standard" density="compact">
    <button
      class="tw:flex tw:items-center tw:gap-1.5 tw:text-sm tw:text-secondary tw:hover:text-on-sidebar tw:w-fit"
      @click="goBack"
    >
      <IconArrowLeft :size="16" /> Item Master
    </button>

    <div v-if="loading" class="tw:text-secondary tw:py-12 tw:text-center">Loading…</div>

    <div v-else-if="!product" class="tw:text-secondary tw:py-12 tw:text-center tw:italic">
      Item not found.
    </div>

    <template v-else>
      <!-- Header -->
      <div class="tw:flex tw:items-start tw:justify-between tw:gap-4">
        <div class="tw:flex tw:items-start tw:gap-3">
          <div
            class="tw:w-11 tw:h-11 tw:bg-primary/10 tw:text-primary tw:rounded-xl tw:flex tw:items-center tw:justify-center tw:shrink-0"
          >
            <IconPackage class="tw:size-6" />
          </div>
          <div>
            <h1 class="tw:text-2xl tw:font-bold tw:text-on-sidebar">{{ product.name }}</h1>
            <div class="tw:flex tw:items-center tw:gap-2 tw:mt-1">
              <span
                class="tw:inline-flex tw:items-center tw:rounded tw:border tw:border-primary tw:px-2 tw:py-0.5 tw:text-xs tw:font-medium tw:text-primary"
                >{{ product.sku }}</span
              >
              <ProductStatusBadgeById v-if="product.statusId" :statusId="product.statusId" />
            </div>
          </div>
        </div>
        <BaseButton v-if="canUpdate" variant="outline" size="sm" @click="showEdit = true">
          <template #icon><IconPencil :size="16" /></template>
          Edit
        </BaseButton>
      </div>

      <!-- Tabs -->
      <div class="tw:flex tw:border-b tw:border-divider">
        <button
          v-for="tab in TABS"
          :key="tab.id"
          class="tw:px-5 tw:py-2.5 tw:border-b-2 tw:font-semibold tw:text-sm tw:transition-colors"
          :class="activeTab === tab.id
            ? 'tw:border-primary tw:text-primary'
            : 'tw:border-transparent tw:text-secondary tw:hover:text-on-sidebar'"
          @click="activeTab = tab.id"
        >
          {{ tab.label }}
        </button>
      </div>

      <!-- Overview -->
      <div v-if="activeTab === 'overview'" class="tw:grid tw:grid-cols-1 tw:md:grid-cols-2 tw:gap-5 tw:max-w-3xl">
        <div>
          <p class="tw:text-xs tw:uppercase tw:font-bold tw:text-secondary tw:mb-1">Name</p>
          <p class="tw:text-on-sidebar">{{ product.name }}</p>
        </div>
        <div>
          <p class="tw:text-xs tw:uppercase tw:font-bold tw:text-secondary tw:mb-1">SKU</p>
          <p class="tw:text-on-sidebar tw:font-mono">{{ product.sku }}</p>
        </div>
        <div>
          <p class="tw:text-xs tw:uppercase tw:font-bold tw:text-secondary tw:mb-1">Product Family</p>
          <ProductFamilyBadgeById v-if="product.productFamilyId" :productFamilyId="product.productFamilyId" />
          <span v-else class="tw:text-sm tw:text-secondary">—</span>
        </div>
        <div>
          <p class="tw:text-xs tw:uppercase tw:font-bold tw:text-secondary tw:mb-1">Product Type</p>
          <ProductTypeBadgeById v-if="product.productTypeId" :productTypeId="product.productTypeId" />
          <span v-else class="tw:text-sm tw:text-secondary">—</span>
        </div>
        <div>
          <p class="tw:text-xs tw:uppercase tw:font-bold tw:text-secondary tw:mb-1">Status</p>
          <ProductStatusBadgeById v-if="product.statusId" :statusId="product.statusId" />
          <span v-else class="tw:text-sm tw:text-secondary">—</span>
        </div>
        <div class="tw:md:col-span-2">
          <p class="tw:text-xs tw:uppercase tw:font-bold tw:text-secondary tw:mb-1">Description</p>
          <p class="tw:text-on-sidebar tw:whitespace-pre-wrap">{{ product.description || '—' }}</p>
        </div>
      </div>

      <!-- Specifications -->
      <ProductSpecificationsTab
        v-else-if="activeTab === 'specifications'"
        :productId="product.id"
        :productName="product.name"
      />
    </template>

    <ProductsCreateUpdateDialog v-if="showEdit" :id="props.id" v-model="showEdit" />
  </BasePage>
</template>
