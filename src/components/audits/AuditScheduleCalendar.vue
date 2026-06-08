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

const instances = useLiveQuery(async (db) => db.AuditInstance.where().exec(), { initial: [] })
const departments = useLiveQuery(async (db) => db.Department.where().exec(), { initial: [] })

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
  { initial: {} },
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

// grid[deptKey][monthIdx] = [instances]; only scheduled audits in the year.
const grid = computed(() => {
  const g = {}
  for (const a of instances.value) {
    if (yearOf(a.scheduledDate) !== year.value) continue
    const mi = monthIndex(a.scheduledDate)
    if (mi == null) continue
    const key = a.departmentId || UNASSIGNED
    g[key] ??= {}
    ;(g[key][mi] ??= []).push(a)
  }
  return g
})

// Rows = departments that have at least one audit this year (+ Unassigned).
const rows = computed(() => {
  const keys = Object.keys(grid.value)
  const out = keys
    .filter((k) => k !== UNASSIGNED)
    .map((k) => ({ key: k, label: deptName.value[k] || 'Department' }))
    .sort((a, b) => a.label.localeCompare(b.label))
  if (grid.value[UNASSIGNED]) out.push({ key: UNASSIGNED, label: 'Unassigned' })
  return out
})

const totalScheduled = computed(() =>
  instances.value.filter((a) => yearOf(a.scheduledDate) === year.value).length,
)

function cellAudits(deptKey, monthIdx) {
  return grid.value[deptKey]?.[monthIdx] ?? []
}
function openAudit(a) {
  router.push(getCompanyPath(`/audits/instances/${a.id}`))
}
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-3">
    <!-- Year nav -->
    <div class="tw:flex tw:items-center tw:justify-between">
      <div class="tw:flex tw:items-center tw:gap-2">
        <IconCalendarTime :size="18" class="tw:text-primary" />
        <span class="tw:text-sm tw:font-semibold tw:text-on-sidebar">Annual Audit Schedule</span>
        <span class="tw:text-xs tw:text-secondary">{{ totalScheduled }} scheduled in {{ year }}</span>
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

    <div class="tw:overflow-x-auto tw:border tw:border-divider tw:rounded-lg">
      <table class="tw:w-full tw:border-collapse tw:text-xs">
        <thead>
          <tr class="tw:bg-main-hover/40">
            <th class="tw:sticky tw:left-0 tw:bg-main-hover/40 tw:text-left tw:px-3 tw:py-2 tw:font-semibold tw:text-secondary tw:border-b tw:border-divider tw:min-w-44">
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
            <td class="tw:sticky tw:left-0 tw:bg-white tw:px-3 tw:py-2 tw:font-medium tw:text-on-main tw:border-r tw:border-divider">
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
                  class="tw:text-left tw:rounded tw:bg-primary/5 tw:border tw:border-primary/20 tw:px-1.5 tw:py-1 tw:cursor-pointer tw:hover:bg-primary/10 tw:border-0"
                  :title="`${a.auditNumber || 'Audit'}${a.displayMeta?.standardName ? ' · ' + a.displayMeta.standardName : ''} — ${auditorName(a.leadAuditorUserId)} (${a.statusId})`"
                  @click="openAudit(a)"
                >
                  <div class="tw:font-mono tw:font-semibold tw:text-primary tw:text-[10px] tw:truncate">
                    {{ a.auditNumber || 'Audit' }}
                  </div>
                  <div v-if="a.displayMeta?.standardName" class="tw:text-[10px] tw:font-medium tw:text-on-main tw:truncate">
                    {{ a.displayMeta.standardName }}
                  </div>
                  <div class="tw:text-[10px] tw:text-secondary tw:truncate">
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
