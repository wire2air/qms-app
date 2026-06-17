<script setup>
import { IconTruck, IconUsers } from '@tabler/icons-vue'
import { isAllowed } from '@/utils/currentSession.js'
import { getCompanyPath } from '@/utils/routeHelpers.js'

const router = useRouter()

const canCreateSupplier = computed(() => isAllowed(['suppliers:create']))
const canUpdateSupplier = computed(() => isAllowed(['suppliers:update']))
const canDeleteSupplier = computed(() => isAllowed(['suppliers:delete']))

const filters = ref({ search: '', statusId: null, category: null, riskLevel: null })

const suppliers = useLiveQueryWithDeps(
  [
    () => filters.value.search,
    () => filters.value.statusId,
    () => filters.value.category,
    () => filters.value.riskLevel,
  ],
  async (db, [search, statusId, category, riskLevel]) => {
    let results = await db.Supplier.where().exec()
    if (search) {
      const q = search.toLowerCase()
      results = results.filter(
        (s) => s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q),
      )
    }
    if (statusId) results = results.filter((s) => s.statusId === statusId)
    if (category) results = results.filter((s) => s.category === category)
    if (riskLevel) results = results.filter((s) => s.riskLevel === riskLevel)
    return results.sort(
      (a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0),
    )
  },

  { models: ['Supplier'], initial: [] },
)

const confirmDialog = ref(null)

function onCreateSupplier() {
  router.push(getCompanyPath('/suppliers/create'))
}

function onEditSupplier(row) {
  router.push(getCompanyPath(`/suppliers/${row.id}`))
}

function onDeleteSupplier(row) {
  confirmDialog.value = {
    title: 'Delete Supplier',
    message: `Are you sure you want to delete "${row.name}" (${row.code})? This cannot be undone.`,
    okLabel: 'Delete',
    onOk: async () => {
      await row.delete()
      confirmDialog.value = null
    },
  }
}
</script>

<template>
  <BasePage width="standard">
    <PageHeader
      :icon="IconTruck"
      title="Suppliers"
      subtitle="Manage and evaluate your global network of manufacturing partners."
    >
      <template #actions>
        <BaseButton v-if="canCreateSupplier" @click="onCreateSupplier">
          <span>Create New Supplier</span>
        </BaseButton>
      </template>
    </PageHeader>

    <!-- Stats Card -->
    <div class="tw:grid tw:grid-cols-1 tw:md:grid-cols-4 tw:gap-4">
      <div class="tw:bg-white tw:rounded-lg tw:border tw:border-divider tw:p-4">
        <div class="tw:flex tw:items-center tw:gap-4">
          <div
            class="tw:w-12 tw:h-12 tw:rounded-lg tw:bg-blue-50 tw:text-blue-600 tw:flex tw:items-center tw:justify-center"
          >
            <IconUsers :size="24" />
          </div>
          <div>
            <div class="tw:text-xs tw:uppercase tw:tracking-tight tw:font-bold tw:text-secondary">
              Total Suppliers
            </div>
            <div class="tw:text-2xl tw:font-black tw:text-on-sidebar">
              {{ suppliers.length }}
            </div>
          </div>
        </div>
      </div>
    </div>

    <SuppliersFilterToolbar v-model:filters="filters" />

    <SuppliersTable
      :rows="suppliers"
      :canUpdate="canUpdateSupplier"
      :canDelete="canDeleteSupplier"
      @delete="onDeleteSupplier"
      @edit="onEditSupplier"
    />
  </BasePage>

  <ConfirmDialog
    v-if="confirmDialog"
    :modelValue="true"
    v-bind="confirmDialog"
    @update:modelValue="confirmDialog = null"
    @ok="confirmDialog?.onOk"
  />
</template>
