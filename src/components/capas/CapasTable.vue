<script setup>
import {
  IconEdit,
  IconTrash,
  IconCircleDot,
  IconAlertTriangle,
  IconTag,
  IconBuildingFactory2,
  IconCalendar,
  IconTargetArrow,
} from '@tabler/icons-vue'
import { getCompanyPath } from '@/utils/routeHelpers'
import { EFFECTIVENESS_FILTER_OPTIONS } from '@/composables/useEffectivenessRollup.js'

const props = defineProps({
  rows: { type: Array, default: () => [] },
  canUpdate: { type: Boolean, default: false },
  canDelete: { type: Boolean, default: false },
  // Copy for the in-card empty state (the page's filters produced no rows).
  // The table stays mounted when empty so its filter controls remain reachable.
  emptyLabel: { type: String, default: null },
})

const emit = defineEmits(['delete', 'edit'])

// Quick views, rendered in the table toolbar's #tabs slot.
const activeFilter = defineModel('activeFilter', { type: String, default: 'all_open' })
// Query-level filters (applied upstream in CapasHome, before the rows reach this
// table) — the cascading menu lives in the toolbar's #toolbar-filters slot,
// beside DataTable's own column-filter trigger.
const filters = defineModel('filters', { type: Object, default: () => ({}) })

const filterPills = [
  // 'All' means no lifecycle filter at all — closed and cancelled records
  // included. Every other pill narrows to some subset of open, so without
  // this there was no way to see the whole register in one list.
  { value: 'all', label: 'All' },
  { value: 'all_open', label: 'All open' },
  { value: 'mine', label: 'My CAPAs' },
  { value: 'critical', label: 'Critical' },
  { value: 'high', label: 'High' },
  { value: 'closed', label: 'Closed' },
  { value: 'cancelled', label: 'Cancelled' },
]

// The menu is bound to ONLY its own groups: BaseFilterMenu's count badge counts
// every non-empty value in the object it's given, so handing it the whole filter
// bag made it report the quick view (`activeFilter`) as an active filter.
const MENU_GROUPS = ['statusId', 'priorityId', 'typeId', 'supplierId', 'createdAt', 'effectiveness']
const menuFilters = computed(() =>
  Object.fromEntries(MENU_GROUPS.map((k) => [k, filters.value?.[k] ?? null])),
)
function onMenuFilters(next) {
  filters.value = { ...filters.value, ...next }
}

const priorityDotClass = {
  CRITICAL: 'tw:bg-red-500',
  HIGH: 'tw:bg-amber-500',
  MEDIUM: 'tw:bg-blue-500',
  LOW: 'tw:bg-green-500',
}

// Option sources, shared by the filter menu and the advanced filter's
// entity-column dropdowns (ordered so both read in the configured order).
const capaPriorities = useLiveQuery(
  (db) => db.CapaPriority.where().orderBy('displayOrder').exec(),
  {
    models: ['CapaPriority'],
    initial: [],
  },
)
const capaStatuses = useLiveQuery((db) => db.CapaStatus.where().orderBy('displayOrder').exec(), {
  models: ['CapaStatus'],
  initial: [],
})
const capaTypes = useLiveQuery((db) => db.CapaType.where().orderBy('displayOrder').exec(), {
  models: ['CapaType'],
  initial: [],
})
const suppliers = useLiveQuery((db) => db.Supplier.where('statusId', 'APPROVED').exec(), {
  models: ['Supplier'],
  initial: [],
})
// Effectiveness check, from the real capa_effectiveness_checks rows.
//
// This column used to read `capa.effectivenessCheck?.status` — a JSONB column
// on the CAPA row that nothing has ever written (0 of 50 rows populated). So
// the column showed "—" for every CAPA, including closed ones with a check
// scheduled and visible on the detail page (reported 2026-08-18). The checks
// live in their own table; that is what this reads.
//
// One CAPA can have several checks over time (a failed check is renewed into a
// new one). The open check is the interesting one; once they are all finished
// the most recent tells you the outcome.
const OPEN_EC_STATUSES = ['PENDING', 'IN_PROGRESS']

const checksByCapaId = useLiveQueryWithDeps(
  [() => props.rows.map((r) => r.id).join(',')],
  async (db, [idsStr]) => {
    if (!idsStr) return {}
    const ids = idsStr.split(',')
    const lists = await Promise.all(
      ids.map((id) => db.CapaEffectivenessCheck.where('capaId', id).exec()),
    )
    const out = {}
    ids.forEach((id, i) => {
      const checks = lists[i] ?? []
      if (!checks.length) return
      const open = checks.find((c) => OPEN_EC_STATUSES.includes(c.statusId))
      const latest = checks
        .slice()
        .sort((a, b) => (b.dueAt?.toMillis?.() ?? 0) - (a.dueAt?.toMillis?.() ?? 0))[0]
      out[id] = open ?? latest
    })
    return out
  },
  { models: ['CapaEffectivenessCheck'], initial: {} },
)

// The SECOND implementation: CAPAs on a template with an Effectiveness Check
// DELAY step carry the check as a workflow step, not a CapaEffectivenessCheck
// row (see the guard in closeCapa). Both populations exist while the transition
// runs, so the column reads both and this is the join for the step-based one:
// Capa → WorkflowInstance → its DELAY step.
const delayStepByCapaId = useLiveQueryWithDeps(
  [() => props.rows.map((r) => r.id).join(',')],
  async (db, [idsStr]) => {
    if (!idsStr) return {}
    const ids = idsStr.split(',')
    const instanceLists = await Promise.all(
      ids.map((id) => db.WorkflowInstance.where('[resourceType+resourceId]', ['Capa', id]).exec()),
    )
    const out = {}
    await Promise.all(
      ids.map(async (id, i) => {
        const instances = instanceLists[i] ?? []
        if (!instances.length) return
        const stepLists = await Promise.all(
          instances.map((inst) =>
            db.WorkflowInstanceStep.where('workflowInstanceId', inst.id).exec(),
          ),
        )
        const delays = stepLists.flat().filter((s) => s.stepType === 'DELAY')
        if (!delays.length) return
        // Prefer one still running; otherwise the last one, which holds the verdict.
        const live = delays.find((s) => !TERMINAL_STEP_STATUSES.includes(s.statusId))
        out[id] = live ?? delays[delays.length - 1]
      }),
    )
    return out
  },
  { models: ['WorkflowInstance', 'WorkflowInstanceStep'], initial: {} },
)

const TERMINAL_STEP_STATUSES = ['APPROVED', 'SKIPPED', 'CANCELLED', 'REJECTED']

/**
 * One shape for the column regardless of which implementation backs the row:
 * { label, date, outcome }.
 *
 * The record-based check keeps its own status vocabulary; the step-based one
 * reports the step status, plus the verdict once recorded — which is the thing
 * a reader actually wants ("did it work?"), and is only queryable at all
 * because effectiveness_outcome is a column rather than a form answer.
 */
function effectivenessCheckFor(row) {
  const check = checksByCapaId.value[row.id]
  if (check) {
    return { label: check.statusId, date: check.dueAt, outcome: check.outcome ?? null }
  }
  const step = delayStepByCapaId.value[row.id]
  if (step) {
    return {
      label: step.statusId,
      date: step.delayUntil ?? step.delayUntilDate ?? null,
      outcome: step.effectivenessOutcome ?? null,
    }
  }
  return null
}

const EFFECTIVENESS_LABELS = {
  EFFECTIVE: 'Effective',
  NOT_EFFECTIVE: 'Not effective',
}

function selectOpts(list) {
  return list.map((x) => ({ value: x.id, label: x.name }))
}

// Descriptor tree for the cascading filter menu (each dimension → a submenu of
// its values; `group` is the selection bucket key on the filter model).
const filterItems = computed(() => [
  {
    id: 'statusId',
    label: 'Status',
    icon: IconCircleDot,
    group: 'statusId',
    options: selectOpts(capaStatuses.value),
  },
  {
    id: 'priorityId',
    label: 'Priority',
    icon: IconAlertTriangle,
    group: 'priorityId',
    options: selectOpts(capaPriorities.value),
  },
  {
    id: 'typeId',
    label: 'Type',
    icon: IconTag,
    group: 'typeId',
    options: selectOpts(capaTypes.value),
  },
  {
    id: 'supplierId',
    label: 'Supplier',
    icon: IconBuildingFactory2,
    group: 'supplierId',
    searchable: true,
    options: selectOpts(suppliers.value),
  },
  { id: 'createdAt', label: 'Created date', icon: IconCalendar, group: 'createdAt', type: 'date' },
  {
    id: 'effectiveness',
    label: 'Effectiveness',
    icon: IconTargetArrow,
    group: 'effectiveness',
    options: EFFECTIVENESS_FILTER_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
  },
])

const columns = computed(() => {
  const filterCfg = {
    priority: { filterType: 'select', filterOptions: selectOpts(capaPriorities.value) },
    status: { filterType: 'select', filterOptions: selectOpts(capaStatuses.value) },
    type: { filterType: 'select', filterOptions: selectOpts(capaTypes.value) },
    createdAt: { filterType: 'date' },
  }
  return [
    {
      name: 'capaNumber',
      label: 'CAPA NUMBER',
      field: 'capaNumber',
      align: 'left',
      sortable: true,
      hideable: false,
    },
    { name: 'title', label: 'TITLE', field: 'title', align: 'left', sortable: true },
    { name: 'priority', label: 'PRIORITY', field: 'priorityId', align: 'left', sortable: false },
    { name: 'status', label: 'STATUS', field: 'statusId', align: 'left', sortable: false },
    { name: 'type', label: 'TYPE', field: 'typeId', align: 'left', sortable: false },
    {
      name: 'effectivenessCheck',
      label: 'EFFECTIVENESS CHECK',
      field: 'effectivenessCheck',
      align: 'left',
      sortable: false,
      // The on-screen cell renders a badge; CSV gets "Pending · 25 Oct 2026".
      // Without this the export serialises the dead JSONB column instead.
      exportValue: (row) => {
        const check = effectivenessCheckFor(row)
        if (!check) return ''
        return [
          check.label,
          check.outcome ? EFFECTIVENESS_LABELS[check.outcome] : null,
          check.date ? check.date.formatDate('date') : null,
        ]
          .filter(Boolean)
          .join(' · ')
      },
    },
    { name: 'createdAt', label: 'CREATED', field: 'createdAt', align: 'left', sortable: true },
    { name: 'actions', label: '', field: 'actions', align: 'right' },
  ].map((c) => ({ ...c, ...(filterCfg[c.name] || {}) }))
})

const pagination = ref({ page: 1, pageSize: 50 })
const sort = ref([{ id: 'createdAt', desc: true }])

function rowMenuItems(row) {
  const items = []
  if (props.canUpdate) {
    items.push({ name: 'Edit', icon: IconEdit, click: () => emit('edit', row) })
  }
  if (props.canDelete) {
    items.push({ name: 'Delete', icon: IconTrash, click: () => emit('delete', row) })
  }
  return items
}
</script>

<template>
  <DataTable
    v-model:pagination="pagination"
    v-model:sort="sort"
    :rows="rows"
    :columns="columns"
    rowKey="id"
    :noDataLabel="emptyLabel"
    :mobileCards="false"
    searchable
    exportManager
    exportFilename="capas.csv"
    persistKey="capas"
  >
    <!-- Query-level filter menu -->
    <template #toolbar-filters>
      <BaseFilterMenu
        :modelValue="menuFilters"
        :items="filterItems"
        iconOnly
        @update:modelValue="onMenuFilters"
      />
    </template>

    <!-- Quick views -->
    <template #tabs>
      <BaseQuickFilterPills v-model="activeFilter" :pills="filterPills" ariaLabel="Quick views" />
    </template>

    <template #body-cell-capaNumber="{ row }">
      <RouterLink
        :to="getCompanyPath(`/capas/${row.id}`)"
        class="tw:text-xs tw:text-secondary tw:hover:text-primary"
      >
        {{ row.capaNumber || '—' }}
      </RouterLink>
    </template>

    <template #body-cell-title="{ row }">
      <RouterLink
        :to="getCompanyPath(`/capas/${row.id}`)"
        class="tw:flex tw:items-center tw:gap-2 tw:text-on-main tw:hover:text-primary"
      >
        <span
          class="tw:inline-block tw:w-2 tw:h-2 tw:rounded-full tw:shrink-0"
          :class="priorityDotClass[row.priorityId] || 'tw:bg-gray-400'"
        />
        <span class="tw:font-medium">{{ row.title }}</span>
      </RouterLink>
    </template>

    <template #body-cell-priority="{ row }">
      <CapaPriorityBadgeById :priorityId="row.priorityId" />
    </template>

    <template #body-cell-status="{ row }">
      <CapaStatusBadgeById :statusId="row.statusId" />
    </template>

    <template #body-cell-type="{ row }">
      <CapaTypeBadgeById :typeId="row.typeId" />
    </template>

    <template #body-cell-effectivenessCheck="{ row }">
      <div v-if="effectivenessCheckFor(row)" class="tw:flex tw:items-center tw:gap-1.5">
        <CapaEffectivenessCheckStatusBadgeById :statusId="effectivenessCheckFor(row).label" />
        <BaseBadge
          v-if="effectivenessCheckFor(row).outcome"
          class="tw:text-micro"
          :class="
            effectivenessCheckFor(row).outcome === 'EFFECTIVE'
              ? 'tw:bg-green-100 tw:text-green-700'
              : 'tw:bg-red-100 tw:text-red-700'
          "
        >
          {{ EFFECTIVENESS_LABELS[effectivenessCheckFor(row).outcome] }}
        </BaseBadge>
        <span v-if="effectivenessCheckFor(row).date" class="tw:text-xs tw:text-secondary">
          {{ effectivenessCheckFor(row).date.formatDate('date') }}
        </span>
      </div>
      <span v-else class="tw:text-secondary">—</span>
    </template>

    <template #body-cell-createdAt="{ row }">
      <span class="tw:text-sm tw:text-secondary">{{ row.createdAt?.formatDate('date') }}</span>
    </template>

    <template #body-cell-actions="{ row }">
      <div v-if="rowMenuItems(row).length" class="tw:flex tw:justify-end">
        <BaseMenu :items="rowMenuItems(row)" />
      </div>
    </template>
  </DataTable>
</template>
