<script setup>
import { humanizeFilter } from '@/composables/useListPrint.js'
import {
  IconAlertCircle,
  IconAlertTriangle,
  IconCircleCheck,
  IconClipboardList,
} from '@tabler/icons-vue'
import { isAllowed, currentSession } from '@/utils/currentSession.js'
import { getCompanyPath } from '@/utils/routeHelpers.js'
import { DateTime } from 'luxon'
import { matchesDateFilter } from '@/utils/dateRanges.js'

const router = useRouter()
const route = useRoute()

const canCreate = computed(() => isAllowed(['ncr:create']))
const canUpdate = computed(() => isAllowed(['ncr:update']))
const canDelete = computed(() => isAllowed(['ncr:delete']))

const { confirm } = useConfirm()
const toast = useToast()

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
const OPEN_STATUSES = ['DRAFT', 'OPEN']

function applyFilters(results, statusIds, severityIds, typeIds) {
  if (statusIds?.length) results = results.filter((r) => statusIds.includes(r.statusId))
  if (severityIds?.length) results = results.filter((r) => severityIds.includes(r.severityId))
  if (typeIds?.length) results = results.filter((r) => typeIds.includes(r.typeId))
  return results
}

function applyActiveFilter(results, af) {
  const userId = currentSession.value?.userId
  // Explicit rather than relying on the fallthrough below: 'all' is a real
  // choice (the whole register, closed included), not an unrecognised value.
  if (af === 'all') return results
  if (af === 'all_open') return results.filter((r) => OPEN_STATUSES.includes(r.statusId))
  if (af === 'mine')
    return results.filter((r) => r.ownerId === userId && OPEN_STATUSES.includes(r.statusId))
  if (af === 'critical')
    return results.filter((r) => r.severityId === 'CRITICAL' && OPEN_STATUSES.includes(r.statusId))
  if (af === 'major')
    return results.filter((r) => r.severityId === 'MAJOR' && OPEN_STATUSES.includes(r.statusId))
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
    if (createdAt) results = results.filter((r) => matchesDateFilter(r.createdAt, createdAt))
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
  const criticalOpen = openNcs.filter((r) => r.severityId === 'CRITICAL')
  const closedThisMonth = all.filter(
    (r) => CLOSED_STATUSES.includes(r.statusId) && r.closedAt && r.closedAt >= startOfMonth,
  )
  return {
    open: openNcs.length,
    criticalOpen: criticalOpen.length,
    closedThisMonth: closedThisMonth.length,
  }
})

// Compact KPI strip (list-page metrics bar, not a dashboard card grid).
const kpiItems = computed(() => [
  { key: 'open', label: 'Open NCs', value: stats.value.open, icon: IconAlertCircle, color: 'blue' },
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

// The table emits `delete`; without a listener the row-menu Delete did nothing
// (no dialog, no removal). Confirm, then soft-delete (the model is paranoid).
async function onDeleteNc(row) {
  const label = row.ncNumber ? `${row.ncNumber} — ${row.title}` : row.title
  const ok = await confirm({
    title: 'Delete Nonconformance',
    message: `Delete nonconformance '${label}'? It will be removed from the list.`,
    okLabel: 'Delete',
    danger: true,
  })
  if (!ok) return
  try {
    await row.delete()
    toast.success('Nonconformance deleted')
  } catch (e) {
    toast.error(e?.message || 'Failed to delete nonconformance')
  }
}
</script>

<template>
  <BaseListLayout
    title="Nonconformances"
    subtitle="Track, investigate and close nonconformances."
    :state="list.state.value"
    :emptyIcon="IconClipboardList"
    :emptyTitle="
      list.hasActiveFilters.value
        ? 'No nonconformances match your filters'
        : 'No nonconformances yet'
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
      <ListPrintButton
        entity="Nonconformance"
        title="Nonconformance Register"
        :rows="ncs"
        :filterLabel="humanizeFilter(list.filters.value.activeFilter)"
      />
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
      @delete="onDeleteNc"
    />
  </BaseListLayout>
</template>
