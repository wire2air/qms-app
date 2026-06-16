<script setup>
import { IconPlus, IconClipboardList, IconPower, IconEdit } from '@tabler/icons-vue'
import { isAllowed } from '@/utils/currentSession.js'
import { getCompanyPath } from '@/utils/routeHelpers.js'
import { humanizeCron } from '@/utils/cronHumanize.js'

/**
 * Log Book Assignments list. SyncEngine live query; admin can toggle
 * active/inactive inline (a server-side PATCH) and routes into the
 * create / edit pages for everything else.
 *
 * Filters: by log book (form template), active state. No search on
 * name yet — the table is short enough that filters are sufficient.
 */
const router = useRouter()

const canAssign = computed(() => isAllowed(['inspections:assign']))

const filters = ref({
  logBookId: null,
  active: 'all', // 'all' | 'active' | 'inactive'
})

// Round 0: query log_books directly. Variable names preserved at the
// template binding level (logBookId, logBookById) so reading the view
// stays consistent with the rest of the I&L module.
const logBooks = useLiveQuery((db) => db.LogBook.where().exec(), {
  models: ['LogBook'],
  initial: [],
})
const assignments = useLiveQueryWithDeps(
  [() => filters.value.logBookId, () => filters.value.active],
  async (db, [logBookId, active]) => {
    let rows = await db.FormAssignment.where().exec()
    if (logBookId) rows = rows.filter((r) => r.logBookId === logBookId)
    if (active === 'active') rows = rows.filter((r) => r.active === true)
    if (active === 'inactive') rows = rows.filter((r) => r.active === false)
    return rows.sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))
  },

  { models: ['FormAssignment'], initial: [] },
)

const logBookById = computed(() => {
  const map = new Map()
  for (const lb of logBooks.value) map.set(lb.id, lb)
  return map
})

function templateLabel(id) {
  return logBookById.value.get(id)?.title ?? id
}

function scheduleSummary(plan) {
  if (!plan.schedule || typeof plan.schedule !== 'object') return '—'
  if (plan.schedule.type === 'AD_HOC') return 'Ad-hoc (no schedule)'
  return humanizeCron(plan.schedule.cron)
}

function goCreate() {
  router.push(getCompanyPath('/inspections-logs/form-assignments/create'))
}
function goEdit(id) {
  router.push(getCompanyPath(`/inspections-logs/form-assignments/${id}`))
}
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-4 tw:h-full tw:p-5">
    <PageHeader title="Log Book Assignments" />

    <SafeTeleport to="#main-header-actions">
      <BaseButton v-if="canAssign" variant="primary" @click="goCreate">
        <IconPlus :size="16" />
        New Assignment
      </BaseButton>
    </SafeTeleport>

    <!-- Page Header -->
    <div class="tw:flex tw:flex-col tw:gap-1">
      <div class="tw:text-3xl tw:font-bold tw:text-on-sidebar">Log Book Assignments</div>
      <div class="tw:text-sm tw:text-secondary">
        Plan who fills which log book, when (cron + timezone), and where (site). The scheduler
        materialises occurrences in a 24h look-ahead.
      </div>
    </div>

    <!-- Filters -->
    <div class="tw:flex tw:items-center tw:gap-3 tw:flex-wrap">
      <div class="tw:flex tw:items-center tw:gap-2">
        <span class="tw:text-xs tw:text-secondary">Log book</span>
        <select
          v-model="filters.logBookId"
          class="tw:rounded tw:border tw:border-divider tw:bg-card tw:px-2 tw:py-1 tw:text-sm"
        >
          <option :value="null">All</option>
          <option v-for="t in logBooks" :key="t.id" :value="t.id">
            {{ t.title }}
          </option>
        </select>
      </div>
      <div class="tw:flex tw:items-center tw:gap-2">
        <span class="tw:text-xs tw:text-secondary">Status</span>
        <select
          v-model="filters.active"
          class="tw:rounded tw:border tw:border-divider tw:bg-card tw:px-2 tw:py-1 tw:text-sm"
        >
          <option value="all">All</option>
          <option value="active">Active only</option>
          <option value="inactive">Inactive only</option>
        </select>
      </div>
    </div>

    <!-- Empty state -->
    <div
      v-if="assignments.length === 0"
      class="tw:flex tw:flex-col tw:items-center tw:justify-center tw:gap-3 tw:py-16 tw:text-secondary"
    >
      <IconClipboardList :size="48" class="tw:opacity-60" />
      <div class="tw:text-sm">No log book assignments yet.</div>
      <BaseButton v-if="canAssign" variant="primary" @click="goCreate">
        <IconPlus :size="16" />
        Create the first one
      </BaseButton>
    </div>

    <!-- Table -->
    <div v-else class="tw:bg-white tw:rounded-lg tw:border tw:border-divider tw:overflow-hidden">
      <table class="tw:w-full tw:text-sm">
        <thead class="tw:bg-main">
          <tr class="tw:text-left">
            <th class="tw:px-3 tw:py-2 tw:font-semibold tw:text-secondary">Log Book</th>
            <th class="tw:px-3 tw:py-2 tw:font-semibold tw:text-secondary">Schedule</th>
            <th class="tw:px-3 tw:py-2 tw:font-semibold tw:text-secondary">Assignees</th>
            <th class="tw:px-3 tw:py-2 tw:font-semibold tw:text-secondary">Grace</th>
            <th class="tw:px-3 tw:py-2 tw:font-semibold tw:text-secondary">Status</th>
            <th class="tw:px-3 tw:py-2"></th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in assignments"
            :key="row.id"
            class="tw:border-t tw:border-divider tw:hover:bg-main-hover"
          >
            <td class="tw:px-3 tw:py-2 tw:font-medium tw:text-on-main">
              {{ templateLabel(row.logBookId) }}
            </td>
            <td class="tw:px-3 tw:py-2 tw:text-on-main">
              <div>{{ scheduleSummary(row) }}</div>
              <div
                v-if="row.schedule?.type === 'RECURRING' && row.schedule?.timezone"
                class="tw:text-xs tw:text-secondary"
              >
                {{ row.schedule.timezone }}
              </div>
            </td>
            <td class="tw:px-3 tw:py-2 tw:text-on-main">
              <RoleBadgeById v-if="row.assignedRoleId" :roleId="row.assignedRoleId" />
              <div v-else-if="row.assignedUserIds?.length" class="tw:flex tw:flex-wrap tw:gap-1">
                <UserBadgeById v-for="uid in row.assignedUserIds" :key="uid" :userId="uid" />
              </div>
              <span v-else class="tw:text-secondary">—</span>
            </td>
            <td class="tw:px-3 tw:py-2 tw:text-on-main">{{ row.graceMinutes }} min</td>
            <td class="tw:px-3 tw:py-2">
              <span
                class="tw:inline-flex tw:items-center tw:gap-1 tw:text-xs tw:rounded tw:px-2 tw:py-0.5"
                :class="
                  row.active
                    ? 'tw:bg-green-100 tw:text-green-700'
                    : 'tw:bg-gray-100 tw:text-gray-700'
                "
              >
                <IconPower :size="12" />
                {{ row.active ? 'Active' : 'Inactive' }}
              </span>
            </td>
            <td class="tw:px-3 tw:py-2 tw:text-right">
              <button
                v-if="canAssign"
                class="tw:text-primary tw:text-xs tw:hover:underline tw:flex tw:items-center tw:gap-1"
                @click="goEdit(row.id)"
              >
                <IconEdit :size="14" />
                Edit
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
