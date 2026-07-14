<script setup>
/**
 * Audit Programs list. Mirrors AuditStandardsHome: a create button +
 * table of programs with click-through to the detail page. Programs are
 * recurring schedule definitions; the daily generator (Phase B-5) reads
 * active programs whose next_due_date is today-or-earlier and mints an
 * AuditInstance off each. Rendered via the shared DataTable — search,
 * advanced filter, density, column manager and export live in the table
 * toolbar.
 */
import { IconPlus } from '@tabler/icons-vue'
import { isAllowed } from '@/utils/currentSession.js'
import { getCompanyPath } from '@/utils/routeHelpers.js'

const canRead = computed(() => isAllowed(['audit_programs:read']))
const canCreate = computed(() => isAllowed(['audit_programs:create']))

const showCreateDialog = ref(false)

const programs = useLiveQuery(
  async (db) => {
    const results = await db.AuditProgram.where().exec()
    return results.sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))
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
const FREQUENCY_OPTIONS = Object.entries(FREQUENCY_LABELS).map(([value, label]) => ({ value, label }))

const TYPE_LABELS = {
  INTERNAL: 'Internal',
  EXTERNAL: 'External',
  SUPPLIER: 'Supplier',
}
const TYPE_OPTIONS = Object.entries(TYPE_LABELS).map(([value, label]) => ({ value, label }))

const ACTIVE_OPTIONS = [
  { value: true, label: 'Active' },
  { value: false, label: 'Paused' },
]

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

const columns = [
  { name: 'name', label: 'Name', field: 'name', align: 'left', sortable: true },
  {
    name: 'type',
    label: 'Type',
    field: 'programTypeId',
    align: 'left',
    filterType: 'select',
    filterOptions: TYPE_OPTIONS,
  },
  {
    name: 'frequency',
    label: 'Frequency',
    field: 'frequencyId',
    align: 'left',
    filterType: 'select',
    filterOptions: FREQUENCY_OPTIONS,
  },
  { name: 'standard', label: 'Standard', field: 'auditStandardId', align: 'left' },
  {
    name: 'nextDue',
    label: 'Next Due',
    field: 'nextDueDate',
    align: 'left',
    sortable: true,
    filterType: 'date',
  },
  {
    name: 'active',
    label: 'Active',
    field: 'active',
    align: 'left',
    filterType: 'select',
    filterOptions: ACTIVE_OPTIONS,
  },
]
</script>

<template>
  <div v-if="!canRead" class="tw:py-12 tw:text-center tw:text-secondary">
    You don't have permission to view audit programs.
  </div>
  <DataTable
    v-else
    :rows="programs"
    :columns="columns"
    rowKey="id"
    :mobileCards="false"
    searchable
    filterable
    densitySelector
    columnManager
    exportManager
    exportFilename="audit-programs.csv"
    persistKey="audits:programs"
    noDataLabel="No programs yet. A program defines a recurring schedule — the daily worker mints an Audit whenever the program hits its frequency window."
  >
    <template #toolbar-left>
      <span class="tw:text-sm tw:text-secondary">
        {{ programs.length }} program{{ programs.length === 1 ? '' : 's' }}
      </span>
      <BaseButton v-if="canCreate" variant="primary" size="sm" @click="showCreateDialog = true">
        <template #icon><IconPlus :size="16" /></template>
        New Program
      </BaseButton>
    </template>

    <template #body-cell-name="{ row }">
      <RouterLink
        :to="getCompanyPath(`/audits/programs/${row.id}`)"
        class="tw:font-medium tw:text-on-main tw:hover:text-primary"
      >
        {{ row.name }}
      </RouterLink>
      <div
        v-if="row.description"
        class="tw:text-xs tw:text-secondary tw:font-normal tw:mt-0.5 tw:truncate tw:max-w-md"
      >
        {{ row.description }}
      </div>
    </template>

    <template #body-cell-type="{ row }">
      <span
        class="tw:text-micro tw:font-semibold tw:uppercase tw:tracking-wide tw:rounded tw:px-2 tw:py-0.5"
        :class="typeBadgeClass(row.programTypeId)"
      >
        {{ TYPE_LABELS[row.programTypeId] || row.programTypeId }}
      </span>
    </template>

    <template #body-cell-frequency="{ row }">
      <span class="tw:text-xs">
        {{ FREQUENCY_LABELS[row.frequencyId] || row.frequencyId }}
        <span v-if="row.frequencyId === 'EVERY_X_DAYS' && row.daysInterval" class="tw:text-secondary">
          ({{ row.daysInterval }}d)
        </span>
      </span>
    </template>

    <template #body-cell-standard="{ row }">
      <AuditStandardBadgeById v-if="row.auditStandardId" :standardId="row.auditStandardId" />
      <span v-else class="tw:text-xs tw:text-secondary">—</span>
    </template>

    <template #body-cell-nextDue="{ row }">
      <span class="tw:text-xs">{{ row.nextDueDate ? row.nextDueDate.formatDate('date') : '—' }}</span>
    </template>

    <template #body-cell-active="{ row }">
      <span
        class="tw:text-micro tw:font-semibold tw:uppercase tw:tracking-wide tw:rounded tw:px-2 tw:py-0.5"
        :class="
          row.active ? 'tw:bg-emerald-100 tw:text-emerald-700' : 'tw:bg-gray-100 tw:text-gray-600'
        "
      >
        {{ row.active ? 'Active' : 'Paused' }}
      </span>
    </template>
  </DataTable>

  <AuditProgramCreateDialog v-model="showCreateDialog" />
</template>
