<script setup>
import {
  IconInbox,
  IconCalendarMonth,
  IconArrowUpRight,
  IconCircleCheck,
} from '@tabler/icons-vue'
import { getCompanyPath } from '@/utils/routeHelpers.js'
import { DateTime } from 'luxon'

const router = useRouter()

const events = useLiveQuery((db) => db.QualityEvent.where().exec(), {
  models: ['QualityEvent'],
  initial: [],
})
// Escalation links only — record_links also carries CAUSED and audit-finding
// spawns, which are not escalations.
const links = useLiveQuery(
  async (db) => {
    const all = await db.RecordLink.where('fromType', 'QualityEvent').exec()
    return all.filter((l) => l.relation === 'ESCALATED')
  },
  { models: ['RecordLink'], initial: [] },
)
const categories = useLiveQuery((db) => db.EventCategory.where().orderBy('displayOrder').exec(), {
  models: ['EventCategory'],
  initial: [],
})
const severities = useLiveQuery((db) => db.EventSeverity.where().orderBy('rank').exec(), {
  models: ['EventSeverity'],
  initial: [],
})
const departments = useLiveQuery((db) => db.Department.where().exec(), {
  models: ['Department'],
  initial: [],
})

const OPEN_STATUSES = ['DRAFT', 'OPEN', 'UNDER_REVIEW', 'AWAITING_DECISION']

const escalatedEventIds = computed(() => new Set(links.value.map((l) => l.fromId)))

const kpis = computed(() => {
  const all = events.value
  const now = DateTime.now()
  const startOfMonth = now.startOf('month')
  const open = all.filter((e) => OPEN_STATUSES.includes(e.statusId))
  const thisMonth = all.filter((e) => e.reportedDate && e.reportedDate >= startOfMonth)
  // Escalation is a link, never a status (2026-08-18) — the status half of
  // this test used to be the primary signal and is now always false.
  const escalated = all.filter((e) => escalatedEventIds.value.has(e.id))
  const closed = all.filter((e) => e.statusId === 'CLOSED')
  return {
    open: open.length,
    thisMonth: thisMonth.length,
    escalated: escalated.length,
    closed: closed.length,
  }
})

function tally(items, keyFn) {
  const counts = new Map()
  for (const it of items) {
    const k = keyFn(it) ?? '—'
    counts.set(k, (counts.get(k) ?? 0) + 1)
  }
  return counts
}

const byCategory = computed(() => {
  const nameOf = new Map(categories.value.map((c) => [c.id, c.name]))
  const counts = tally(events.value, (e) =>
    e.categoryId ? nameOf.get(e.categoryId) || 'Unknown' : 'Uncategorized',
  )
  return { labels: [...counts.keys()], series: [...counts.values()] }
})

const bySeverity = computed(() => {
  const nameOf = new Map(severities.value.map((s) => [s.id, s.name]))
  const counts = tally(events.value, (e) =>
    e.severityId ? nameOf.get(e.severityId) || 'Unknown' : 'None',
  )
  return { labels: [...counts.keys()], series: [...counts.values()] }
})

const byDepartment = computed(() => {
  const nameOf = new Map(departments.value.map((d) => [d.id, d.name]))
  const counts = tally(events.value, (e) =>
    e.departmentId ? nameOf.get(e.departmentId) || 'Unknown' : 'None',
  )
  const entries = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
  return {
    labels: entries.map((e) => e[0]),
    series: [{ name: 'Events', data: entries.map((e) => e[1]) }],
  }
})

const monthlyTrend = computed(() => {
  const now = DateTime.now().startOf('month')
  const buckets = []
  for (let i = 5; i >= 0; i--) buckets.push(now.minus({ months: i }))
  const labels = buckets.map((b) => b.toFormat('LLL yy'))
  const data = buckets.map(
    (b) =>
      events.value.filter((e) => {
        const d = e.reportedDate || e.createdAt
        return d && d.startOf('month').toMillis() === b.toMillis()
      }).length,
  )
  return { labels, series: [{ name: 'Events', data }] }
})

const escalationRate = computed(() => {
  const total = events.value.length || 1
  return Math.round((kpis.value.escalated / total) * 100)
})
</script>

<template>
  <BasePage width="wide">
    <PageHeader
      title="Events Dashboard"
      subtitle="Quality observation trends and escalation activity."
    >
      <template #actions>
        <BaseButton variant="outline" @click="router.push(getCompanyPath('/qualityEvents'))"
          >All Events</BaseButton
        >
      </template>
    </PageHeader>

    <ContentGrid min="14rem">
      <BaseStatCard label="Open Events" :value="kpis.open" :icon="IconInbox" iconColor="blue" />
      <BaseStatCard
        label="This Month"
        :value="kpis.thisMonth"
        :icon="IconCalendarMonth"
        iconColor="primary"
      />
      <BaseStatCard
        label="Escalated"
        :value="kpis.escalated"
        :icon="IconArrowUpRight"
        iconColor="amber"
        :trend="{ direction: 'up', value: `${escalationRate}% of all` }"
      />
      <BaseStatCard label="Closed" :value="kpis.closed" :icon="IconCircleCheck" iconColor="green" />
    </ContentGrid>

    <div class="tw:grid tw:grid-cols-1 tw:lg:grid-cols-2 tw:gap-4">
      <div class="tw:rounded-xl tw:border tw:border-divider tw:bg-card tw:p-4">
        <BaseText as="h3" class="tw:text-sm tw:font-bold tw:text-on-main tw:mb-2"
          >Events by Category</BaseText
        >
        <BaseChart
          v-if="byCategory.series.length"
          type="donut"
          :series="byCategory.series"
          :options="{ labels: byCategory.labels }"
          :height="280"
        />
        <p v-else class="tw:text-sm tw:text-secondary tw:italic">No data yet.</p>
      </div>

      <div class="tw:rounded-xl tw:border tw:border-divider tw:bg-card tw:p-4">
        <BaseText as="h3" class="tw:text-sm tw:font-bold tw:text-on-main tw:mb-2"
          >Events by Severity</BaseText
        >
        <BaseChart
          v-if="bySeverity.series.length"
          type="donut"
          :series="bySeverity.series"
          :options="{ labels: bySeverity.labels }"
          :height="280"
        />
        <p v-else class="tw:text-sm tw:text-secondary tw:italic">No data yet.</p>
      </div>

      <div class="tw:rounded-xl tw:border tw:border-divider tw:bg-card tw:p-4">
        <BaseText as="h3" class="tw:text-sm tw:font-bold tw:text-on-main tw:mb-2"
          >Monthly Trend</BaseText
        >
        <BaseChart
          type="line"
          :series="monthlyTrend.series"
          :options="{ xaxis: { categories: monthlyTrend.labels } }"
          :height="280"
        />
      </div>

      <div class="tw:rounded-xl tw:border tw:border-divider tw:bg-card tw:p-4">
        <BaseText as="h3" class="tw:text-sm tw:font-bold tw:text-on-main tw:mb-2"
          >Events by Department</BaseText
        >
        <BaseChart
          v-if="byDepartment.labels.length"
          type="bar"
          :series="byDepartment.series"
          :options="{ xaxis: { categories: byDepartment.labels } }"
          :height="280"
        />
        <p v-else class="tw:text-sm tw:text-secondary tw:italic">No data yet.</p>
      </div>
    </div>
  </BasePage>
</template>
