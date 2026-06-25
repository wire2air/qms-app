<script setup>
import {
  IconTool,
  IconPlus,
  IconAlertCircle,
  IconCalendar,
  IconCalendarCheck,
} from '@tabler/icons-vue'
import { isAllowed } from '@/utils/currentSession.js'
import { post } from '@/api' // Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { DateTime } from 'luxon'

/**
 * Equipment — list page. Sourced from db.Equipment (Round 0.5 entity).
 * Filterable by status / category / site / department; admins with
 * `equipment:create` can add new records.
 *
 * Built on the Enterprise Page Framework list template: `useListLayout`
 * (filter state + URL sync + pagination + resolved content state) +
 * `BaseListLayout` (header / filters / state region) + `BaseTable`.
 */
const canCreate = computed(() => isAllowed(['equipment:create']))
const canUpdate = computed(() => isAllowed(['equipment:update']))
const toast = useToast()

const showCreateDialog = ref(false)

// Multi-select dimensions (Linear-style filter menu) — arrays of ids. Default
// to in-service so retired equipment doesn't drown the list.
const list = useListLayout({
  filters: { search: '', status: ['IN_SERVICE'], category: [] },
  total: () => equipment.value.length,
  empty: () => equipment.value.length === 0,
  syncUrl: true,
})

const equipment = useLiveQueryWithDeps(
  [
    () => list.filters.value.search,
    () => list.filters.value.status,
    () => list.filters.value.category,
  ],
  async (db, [q, statuses, categories]) => {
    let rows = await db.Equipment.where().exec()
    if (statuses?.length) rows = rows.filter((e) => statuses.includes(e.statusId))
    if (categories?.length) rows = rows.filter((e) => categories.includes(e.category))
    if (q) {
      const needle = q.toLowerCase()
      rows = rows.filter(
        (e) =>
          e.name?.toLowerCase().includes(needle) ||
          e.code?.toLowerCase().includes(needle) ||
          e.serialNumber?.toLowerCase().includes(needle),
      )
    }
    return rows.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))
  },

  { models: ['Equipment'], initial: [] },
)

// Option sources for the advanced filter's entity-column dropdowns.
const sites = useLiveQuery((db) => db.Site.where().exec(), { models: ['Site'], initial: [] })
const siteById = computed(() => new Map(sites.value.map((s) => [s.id, s])))
function selectOpts(list) {
  return list.map((x) => ({ value: x.id, label: x.name }))
}

const columns = computed(() => {
  const filterCfg = {
    category: {
      filterType: 'select',
      filterOptions: [
        { value: 'INSTRUMENT', label: 'Instrument' },
        { value: 'MACHINE', label: 'Machine' },
        { value: 'VEHICLE', label: 'Vehicle' },
        { value: 'SENSOR', label: 'Sensor' },
        { value: 'OTHER', label: 'Other' },
      ],
    },
    site: { filterType: 'select', filterOptions: selectOpts(sites.value) },
    status: {
      filterType: 'select',
      filterOptions: [
        { value: 'IN_SERVICE', label: 'In service' },
        { value: 'OUT_OF_SERVICE', label: 'Out of service' },
        { value: 'RETIRED', label: 'Retired' },
      ],
    },
    nextCalibrationDue: { filterType: 'date' },
    nextPmDue: { filterType: 'date' },
  }
  return [
    { name: 'name', label: 'Name', field: 'name', align: 'left', sortable: true },
    { name: 'category', label: 'Category', field: (r) => categoryLabel(r.category), align: 'left', sortable: true },
    { name: 'site', label: 'Site', field: (r) => siteById.value.get(r.siteId)?.name ?? '—', align: 'left', sortable: true },
    { name: 'status', label: 'Status', field: 'statusId', align: 'left', sortable: true },
    { name: 'nextCalibrationDue', label: 'Next calibration', field: 'nextCalibrationDue', align: 'left', sortable: true },
    { name: 'nextPmDue', label: 'Next PM', field: 'nextPmDue', align: 'left', sortable: true },
    { name: 'actions', label: '', align: 'right' },
  ].map((c) => ({ ...c, ...(filterCfg[c.name] || {}) }))
})

function fmtDate(d) {
  if (!d) return null
  if (d.toFormat) return d.toFormat('LLL d, yyyy')
  return new Date(d).toLocaleDateString()
}

// "Due within 30 days" — small visual nudge for upcoming calibrations
// and PM. Doesn't replace a real maintenance scheduler, just helps the
// admin scan the list.
function dueSoon(d) {
  if (!d) return false
  const ms = d.toMillis ? d.toMillis() : new Date(d).getTime()
  const diff = ms - DateTime.now().toMillis()
  return diff < 30 * 24 * 60 * 60 * 1000
}
function overdue(d) {
  if (!d) return false
  const ms = d.toMillis ? d.toMillis() : new Date(d).getTime()
  return ms < DateTime.now().toMillis()
}

function dueClass(d) {
  if (overdue(d)) return 'tw:text-red-700 tw:font-medium'
  if (dueSoon(d)) return 'tw:text-amber-700'
  return 'tw:text-secondary'
}

function categoryLabel(c) {
  return (
    {
      INSTRUMENT: 'Instrument',
      MACHINE: 'Machine',
      VEHICLE: 'Vehicle',
      SENSOR: 'Sensor',
      OTHER: 'Other',
    }[c] || '—'
  )
}

function statusBadgeClass(id) {
  if (id === 'IN_SERVICE') return 'tw:bg-green-100 tw:text-green-700'
  if (id === 'OUT_OF_SERVICE') return 'tw:bg-amber-100 tw:text-amber-700'
  return 'tw:bg-gray-200 tw:text-gray-700'
}

function onCreated() {
  // No detail page yet (parallel follow-up); the new row appears
  // automatically via live-query.
}

// ─── Edit mode ────────────────────────────────────────────────────
// Row click opens the same dialog in edit mode. Backed by an
// `editingEquipment` ref that the dialog seeds its draft from.
const showEditDialog = ref(false)
const editingEquipment = ref(null)

function openEdit(row) {
  if (!canUpdate.value) return
  editingEquipment.value = row
  showEditDialog.value = true
}
function onUpdated() {
  // SyncEngine handles the IDB write + live-query refresh — nothing
  // to do here beyond closing the dialog (which the dialog handles).
  editingEquipment.value = null
}

// ─── Record calibration (quick action) ────────────────────────────
// Stamps "calibrated today" and rolls next_calibration_due forward by the
// instrument's interval (server-side). Documentation of the event still goes
// in the Calibration Log. Requires an interval to be set on the instrument.
const recordingId = ref(null)
async function recordCalibration(e) {
  if (recordingId.value) return
  recordingId.value = e.id
  try {
    // Action RPC — the synced row refreshes via the sync socket.
    await post(`/v1/services/equipment/${e.id}/record-calibration`, {})
    toast.success(`Calibration recorded for ${e.name}`)
  } catch (err) {
    toast.error(err?.message || 'Failed to record calibration')
  } finally {
    recordingId.value = null
  }
}
</script>

<template>
  <BaseListLayout
    title="Equipment"
    :icon="IconTool"
    subtitle="Instruments, machines, and other equipment tracked by the QMS. Log books reference equipment for calibration, preventive maintenance, and equipment-specific routines."
    :state="list.state.value"
    :emptyIcon="IconTool"
    :emptyTitle="list.hasActiveFilters.value ? 'No equipment matches your filters' : 'No equipment yet'"
  >
    <template #actions>
      <BaseButton v-if="canCreate" variant="primary" @click="showCreateDialog = true">
        <IconPlus :size="16" />
        New Equipment
      </BaseButton>
    </template>

    <template #filters>
      <EquipmentFilterToolbar v-model:filters="list.filters.value" />
    </template>

    <template #empty-action>
      <BaseButton v-if="canCreate && !list.hasActiveFilters.value" variant="primary" @click="showCreateDialog = true">
        <IconPlus :size="16" />
        Add the first one
      </BaseButton>
    </template>

    <DataTable
      v-model:pagination="list.tablePagination.value"
      v-model:sort="list.sort.value"
      :rows="equipment"
      :columns="columns"
      rowKey="id"
      :mobileCards="false"
      filterable
      @rowClick="openEdit"
    >
      <template #body-cell-name="{ row }">
        <div class="tw:font-medium tw:text-on-main">{{ row.name }}</div>
        <div class="tw:text-xs tw:text-secondary tw:font-mono">
          {{ row.code }}
          <span v-if="row.serialNumber">· {{ row.serialNumber }}</span>
        </div>
      </template>

      <template #body-cell-status="{ row }">
        <span
          class="tw:inline-flex tw:items-center tw:gap-1 tw:text-micro tw:font-bold tw:rounded tw:px-2 tw:py-0.5"
          :class="statusBadgeClass(row.statusId)"
        >
          {{ row.statusId?.replace(/_/g, ' ') }}
        </span>
      </template>

      <template #body-cell-nextCalibrationDue="{ row }">
        <span
          v-if="row.nextCalibrationDue"
          class="tw:inline-flex tw:items-center tw:gap-1 tw:text-xs"
          :class="dueClass(row.nextCalibrationDue)"
        >
          <IconAlertCircle v-if="overdue(row.nextCalibrationDue)" :size="12" />
          <IconCalendar v-else :size="12" />
          {{ fmtDate(row.nextCalibrationDue) }}
        </span>
        <span v-else class="tw:text-secondary">—</span>
      </template>

      <template #body-cell-nextPmDue="{ row }">
        <span
          v-if="row.nextPmDue"
          class="tw:inline-flex tw:items-center tw:gap-1 tw:text-xs"
          :class="dueClass(row.nextPmDue)"
        >
          <IconAlertCircle v-if="overdue(row.nextPmDue)" :size="12" />
          <IconCalendar v-else :size="12" />
          {{ fmtDate(row.nextPmDue) }}
        </span>
        <span v-else class="tw:text-secondary">—</span>
      </template>

      <template #body-cell-actions="{ row }">
        <button
          v-if="canUpdate && row.requiresCalibration"
          type="button"
          class="tw:inline-flex tw:items-center tw:gap-1 tw:text-xs tw:font-medium tw:text-primary tw:hover:underline tw:bg-transparent tw:border-0 tw:cursor-pointer tw:disabled:opacity-50"
          :disabled="recordingId === row.id"
          title="Mark calibrated today and roll the next-due date forward"
          @click.stop="recordCalibration(row)"
        >
          <IconCalendarCheck :size="14" />
          {{ recordingId === row.id ? 'Recording…' : 'Record calibration' }}
        </button>
      </template>
    </DataTable>

    <CreateEquipmentDialog v-model="showCreateDialog" @created="onCreated" />
    <!-- Same component, edit mode. The dialog seeds its draft from
         the `equipment` prop when set. -->
    <CreateEquipmentDialog v-model="showEditDialog" :equipment="editingEquipment" @updated="onUpdated" />
  </BaseListLayout>
</template>
