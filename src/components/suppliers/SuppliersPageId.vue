<script setup>
import { getCompanyPath } from '@/utils/routeHelpers.js'
import { isAllowed } from '@/utils/currentSession.js'
import {
  buildSupplierBanners,
  buildSupplierSections,
  buildSupplierActions,
} from './supplierDetailConfig.js'

const props = defineProps({
  id: {
    type: String,
    required: true,
  },
})

const route = useRoute()
const router = useRouter()
const canUpdate = computed(() => isAllowed(['suppliers:update']))

const supplier = useLiveQueryWithDeps(
  [() => props.id],
  async (db, [id]) => db.Supplier.findByPk(id),
  { models: ['Supplier'] },
)

const loading = computed(() => supplier.value === undefined)

const breadcrumbs = computed(() => [
  { label: 'Suppliers', to: getCompanyPath('/suppliers') },
  { label: supplier.value?.name || 'Loading...' },
])

const { isSaving, saveError } = useAutoSave(supplier)

const tabs = [
  { value: 'overview', label: 'Overview' },
  { value: 'company-profile', label: 'Company Profile' },
  { value: 'locations', label: 'Locations & Contacts' },
  { value: 'quality-records', label: 'Quality Records' },
  { value: 'users', label: 'Users' },
  { value: 'documents', label: 'Documents' },
  { value: 'asset-requests', label: 'Asset Requests' },
  { value: 'evaluations', label: 'Evaluations' },
]

const editingName = ref(false)

const activeTab = computed({
  get: () => route.query.tab || tabs[0].value,
  set: (value) => {
    router.replace({ query: { ...route.query, tab: value } })
  },
})

// ─── BaseDetailLayout config ──────────────────────────────────────────────────
const supplierBanners = computed(() =>
  buildSupplierBanners(supplier.value, { canUpdate: canUpdate.value }),
)
const supplierActions = computed(() => buildSupplierActions({}, {}))
const supplierDetailConfig = computed(() =>
  defineDetailConfig({
    variant: 'standard',
    width: 'standard',
    breadcrumbs: breadcrumbs.value,
    banners: () => supplierBanners.value,
    actions: supplierActions.value,
    sections: buildSupplierSections(supplier.value),
  }),
)
</script>

<template>
  <BaseDetailLayout
    :config="supplierDetailConfig"
    :record="supplier"
    :loading="loading"
    :notFound="!loading && !supplier"
    notFoundTitle="Supplier not found"
    notFoundDescription="This supplier could not be found."
  >
    <template #title>
      <BaseTextInput
        v-if="editingName && canUpdate"
        v-model="supplier.name"
        size="sm"
        autofocus
        @keyup.enter="editingName = false"
        @blur="editingName = false"
      />
      <BaseClickableRow
        v-else
        class="tw:text-base tw:font-semibold tw:text-on-main"
        :class="canUpdate ? 'tw:hover:text-primary' : ''"
        :disabled="!canUpdate"
        aria-label="Edit supplier name"
        @click="canUpdate && (editingName = true)"
      >
        {{ supplier?.name }}
      </BaseClickableRow>
    </template>

    <template #status>
      <SupplierStatusSelectMenu
        v-if="canUpdate"
        v-model="supplier.statusId"
        :required="true"
      />
      <SupplierStatusBadgeById v-else :statusId="supplier.statusId" />
    </template>

    <template v-if="supplier" #meta>
      <span class="tw:font-mono">{{ supplier.code }}</span>
      <span> · Supplier Record</span>
    </template>

    <template #actions>
      <div class="tw:flex tw:items-center tw:gap-2">
        <div v-if="isSaving" class="tw:flex tw:items-center tw:gap-2 tw:text-sm tw:text-secondary">
          <BaseSpinner size="sm" />
          Saving...
        </div>
        <p v-else-if="saveError" class="tw:text-sm tw:text-red-500">{{ saveError }}</p>
        <DetailActionBar :actions="supplierActions" />
      </div>
    </template>

    <template v-if="supplier" #section-details>
      <!-- Tab Navigation + Content -->
      <BaseTabs v-model="activeTab" :tabs="tabs" ariaLabel="Supplier sections">
        <div class="tw:mt-6">
          <BaseTabPanel value="overview">
            <SuppliersOverview :supplier="supplier" :canUpdate="canUpdate" :supplierId="props.id" />
          </BaseTabPanel>
          <BaseTabPanel value="company-profile">
            <SuppliersCompanyProfileTab :supplier="supplier" :canUpdate="canUpdate" />
          </BaseTabPanel>
          <BaseTabPanel value="locations">
            <SuppliersLocationsContactsTab :supplierId="props.id" :canUpdate="canUpdate" />
          </BaseTabPanel>
          <BaseTabPanel value="users">
            <SuppliersUsersTab :supplierId="props.id" :canUpdate="canUpdate" />
          </BaseTabPanel>
          <BaseTabPanel value="quality-records">
            <SuppliersPerformanceTab :supplierId="props.id" :canUpdate="canUpdate" />
          </BaseTabPanel>
          <BaseTabPanel value="documents">
            <SuppliersDocumentsTab :supplier="supplier" />
          </BaseTabPanel>
          <BaseTabPanel value="asset-requests">
            <SuppliersAssetRequestsTab :supplierId="props.id" />
          </BaseTabPanel>
          <BaseTabPanel value="evaluations">
            <SuppliersEvaluationsTab :supplier="supplier" />
          </BaseTabPanel>
        </div>
      </BaseTabs>
    </template>
  </BaseDetailLayout>
</template>
