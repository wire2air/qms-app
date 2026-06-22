<script setup>
import { IconTruck, IconUsers } from '@tabler/icons-vue'
import { isAllowed } from '@/utils/currentSession.js'
import { getCompanyPath } from '@/utils/routeHelpers.js'

const router = useRouter()

const canCreateSupplier = computed(() => isAllowed(['suppliers:create']))
const canUpdateSupplier = computed(() => isAllowed(['suppliers:update']))
const canDeleteSupplier = computed(() => isAllowed(['suppliers:delete']))

// Filters + resolved content state (URL-synced). Declared before the live query
// because `total`/`empty` are lazy getters that read `suppliers`.
const list = useListLayout({
  filters: { search: '', statusId: null, category: null, riskLevel: null },
  total: () => suppliers.value.length,
  empty: () => suppliers.value.length === 0,
  syncUrl: true,
})

const suppliers = useLiveQueryWithDeps(
  [
    () => list.filters.value.search,
    () => list.filters.value.statusId,
    () => list.filters.value.category,
    () => list.filters.value.riskLevel,
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

const { confirm } = useConfirm()

function onCreateSupplier() {
  router.push(getCompanyPath('/suppliers/create'))
}

function onEditSupplier(row) {
  router.push(getCompanyPath(`/suppliers/${row.id}`))
}

async function onDeleteSupplier(row) {
  const ok = await confirm({
    title: 'Delete Supplier',
    message: `Are you sure you want to delete "${row.name}" (${row.code})? This cannot be undone.`,
    okLabel: 'Delete',
    danger: true,
  })
  if (ok) await row.delete()
}
</script>

<template>
  <BaseListLayout
    title="Suppliers"
    :icon="IconTruck"
    subtitle="Manage and evaluate your global network of manufacturing partners."
    :state="list.state.value"
    :emptyTitle="list.hasActiveFilters.value ? 'No suppliers match your filters' : 'No suppliers yet'"
  >
    <template #actions>
      <BaseButton v-if="canCreateSupplier" @click="onCreateSupplier">
        <span>Create New Supplier</span>
      </BaseButton>
    </template>

    <template #stats>
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
    </template>

    <template #filters>
      <SuppliersFilterToolbar v-model:filters="list.filters.value" />
    </template>

    <SuppliersTable
      :rows="suppliers"
      :canUpdate="canUpdateSupplier"
      :canDelete="canDeleteSupplier"
      @delete="onDeleteSupplier"
      @edit="onEditSupplier"
    />
  </BaseListLayout>
</template>
