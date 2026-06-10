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

const supplier = useLiveQueryWithDeps([() => props.id], async (db, [id]) =>
  db.Supplier.findByPk(id),
)

const loading = computed(() => supplier.value === undefined)

const breadcrumbs = computed(() => [
  { label: 'Suppliers', to: getCompanyPath('/suppliers') },
  { label: supplier.value?.name || 'Loading...' },
])

const isSaving = ref(false)
const saveError = ref(null)
const isFirstLoad = ref(true)

const debouncedSave = useDebounceFn(async () => {
  if (!supplier.value) return
  isSaving.value = true
  saveError.value = null
  try {
    await supplier.value.save()
  } catch (err) {
    saveError.value = err.message || 'Failed to save'
  } finally {
    isSaving.value = false
  }
}, 500)

watch(
  supplier,
  (s) => {
    if (isFirstLoad.value) {
      isFirstLoad.value = false
      return
    }
    if (s) debouncedSave()
  },
  { deep: true },
)

const tabs = [
  { value: 'overview', label: 'Overview' },
  { value: 'company-profile', label: 'Company Profile' },
  { value: 'locations', label: 'Locations & Contacts' },
  { value: 'performance', label: 'Performance' },
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
  <div class="tw:flex tw:flex-col tw:h-full">
    <SafeTeleport to="#main-header-title">
      <BaseBreadcrumbs :items="breadcrumbs" />
    </SafeTeleport>

    <SafeTeleport to="#main-header-actions">
      <div v-if="isSaving" class="tw:flex tw:items-center tw:gap-2 tw:text-sm tw:text-secondary">
        <div
          class="tw:animate-spin tw:rounded-full tw:size-4 tw:border-2 tw:border-primary tw:border-t-transparent"
        />
        Saving...
      </div>
      <p v-else-if="saveError" class="tw:text-sm tw:text-red-500">{{ saveError }}</p>
    </SafeTeleport>

    <!-- Loading State -->
    <div v-if="loading" class="tw:flex tw:flex-col tw:items-center tw:justify-center tw:py-16">
      <div
        class="tw:animate-spin tw:rounded-full tw:size-12 tw:border-4 tw:border-primary tw:border-t-transparent"
      />
      <div class="tw:text-sm tw:text-secondary tw:mt-3">Loading supplier...</div>
    </div>

    <!-- Content -->
    <div v-else-if="supplier" class="tw:overflow-y-auto">
      <div class="tw:max-w-5xl tw:mx-auto tw:p-8 tw:space-y-8">
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

        <!-- Tab Navigation -->
        <div class="tw:flex tw:gap-8 tw:border-b tw:border-divider tw:overflow-x-auto">
          <button
            v-for="tab in tabs"
            :key="tab.value"
            class="tw:pb-3 tw:text-sm tw:font-medium tw:whitespace-nowrap tw:flex tw:items-center tw:gap-2 tw:transition-colors"
            :class="
              activeTab === tab.value
                ? 'tw:text-primary tw:border-b-2 tw:border-primary tw:font-bold'
                : 'tw:text-secondary tw:hover:text-on-main'
            "
            @click="activeTab = tab.value"
          >
            {{ tab.label }}
          </button>
        </div>

        <!-- Tab Content -->
        <SuppliersOverview
          v-if="activeTab === 'overview'"
          :supplier="supplier"
          :canUpdate="canUpdate"
          :supplierId="props.id"
        />
        <SuppliersCompanyProfileTab
          v-else-if="activeTab === 'company-profile'"
          :supplier="supplier"
          :canUpdate="canUpdate"
        />
        <SuppliersLocationsContactsTab
          v-else-if="activeTab === 'locations'"
          :supplierId="props.id"
          :canUpdate="canUpdate"
        />
        <SuppliersUsersTab
          v-else-if="activeTab === 'users'"
          :supplierId="props.id"
          :canUpdate="canUpdate"
        />
        <SuppliersPerformanceTab
          v-else-if="activeTab === 'performance'"
          :supplierId="props.id"
          :canUpdate="canUpdate"
        />
        <SuppliersDocumentsTab v-else-if="activeTab === 'documents'" :supplier="supplier" />
        <SuppliersAssetRequestsTab
          v-else-if="activeTab === 'asset-requests'"
          :supplierId="props.id"
        />
        <SuppliersEvaluationsTab v-else-if="activeTab === 'evaluations'" :supplier="supplier" />
      </div>
    </div>
  </div>
</template>
