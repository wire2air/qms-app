<script setup>
import { IconAlertCircle, IconAlertTriangle, IconClock, IconCircleCheck } from '@tabler/icons-vue'
import { isAllowed, currentSession } from '@/utils/currentSession.js'
import { getCompanyPath } from '@/utils/routeHelpers.js'
import { DateTime } from 'luxon'

const router = useRouter()

const canCreate = computed(() => isAllowed(['nonconformances:create']))
const canUpdate = computed(() => isAllowed(['nonconformances:update']))
const canDelete = computed(() => isAllowed(['nonconformances:delete']))

const filters = ref({ search: '', statusId: null, severityId: null, typeId: null })
const activeFilter = ref('all_open')

const CLOSED_STATUSES = ['CLOSED']
const OPEN_STATUSES = ['DRAFT', 'UNDER_REVIEW']

function applyFilters(results, search, statusId, severityId, typeId) {
  if (search) {
    const q = search.toLowerCase()
    results = results.filter(
      (r) => r.title?.toLowerCase().includes(q) || r.ncNumber?.toLowerCase().includes(q),
    )
  }
  if (statusId) results = results.filter((r) => r.statusId === statusId)
  if (severityId) results = results.filter((r) => r.severityId === severityId)
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
    return results.filter((r) => r.severityId === 'CRITICAL' && OPEN_STATUSES.includes(r.statusId))
  if (af === 'major')
    return results.filter((r) => r.severityId === 'MAJOR' && OPEN_STATUSES.includes(r.statusId))
  if (af === 'overdue')
    return results.filter((r) => r.dueDate && r.dueDate < now && OPEN_STATUSES.includes(r.statusId))
  if (af === 'closed') return results.filter((r) => r.statusId === 'CLOSED')
  return results
}

const allNcs = useLiveQuery((db) => db.Nonconformance.where().exec(), { initial: [] })

const ncs = useLiveQueryWithDeps(
  [
    () => filters.value.search,
    () => filters.value.statusId,
    () => filters.value.severityId,
    () => filters.value.typeId,
    () => activeFilter.value,
  ],
  async (db, [search, statusId, severityId, typeId, af]) => {
    let results = await db.Nonconformance.where().exec()
    results = applyFilters(results, search, statusId, severityId, typeId)
    results = applyActiveFilter(results, af)
    return results.sort(
      (a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0),
    )
  },
  { initial: [] },
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

function onRaiseNc() {
  router.push(getCompanyPath('/nonconformances/create'))
}
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-3 tw:h-full tw:p-5">
    <SafeTeleport to="#main-header-title">
      <div class="tw:flex tw:items-center tw:gap-2 tw:text-on-sidebar">
        <h2 class="tw:text-lg tw:font-bold tw:tracking-tight tw:text-nowrap">Nonconformances</h2>
      </div>
    </SafeTeleport>

    <SafeTeleport to="#main-header-actions">
      <BaseButton v-if="canCreate" variant="primary" @click="onRaiseNc">Raise NC</BaseButton>
    </SafeTeleport>

    <!-- Page Header -->
    <div class="tw:flex tw:flex-col tw:gap-1">
      <div class="tw:text-3xl tw:font-bold tw:text-on-sidebar">Nonconformances</div>
      <div class="tw:text-sm tw:text-secondary">Track, investigate and close nonconformances.</div>
    </div>

    <!-- Stat Cards -->
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
            Open NCs
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
          <IconAlertTriangle :size="20" />
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

    <NonconformancesFilterToolbar v-model:filters="filters" v-model:activeFilter="activeFilter" />

    <NonconformancesTable
      :rows="ncs"
      :canUpdate="canUpdate"
      :canDelete="canDelete"
      @edit="(row) => router.push(getCompanyPath(`/nonconformances/${row.id}`))"
    />
  </div>
</template>
