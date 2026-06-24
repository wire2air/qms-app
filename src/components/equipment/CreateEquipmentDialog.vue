<script setup>
import { IconX, IconCheck, IconCircleX } from '@tabler/icons-vue'
import { post, patch } from '@/api' // Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { required, minValue } from '@shared/components/form/validators.js'

/**
 * Equipment create/edit dialog. POSTs to /v1/services/equipment on
 * create; PATCHes /v1/services/equipment/:id on edit. Either way the
 * service runs validation (unique code, status/category enums,
 * auto-stamps retiredAt on RETIRED transitions) before the row lands.
 *
 * Mode is determined by the optional `equipment` prop:
 *   - null/undefined  → create mode
 *   - row object      → edit mode (pre-fills, blocks code edits to
 *                       keep audit references stable, PATCHes on save)
 */
const props = defineProps({
  // When set, the dialog opens in edit mode pre-populated with this
  // row. Code stays read-only — changing it would break record_number
  // continuity for existing log entries.
  equipment: { type: Object, default: null },
})

const emit = defineEmits(['created', 'updated'])
const open = defineModel({ type: Boolean, default: false })
const toast = useToast()

const formRef = ref(null)
const isSubmitting = ref(false)
const saveError = ref('')

const isEditing = computed(() => Boolean(props.equipment?.id))

const code = ref('')
const name = ref('')
const description = ref('')
const manufacturer = ref('')
const model = ref('')
const serialNumber = ref('')
const category = ref(null)
const siteId = ref(null)
const departmentId = ref(null)
const supplierId = ref(null)
const ownerUserId = ref(null)
const statusId = ref('IN_SERVICE')
const requiresCalibration = ref(false)
const calibrationIntervalMonths = ref(null)
const locationText = ref('')
const notes = ref('')
// Date fields — bound to <input type="date"> which speaks
// "yyyy-MM-dd" strings. We translate to/from luxon DateTime / ISO.
const installedAt = ref('')
const retiredAt = ref('')
const nextCalibrationDue = ref('')
const nextPmDue = ref('')

function toDateInput(dt) {
  if (!dt) return ''
  if (dt.toFormat) return dt.toFormat('yyyy-LL-dd')
  const d = new Date(dt)
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10)
}

// Code availability — no dedicated checkcode endpoint for equipment;
// we query the SyncEngine for an exact-code match. Server-side INSERT
// still validates (race-safe) and returns a clean error if a row
// slips through.
const codeMatches = useLiveQueryWithDeps(
  [() => code.value.trim(), () => props.equipment?.id ?? null],
  async (db, [c, selfId]) => {
    if (!c || c.length < 2) return []
    const rows = await db.Equipment.where('code', c).exec()
    // In edit mode the row's own code matches itself — exclude it.
    return selfId ? rows.filter((r) => r.id !== selfId) : rows
  },

  { models: ['Equipment'], initial: [] },
)
const isCodeAvailable = computed(() => {
  const c = code.value.trim()
  if (!c || c.length < 2) return null
  if (codeMatches.value === undefined) return null // still loading
  return codeMatches.value.length === 0
})

// Submit-time rule: taken code blocks submit.
function codeUnique() {
  return isCodeAvailable.value !== false || 'Code already in use'
}

// Reset / seed state every time the dialog opens. In edit mode we
// pull from props.equipment; in create mode we clear to defaults.
watch(open, (isOpen) => {
  if (!isOpen) {
    saveError.value = ''
    return
  }
  const e = props.equipment
  code.value = e?.code ?? ''
  name.value = e?.name ?? ''
  description.value = e?.description ?? ''
  manufacturer.value = e?.manufacturer ?? ''
  model.value = e?.model ?? ''
  serialNumber.value = e?.serialNumber ?? ''
  category.value = e?.category ?? null
  siteId.value = e?.siteId ?? null
  departmentId.value = e?.departmentId ?? null
  supplierId.value = e?.supplierId ?? null
  ownerUserId.value = e?.ownerUserId ?? null
  statusId.value = e?.statusId ?? 'IN_SERVICE'
  requiresCalibration.value = e?.requiresCalibration ?? false
  calibrationIntervalMonths.value = e?.calibrationIntervalMonths ?? null
  locationText.value = e?.locationText ?? ''
  notes.value = e?.notes ?? ''
  installedAt.value = toDateInput(e?.installedAt)
  retiredAt.value = toDateInput(e?.retiredAt)
  nextCalibrationDue.value = toDateInput(e?.nextCalibrationDue)
  nextPmDue.value = toDateInput(e?.nextPmDue)
  isSubmitting.value = false
})

// Common payload for both POST and PATCH. `code` is omitted on
// PATCH below — the backend updatable list also excludes it, but
// being explicit here makes the intent obvious.
function buildPayload() {
  return {
    name: name.value.trim(),
    description: description.value?.trim() || null,
    manufacturer: manufacturer.value?.trim() || null,
    model: model.value?.trim() || null,
    serialNumber: serialNumber.value?.trim() || null,
    category: category.value || null,
    siteId: siteId.value || null,
    departmentId: departmentId.value || null,
    supplierId: supplierId.value || null,
    ownerUserId: ownerUserId.value || null,
    statusId: statusId.value,
    requiresCalibration: requiresCalibration.value,
    calibrationIntervalMonths: requiresCalibration.value
      ? Number(calibrationIntervalMonths.value) || null
      : null,
    locationText: locationText.value?.trim() || null,
    notes: notes.value?.trim() || null,
    // Dates: empty string from the date input → null; otherwise send
    // the yyyy-MM-dd, which Postgres / Sequelize parses as midnight.
    installedAt: installedAt.value || null,
    retiredAt: retiredAt.value || null,
    nextCalibrationDue: nextCalibrationDue.value || null,
    nextPmDue: nextPmDue.value || null,
  }
}

async function onSubmit() {
  if (isSubmitting.value) return
  isSubmitting.value = true
  saveError.value = ''
  try {
    if (isEditing.value) {
      const res = await patch(`/v1/services/equipment/${props.equipment.id}`, buildPayload())
      emit('updated', res?.equipment ?? res)
      open.value = false
      toast.success('Equipment updated')
      return
    }
    const res = await post('/v1/services/equipment', {
      code: code.value.trim(),
      ...buildPayload(),
    })
    emit('created', res?.equipment ?? res)
    open.value = false
    toast.success('Equipment added')
  } catch (err) {
    saveError.value =
      err?.message || (isEditing.value ? 'Failed to update equipment' : 'Failed to add equipment')
  } finally {
    isSubmitting.value = false
  }
}

function close() {
  open.value = false
}
</script>

<template>
  <BaseDialog v-model="open" maxWidth="2xl" persistent>
    <div class="tw:flex tw:justify-between tw:items-center tw:mb-4">
      <div>
        <div class="tw:text-xl tw:font-bold tw:text-on-main">
          {{ isEditing ? 'Edit Equipment' : 'New Equipment' }}
        </div>
        <div class="tw:text-xs tw:text-secondary">
          {{
            isEditing
              ? 'Update metadata, change service status, or set the next calibration / PM date.'
              : 'Add an instrument, machine, or equipment that log books will reference.'
          }}
        </div>
      </div>
      <button class="tw:p-1 tw:rounded tw:text-secondary tw:hover:bg-main-hover" @click="close">
        <IconX :size="20" />
      </button>
    </div>

    <BaseForm ref="formRef" hideFooter @submit="onSubmit">
      <div class="tw:flex tw:flex-col tw:gap-4">
        <BaseField label="Name" required :value="name" :rules="[required()]">
          <template #default="field">
            <BaseTextInput
              v-bind="field"
              v-model="name"
              placeholder="e.g. Freezer #3, Calibration probe T-001"
            />
          </template>
        </BaseField>

        <BaseField
          label="Code"
          required
          :value="code"
          :rules="[
            required(),
            (v) => /^[a-z0-9-_]+$/i.test((v || '').trim()) || 'Use letters, numbers, - and _ only.',
            (v) => (v || '').trim().length >= 2 || 'Code must be at least 2 characters.',
            codeUnique,
          ]"
        >
          <template #default="field">
            <div class="tw:relative">
              <BaseTextInput
                v-bind="field"
                v-model="code"
                placeholder="e.g. EQ-001"
                :disabled="isEditing"
              />
              <div class="tw:absolute tw:right-2 tw:top-1/2 tw:-translate-y-1/2">
                <IconCheck v-if="isCodeAvailable === true" :size="16" class="tw:text-green-600" />
                <IconCircleX v-else-if="isCodeAvailable === false" :size="16" class="tw:text-bad" />
              </div>
            </div>
            <div class="tw:text-xs tw:text-secondary tw:mt-1">
              Unique identifier (e.g. asset tag). Used in audit reports and log book references.
              <span v-if="isEditing"> Locked after creation to keep audit references stable.</span>
            </div>
          </template>
        </BaseField>

        <div class="tw:grid tw:grid-cols-1 tw:md:grid-cols-2 tw:gap-3">
          <BaseField v-slot="{ id: fieldId }" label="Category">
            <select
              :id="fieldId"
              v-model="category"
              class="tw:w-full tw:rounded tw:border tw:border-divider tw:bg-card tw:px-3 tw:py-1.5 tw:text-sm"
            >
              <option :value="null">— Uncategorised —</option>
              <option value="INSTRUMENT">Instrument</option>
              <option value="MACHINE">Machine</option>
              <option value="VEHICLE">Vehicle</option>
              <option value="SENSOR">Sensor</option>
              <option value="OTHER">Other</option>
            </select>
          </BaseField>
          <BaseField v-slot="{ id: fieldId }" label="Status">
            <select
              :id="fieldId"
              v-model="statusId"
              class="tw:w-full tw:rounded tw:border tw:border-divider tw:bg-card tw:px-3 tw:py-1.5 tw:text-sm"
            >
              <option value="IN_SERVICE">In service</option>
              <option value="OUT_OF_SERVICE">Out of service</option>
              <option value="RETIRED">Retired</option>
            </select>
          </BaseField>
        </div>

        <BaseField v-slot="{ id: fieldId }" label="Description">
          <BaseTextarea
            :id="fieldId"
            v-model="description"
            :rows="2"
            placeholder="Optional context"
          />
        </BaseField>

        <div class="tw:grid tw:grid-cols-1 tw:md:grid-cols-3 tw:gap-3">
          <BaseField v-slot="{ id: fieldId }" label="Manufacturer">
            <BaseTextInput :id="fieldId" v-model="manufacturer" />
          </BaseField>
          <BaseField v-slot="{ id: fieldId }" label="Model">
            <BaseTextInput :id="fieldId" v-model="model" />
          </BaseField>
          <BaseField v-slot="{ id: fieldId }" label="Serial number">
            <BaseTextInput :id="fieldId" v-model="serialNumber" />
          </BaseField>
        </div>

        <div class="tw:grid tw:grid-cols-1 tw:md:grid-cols-2 tw:gap-3">
          <BaseField label="Site" required :value="siteId" :rules="[required()]">
            <template #default="field">
              <SiteSelectMenu v-bind="field" v-model="siteId" :required="true" />
            </template>
          </BaseField>
          <BaseField label="Department" optional>
            <DepartmentSelectMenu v-model="departmentId" />
            <div class="tw:text-caption tw:text-secondary tw:mt-1">
              Calibration reminders escalate to the department's supervisor.
            </div>
          </BaseField>
        </div>

        <BaseField label="Owner / custodian" optional>
          <UserSelectMenu v-model="ownerUserId" />
          <div class="tw:text-caption tw:text-secondary tw:mt-1">
            The responsible person — notified first about calibration. Falls back to the department
            supervisor.
          </div>
        </BaseField>

        <BaseField v-slot="{ id: fieldId }" label="Location (free text)">
          <BaseTextInput
            :id="fieldId"
            v-model="locationText"
            placeholder="e.g. Rack 3, Bay B; Lab 2; East wall freezer"
          />
        </BaseField>

        <!-- Calibration program. requiresCalibration flags the instrument as
             calibration-tracked (drives the daily due reminder); the interval
             auto-computes the next due each time a calibration is recorded. -->
        <div
          class="tw:rounded-lg tw:border tw:border-divider tw:bg-main-hover/40 tw:p-3 tw:flex tw:flex-col tw:gap-3"
        >
          <label class="tw:flex tw:items-center tw:gap-2 tw:cursor-pointer tw:select-none">
            <BaseCheckbox v-model="requiresCalibration" />
            <span class="tw:text-sm tw:font-medium tw:text-on-main">Requires calibration</span>
          </label>
          <div v-if="requiresCalibration" class="tw:w-48">
            <BaseField
              label="Calibration interval (months)"
              required
              :value="calibrationIntervalMonths"
              :rules="[required(), minValue(1)]"
            >
              <template #default="field">
                <BaseTextInput
                  v-bind="field"
                  v-model.number="calibrationIntervalMonths"
                  type="number"
                  min="1"
                  placeholder="e.g. 12"
                />
              </template>
            </BaseField>
            <div class="tw:text-caption tw:text-secondary tw:mt-1">
              Used to roll the next-due date forward when a calibration is recorded.
            </div>
          </div>
        </div>

        <!-- Lifecycle + maintenance dates. All optional. The list page
             uses next_calibration_due / next_pm_due to flag overdue +
             due-soon equipment, so populating them is what makes the
             catalog actually useful. retiredAt is auto-stamped server-
             side when statusId flips to RETIRED, but you can also set
             it manually for accurate historical dates. -->
        <div class="tw:grid tw:grid-cols-1 tw:md:grid-cols-2 tw:gap-3">
          <BaseField v-slot="{ id: fieldId }" label="Installed">
            <input
              :id="fieldId"
              v-model="installedAt"
              type="date"
              class="tw:w-full tw:rounded tw:border tw:border-divider tw:bg-card tw:px-3 tw:py-1.5 tw:text-sm"
            />
          </BaseField>
          <BaseField v-slot="{ id: fieldId }" label="Retired">
            <input
              :id="fieldId"
              v-model="retiredAt"
              type="date"
              class="tw:w-full tw:rounded tw:border tw:border-divider tw:bg-card tw:px-3 tw:py-1.5 tw:text-sm"
            />
          </BaseField>
          <BaseField v-slot="{ id: fieldId }" label="Next calibration due">
            <input
              :id="fieldId"
              v-model="nextCalibrationDue"
              type="date"
              class="tw:w-full tw:rounded tw:border tw:border-divider tw:bg-card tw:px-3 tw:py-1.5 tw:text-sm"
            />
          </BaseField>
          <BaseField v-slot="{ id: fieldId }" label="Next PM due">
            <input
              :id="fieldId"
              v-model="nextPmDue"
              type="date"
              class="tw:w-full tw:rounded tw:border tw:border-divider tw:bg-card tw:px-3 tw:py-1.5 tw:text-sm"
            />
          </BaseField>
        </div>

        <BaseField v-slot="{ id: fieldId }" label="Notes">
          <BaseTextarea
            :id="fieldId"
            v-model="notes"
            :rows="2"
            placeholder="Internal notes about this equipment"
          />
        </BaseField>
      </div>
    </BaseForm>

    <template #footer>
      <BaseDialogFooter
        :submitLabel="isEditing ? 'Save changes' : 'Add equipment'"
        :loading="isSubmitting"
        :error="saveError"
        @cancel="close"
        @submit="formRef?.submit()"
      />
    </template>
  </BaseDialog>
</template>
