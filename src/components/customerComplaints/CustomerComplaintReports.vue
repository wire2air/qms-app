<script setup>
import { IconChartBar, IconArrowLeft, IconStarFilled } from '@tabler/icons-vue'
import { getCompanyPath } from '@/utils/routeHelpers.js'
import { DateTime } from 'luxon'

/**
 * Complaint reports — computed client-side from IndexedDB (live, no
 * backend aggregation endpoint). Spam tickets are excluded everywhere.
 */
const router = useRouter()

const RANGES = [
  { id: 30, name: 'Last 30 days' },
  { id: 90, name: 'Last 90 days' },
  { id: 365, name: 'Last 12 months' },
]
const rangeDays = ref(90)

const complaints = useLiveQuery((db) => db.CustomerComplaint.where().exec(), {
  models: ['CustomerComplaint'],
  initial: [],
})

const inRange = computed(() => {
  const since = DateTime.now().minus({ days: rangeDays.value })
  return complaints.value.filter((c) => !c.isSpam && c.createdAt && c.createdAt >= since)
})

// ── Headline metrics ──
function avgHours(rows, fromField, toField) {
  const deltas = rows
    .filter((r) => r[fromField] && r[toField])
    .map((r) => r[toField].diff(r[fromField], 'hours').hours)
  if (!deltas.length) return null
  return deltas.reduce((a, b) => a + b, 0) / deltas.length
}

function formatHours(h) {
  if (h == null) return '—'
  if (h < 1) return `${Math.round(h * 60)}m`
  if (h < 48) return `${h.toFixed(1)}h`
  return `${(h / 24).toFixed(1)}d`
}

const metrics = computed(() => {
  const rows = inRange.value
  const resolved = rows.filter((r) => r.resolvedAt)
  const rated = rows.filter((r) => r.csatRating)
  return {
    created: rows.length,
    resolved: resolved.length,
    avgFirstResponse: avgHours(rows, 'createdAt', 'firstResponseAt'),
    avgResolution: avgHours(resolved, 'createdAt', 'resolvedAt'),
    csatCount: rated.length,
    csatAvg: rated.length ? rated.reduce((a, r) => a + r.csatRating, 0) / rated.length : null,
  }
})

// ── Created vs resolved trend (weekly buckets) ──
const trend = computed(() => {
  const weeks = Math.min(Math.ceil(rangeDays.value / 7), 26)
  const buckets = []
  for (let i = weeks - 1; i >= 0; i--) {
    const start = DateTime.now().startOf('week').minus({ weeks: i })
    const end = start.plus({ weeks: 1 })
    buckets.push({
      label: start.formatDate ? start.formatDate('date') : start.toLocaleString(),
      created: inRange.value.filter((c) => c.createdAt >= start && c.createdAt < end).length,
      resolved: inRange.value.filter(
        (c) => c.resolvedAt && c.resolvedAt >= start && c.resolvedAt < end,
      ).length,
    })
  }
  const max = Math.max(1, ...buckets.map((b) => Math.max(b.created, b.resolved)))
  return { buckets, max }
})

// ── Breakdowns ──
function breakdown(rows, keyFn, labelFn = (k) => k) {
  const counts = new Map()
  for (const r of rows) {
    const key = keyFn(r) ?? '—'
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  const total = rows.length || 1
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([key, count]) => ({
      key,
      label: labelFn(key),
      count,
      pct: Math.round((count / total) * 100),
    }))
}

const bySource = computed(() => breakdown(inRange.value, (r) => r.sourceId))
const byPriority = computed(() => breakdown(inRange.value, (r) => r.priorityId ?? 'None'))
const bySentiment = computed(() => breakdown(inRange.value, (r) => r.sentiment ?? 'Unclassified'))
const byStatus = computed(() => breakdown(inRange.value, (r) => r.statusId))
const byAgent = computed(() => breakdown(inRange.value, (r) => r.assignedTo))

const BREAKDOWN_SECTIONS = [
  { title: 'By source', data: bySource, userIds: false },
  { title: 'By status', data: byStatus, userIds: false },
  { title: 'By priority', data: byPriority, userIds: false },
  { title: 'By sentiment', data: bySentiment, userIds: false },
  { title: 'By agent', data: byAgent, userIds: true },
]
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-4 tw:p-5">
    <PageHeader :icon="IconChartBar" title="Complaint Reports" />

    <div class="tw:flex tw:items-center tw:justify-between tw:gap-2 tw:flex-wrap">
      <div class="tw:flex tw:flex-col tw:gap-1">
        <div class="tw:text-3xl tw:font-bold tw:text-on-sidebar">Reports</div>
        <div class="tw:text-sm tw:text-secondary">
          Ticket volume, response performance and satisfaction across the support queue.
        </div>
      </div>
      <div class="tw:flex tw:items-center tw:gap-2">
        <BaseSelectMenu v-model="rangeDays" :items="RANGES" :required="true" />
        <BaseButton variant="outline" @click="router.push(getCompanyPath('/customer-complaints'))">
          <IconArrowLeft :size="16" class="tw:mr-1" />
          Back to tickets
        </BaseButton>
      </div>
    </div>

    <!-- Headline metrics -->
    <div class="tw:grid tw:grid-cols-2 tw:md:grid-cols-5 tw:gap-3">
      <div class="tw:bg-white tw:rounded-lg tw:border tw:border-divider tw:p-4">
        <div class="tw:text-xs tw:uppercase tw:font-bold tw:text-secondary">Created</div>
        <div class="tw:text-2xl tw:font-black tw:text-on-sidebar">{{ metrics.created }}</div>
      </div>
      <div class="tw:bg-white tw:rounded-lg tw:border tw:border-divider tw:p-4">
        <div class="tw:text-xs tw:uppercase tw:font-bold tw:text-secondary">Resolved</div>
        <div class="tw:text-2xl tw:font-black tw:text-on-sidebar">{{ metrics.resolved }}</div>
      </div>
      <div class="tw:bg-white tw:rounded-lg tw:border tw:border-divider tw:p-4">
        <div class="tw:text-xs tw:uppercase tw:font-bold tw:text-secondary">Avg first response</div>
        <div class="tw:text-2xl tw:font-black tw:text-on-sidebar">
          {{ formatHours(metrics.avgFirstResponse) }}
        </div>
      </div>
      <div class="tw:bg-white tw:rounded-lg tw:border tw:border-divider tw:p-4">
        <div class="tw:text-xs tw:uppercase tw:font-bold tw:text-secondary">Avg resolution</div>
        <div class="tw:text-2xl tw:font-black tw:text-on-sidebar">
          {{ formatHours(metrics.avgResolution) }}
        </div>
      </div>
      <div class="tw:bg-white tw:rounded-lg tw:border tw:border-divider tw:p-4">
        <div class="tw:text-xs tw:uppercase tw:font-bold tw:text-secondary">CSAT</div>
        <div class="tw:flex tw:items-baseline tw:gap-1">
          <div class="tw:text-2xl tw:font-black tw:text-on-sidebar">
            {{ metrics.csatAvg != null ? metrics.csatAvg.toFixed(1) : '—' }}
          </div>
          <IconStarFilled v-if="metrics.csatAvg != null" :size="14" class="tw:text-amber-400" />
          <span v-if="metrics.csatCount" class="tw:text-xs tw:text-secondary">
            ({{ metrics.csatCount }})
          </span>
        </div>
      </div>
    </div>

    <!-- Weekly trend -->
    <div class="tw:bg-white tw:rounded-lg tw:border tw:border-divider tw:p-5">
      <div class="tw:flex tw:items-center tw:justify-between tw:mb-4">
        <div class="tw:text-xs tw:font-semibold tw:text-secondary tw:uppercase tw:tracking-wider">
          Created vs Resolved (weekly)
        </div>
        <div class="tw:flex tw:items-center tw:gap-3 tw:text-xs tw:text-secondary">
          <span class="tw:flex tw:items-center tw:gap-1">
            <span class="tw:w-2.5 tw:h-2.5 tw:rounded-sm tw:bg-blue-500 tw:inline-block" />
            Created
          </span>
          <span class="tw:flex tw:items-center tw:gap-1">
            <span class="tw:w-2.5 tw:h-2.5 tw:rounded-sm tw:bg-emerald-500 tw:inline-block" />
            Resolved
          </span>
        </div>
      </div>
      <div class="tw:flex tw:items-end tw:gap-1 tw:h-36 tw:overflow-x-auto">
        <div
          v-for="(bucket, index) in trend.buckets"
          :key="index"
          class="tw:flex tw:items-end tw:gap-0.5 tw:flex-1 tw:min-w-6 tw:h-full"
          :title="`Week of ${bucket.label}: ${bucket.created} created, ${bucket.resolved} resolved`"
        >
          <div
            class="tw:flex-1 tw:bg-blue-500 tw:rounded-t"
            :style="{ height: `${(bucket.created / trend.max) * 100}%` }"
          />
          <div
            class="tw:flex-1 tw:bg-emerald-500 tw:rounded-t"
            :style="{ height: `${(bucket.resolved / trend.max) * 100}%` }"
          />
        </div>
      </div>
    </div>

    <!-- Breakdowns -->
    <div class="tw:grid tw:grid-cols-1 tw:md:grid-cols-2 tw:xl:grid-cols-3 tw:gap-3">
      <div
        v-for="section in BREAKDOWN_SECTIONS"
        :key="section.title"
        class="tw:bg-white tw:rounded-lg tw:border tw:border-divider tw:p-5"
      >
        <div
          class="tw:text-xs tw:font-semibold tw:text-secondary tw:uppercase tw:tracking-wider tw:mb-3"
        >
          {{ section.title }}
        </div>
        <div v-if="section.data.value.length" class="tw:flex tw:flex-col tw:gap-2">
          <div v-for="row in section.data.value" :key="row.key" class="tw:flex tw:flex-col">
            <div class="tw:flex tw:items-center tw:justify-between tw:text-sm tw:mb-0.5">
              <UserBadgeById v-if="section.userIds && row.key !== '—'" :userId="row.key" />
              <span v-else class="tw:truncate">{{ row.label }}</span>
              <span class="tw:text-xs tw:text-secondary tw:shrink-0 tw:ml-2">
                {{ row.count }} · {{ row.pct }}%
              </span>
            </div>
            <div class="tw:h-1.5 tw:bg-gray-100 tw:rounded-full tw:overflow-hidden">
              <div class="tw:h-full tw:bg-blue-500" :style="{ width: `${row.pct}%` }" />
            </div>
          </div>
        </div>
        <p v-else class="tw:text-xs tw:text-secondary tw:italic">No data in range.</p>
      </div>
    </div>
  </div>
</template>
