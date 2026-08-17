<script setup>
import { IconAlertCircle, IconClock, IconCircleCheck, IconShieldCheck } from '@tabler/icons-vue'
import { isAllowed, currentSession } from '@/utils/currentSession.js'
import { getCompanyPath } from '@/utils/routeHelpers.js'
import { matchesDateFilter } from '@/utils/dateRanges.js'
import { DateTime } from 'luxon'

const router = useRouter()
const route = useRoute()

const canCreate = computed(() => isAllowed(['capa:create']))
const canUpdate = computed(() => isAllowed(['capa:update']))
const canDelete = computed(() => isAllowed(['capa:delete']))

const { confirm } = useConfirm()
const toast = useToast()

// Filters + resolved content state (URL-synced). Declared before the live query
// because `total`/`empty` are lazy getters that read `capas`.
const list = useListLayout({
  filters: {
    // Multi-select dimensions (Linear-style filter menu) — arrays of ids.
    // (Free-text search now lives in the table toolbar, not here.)
    statusId: [],
    priorityId: [],
    typeId: [],
    supplierId: route.query.supplierId ? [route.query.supplierId] : [],
    createdAt: null,
    activeFilter: 'all_open',
  },
  total: () => capas.value.length,
  empty: () => capas.value.length === 0,
  syncUrl: true,
})

// Supplier deep-link: /capas?supplierId=… prefilters to one supplier.
watch(
  () => route.query.supplierId,
  (v) => (list.filters.value.supplierId = v ? [v] : []),
)
const filterSupplier = useLiveQueryWithDeps(
  [() => list.filters.value.supplierId?.[0] ?? null],
  async (db, [id]) => (id ? db.Supplier.findByPk(id) : null),
  { models: ['Supplier'] },
)
function clearSupplierFilter() {
  list.filters.value.supplierId = []
  const q = { ...route.query }
  delete q.supplierId
  router.replace({ query: q })
}

const CLOSED_STATUSES = ['CLOSED', 'CANCELLED']
const OPEN_STATUSES = ['DRAFT', 'PENDING']

function applyFilters(results, statusIds, priorityIds, typeIds) {
  if (statusIds?.length) results = results.filter((r) => statusIds.includes(r.statusId))
  if (priorityIds?.length) results = results.filter((r) => priorityIds.includes(r.priorityId))
  if (typeIds?.length) results = results.filter((r) => typeIds.includes(r.typeId))
  return results
}

function applyActiveFilter(results, af) {
  const now = DateTime.now()
  const userId = currentSession.value?.userId
  if (af === 'all_open') return results.filter((r) => OPEN_STATUSES.includes(r.statusId))
  if (af === 'mine')
    return results.filter((r) => r.ownerId === userId && OPEN_STATUSES.includes(r.statusId))
  if (af === 'critical')
    return results.filter((r) => r.priorityId === 'CRITICAL' && OPEN_STATUSES.includes(r.statusId))
  if (af === 'high')
    return results.filter((r) => r.priorityId === 'HIGH' && OPEN_STATUSES.includes(r.statusId))
  if (af === 'overdue')
    return results.filter((r) => r.dueDate && r.dueDate < now && OPEN_STATUSES.includes(r.statusId))
  if (af === 'closed') return results.filter((r) => r.statusId === 'CLOSED')
  if (af === 'cancelled') return results.filter((r) => r.statusId === 'CANCELLED')
  return results
}

const allCapas = useLiveQuery((db) => db.Capa.where().exec(), { models: ['Capa'], initial: [] })

const capas = useLiveQueryWithDeps(
  [
    () => list.filters.value.statusId,
    () => list.filters.value.priorityId,
    () => list.filters.value.typeId,
    () => list.filters.value.activeFilter,
    () => list.filters.value.supplierId,
    () => list.filters.value.createdAt,
  ],
  async (db, [statusIds, priorityIds, typeIds, af, supplierIds, createdAt]) => {
    let results = await db.Capa.where().exec()
    results = applyFilters(results, statusIds, priorityIds, typeIds)
    results = applyActiveFilter(results, af)
    if (supplierIds?.length) results = results.filter((r) => supplierIds.includes(r.supplierId))
    if (createdAt) results = results.filter((r) => matchesDateFilter(r.createdAt, createdAt))
    return results.sort(
      (a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0),
    )
  },

  { models: ['Capa'], initial: [] },
)

const stats = computed(() => {
  const all = allCapas.value
  const now = DateTime.now()
  const startOfMonth = now.startOf('month')
  const openCapas = all.filter((r) => OPEN_STATUSES.includes(r.statusId))
  const overdue = openCapas.filter((r) => r.dueDate && r.dueDate < now)
  const criticalOpen = openCapas.filter((r) => r.priorityId === 'CRITICAL')
  const closedThisMonth = all.filter(
    (r) => CLOSED_STATUSES.includes(r.statusId) && r.closedAt && r.closedAt >= startOfMonth,
  )
  return {
    open: openCapas.length,
    overdue: overdue.length,
    criticalOpen: criticalOpen.length,
    closedThisMonth: closedThisMonth.length,
  }
})

// Compact KPI strip (list-page metrics bar) — matches the other QMS list pages.
const kpiItems = computed(() => [
  {
    key: 'open',
    label: 'Open CAPAs',
    value: stats.value.open,
    icon: IconAlertCircle,
    color: 'blue',
  },
  {
    key: 'overdue',
    label: 'Overdue',
    value: stats.value.overdue,
    icon: IconClock,
    color: 'red',
    emphasize: stats.value.overdue > 0,
  },
  {
    key: 'critical',
    label: 'Critical open',
    value: stats.value.criticalOpen,
    icon: IconShieldCheck,
    color: 'amber',
    emphasize: stats.value.criticalOpen > 0,
  },
  {
    key: 'closed',
    label: 'Closed this month',
    value: stats.value.closedThisMonth,
    icon: IconCircleCheck,
    color: 'green',
  },
])

function onCreateCapa() {
  router.push(getCompanyPath('/capas/create'))
}

// The table emits `delete`; without a listener the row-menu Delete did nothing
// (no dialog, no removal). Confirm, then soft-delete (the model is paranoid).
async function onDeleteCapa(row) {
  const label = row.capaNumber ? `${row.capaNumber} — ${row.title}` : row.title
  const ok = await confirm({
    title: 'Delete CAPA',
    message: `Delete CAPA '${label}'? It will be removed from the list.`,
    okLabel: 'Delete',
    danger: true,
  })
  if (!ok) return
  try {
    await row.delete()
    toast.success('CAPA deleted')
  } catch (e) {
    toast.error(e?.message || 'Failed to delete CAPA')
  }
}
</script>

<template>
  <BaseListLayout
    title="CAPAs"
    subtitle="Track corrective and preventive actions through to verification."
    :state="list.state.value"
    :emptyTitle="list.hasActiveFilters.value ? 'No CAPAs match your filters' : 'No CAPAs yet'"
  >
    <template #title>
      <span class="tw:inline-flex tw:items-center tw:gap-1.5">
        CAPAs
        <HelpButton slug="KB/quality/capas" :size="16" />
      </span>
    </template>

    <template #actions>
      <BaseButton v-if="canCreate" variant="primary" @click="onCreateCapa">Create CAPA</BaseButton>
    </template>

    <template #stats>
      <BaseStatStrip :items="kpiItems" />
    </template>

    <template #filters>
      <div
        v-if="supplierFilter"
        class="tw:flex tw:items-center tw:gap-2 tw:mb-3 tw:text-sm tw:bg-blue-50 tw:border tw:border-blue-200 tw:text-blue-800 tw:rounded-lg tw:px-3 tw:py-2"
      >
        <span
          >Filtered by supplier: <strong>{{ filterSupplier?.name || '…' }}</strong></span
        >
        <button
          type="button"
          class="tw:ml-auto tw:text-blue-700 tw:hover:underline tw:bg-transparent tw:border-0 tw:cursor-pointer tw:text-xs tw:font-medium"
          @click="clearSupplierFilter"
        >
          Clear
        </button>
      </div>

      <CapasFilterToolbar
        v-model:filters="list.filters.value"
        v-model:activeFilter="list.filters.value.activeFilter"
      />
    </template>

    <CapasTable
      :rows="capas"
      :canUpdate="canUpdate"
      :canDelete="canDelete"
      @edit="(row) => router.push(getCompanyPath(`/capas/${row.id}`))"
      @delete="onDeleteCapa"
    />
  </BaseListLayout>
</template>
