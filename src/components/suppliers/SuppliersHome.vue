<script setup>
import {
  IconTruck,
  IconUsers,
  IconAlertTriangle,
  IconShieldCheck,
  IconCircleCheck,
} from '@tabler/icons-vue'
import { isAllowed } from '@/utils/currentSession.js'
import { getCompanyPath } from '@/utils/routeHelpers.js'

const router = useRouter()

const canCreateSupplier = computed(() => isAllowed(['suppliers:create']))
const canUpdateSupplier = computed(() => isAllowed(['suppliers:update']))
const canDeleteSupplier = computed(() => isAllowed(['suppliers:delete']))

// Filters + resolved content state (URL-synced). Declared before the live query
// because `total`/`empty` are lazy getters that read `suppliers`.
const list = useListLayout({
  // Multi-select dimensions (Linear-style filter menu) — arrays of ids.
  filters: { search: '', statusId: [], category: [], riskLevel: [] },
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
  async (db, [search, statusIds, categories, riskLevels]) => {
    let results = await db.Supplier.where().exec()
    if (search) {
      const q = search.toLowerCase()
      results = results.filter(
        (s) => s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q),
      )
    }
    if (statusIds?.length) results = results.filter((s) => statusIds.includes(s.statusId))
    if (categories?.length) results = results.filter((s) => categories.includes(s.category))
    if (riskLevels?.length) results = results.filter((s) => riskLevels.includes(s.riskLevel))
    return results.sort(
      (a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0),
    )
  },

  { models: ['Supplier'], initial: [] },
)

const allSuppliers = useLiveQuery((db) => db.Supplier.where().exec(), {
  models: ['Supplier'],
  initial: [],
})

// Compact KPI strip (list-page metrics bar) — matches the other QMS list pages.
const kpiItems = computed(() => {
  const all = allSuppliers.value
  const byRisk = (r) => all.filter((s) => s.riskLevel === r).length
  return [
    {
      key: 'total',
      label: 'Total suppliers',
      value: all.length,
      icon: IconUsers,
      color: 'primary',
    },
    {
      key: 'high',
      label: 'High risk',
      value: byRisk('High'),
      icon: IconAlertTriangle,
      color: 'red',
      emphasize: byRisk('High') > 0,
    },
    { key: 'medium', label: 'Medium risk', value: byRisk('Medium'), icon: IconShieldCheck, color: 'amber' },
    { key: 'low', label: 'Low risk', value: byRisk('Low'), icon: IconCircleCheck, color: 'green' },
  ]
})

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
      <BaseStatStrip :items="kpiItems" />
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
