<script setup>
/**
 * Supplier audit-findings trend card. Surfaces the supplier's open
 * audit-finding load + a recency snapshot so the buyer / quality
 * lead doesn't have to drill into the audit module to spot a
 * trouble pattern.
 *
 * Reads every AuditFinding the FE has IDB'd and filters by the
 * supplier_id column. Server-side RLS already restricted what the
 * user sees (audits:read + team-membership branch), so anything in
 * IDB is fair game.
 */
import { IconBolt } from '@tabler/icons-vue'
import { DateTime } from 'luxon'
import { getCompanyPath } from '@/utils/routeHelpers.js'

const props = defineProps({
  supplierId: { type: String, default: null },
})

const router = useRouter()

const findings = useLiveQueryWithDeps(
  [() => props.supplierId],
  async (db, [supplierId]) => {
    if (!supplierId) return []
    const rows = await db.AuditFinding.where().exec()
    return rows.filter((f) => f.supplierId === supplierId)
  },
  { initial: [] },
)

const OPEN_FINDING_STATUSES = new Set([
  'OPEN',
  'IN_REVIEW',
  'IN_REMEDIATION',
  'VERIFIED',
])

const stats = computed(() => {
  const total = findings.value.length
  const open = findings.value.filter((f) => OPEN_FINDING_STATUSES.has(f.statusId)).length
  const majorOpen = findings.value.filter(
    (f) => OPEN_FINDING_STATUSES.has(f.statusId) && f.findingTypeId === 'MAJOR_NC',
  ).length
  // "Last 12 months" — rolling window keeps the buyer's eye on
  // recent supplier performance instead of the all-time count.
  const oneYearAgo = DateTime.utc().minus({ years: 1 })
  const last12m = findings.value.filter((f) => {
    const dt = f.createdAt?.toMillis?.() ?? 0
    return dt >= oneYearAgo.toMillis()
  }).length
  return { total, open, majorOpen, last12m }
})

const recent = computed(() =>
  [...findings.value]
    .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))
    .slice(0, 5),
)

function openFindingsInstance(f) {
  router.push(getCompanyPath(`/audits/instances/${f.auditInstanceId}`))
}
</script>

<template>
  <div
    class="tw:bg-sidebar tw:rounded-xl tw:shadow-sm tw:border tw:border-divider tw:overflow-hidden tw:flex tw:flex-col"
  >
    <div
      class="tw:px-6 tw:py-4 tw:border-b tw:border-divider tw:bg-main-hover tw:flex tw:items-center tw:gap-3"
    >
      <div
        class="tw:w-10 tw:h-10 tw:rounded-lg tw:bg-red-100 tw:flex tw:items-center tw:justify-center"
      >
        <IconBolt :size="20" class="tw:text-red-600" />
      </div>
      <h3 class="tw:text-lg tw:font-bold tw:text-on-main">Audit Findings</h3>
    </div>

    <div class="tw:p-6 tw:space-y-4">
      <!-- Trend strip — three stat tiles that compress the supplier's
           audit history into one line: open right now, open Majors,
           last-12-months volume. -->
      <div class="tw:grid tw:grid-cols-3 tw:gap-3">
        <div class="tw:flex tw:flex-col tw:items-center tw:p-2 tw:rounded-lg tw:bg-main-hover">
          <span class="tw:text-2xl tw:font-bold tw:text-on-main">{{ stats.open }}</span>
          <span class="tw:text-[10px] tw:text-secondary tw:uppercase tw:tracking-wider">Open</span>
        </div>
        <div
          class="tw:flex tw:flex-col tw:items-center tw:p-2 tw:rounded-lg"
          :class="stats.majorOpen > 0 ? 'tw:bg-red-50' : 'tw:bg-main-hover'"
        >
          <span
            class="tw:text-2xl tw:font-bold"
            :class="stats.majorOpen > 0 ? 'tw:text-red-700' : 'tw:text-on-main'"
          >
            {{ stats.majorOpen }}
          </span>
          <span class="tw:text-[10px] tw:text-secondary tw:uppercase tw:tracking-wider">
            Major NC
          </span>
        </div>
        <div class="tw:flex tw:flex-col tw:items-center tw:p-2 tw:rounded-lg tw:bg-main-hover">
          <span class="tw:text-2xl tw:font-bold tw:text-on-main">{{ stats.last12m }}</span>
          <span class="tw:text-[10px] tw:text-secondary tw:uppercase tw:tracking-wider">
            Last 12 mo
          </span>
        </div>
      </div>

      <!-- Recent findings list — newest 5, click-through to the
           parent audit. Empty state when the supplier is clean. -->
      <div v-if="!recent.length" class="tw:py-4 tw:text-center tw:text-xs tw:text-secondary tw:italic">
        No audit findings on file.
      </div>
      <div v-else class="tw:flex tw:flex-col tw:divide-y tw:divide-divider">
        <button
          v-for="f in recent"
          :key="f.id"
          type="button"
          class="tw:flex tw:items-start tw:gap-2 tw:py-2 tw:text-left tw:bg-transparent tw:border-0 tw:cursor-pointer tw:hover:bg-main-hover/40 tw:rounded tw:px-1"
          @click="openFindingsInstance(f)"
        >
          <code class="tw:text-[10px] tw:font-mono tw:text-secondary tw:mt-0.5 tw:shrink-0">
            {{ f.findingNumber }}
          </code>
          <div class="tw:flex tw:flex-col tw:gap-0.5 tw:flex-1 tw:min-w-0">
            <p class="tw:text-xs tw:text-on-main tw:line-clamp-1">{{ f.description }}</p>
            <div class="tw:flex tw:items-center tw:gap-1.5 tw:flex-wrap">
              <AuditFindingTypeBadgeById :typeId="f.findingTypeId" />
              <AuditFindingStatusBadgeById :statusId="f.statusId" />
            </div>
          </div>
        </button>
      </div>
    </div>
  </div>
</template>
