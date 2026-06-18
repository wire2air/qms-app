<script setup>
import { getCompanyPath } from '@/utils/routeHelpers.js'
import { isAllowed } from '@/utils/currentSession.js'

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
</script>

<template>
  <BasePage width="standard" fullHeight>
    <PageHeader>
      <template #title>
        <BaseBreadcrumbs :items="breadcrumbs" />
      </template>
      <template #actions>
        <div v-if="isSaving" class="tw:flex tw:items-center tw:gap-2 tw:text-sm tw:text-secondary">
          <BaseSpinner size="sm" />
          Saving...
        </div>
        <p v-else-if="saveError" class="tw:text-sm tw:text-red-500">{{ saveError }}</p>
      </template>
    </PageHeader>

    <!-- Loading State -->
    <div v-if="loading" class="tw:flex tw:flex-col tw:items-center tw:justify-center tw:py-16">
      <BaseSpinner size="lg" />
      <div class="tw:text-sm tw:text-secondary tw:mt-3">Loading supplier...</div>
    </div>

    <!-- Content -->
    <div v-else-if="supplier" class="tw:flex-1 tw:min-h-0 tw:overflow-y-auto">
      <div class="tw:py-8 tw:space-y-8">
        <!-- Header Section -->
        <section
          class="tw:flex tw:flex-col tw:md:flex-row tw:md:items-center tw:justify-between tw:gap-4"
        >
          <div class="tw:space-y-1">
            <div class="tw:flex tw:items-center tw:gap-3">
              <template v-if="editingName && canUpdate">
                <BaseTextInput
                  v-model="supplier.name"
                  size="sm"
                  @keyup.enter="editingName = false"
                  @blur="editingName = false"
                />
              </template>
              <h1
                v-else
                class="tw:text-2xl tw:font-bold tw:text-on-main tw:tracking-tight tw:cursor-pointer tw:hover:text-primary"
                @click="canUpdate && (editingName = true)"
              >
                {{ supplier.name }}
              </h1>
              <SupplierStatusSelectMenu
                v-if="canUpdate"
                v-model="supplier.statusId"
                :required="true"
              />
              <SupplierStatusBadgeById v-else :statusId="supplier.statusId" />
            </div>
            <p class="tw:text-secondary tw:text-sm">{{ supplier.code }} • Supplier Record</p>
          </div>
        </section>

        <!-- Tab Navigation + Content -->
        <BaseTabs v-model="activeTab" :tabs="tabs" ariaLabel="Supplier sections">
          <div class="tw:mt-6">
            <BaseTabPanel value="overview">
              <SuppliersOverview
                :supplier="supplier"
                :canUpdate="canUpdate"
                :supplierId="props.id"
              />
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
      </div>
    </div>
  </BasePage>
</template>
