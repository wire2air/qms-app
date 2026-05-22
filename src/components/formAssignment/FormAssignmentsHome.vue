<script setup>
import { IconPlus, IconClipboardList, IconPower, IconEdit } from '@tabler/icons-vue'
import { isAllowed } from '@/utils/currentSession.js'
import { getCompanyPath } from '@/utils/routeHelpers.js'

/**
 * Form Assignment plans list. SyncEngine live query; admin can toggle
 * active/inactive inline (a server-side PATCH) and routes into the
 * create / edit pages for everything else.
 *
 * Filters: by form template, active state. No search on name yet — the
 * table is short enough that filters are sufficient.
 */
const router = useRouter()

const canAssign = computed(() => isAllowed(['inspections:assign']))

const filters = ref({
  formTemplateId: null,
  active: 'all', // 'all' | 'active' | 'inactive'
})

const formTemplates = useLiveQuery((db) => db.FormTemplate.where().exec(), { initial: [] })
const assignments = useLiveQueryWithDeps(
  [() => filters.value.formTemplateId, () => filters.value.active],
  async (db, [formTemplateId, active]) => {
    let rows = await db.FormAssignment.where().exec()
    if (formTemplateId) rows = rows.filter((r) => r.formTemplateId === formTemplateId)
    if (active === 'active') rows = rows.filter((r) => r.active === true)
    if (active === 'inactive') rows = rows.filter((r) => r.active === false)
    return rows.sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))
  },
  { initial: [] },
)

const templateById = computed(() => {
  const map = new Map()
  for (const t of formTemplates.value) map.set(t.id, t)
  return map
})

function templateLabel(id) {
  return templateById.value.get(id)?.title ?? id
}

function scheduleSummary(plan) {
  if (!plan.schedule || typeof plan.schedule !== 'object') return '—'
  if (plan.schedule.type === 'AD_HOC') return 'Ad-hoc (no schedule)'
  const tz = plan.schedule.timezone ? ` (${plan.schedule.timezone})` : ''
  return `${plan.schedule.cron ?? '—'}${tz}`
}

function assigneeSummary(plan) {
  if (plan.assignedRoleId) return `Role: ${plan.assignedRoleId}`
  const count = Array.isArray(plan.assignedUserIds) ? plan.assignedUserIds.length : 0
  return count === 1 ? '1 user' : count > 1 ? `${count} users` : '—'
}

function fmtDate(dt) {
  if (!dt) return '—'
  if (dt.toFormat) return dt.toFormat('LLL d, yyyy')
  return new Date(dt).toLocaleDateString()
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
    <SafeTeleport to="#main-header-title">
      <div class="tw:flex tw:items-center tw:gap-2 tw:text-on-sidebar">
        <h2 class="tw:text-lg tw:font-bold tw:tracking-tight tw:text-nowrap">Form Assignments</h2>
      </div>
    </SafeTeleport>

    <SafeTeleport to="#main-header-actions">
      <BaseButton v-if="canAssign" variant="primary" @click="goCreate">
        <IconPlus :size="16" />
        New Assignment Plan
      </BaseButton>
    </SafeTeleport>

    <!-- Page Header -->
    <div class="tw:flex tw:flex-col tw:gap-1">
      <div class="tw:text-3xl tw:font-bold tw:text-on-sidebar">Form Assignments</div>
      <div class="tw:text-sm tw:text-secondary">
        Plan who fills which form, when (cron + timezone), and where (site). The scheduler
        materialises occurrences in a 24h look-ahead.
      </div>
    </div>

    <!-- Filters -->
    <div class="tw:flex tw:items-center tw:gap-3 tw:flex-wrap">
      <div class="tw:flex tw:items-center tw:gap-2">
        <span class="tw:text-xs tw:text-secondary">Form template</span>
        <select
          v-model="filters.formTemplateId"
          class="tw:rounded tw:border tw:border-divider tw:bg-card tw:px-2 tw:py-1 tw:text-sm"
        >
          <option :value="null">All</option>
          <option v-for="t in formTemplates" :key="t.id" :value="t.id">
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
      <div class="tw:text-sm">No assignment plans yet.</div>
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
            <th class="tw:px-3 tw:py-2 tw:font-semibold tw:text-secondary">Name</th>
            <th class="tw:px-3 tw:py-2 tw:font-semibold tw:text-secondary">Form</th>
            <th class="tw:px-3 tw:py-2 tw:font-semibold tw:text-secondary">Schedule</th>
            <th class="tw:px-3 tw:py-2 tw:font-semibold tw:text-secondary">Assignees</th>
            <th class="tw:px-3 tw:py-2 tw:font-semibold tw:text-secondary">Grace</th>
            <th class="tw:px-3 tw:py-2 tw:font-semibold tw:text-secondary">Effective</th>
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
            <td class="tw:px-3 tw:py-2">
              <div class="tw:font-medium tw:text-on-main">{{ row.name }}</div>
              <div v-if="row.description" class="tw:text-xs tw:text-secondary tw:truncate">
                {{ row.description }}
              </div>
            </td>
            <td class="tw:px-3 tw:py-2 tw:text-on-main">{{ templateLabel(row.formTemplateId) }}</td>
            <td class="tw:px-3 tw:py-2 tw:font-mono tw:text-xs tw:text-on-main">
              {{ scheduleSummary(row) }}
            </td>
            <td class="tw:px-3 tw:py-2 tw:text-on-main">{{ assigneeSummary(row) }}</td>
            <td class="tw:px-3 tw:py-2 tw:text-on-main">{{ row.graceMinutes }} min</td>
            <td class="tw:px-3 tw:py-2 tw:text-xs tw:text-secondary">
              {{ fmtDate(row.effectiveAt) }}
              <span v-if="row.effectiveUntil">→ {{ fmtDate(row.effectiveUntil) }}</span>
            </td>
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
