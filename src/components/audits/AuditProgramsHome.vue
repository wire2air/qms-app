<script setup>
/**
 * Audit Programs list. Mirrors AuditStandardsHome: a top search +
 * create button, then a table of programs with click-through to the
 * detail page. Programs are recurring schedule definitions; the daily
 * generator (Phase B-5) reads active programs whose next_due_date is
 * today-or-earlier and mints an AuditInstance off each.
 */
import { IconCalendarTime, IconPlus } from '@tabler/icons-vue'
import { isAllowed } from '@/utils/currentSession.js'
import { getCompanyPath } from '@/utils/routeHelpers.js'

const router = useRouter()

const canRead = computed(() => isAllowed(['auditPrograms:read']))
const canCreate = computed(() => isAllowed(['auditPrograms:create']))

const showCreateDialog = ref(false)
function openDetail(row) {
  router.push(getCompanyPath(`/audits/programs/${row.id}`))
}

const search = ref('')

const programs = useLiveQueryWithDeps(
  [() => search.value],
  async (db, [q]) => {
    const results = await db.AuditProgram.where().exec()
    const sorted = results.sort(
      (a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0),
    )
    if (!q) return sorted
    const lower = q.toLowerCase()
    return sorted.filter((p) => (p.name || '').toLowerCase().includes(lower))
  },

  { models: ['AuditProgram'], initial: [] },
)

const FREQUENCY_LABELS = {
  ONE_TIME: 'One-Time',
  MONTHLY: 'Monthly',
  QUARTERLY: 'Quarterly',
  SEMI_ANNUAL: 'Semi-Annual',
  ANNUAL: 'Annual',
  EVERY_X_DAYS: 'Every X Days',
  CUSTOM_RECURRENCE: 'Custom',
}
const TYPE_LABELS = {
  INTERNAL: 'Internal',
  EXTERNAL: 'External',
  SUPPLIER: 'Supplier',
}

function typeBadgeClass(typeId) {
  switch (typeId) {
    case 'INTERNAL':
      return 'tw:bg-blue-100 tw:text-blue-700'
    case 'EXTERNAL':
      return 'tw:bg-purple-100 tw:text-purple-700'
    case 'SUPPLIER':
      return 'tw:bg-amber-100 tw:text-amber-700'
    default:
      return 'tw:bg-gray-100 tw:text-gray-700'
  }
}
</script>

<template>
  <div v-if="!canRead" class="tw:py-12 tw:text-center tw:text-secondary">
    You don't have permission to view audit programs.
  </div>
  <div v-else class="tw:flex tw:flex-col tw:gap-3">
    <div class="tw:flex tw:items-center tw:justify-between tw:gap-3">
      <div class="tw:flex tw:items-center tw:gap-3">
        <BaseTextInput v-model="search" placeholder="Search programs..." class="tw:w-72" />
        <div class="tw:text-xs tw:text-secondary">
          {{ programs.length }} program{{ programs.length === 1 ? '' : 's' }}
        </div>
      </div>
      <BaseButton v-if="canCreate" variant="primary" size="sm" @click="showCreateDialog = true">
        <template #icon><IconPlus :size="16" /></template>
        New Program
      </BaseButton>
    </div>

    <div
      v-if="!programs.length"
      class="tw:flex tw:flex-col tw:items-center tw:gap-2 tw:py-16 tw:text-secondary"
    >
      <IconCalendarTime :size="40" class="tw:opacity-50" />
      <div class="tw:text-base tw:font-semibold">No programs yet</div>
      <div class="tw:text-sm tw:text-center tw:max-w-md">
        A program defines a recurring schedule. The daily worker mints an Audit whenever the program
        hits its frequency window.
      </div>
    </div>

    <div v-else class="tw:bg-white tw:border tw:border-divider tw:rounded-lg tw:overflow-hidden">
      <table class="tw:w-full tw:text-sm">
        <thead>
          <tr
            class="tw:text-left tw:text-xs tw:font-bold tw:text-secondary tw:uppercase tw:tracking-wider tw:border-b tw:border-divider tw:bg-main-hover"
          >
            <th class="tw:px-4 tw:py-3">Name</th>
            <th class="tw:px-4 tw:py-3">Type</th>
            <th class="tw:px-4 tw:py-3">Frequency</th>
            <th class="tw:px-4 tw:py-3">Standard</th>
            <th class="tw:px-4 tw:py-3">Next Due</th>
            <th class="tw:px-4 tw:py-3">Active</th>
          </tr>
        </thead>
        <tbody>
          <BaseClickableRow
            v-for="row in programs"
            :key="row.id"
            tag="tr"
            class="tw:border-b tw:border-divider tw:hover:bg-main-hover/40"
            :aria-label="`Open program ${row.name}`"
            @click="openDetail(row)"
          >
            <td class="tw:px-4 tw:py-3 tw:font-medium tw:text-on-sidebar">
              {{ row.name }}
              <div
                v-if="row.description"
                class="tw:text-xs tw:text-secondary tw:font-normal tw:mt-0.5 tw:truncate tw:max-w-md"
              >
                {{ row.description }}
              </div>
            </td>
            <td class="tw:px-4 tw:py-3">
              <span
                class="tw:text-[10px] tw:font-semibold tw:uppercase tw:tracking-wide tw:rounded tw:px-2 tw:py-0.5"
                :class="typeBadgeClass(row.programTypeId)"
              >
                {{ TYPE_LABELS[row.programTypeId] || row.programTypeId }}
              </span>
            </td>
            <td class="tw:px-4 tw:py-3 tw:text-xs">
              {{ FREQUENCY_LABELS[row.frequencyId] || row.frequencyId }}
              <span
                v-if="row.frequencyId === 'EVERY_X_DAYS' && row.daysInterval"
                class="tw:text-secondary"
              >
                ({{ row.daysInterval }}d)
              </span>
            </td>
            <td class="tw:px-4 tw:py-3">
              <AuditStandardBadgeById
                v-if="row.auditStandardId"
                :standardId="row.auditStandardId"
              />
              <span v-else class="tw:text-xs tw:text-secondary">—</span>
            </td>
            <td class="tw:px-4 tw:py-3 tw:text-xs">
              {{ row.nextDueDate ? row.nextDueDate.formatDate('date') : '—' }}
            </td>
            <td class="tw:px-4 tw:py-3">
              <span
                class="tw:text-[10px] tw:font-semibold tw:uppercase tw:tracking-wide tw:rounded tw:px-2 tw:py-0.5"
                :class="
                  row.active
                    ? 'tw:bg-emerald-100 tw:text-emerald-700'
                    : 'tw:bg-gray-100 tw:text-gray-600'
                "
              >
                {{ row.active ? 'Active' : 'Paused' }}
              </span>
            </td>
          </BaseClickableRow>
        </tbody>
      </table>
    </div>

    <AuditProgramCreateDialog v-model="showCreateDialog" />
  </div>
</template>
