<script setup>
/**
 * Annual audit schedule matrix (#2) — rows = departments (the audited area),
 * columns = the 12 months of the selected year, each cell = the audits
 * scheduled that month for that department (audit number + lead auditor),
 * clickable to open. Mirrors the classic ISO internal-audit annual plan.
 *
 * Pure read off synced AuditInstance + Department + User. Year is selectable.
 */
import { IconChevronLeft, IconChevronRight, IconCalendarTime } from '@tabler/icons-vue'
import { getCompanyPath } from '@/utils/routeHelpers.js'

const router = useRouter()
const year = ref(new Date().getFullYear())

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const instances = useLiveQuery(async (db) => db.AuditInstance.where().exec(), {
  models: ['AuditInstance'],
  initial: [],
})
const departments = useLiveQuery(async (db) => db.Department.where().exec(), {
  models: ['Department'],
  initial: [],
})

// Lead-auditor names.
const userIds = computed(() => [
  ...new Set(instances.value.map((a) => a.leadAuditorUserId).filter(Boolean)),
])
const userMap = useLiveQueryWithDeps(
  [() => userIds.value.join(',')],
  async (db, [idsStr]) => {
    const ids = idsStr ? idsStr.split(',') : []
    if (!ids.length) return {}
    const users = await Promise.all(ids.map((id) => db.User.findByPk(id)))
    const map = {}
    for (const u of users.filter(Boolean)) {
      map[u.id] = [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email || u.id
    }
    return map
  },

  { models: ['User'], initial: {} },
)
function auditorName(id) {
  return id ? (userMap.value[id] ?? '—') : '—'
}

const deptName = computed(() => {
  const m = {}
  for (const d of departments.value) m[d.id] = d.name
  return m
})

function monthIndex(d) {
  if (!d) return null
  // Luxon DateTime → .month (1-12); JS Date / ISO → getMonth (0-11).
  if (typeof d.month === 'number') return d.month - 1
  const js = d instanceof Date ? d : new Date(d)
  return Number.isNaN(js.getTime()) ? null : js.getMonth()
}
function yearOf(d) {
  if (!d) return null
  if (typeof d.year === 'number') return d.year
  const js = d instanceof Date ? d : new Date(d)
  return Number.isNaN(js.getTime()) ? null : js.getFullYear()
}

const UNASSIGNED = '__none__'

// Row grouping: supplier audits group by supplier ("Supplier: X"); internal
// audits group by department (Unassigned if none).
function rowKey(a) {
  if (a.programTypeId === 'SUPPLIER' && a.supplierId) return `supplier:${a.supplierId}`
  return a.departmentId || UNASSIGNED
}

// grid[rowKey][monthIdx] = [instances]; only scheduled audits in the year.
const grid = computed(() => {
  const g = {}
  for (const a of instances.value) {
    if (yearOf(a.scheduledDate) !== year.value) continue
    const mi = monthIndex(a.scheduledDate)
    if (mi == null) continue
    const key = rowKey(a)
    g[key] ??= {}
    ;(g[key][mi] ??= []).push(a)
  }
  return g
})

// Resolve a display label per row key (supplier name / department name).
const labelByKey = computed(() => {
  const m = {}
  for (const a of instances.value) {
    if (yearOf(a.scheduledDate) !== year.value) continue
    const key = rowKey(a)
    if (m[key]) continue
    if (key.startsWith('supplier:'))
      m[key] = `Supplier: ${a.displayMeta?.supplierName || 'Supplier'}`
    else if (key === UNASSIGNED) m[key] = 'Unassigned'
    else m[key] = deptName.value[key] || 'Department'
  }
  return m
})

// Rows = supplier/department groups with audits this year (+ Unassigned last).
const rows = computed(() => {
  const out = Object.keys(grid.value)
    .filter((k) => k !== UNASSIGNED)
    .map((k) => ({ key: k, label: labelByKey.value[k] || 'Department' }))
    .sort((a, b) => a.label.localeCompare(b.label))
  if (grid.value[UNASSIGNED]) out.push({ key: UNASSIGNED, label: 'Unassigned' })
  return out
})

const totalScheduled = computed(
  () => instances.value.filter((a) => yearOf(a.scheduledDate) === year.value).length,
)

function cellAudits(deptKey, monthIdx) {
  return grid.value[deptKey]?.[monthIdx] ?? []
}
function openAudit(a) {
  router.push(getCompanyPath(`/audits/instances/${a.id}`))
}

// Color-code each audit chip by lifecycle/due state.
function startOfToday() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}
function auditTone(a) {
  if (a.statusId === 'CANCELLED') return 'cancelled'
  if (['COMPLETED', 'CLOSED'].includes(a.statusId)) return 'done'
  if (['IN_PROGRESS', 'REVIEW'].includes(a.statusId)) return 'inflight'
  // DRAFT / SCHEDULED: past due once the scheduled date has passed unstarted.
  const due = a.scheduledDate?.toMillis ? a.scheduledDate.toMillis() : null
  if (due != null && due < startOfToday()) return 'pastdue'
  return 'scheduled'
}
const TONE_CLASS = {
  pastdue: 'tw:bg-red-50 tw:border-red-300 tw:hover:bg-red-100',
  inflight: 'tw:bg-amber-50 tw:border-amber-300 tw:hover:bg-amber-100',
  done: 'tw:bg-emerald-50 tw:border-emerald-300 tw:hover:bg-emerald-100',
  cancelled: 'tw:bg-gray-50 tw:border-gray-200 tw:opacity-60',
  scheduled: 'tw:bg-primary/5 tw:border-primary/20 tw:hover:bg-primary/10',
}
const LEGEND = [
  { tone: 'scheduled', label: 'Scheduled', dot: 'tw:bg-primary/40' },
  { tone: 'inflight', label: 'In Flight', dot: 'tw:bg-amber-400' },
  { tone: 'pastdue', label: 'Past Due', dot: 'tw:bg-red-400' },
  { tone: 'done', label: 'Completed', dot: 'tw:bg-emerald-400' },
]
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-3">
    <!-- Year nav -->
    <div class="tw:flex tw:items-center tw:justify-between">
      <div class="tw:flex tw:items-center tw:gap-2">
        <IconCalendarTime :size="18" class="tw:text-primary" />
        <span class="tw:text-sm tw:font-semibold tw:text-on-sidebar">Annual Audit Schedule</span>
        <span class="tw:text-xs tw:text-secondary"
          >{{ totalScheduled }} scheduled in {{ year }}</span
        >
      </div>
      <div class="tw:flex tw:items-center tw:gap-1">
        <button
          type="button"
          class="tw:p-1.5 tw:rounded tw:text-secondary tw:hover:bg-main-hover tw:cursor-pointer tw:bg-transparent tw:border-0"
          @click="year -= 1"
        >
          <IconChevronLeft :size="18" />
        </button>
        <span class="tw:text-sm tw:font-bold tw:w-12 tw:text-center">{{ year }}</span>
        <button
          type="button"
          class="tw:p-1.5 tw:rounded tw:text-secondary tw:hover:bg-main-hover tw:cursor-pointer tw:bg-transparent tw:border-0"
          @click="year += 1"
        >
          <IconChevronRight :size="18" />
        </button>
      </div>
    </div>

    <!-- Legend -->
    <div class="tw:flex tw:items-center tw:gap-4 tw:flex-wrap">
      <div v-for="l in LEGEND" :key="l.tone" class="tw:flex tw:items-center tw:gap-1.5">
        <span class="tw:size-2.5 tw:rounded-full" :class="l.dot"></span>
        <span class="tw:text-caption tw:text-secondary">{{ l.label }}</span>
      </div>
    </div>

    <div class="tw:overflow-x-auto tw:border tw:border-divider tw:rounded-lg">
      <table class="tw:w-full tw:border-collapse tw:text-xs">
        <thead>
          <tr class="tw:bg-main-hover/40">
            <th
              class="tw:sticky tw:left-0 tw:bg-main-hover/40 tw:text-left tw:px-3 tw:py-2 tw:font-semibold tw:text-secondary tw:border-b tw:border-divider tw:min-w-44"
            >
              Area / Department
            </th>
            <th
              v-for="m in MONTHS"
              :key="m"
              class="tw:px-2 tw:py-2 tw:text-center tw:font-semibold tw:text-secondary tw:border-b tw:border-l tw:border-divider"
            >
              {{ m }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="!rows.length">
            <td :colspan="13" class="tw:px-3 tw:py-8 tw:text-center tw:text-secondary tw:italic">
              No audits scheduled in {{ year }}.
            </td>
          </tr>
          <tr v-for="row in rows" :key="row.key" class="tw:border-b tw:border-divider">
            <td
              class="tw:sticky tw:left-0 tw:bg-white tw:px-3 tw:py-2 tw:font-medium tw:text-on-main tw:border-r tw:border-divider"
            >
              {{ row.label }}
            </td>
            <td
              v-for="(m, mi) in MONTHS"
              :key="mi"
              class="tw:px-1.5 tw:py-1.5 tw:align-top tw:border-l tw:border-divider"
            >
              <div class="tw:flex tw:flex-col tw:gap-1">
                <button
                  v-for="a in cellAudits(row.key, mi)"
                  :key="a.id"
                  type="button"
                  class="tw:text-left tw:rounded tw:border tw:px-1.5 tw:py-1 tw:cursor-pointer"
                  :class="TONE_CLASS[auditTone(a)]"
                  :title="`${a.auditNumber || 'Audit'}${a.displayMeta?.standardName ? ' · ' + a.displayMeta.standardName : ''} — ${auditorName(a.leadAuditorUserId)} (${a.statusId})`"
                  @click="openAudit(a)"
                >
                  <div
                    class="tw:font-mono tw:font-semibold tw:text-on-main tw:text-micro tw:truncate"
                  >
                    {{ a.auditNumber || 'Audit' }}
                  </div>
                  <div
                    v-if="a.displayMeta?.standardName"
                    class="tw:text-micro tw:font-medium tw:text-on-main tw:truncate"
                  >
                    {{ a.displayMeta.standardName }}
                  </div>
                  <div class="tw:text-micro tw:text-secondary tw:truncate">
                    {{ auditorName(a.leadAuditorUserId) }}
                  </div>
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
