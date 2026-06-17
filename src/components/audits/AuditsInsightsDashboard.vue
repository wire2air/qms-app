<script setup>
/**
 * Audit Management insights — quick-glance overview of the module's
 * health.
 *
 * Six widgets:
 *   1. Stat strip — programs / in-flight audits / open findings / due-30d.
 *   2. Findings by category (horizontal bars from a live query).
 *   3. Findings by type (Major / Minor / Observation / OFI, open only).
 *   4. Lead auditor backlog (per-lead active audit count, top 5).
 *   5. Upcoming audits (SCHEDULED + DRAFT, sorted by scheduledDate asc).
 *   6. Recent findings (newest 10, click-through).
 *
 * No chart-library dep — bars are Tailwind div widths computed from
 * the live counts. Same lightweight approach the rest of the module
 * uses for progress indicators.
 */
import {
  IconCalendarTime,
  IconBolt,
  IconChecklist,
  IconChartBar,
  IconUsers,
} from '@tabler/icons-vue'
import { DateTime } from 'luxon'
import { getCompanyPath } from '@/utils/routeHelpers.js'

const router = useRouter()

// ── Source live queries (each runs once + flows into the widgets) ───

const programs = useLiveQuery(async (db) => db.AuditProgram.where().exec(), {
  models: ['AuditProgram'],
  initial: [],
})
const instances = useLiveQuery(async (db) => db.AuditInstance.where().exec(), {
  models: ['AuditInstance'],
  initial: [],
})
const findings = useLiveQuery(async (db) => db.AuditFinding.where().exec(), {
  models: ['AuditFinding'],
  initial: [],
})
const findingCategories = useLiveQuery(
  async (db) => db.AuditFindingCategory.where().exec(),

  { models: ['AuditFindingCategory'], initial: [] },
)
const users = useLiveQuery(async (db) => db.User.where().exec(), { models: ['User'], initial: [] })

// ── 1) Stat strip ───────────────────────────────────────────────────

const activePrograms = computed(() => programs.value.filter((p) => p.active).length)

const IN_FLIGHT_STATUSES = new Set(['DRAFT', 'SCHEDULED', 'IN_PROGRESS', 'REVIEW'])
const inFlightAudits = computed(
  () => instances.value.filter((i) => IN_FLIGHT_STATUSES.has(i.statusId)).length,
)

const OPEN_FINDING_STATUSES = new Set(['OPEN', 'IN_REVIEW', 'IN_REMEDIATION', 'VERIFIED'])
const openFindings = computed(
  () => findings.value.filter((f) => OPEN_FINDING_STATUSES.has(f.statusId)).length,
)

const auditsDueIn30d = computed(() => {
  const today = DateTime.utc().startOf('day')
  const horizon = today.plus({ days: 30 })
  return instances.value.filter((i) => {
    if (!i.scheduledDate) return false
    const dt = i.scheduledDate.startOf?.('day') ?? null
    if (!dt) return false
    // Counted: SCHEDULED audits within 30d (DRAFT means not yet
    // committed; past CLOSED / CANCELLED audits don't qualify).
    if (!['SCHEDULED', 'DRAFT'].includes(i.statusId)) return false
    return dt >= today && dt <= horizon
  }).length
})

// ── 2) Findings by category — open only ────────────────────────────

const categoryNameById = computed(() => new Map(findingCategories.value.map((c) => [c.id, c.name])))

const findingsByCategory = computed(() => {
  const buckets = new Map()
  for (const f of findings.value) {
    if (!OPEN_FINDING_STATUSES.has(f.statusId)) continue
    const id = f.categoryId || '__uncategorized__'
    buckets.set(id, (buckets.get(id) ?? 0) + 1)
  }
  // Convert to display rows, sorted desc by count.
  const rows = [...buckets.entries()]
    .map(([id, count]) => ({
      id,
      name: id === '__uncategorized__' ? 'Uncategorized' : categoryNameById.value.get(id) || '—',
      count,
    }))
    .sort((a, b) => b.count - a.count)
  const max = rows[0]?.count ?? 0
  return rows.map((r) => ({ ...r, widthPct: max ? Math.round((r.count / max) * 100) : 0 }))
})

// ── 3) Findings by type — open only ────────────────────────────────

const TYPE_ROW_CONFIG = [
  { id: 'MAJOR_NC', name: 'Major NC', barClass: 'tw:bg-red-500' },
  { id: 'MINOR_NC', name: 'Minor NC', barClass: 'tw:bg-amber-500' },
  { id: 'OBSERVATION', name: 'Observation', barClass: 'tw:bg-blue-500' },
  { id: 'OFI', name: 'OFI', barClass: 'tw:bg-violet-500' },
]
const findingsByType = computed(() => {
  const counts = Object.fromEntries(TYPE_ROW_CONFIG.map((t) => [t.id, 0]))
  for (const f of findings.value) {
    if (!OPEN_FINDING_STATUSES.has(f.statusId)) continue
    if (counts[f.findingTypeId] != null) counts[f.findingTypeId] += 1
  }
  const max = Math.max(...Object.values(counts), 1)
  return TYPE_ROW_CONFIG.map((t) => ({
    ...t,
    count: counts[t.id],
    widthPct: Math.round((counts[t.id] / max) * 100),
  }))
})

// ── 4) Lead auditor backlog ────────────────────────────────────────

const userNameById = computed(() =>
  Object.fromEntries(
    users.value.map((u) => [u.id, `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.email]),
  ),
)

const leadBacklog = computed(() => {
  const buckets = new Map()
  for (const i of instances.value) {
    if (!IN_FLIGHT_STATUSES.has(i.statusId)) continue
    if (!i.leadAuditorUserId) continue
    buckets.set(i.leadAuditorUserId, (buckets.get(i.leadAuditorUserId) ?? 0) + 1)
  }
  const rows = [...buckets.entries()]
    .map(([userId, count]) => ({
      userId,
      name: userNameById.value[userId] || userId.slice(0, 8),
      count,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
  const max = rows[0]?.count ?? 0
  return rows.map((r) => ({ ...r, widthPct: max ? Math.round((r.count / max) * 100) : 0 }))
})

// ── 5) Upcoming audits ─────────────────────────────────────────────

const upcomingAudits = computed(() => {
  const today = DateTime.utc().startOf('day')
  return instances.value
    .filter((i) => {
      if (!i.scheduledDate) return false
      if (!['DRAFT', 'SCHEDULED'].includes(i.statusId)) return false
      const dt = i.scheduledDate.startOf?.('day') ?? null
      return dt && dt >= today
    })
    .sort((a, b) => (a.scheduledDate?.toMillis?.() ?? 0) - (b.scheduledDate?.toMillis?.() ?? 0))
    .slice(0, 10)
})

// ── 6) Recent findings ─────────────────────────────────────────────

const recentFindings = computed(() =>
  [...findings.value]
    .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))
    .slice(0, 10),
)

// ── Navigation helpers ────────────────────────────────────────────

function openInstance(i) {
  router.push(getCompanyPath(`/audits/instances/${i.id}`))
}
function openFindingsInstance(f) {
  router.push(getCompanyPath(`/audits/instances/${f.auditInstanceId}`))
}
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-4">
    <!-- 1. Stat strip -->
    <div class="tw:grid tw:grid-cols-2 tw:md:grid-cols-4 tw:gap-3">
      <div
        class="tw:bg-white tw:border tw:border-divider tw:rounded-lg tw:p-4 tw:flex tw:items-center tw:gap-3"
      >
        <div
          class="tw:size-10 tw:rounded-lg tw:bg-blue-100 tw:flex tw:items-center tw:justify-center tw:text-blue-700"
        >
          <IconCalendarTime :size="20" />
        </div>
        <div class="tw:flex tw:flex-col">
          <span class="tw:text-2xl tw:font-bold tw:text-on-main">{{ activePrograms }}</span>
          <span class="tw:text-xs tw:text-secondary tw:uppercase tw:tracking-wider">
            Active Programs
          </span>
        </div>
      </div>
      <div
        class="tw:bg-white tw:border tw:border-divider tw:rounded-lg tw:p-4 tw:flex tw:items-center tw:gap-3"
      >
        <div
          class="tw:size-10 tw:rounded-lg tw:bg-amber-100 tw:flex tw:items-center tw:justify-center tw:text-amber-700"
        >
          <IconChecklist :size="20" />
        </div>
        <div class="tw:flex tw:flex-col">
          <span class="tw:text-2xl tw:font-bold tw:text-on-main">{{ inFlightAudits }}</span>
          <span class="tw:text-xs tw:text-secondary tw:uppercase tw:tracking-wider">
            In-Flight Audits
          </span>
        </div>
      </div>
      <div
        class="tw:bg-white tw:border tw:border-divider tw:rounded-lg tw:p-4 tw:flex tw:items-center tw:gap-3"
      >
        <div
          class="tw:size-10 tw:rounded-lg tw:bg-red-100 tw:flex tw:items-center tw:justify-center tw:text-red-700"
        >
          <IconBolt :size="20" />
        </div>
        <div class="tw:flex tw:flex-col">
          <span class="tw:text-2xl tw:font-bold tw:text-on-main">{{ openFindings }}</span>
          <span class="tw:text-xs tw:text-secondary tw:uppercase tw:tracking-wider">
            Open Findings
          </span>
        </div>
      </div>
      <div
        class="tw:bg-white tw:border tw:border-divider tw:rounded-lg tw:p-4 tw:flex tw:items-center tw:gap-3"
      >
        <div
          class="tw:size-10 tw:rounded-lg tw:bg-emerald-100 tw:flex tw:items-center tw:justify-center tw:text-emerald-700"
        >
          <IconChartBar :size="20" />
        </div>
        <div class="tw:flex tw:flex-col">
          <span class="tw:text-2xl tw:font-bold tw:text-on-main">{{ auditsDueIn30d }}</span>
          <span class="tw:text-xs tw:text-secondary tw:uppercase tw:tracking-wider">
            Due in 30 Days
          </span>
        </div>
      </div>
    </div>

    <div class="tw:grid tw:grid-cols-1 tw:lg:grid-cols-2 tw:gap-3">
      <!-- 2. Findings by category -->
      <div class="tw:bg-white tw:border tw:border-divider tw:rounded-lg tw:p-5">
        <BaseText
          variant="overline"
          class="tw:block tw:pb-3 tw:border-b tw:border-divider tw:mb-3"
        >
          Open Findings by Category
        </BaseText>
        <div
          v-if="!findingsByCategory.length"
          class="tw:py-6 tw:text-center tw:text-sm tw:text-secondary tw:italic"
        >
          No open findings.
        </div>
        <div v-else class="tw:flex tw:flex-col tw:gap-2">
          <div v-for="row in findingsByCategory" :key="row.id" class="tw:flex tw:flex-col tw:gap-1">
            <div class="tw:flex tw:items-center tw:justify-between tw:text-xs">
              <span class="tw:text-on-main tw:font-medium tw:truncate">{{ row.name }}</span>
              <span class="tw:text-secondary tw:font-mono">{{ row.count }}</span>
            </div>
            <div class="tw:h-2 tw:bg-main-hover tw:rounded-full tw:overflow-hidden">
              <div
                class="tw:h-full tw:bg-primary tw:transition-all"
                :style="{ width: row.widthPct + '%' }"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- 3. Findings by type -->
      <div class="tw:bg-white tw:border tw:border-divider tw:rounded-lg tw:p-5">
        <BaseText
          variant="overline"
          class="tw:block tw:pb-3 tw:border-b tw:border-divider tw:mb-3"
        >
          Open Findings by Type
        </BaseText>
        <div class="tw:flex tw:flex-col tw:gap-2">
          <div v-for="row in findingsByType" :key="row.id" class="tw:flex tw:flex-col tw:gap-1">
            <div class="tw:flex tw:items-center tw:justify-between tw:text-xs">
              <span class="tw:text-on-main tw:font-medium">{{ row.name }}</span>
              <span class="tw:text-secondary tw:font-mono">{{ row.count }}</span>
            </div>
            <div class="tw:h-2 tw:bg-main-hover tw:rounded-full tw:overflow-hidden">
              <div
                class="tw:h-full tw:transition-all"
                :class="row.barClass"
                :style="{ width: row.widthPct + '%' }"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- 4. Lead auditor backlog -->
      <div class="tw:bg-white tw:border tw:border-divider tw:rounded-lg tw:p-5">
        <BaseText
          variant="overline"
          class="tw:pb-3 tw:border-b tw:border-divider tw:mb-3 tw:flex tw:items-center tw:gap-2"
        >
          <IconUsers :size="14" />
          Lead Auditor Backlog
        </BaseText>
        <div
          v-if="!leadBacklog.length"
          class="tw:py-6 tw:text-center tw:text-sm tw:text-secondary tw:italic"
        >
          No lead auditors currently assigned to in-flight audits.
        </div>
        <div v-else class="tw:flex tw:flex-col tw:gap-2">
          <div v-for="row in leadBacklog" :key="row.userId" class="tw:flex tw:flex-col tw:gap-1">
            <div class="tw:flex tw:items-center tw:justify-between tw:text-xs">
              <span class="tw:text-on-main tw:font-medium tw:truncate">{{ row.name }}</span>
              <span class="tw:text-secondary tw:font-mono">{{ row.count }}</span>
            </div>
            <div class="tw:h-2 tw:bg-main-hover tw:rounded-full tw:overflow-hidden">
              <div
                class="tw:h-full tw:bg-amber-500 tw:transition-all"
                :style="{ width: row.widthPct + '%' }"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- 5. Upcoming audits -->
      <div class="tw:bg-white tw:border tw:border-divider tw:rounded-lg tw:p-5">
        <BaseText
          variant="overline"
          class="tw:pb-3 tw:border-b tw:border-divider tw:mb-3 tw:flex tw:items-center tw:gap-2"
        >
          <IconCalendarTime :size="14" />
          Upcoming Audits
        </BaseText>
        <div
          v-if="!upcomingAudits.length"
          class="tw:py-6 tw:text-center tw:text-sm tw:text-secondary tw:italic"
        >
          Nothing scheduled.
        </div>
        <div v-else class="tw:flex tw:flex-col tw:divide-y tw:divide-divider">
          <button
            v-for="i in upcomingAudits"
            :key="i.id"
            type="button"
            class="tw:flex tw:items-center tw:justify-between tw:gap-3 tw:py-2 tw:text-left tw:bg-transparent tw:border-0 tw:cursor-pointer tw:hover:bg-main-hover/40 tw:px-1 tw:rounded"
            @click="openInstance(i)"
          >
            <div class="tw:flex tw:flex-col tw:gap-0.5 tw:min-w-0 tw:flex-1">
              <code class="tw:text-xs tw:font-mono tw:text-secondary">{{ i.auditNumber }}</code>
              <AuditStandardBadgeById v-if="i.auditStandardId" :standardId="i.auditStandardId" />
            </div>
            <div class="tw:flex tw:items-center tw:gap-2 tw:shrink-0">
              <span class="tw:text-xs">{{ i.scheduledDate?.formatDate?.('date') ?? '—' }}</span>
              <AuditInstanceStatusBadgeById :statusId="i.statusId" />
            </div>
          </button>
        </div>
      </div>
    </div>

    <!-- 6. Recent findings — full-width across the bottom -->
    <div class="tw:bg-white tw:border tw:border-divider tw:rounded-lg tw:p-5">
      <BaseText
        variant="overline"
        class="tw:pb-3 tw:border-b tw:border-divider tw:mb-3 tw:flex tw:items-center tw:gap-2"
      >
        <IconBolt :size="14" />
        Recent Findings
      </BaseText>
      <div
        v-if="!recentFindings.length"
        class="tw:py-6 tw:text-center tw:text-sm tw:text-secondary tw:italic"
      >
        No findings recorded yet.
      </div>
      <div v-else class="tw:flex tw:flex-col tw:divide-y tw:divide-divider">
        <button
          v-for="f in recentFindings"
          :key="f.id"
          type="button"
          class="tw:flex tw:items-start tw:gap-3 tw:py-2 tw:text-left tw:bg-transparent tw:border-0 tw:cursor-pointer tw:hover:bg-main-hover/40 tw:px-1 tw:rounded"
          @click="openFindingsInstance(f)"
        >
          <code class="tw:text-xs tw:font-mono tw:text-secondary tw:mt-0.5 tw:shrink-0">
            {{ f.findingNumber }}
          </code>
          <div class="tw:flex tw:flex-col tw:gap-0.5 tw:flex-1 tw:min-w-0">
            <p class="tw:text-sm tw:text-on-main tw:line-clamp-1">{{ f.description }}</p>
            <div class="tw:flex tw:items-center tw:gap-1.5 tw:flex-wrap">
              <AuditFindingTypeBadgeById :typeId="f.findingTypeId" />
              <AuditFindingStatusBadgeById :statusId="f.statusId" />
              <span class="tw:text-[11px] tw:text-secondary">
                {{ f.createdAt?.formatDate?.('date') ?? '' }}
              </span>
            </div>
          </div>
        </button>
      </div>
    </div>
  </div>
</template>
