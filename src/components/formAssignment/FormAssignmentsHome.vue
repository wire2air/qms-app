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
 * Rendered via the shared DataTable — search, advanced filter (log book +
 * active state), density, column manager and export all live in the table
 * toolbar. The empty state is the table's own.
 */
const router = useRouter()

const canAssign = computed(() => isAllowed(['inspections:assign']))

const logBooks = useLiveQuery((db) => db.LogBook.where().exec(), {
  models: ['LogBook'],
  initial: [],
})
const assignments = useLiveQuery(
  async (db) => {
    const rows = await db.FormAssignment.where().exec()
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

const logBookOptions = computed(() =>
  logBooks.value.map((lb) => ({ value: lb.id, label: lb.title })),
)
const ACTIVE_OPTIONS = [
  { value: true, label: 'Active' },
  { value: false, label: 'Inactive' },
]

const columns = computed(() => [
  {
    name: 'logBook',
    label: 'Log Book',
    field: 'logBookId',
    align: 'left',
    sortable: true,
    filterType: 'select',
    filterOptions: logBookOptions.value,
  },
  { name: 'schedule', label: 'Schedule', field: scheduleSummary, align: 'left' },
  { name: 'assignees', label: 'Assignees', field: 'assignedRoleId', align: 'left', filterType: false },
  { name: 'grace', label: 'Grace', field: 'graceMinutes', align: 'right', filterType: 'number' },
  {
    name: 'active',
    label: 'Status',
    field: 'active',
    align: 'left',
    filterType: 'select',
    filterOptions: ACTIVE_OPTIONS,
  },
  { name: 'actions', label: '', field: 'actions', align: 'right', filterType: false },
])

function goCreate() {
  router.push(getCompanyPath('/inspections-logs/form-assignments/create'))
}
function goEdit(id) {
  router.push(getCompanyPath(`/inspections-logs/form-assignments/${id}`))
}
</script>

<template>
  <BasePage width="standard">
    <PageHeader
      :icon="IconClipboardList"
      title="Log Book Assignments"
      subtitle="Plan who fills which log book, when (cron + timezone), and where (site). The scheduler materialises occurrences in a 24h look-ahead."
    >
      <template #actions>
        <BaseButton v-if="canAssign" variant="primary" @click="goCreate">
          <IconPlus :size="16" />
          New Assignment
        </BaseButton>
      </template>
    </PageHeader>

    <DataTable
      :rows="assignments"
      :columns="columns"
      rowKey="id"
      :mobileCards="false"
      searchable
      filterable
      densitySelector
      columnManager
      exportManager
      exportFilename="log-book-assignments.csv"
      persistKey="formAssignment:list"
      noDataLabel="No log book assignments yet."
      noResultsLabel="No log book assignments match your filters."
    >
      <template #toolbar-left>
        <span class="tw:text-sm tw:text-secondary">{{ assignments.length }} assignment(s)</span>
      </template>

      <template #body-cell-logBook="{ row }">
        <span class="tw:font-medium tw:text-on-main">{{ templateLabel(row.logBookId) }}</span>
      </template>

      <template #body-cell-schedule="{ row }">
        <div>{{ scheduleSummary(row) }}</div>
        <div
          v-if="row.schedule?.type === 'RECURRING' && row.schedule?.timezone"
          class="tw:text-xs tw:text-secondary"
        >
          {{ row.schedule.timezone }}
        </div>
      </template>

      <template #body-cell-assignees="{ row }">
        <RoleBadgeById v-if="row.assignedRoleId" :roleId="row.assignedRoleId" />
        <div v-else-if="row.assignedUserIds?.length" class="tw:flex tw:flex-wrap tw:gap-1">
          <UserBadgeById v-for="uid in row.assignedUserIds" :key="uid" :userId="uid" />
        </div>
        <span v-else class="tw:text-secondary">—</span>
      </template>

      <template #body-cell-grace="{ row }">
        <span>{{ row.graceMinutes }} min</span>
      </template>

      <template #body-cell-active="{ row }">
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
      </template>

      <template #body-cell-actions="{ row }">
        <button
          v-if="canAssign"
          class="tw:text-primary tw:text-xs tw:hover:underline tw:flex tw:items-center tw:gap-1 tw:ml-auto"
          @click="goEdit(row.id)"
        >
          <IconEdit :size="14" />
          Edit
        </button>
      </template>
    </DataTable>
  </BasePage>
</template>
