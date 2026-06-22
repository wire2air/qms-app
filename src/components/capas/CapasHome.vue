<script setup>
import {
  IconAlertCircle,
  IconClock,
  IconCircleCheck,
  IconShieldCheck,
  IconDownload,
} from '@tabler/icons-vue'
import { isAllowed, currentSession } from '@/utils/currentSession.js'
import { getCompanyPath } from '@/utils/routeHelpers.js'
import { matchesDateFilter } from '@/utils/dateRanges.js'
import { exportToCSV } from '@/utils/exportUtils.js'
import { DateTime } from 'luxon'

const router = useRouter()
const route = useRoute()

const canCreate = computed(() => isAllowed(['capas:create']))
const canUpdate = computed(() => isAllowed(['capas:update']))
const canDelete = computed(() => isAllowed(['capas:delete']))

// Filters + resolved content state (URL-synced). Declared before the live query
// because `total`/`empty` are lazy getters that read `capas`.
const list = useListLayout({
  filters: {
    search: '',
    statusId: null,
    priorityId: null,
    typeId: null,
    supplierId: route.query.supplierId || null,
    createdAt: null,
  },
  total: () => capas.value.length,
  empty: () => capas.value.length === 0,
  syncUrl: true,
})

// Quick-filter pill selection. Kept separate from `list.filters` because the
// CapasFilterToolbar exposes it via its own `v-model:activeFilter`.
const activeFilter = ref('all_open')

// Supplier deep-link: /capas?supplierId=… prefilters to one supplier.
watch(
  () => route.query.supplierId,
  (v) => (list.filters.value.supplierId = v || null),
)
const filterSupplier = useLiveQueryWithDeps(
  [() => list.filters.value.supplierId],
  async (db, [id]) => (id ? db.Supplier.findByPk(id) : null),
  { models: ['Supplier'] },
)
function clearSupplierFilter() {
  list.filters.value.supplierId = null
  const q = { ...route.query }
  delete q.supplierId
  router.replace({ query: q })
}

function exportCsv() {
  exportToCSV(
    capas.value,
    [
      { field: 'capaNumber', label: 'CAPA #' },
      { field: 'title', label: 'Title' },
      { field: 'statusId', label: 'Status' },
      { field: 'priorityId', label: 'Priority' },
      { field: 'typeId', label: 'Type' },
      { field: (r) => r.createdAt?.toFormat?.('yyyy-LL-dd') ?? '', label: 'Created' },
      { field: (r) => r.dueDate?.toFormat?.('yyyy-LL-dd') ?? '', label: 'Due' },
    ],
    'capas',
  )
}

const CLOSED_STATUSES = ['CLOSED', 'CANCELLED']
const OPEN_STATUSES = ['DRAFT', 'PENDING']

function applyFilters(results, search, statusId, priorityId, typeId) {
  if (search) {
    const q = search.toLowerCase()
    results = results.filter(
      (r) => r.title?.toLowerCase().includes(q) || r.capaNumber?.toLowerCase().includes(q),
    )
  }
  if (statusId) results = results.filter((r) => r.statusId === statusId)
  if (priorityId) results = results.filter((r) => r.priorityId === priorityId)
  if (typeId) results = results.filter((r) => r.typeId === typeId)
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
    () => list.filters.value.search,
    () => list.filters.value.statusId,
    () => list.filters.value.priorityId,
    () => list.filters.value.typeId,
    () => activeFilter.value,
    () => list.filters.value.supplierId,
    () => list.filters.value.createdAt,
  ],
  async (db, [search, statusId, priorityId, typeId, af, supplierId, createdAt]) => {
    let results = await db.Capa.where().exec()
    results = applyFilters(results, search, statusId, priorityId, typeId)
    results = applyActiveFilter(results, af)
    if (supplierId) results = results.filter((r) => r.supplierId === supplierId)
    if (createdAt)
      results = results.filter((r) => matchesDateFilter(r.createdAt, createdAt))
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

function onCreateCapa() {
  router.push(getCompanyPath('/capas/create'))
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
      <BaseButton variant="outline" :disabled="!capas.length" @click="exportCsv">
        <IconDownload :size="16" class="tw:mr-1" />
        Export
      </BaseButton>
      <BaseButton v-if="canCreate" variant="primary" @click="onCreateCapa">Create CAPA</BaseButton>
    </template>

    <!-- Stat Cards -->
    <template #stats>
      <div class="tw:grid tw:grid-cols-2 tw:md:grid-cols-4 tw:gap-3">
        <div
          class="tw:bg-white tw:rounded-lg tw:border tw:border-divider tw:p-4 tw:flex tw:items-center tw:gap-4"
        >
          <div
            class="tw:w-10 tw:h-10 tw:rounded-lg tw:bg-blue-50 tw:text-blue-600 tw:flex tw:items-center tw:justify-center tw:shrink-0"
          >
            <IconAlertCircle :size="20" />
          </div>
          <div>
            <div class="tw:text-xs tw:uppercase tw:tracking-tight tw:font-bold tw:text-secondary">
              Open CAPAs
            </div>
            <div class="tw:text-2xl tw:font-black tw:text-on-sidebar">{{ stats.open }}</div>
          </div>
        </div>
        <div
          class="tw:bg-white tw:rounded-lg tw:border tw:border-divider tw:p-4 tw:flex tw:items-center tw:gap-4"
        >
          <div
            class="tw:w-10 tw:h-10 tw:rounded-lg tw:bg-red-50 tw:text-red-600 tw:flex tw:items-center tw:justify-center tw:shrink-0"
          >
            <IconClock :size="20" />
          </div>
          <div>
            <div class="tw:text-xs tw:uppercase tw:tracking-tight tw:font-bold tw:text-secondary">
              Overdue
            </div>
            <div
              class="tw:text-2xl tw:font-black"
              :class="stats.overdue > 0 ? 'tw:text-red-600' : 'tw:text-on-sidebar'"
            >
              {{ stats.overdue }}
            </div>
          </div>
        </div>
        <div
          class="tw:bg-white tw:rounded-lg tw:border tw:border-divider tw:p-4 tw:flex tw:items-center tw:gap-4"
        >
          <div
            class="tw:w-10 tw:h-10 tw:rounded-lg tw:bg-amber-50 tw:text-amber-600 tw:flex tw:items-center tw:justify-center tw:shrink-0"
          >
            <IconShieldCheck :size="20" />
          </div>
          <div>
            <div class="tw:text-xs tw:uppercase tw:tracking-tight tw:font-bold tw:text-secondary">
              Critical open
            </div>
            <div
              class="tw:text-2xl tw:font-black"
              :class="stats.criticalOpen > 0 ? 'tw:text-amber-600' : 'tw:text-on-sidebar'"
            >
              {{ stats.criticalOpen }}
            </div>
          </div>
        </div>
        <div
          class="tw:bg-white tw:rounded-lg tw:border tw:border-divider tw:p-4 tw:flex tw:items-center tw:gap-4"
        >
          <div
            class="tw:w-10 tw:h-10 tw:rounded-lg tw:bg-green-50 tw:text-green-600 tw:flex tw:items-center tw:justify-center tw:shrink-0"
          >
            <IconCircleCheck :size="20" />
          </div>
          <div>
            <div class="tw:text-xs tw:uppercase tw:tracking-tight tw:font-bold tw:text-secondary">
              Closed this month
            </div>
            <div class="tw:text-2xl tw:font-black tw:text-on-sidebar">
              {{ stats.closedThisMonth }}
            </div>
          </div>
        </div>
      </div>
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

      <CapasFilterToolbar v-model:filters="list.filters.value" v-model:activeFilter="activeFilter" />
    </template>

    <CapasTable
      :rows="capas"
      :canUpdate="canUpdate"
      :canDelete="canDelete"
      @edit="(row) => router.push(getCompanyPath(`/capas/${row.id}`))"
    />
  </BaseListLayout>
</template>
