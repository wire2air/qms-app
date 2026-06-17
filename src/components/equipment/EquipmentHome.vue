<script setup>
import {
  IconTool,
  IconPlus,
  IconSearch,
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
 * Row-level editing is not in this round; minor inline edits
 * (location, notes) can land later via an inline-edit pattern. For now
 * the page is a focused catalog view + creation surface.
 */
const canCreate = computed(() => isAllowed(['equipment:create']))
const canUpdate = computed(() => isAllowed(['equipment:update']))
const toast = useToast()

const showCreateDialog = ref(false)

const search = ref('')
const statusFilter = ref('IN_SERVICE') // default to in-service so retired equipment doesn't drown the list
const categoryFilter = ref('all')

const equipment = useLiveQueryWithDeps(
  [() => search.value, () => statusFilter.value, () => categoryFilter.value],
  async (db, [q, status, category]) => {
    let rows = await db.Equipment.where().exec()
    if (status !== 'all') rows = rows.filter((e) => e.statusId === status)
    if (category !== 'all') rows = rows.filter((e) => e.category === category)
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

const sites = useLiveQuery((db) => db.Site.where().exec(), { models: ['Site'], initial: [] })
const siteById = computed(() => new Map(sites.value.map((s) => [s.id, s])))

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
  <BasePage width="wide" density="compact">
    <PageHeader :icon="IconTool" title="Equipment" :iconSize="22" />

    <SafeTeleport to="#main-header-actions">
      <BaseButton v-if="canCreate" variant="primary" @click="showCreateDialog = true">
        <IconPlus :size="16" />
        New Equipment
      </BaseButton>
    </SafeTeleport>

    <div class="tw:flex tw:flex-col tw:gap-1">
      <div class="tw:text-3xl tw:font-bold tw:text-on-sidebar">Equipment</div>
      <div class="tw:text-sm tw:text-secondary">
        Instruments, machines, and other equipment tracked by the QMS. Log books reference equipment
        for calibration, preventive maintenance, and equipment-specific routines.
      </div>
    </div>

    <!-- Filters -->
    <div class="tw:flex tw:items-center tw:gap-3 tw:flex-wrap">
      <div class="tw:relative tw:flex-1 tw:max-w-md">
        <IconSearch
          :size="16"
          class="tw:absolute tw:left-2.5 tw:top-1/2 tw:-translate-y-1/2 tw:text-secondary tw:pointer-events-none"
        />
        <BaseTextInput
          v-model="search"
          placeholder="Search by name, code, or serial…"
          class="tw:pl-8"
        />
      </div>
      <div class="tw:flex tw:items-center tw:gap-2">
        <span class="tw:text-xs tw:text-secondary">Status</span>
        <select
          v-model="statusFilter"
          class="tw:rounded tw:border tw:border-divider tw:bg-card tw:px-2 tw:py-1 tw:text-sm"
        >
          <option value="all">All</option>
          <option value="IN_SERVICE">In service</option>
          <option value="OUT_OF_SERVICE">Out of service</option>
          <option value="RETIRED">Retired</option>
        </select>
      </div>
      <div class="tw:flex tw:items-center tw:gap-2">
        <span class="tw:text-xs tw:text-secondary">Category</span>
        <select
          v-model="categoryFilter"
          class="tw:rounded tw:border tw:border-divider tw:bg-card tw:px-2 tw:py-1 tw:text-sm"
        >
          <option value="all">All</option>
          <option value="INSTRUMENT">Instrument</option>
          <option value="MACHINE">Machine</option>
          <option value="VEHICLE">Vehicle</option>
          <option value="SENSOR">Sensor</option>
          <option value="OTHER">Other</option>
        </select>
      </div>
    </div>

    <!-- Empty -->
    <div
      v-if="equipment.length === 0"
      class="tw:flex tw:flex-col tw:items-center tw:gap-3 tw:py-12 tw:text-secondary"
    >
      <IconTool :size="40" class="tw:opacity-60" />
      <div class="tw:text-sm">
        {{
          search || statusFilter !== 'all' || categoryFilter !== 'all'
            ? 'No equipment matches your filters.'
            : 'No equipment yet.'
        }}
      </div>
      <BaseButton v-if="canCreate" variant="primary" @click="showCreateDialog = true">
        <IconPlus :size="16" />
        Add the first one
      </BaseButton>
    </div>

    <!-- Table -->
    <div v-else class="tw:bg-white tw:rounded-lg tw:border tw:border-divider tw:overflow-hidden">
      <table class="tw:w-full tw:text-sm">
        <thead class="tw:bg-main">
          <tr class="tw:text-left">
            <th class="tw:px-3 tw:py-2 tw:font-semibold tw:text-secondary">Name</th>
            <th class="tw:px-3 tw:py-2 tw:font-semibold tw:text-secondary">Category</th>
            <th class="tw:px-3 tw:py-2 tw:font-semibold tw:text-secondary">Site</th>
            <th class="tw:px-3 tw:py-2 tw:font-semibold tw:text-secondary">Status</th>
            <th class="tw:px-3 tw:py-2 tw:font-semibold tw:text-secondary">Next calibration</th>
            <th class="tw:px-3 tw:py-2 tw:font-semibold tw:text-secondary">Next PM</th>
            <th class="tw:px-3 tw:py-2"></th>
          </tr>
        </thead>
        <tbody>
          <BaseClickableRow
            v-for="e in equipment"
            :key="e.id"
            tag="tr"
            :disabled="!canUpdate"
            class="tw:border-t tw:border-divider tw:hover:bg-main-hover"
            :aria-label="`Edit ${e.name}`"
            @click="openEdit(e)"
          >
            <td class="tw:px-3 tw:py-2">
              <div class="tw:font-medium tw:text-on-main">{{ e.name }}</div>
              <div class="tw:text-xs tw:text-secondary tw:font-mono">
                {{ e.code }}
                <span v-if="e.serialNumber">· {{ e.serialNumber }}</span>
              </div>
            </td>
            <td class="tw:px-3 tw:py-2 tw:text-on-main">{{ categoryLabel(e.category) }}</td>
            <td class="tw:px-3 tw:py-2 tw:text-on-main">
              {{ siteById.get(e.siteId)?.name ?? '—' }}
            </td>
            <td class="tw:px-3 tw:py-2">
              <span
                class="tw:inline-flex tw:items-center tw:gap-1 tw:text-[10px] tw:font-bold tw:rounded tw:px-2 tw:py-0.5"
                :class="statusBadgeClass(e.statusId)"
              >
                {{ e.statusId?.replace(/_/g, ' ') }}
              </span>
            </td>
            <td class="tw:px-3 tw:py-2 tw:text-xs">
              <span
                v-if="e.nextCalibrationDue"
                :class="
                  overdue(e.nextCalibrationDue)
                    ? 'tw:text-red-700 tw:font-medium'
                    : dueSoon(e.nextCalibrationDue)
                      ? 'tw:text-amber-700'
                      : 'tw:text-secondary'
                "
                class="tw:inline-flex tw:items-center tw:gap-1"
              >
                <IconAlertCircle v-if="overdue(e.nextCalibrationDue)" :size="12" />
                <IconCalendar v-else :size="12" />
                {{ fmtDate(e.nextCalibrationDue) }}
              </span>
              <span v-else class="tw:text-secondary">—</span>
            </td>
            <td class="tw:px-3 tw:py-2 tw:text-xs">
              <span
                v-if="e.nextPmDue"
                :class="
                  overdue(e.nextPmDue)
                    ? 'tw:text-red-700 tw:font-medium'
                    : dueSoon(e.nextPmDue)
                      ? 'tw:text-amber-700'
                      : 'tw:text-secondary'
                "
                class="tw:inline-flex tw:items-center tw:gap-1"
              >
                <IconAlertCircle v-if="overdue(e.nextPmDue)" :size="12" />
                <IconCalendar v-else :size="12" />
                {{ fmtDate(e.nextPmDue) }}
              </span>
              <span v-else class="tw:text-secondary">—</span>
            </td>
            <td class="tw:px-3 tw:py-2 tw:text-right" @click.stop>
              <button
                v-if="canUpdate && e.requiresCalibration"
                type="button"
                class="tw:inline-flex tw:items-center tw:gap-1 tw:text-xs tw:font-medium tw:text-primary tw:hover:underline tw:bg-transparent tw:border-0 tw:cursor-pointer tw:disabled:opacity-50"
                :disabled="recordingId === e.id"
                :title="'Mark calibrated today and roll the next-due date forward'"
                @click="recordCalibration(e)"
              >
                <IconCalendarCheck :size="14" />
                {{ recordingId === e.id ? 'Recording…' : 'Record calibration' }}
              </button>
            </td>
          </BaseClickableRow>
        </tbody>
      </table>
    </div>

    <CreateEquipmentDialog v-model="showCreateDialog" @created="onCreated" />
    <!-- Same component, edit mode. The dialog seeds its draft from
         the `equipment` prop when set. -->
    <CreateEquipmentDialog
      v-model="showEditDialog"
      :equipment="editingEquipment"
      @updated="onUpdated"
    />
  </BasePage>
</template>
