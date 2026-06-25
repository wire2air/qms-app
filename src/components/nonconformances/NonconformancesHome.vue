<script setup>
import {
  IconAlertCircle,
  IconAlertTriangle,
  IconClock,
  IconCircleCheck,
  IconClipboardList,
} from '@tabler/icons-vue'
import { isAllowed, currentSession } from '@/utils/currentSession.js'
import { getCompanyPath } from '@/utils/routeHelpers.js'
import { DateTime } from 'luxon'
import { matchesDateFilter } from '@/utils/dateRanges.js'

const router = useRouter()
const route = useRoute()

const canCreate = computed(() => isAllowed(['nonconformances:create']))
const canUpdate = computed(() => isAllowed(['nonconformances:update']))
const canDelete = computed(() => isAllowed(['nonconformances:delete']))

// Filters + resolved content state (URL-synced). Declared before the live query
// because `total`/`empty` are lazy getters that read `ncs`. `activeFilter` (the
// quick-filter pill) lives in the same filter bag so it shares URL-sync +
// page-reset behavior.
const list = useListLayout({
  filters: {
    // Multi-select dimensions (Linear-style filter menu) — arrays of ids.
    // (Free-text search now lives in the table toolbar, not here.)
    statusId: [],
    severityId: [],
    typeId: [],
    supplierId: route.query.supplierId ? [route.query.supplierId] : [],
    createdAt: null,
    activeFilter: 'all_open',
  },
  total: () => ncs.value.length,
  empty: () => ncs.value.length === 0,
  syncUrl: true,
})

// Supplier deep-link: /nonconformances?supplierId=… prefilters to one supplier.
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

const CLOSED_STATUSES = ['CLOSED']
const OPEN_STATUSES = ['DRAFT', 'UNDER_REVIEW']

function applyFilters(results, statusIds, severityIds, typeIds) {
  if (statusIds?.length) results = results.filter((r) => statusIds.includes(r.statusId))
  if (severityIds?.length) results = results.filter((r) => severityIds.includes(r.severityId))
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
    return results.filter((r) => r.severityId === 'CRITICAL' && OPEN_STATUSES.includes(r.statusId))
  if (af === 'major')
    return results.filter((r) => r.severityId === 'MAJOR' && OPEN_STATUSES.includes(r.statusId))
  if (af === 'overdue')
    return results.filter((r) => r.dueDate && r.dueDate < now && OPEN_STATUSES.includes(r.statusId))
  if (af === 'closed') return results.filter((r) => r.statusId === 'CLOSED')
  return results
}

const allNcs = useLiveQuery((db) => db.Nonconformance.where().exec(), {
  models: ['Nonconformance'],
  initial: [],
})

const ncs = useLiveQueryWithDeps(
  [
    () => list.filters.value.statusId,
    () => list.filters.value.severityId,
    () => list.filters.value.typeId,
    () => list.filters.value.activeFilter,
    () => list.filters.value.supplierId,
    () => list.filters.value.createdAt,
  ],
  async (db, [statusIds, severityIds, typeIds, af, supplierIds, createdAt]) => {
    let results = await db.Nonconformance.where().exec()
    results = applyFilters(results, statusIds, severityIds, typeIds)
    results = applyActiveFilter(results, af)
    if (supplierIds?.length) results = results.filter((r) => supplierIds.includes(r.supplierId))
    if (createdAt)
      results = results.filter((r) => matchesDateFilter(r.createdAt, createdAt))
    return results.sort(
      (a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0),
    )
  },

  { models: ['Nonconformance'], initial: [] },
)

const stats = computed(() => {
  const all = allNcs.value
  const now = DateTime.now()
  const startOfMonth = now.startOf('month')
  const openNcs = all.filter((r) => OPEN_STATUSES.includes(r.statusId))
  const overdue = openNcs.filter((r) => r.dueDate && r.dueDate < now)
  const criticalOpen = openNcs.filter((r) => r.severityId === 'CRITICAL')
  const closedThisMonth = all.filter(
    (r) => CLOSED_STATUSES.includes(r.statusId) && r.closedAt && r.closedAt >= startOfMonth,
  )
  return {
    open: openNcs.length,
    overdue: overdue.length,
    criticalOpen: criticalOpen.length,
    closedThisMonth: closedThisMonth.length,
  }
})

// Compact KPI strip (list-page metrics bar, not a dashboard card grid).
const kpiItems = computed(() => [
  { key: 'open', label: 'Open NCs', value: stats.value.open, icon: IconAlertCircle, color: 'blue' },
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
    icon: IconAlertTriangle,
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

function onRaiseNc() {
  router.push(getCompanyPath('/nonconformances/create'))
}
</script>

<template>
  <BaseListLayout
    title="Nonconformances"
    subtitle="Track, investigate and close nonconformances."
    :state="list.state.value"
    :emptyIcon="IconClipboardList"
    :emptyTitle="
      list.hasActiveFilters.value ? 'No nonconformances match your filters' : 'No nonconformances yet'
    "
  >
    <template #title>
      <span class="tw:inline-flex tw:items-center tw:gap-2">
        Nonconformances
        <span
          class="tw:rounded-full tw:bg-main-selected tw:px-2 tw:py-0.5 tw:text-caption tw:font-semibold tw:text-secondary tw:tabular-nums"
        >
          {{ ncs.length }}
        </span>
        <HelpButton slug="KB/quality/nonconformances" :size="16" />
      </span>
    </template>

    <template #actions>
      <BaseButton v-if="canCreate" variant="primary" @click="onRaiseNc">Raise NC</BaseButton>
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

      <NonconformancesFilterToolbar
        v-model:filters="list.filters.value"
        v-model:activeFilter="list.filters.value.activeFilter"
      />
    </template>

    <NonconformancesTable
      :rows="ncs"
      :canUpdate="canUpdate"
      :canDelete="canDelete"
      @edit="(row) => router.push(getCompanyPath(`/nonconformances/${row.id}`))"
    />
  </BaseListLayout>
</template>
