<script setup>
import { humanizeFilter } from '@/composables/useListPrint.js'
import {
  IconLayoutDashboard,
  IconAlertCircle,
  IconArrowUpRight,
  IconCircleCheck,
} from '@tabler/icons-vue'
import { isAllowed, currentSession } from '@/utils/currentSession.js'
import { getCompanyPath } from '@/utils/routeHelpers.js'

const router = useRouter()
const route = useRoute()
const toast = useToast()
const { confirm } = useConfirm()

const canCreate = computed(() => isAllowed(['quality_events:create']))
const canDelete = computed(() => isAllowed(['quality_events:delete']))

// Filters + resolved content state (URL-synced). Declared before the live query
// because `total`/`empty` are lazy getters that read `events`. `activeFilter`
// (the quick-filter pill) lives in the same bag so it shares URL-sync + reset.
const list = useListLayout({
  filters: {
    // Multi-select dimensions (Linear-style filter menu) — arrays of ids.
    statusId: [],
    categoryId: [],
    severityId: [],
    activeFilter: 'all_open',
  },
  total: () => events.value.length,
  empty: () => events.value.length === 0,
  syncUrl: true,
})

// Escalating no longer moves the event to an ESCALATED status (2026-08-18) —
// it spawns a downstream record but the event itself is still open and still
// has to be reviewed and closed. "Escalated" is therefore a property of the
// record_links, not of the status, exactly as QualityEventsDashboard already
// read it.
const OPEN_STATUSES = ['DRAFT', 'OPEN']

// Which events have been escalated. Indexed lookup on fromType, then narrowed
// to the ESCALATED relation — record_links carries other relations (CAUSED,
// and the audit-finding spawns) that must not count as an escalation.
// Declared here because the filter and the KPI strip both read it.
const escalations = useLiveQuery(
  async (db) => {
    const all = await db.RecordLink.where('fromType', 'QualityEvent').exec()
    return all.filter((l) => l.relation === 'ESCALATED')
  },
  { models: ['RecordLink'], initial: [] },
)
const escalatedIds = computed(() => new Set(escalations.value.map((l) => l.fromId)))

function applyFilters(results, statusIds, categoryIds, severityIds) {
  if (statusIds?.length) results = results.filter((r) => statusIds.includes(r.statusId))
  if (categoryIds?.length) results = results.filter((r) => categoryIds.includes(r.categoryId))
  if (severityIds?.length) results = results.filter((r) => severityIds.includes(r.severityId))
  return results
}

function applyActiveFilter(results, af) {
  const userId = currentSession.value?.userId
  // Explicit rather than relying on the fallthrough below: 'all' is a real
  // choice (the whole register, closed included), not an unrecognised value.
  if (af === 'all') return results
  if (af === 'all_open') return results.filter((r) => OPEN_STATUSES.includes(r.statusId))
  if (af === 'mine')
    return results.filter(
      (r) => r.assignedToUserId === userId && OPEN_STATUSES.includes(r.statusId),
    )
  if (af === 'escalated') return results.filter((r) => escalatedIds.value.has(r.id))
  if (af === 'closed') return results.filter((r) => r.statusId === 'CLOSED')
  if (af === 'cancelled') return results.filter((r) => r.statusId === 'CANCELLED')
  return results
}

const allEvents = useLiveQuery((db) => db.QualityEvent.where().exec(), {
  models: ['QualityEvent'],
  initial: [],
})

const events = useLiveQueryWithDeps(
  [
    () => list.filters.value.statusId,
    () => list.filters.value.categoryId,
    () => list.filters.value.severityId,
    () => list.filters.value.activeFilter,
  ],
  async (db, [statusIds, categoryIds, severityIds, af]) => {
    let results = await db.QualityEvent.where().exec()
    results = applyFilters(results, statusIds, categoryIds, severityIds)
    results = applyActiveFilter(results, af)
    return results.sort(
      (a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0),
    )
  },
  { models: ['QualityEvent'], initial: [] },
)

const stats = computed(() => {
  const all = allEvents.value
  return {
    open: all.filter((r) => OPEN_STATUSES.includes(r.statusId)).length,
    escalated: all.filter((r) => escalatedIds.value.has(r.id)).length,
    closed: all.filter((r) => r.statusId === 'CLOSED').length,
  }
})

// Compact KPI strip (list-page metrics bar, not a dashboard card grid).
const kpiItems = computed(() => [
  { key: 'open', label: 'Open', value: stats.value.open, icon: IconAlertCircle, color: 'blue' },
  {
    key: 'escalated',
    label: 'Escalated',
    value: stats.value.escalated,
    icon: IconArrowUpRight,
    color: 'red',
    emphasize: stats.value.escalated > 0,
  },
  {
    key: 'closed',
    label: 'Closed',
    value: stats.value.closed,
    icon: IconCircleCheck,
    color: 'green',
  },
])

async function onDeleteRow(row) {
  if (
    !(await confirm({
      title: 'Delete event',
      message: `Delete event ${row.eventNumber || ''} "${row.title}"?`,
      okLabel: 'Delete',
      danger: true,
    }))
  ) {
    return
  }
  try {
    await row.delete()
    toast.success('Event deleted')
  } catch (e) {
    toast.error(e.message || 'Failed to delete')
  }
}

function openCreateDialog() {
  if (route.query.create !== '1') {
    router.replace({ query: { ...route.query, create: '1' } })
  }
}
</script>

<template>
  <BaseListLayout
    title="Events & Observations"
    subtitle="Log quality observations, concerns, and near-misses — escalate only when justified."
    :state="list.state.value"
    contentOwnsEmpty
  >
    <template #title>
      <span class="tw:inline-flex tw:items-center tw:gap-2">
        Events &amp; Observations
        <span
          class="tw:rounded-full tw:bg-main-selected tw:px-2 tw:py-0.5 tw:text-caption tw:font-semibold tw:text-secondary tw:tabular-nums"
        >
          {{ events.length }}
        </span>
      </span>
    </template>

    <template #actions>
      <ListPrintButton
        entity="QualityEvent"
        title="Quality Event Register"
        :rows="events"
        :filterLabel="humanizeFilter(list.filters.value.activeFilter)"
      />
      <BaseButton
        type="button"
        variant="outline"
        @click="router.push(getCompanyPath('/qualityEvents/dashboard'))"
      >
        <IconLayoutDashboard :size="16" class="tw:mr-1" />
        Dashboard
      </BaseButton>
      <BaseButton v-if="canCreate" type="button" variant="primary" @click="openCreateDialog">
        Log Event
      </BaseButton>
    </template>

    <template v-if="canCreate" #empty-action>
      <BaseButton type="button" variant="primary" @click="openCreateDialog">Log Event</BaseButton>
    </template>

    <template #stats>
      <BaseStatStrip :items="kpiItems" />
    </template>

    <template #filters>
      <QualityEventsFilterToolbar v-model:filters="list.filters.value" />
    </template>

    <QualityEventsTable
      v-model:activeFilter="list.filters.value.activeFilter"
      v-model:filters="list.filters.value"
      :emptyLabel="
        list.hasActiveFilters.value ? 'No events match your filters' : 'No events logged yet'
      "
      :rows="events"
      :escalatedIds="escalatedIds"
      :canDelete="canDelete"
      @delete="onDeleteRow"
    />
  </BaseListLayout>
</template>
