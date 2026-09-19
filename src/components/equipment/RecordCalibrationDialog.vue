<script setup>
/**
 * Record a calibration — the e-signed, evidenced completion.
 *
 * WHY THIS DIALOG EXISTS. Until 2026-09-08 the register's "Record calibration"
 * quick action was `post('/v1/services/equipment/:id/record-calibration', {})`
 * — a bare POST with an EMPTY BODY. That single call clears the QC capture gate
 * (`inspectionResultService.js` refuses a measurement taken with a lapsed
 * instrument), so it re-opens an instrument for production use, and the record
 * it left behind was a date and nothing else: no signer, no certificate, no
 * vendor. The backend now requires all three (equipmentService.recordCalibration,
 * migrations 20260911110000 / 20260911120000). This is the frontend half.
 *
 * Shape follows RetainSampleDisposeDialog — collect the evidence, then hand off
 * to the PIN dialog, then POST once with both. The signature is manifested
 * against the INSTRUMENT (`signatures.equipment_id`) inside the request's
 * transaction, so a refused PIN rolls the calibration back with it; there is no
 * state here to unwind on failure.
 *
 * `recordPm` deliberately does NOT get this treatment — no QC gate reads PM, so
 * a Part-11 signature there would buy no compliance and break the quick action
 * for nothing. The asymmetry is a decision, stated in the service too.
 */
import { post } from '@/api' // Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { DateTime } from 'luxon'
import workflowInstanceEsignAuthDialog from '@/components/workflowInstance/workflowInstanceEsignAuthDialog.vue'

const props = defineProps({
  // The live Equipment row. Passed whole (not by id) because the host already
  // holds it from the register's live query and this dialog only reads it.
  equipment: { type: Object, default: null },
})
const emit = defineEmits(['recorded'])
const show = defineModel({ type: Boolean, default: false })
const toast = useToast()

const certificateNumber = ref('')
const certificateUrl = ref('')
const vendorSupplierId = ref(null)
const vendorName = ref('')
const calibratedOn = ref('')
const comments = ref('')

const saving = ref(false)
const saveError = ref('')
const esignOpen = ref(false)

const UNIT_LABELS = { DAY: 'day', WEEK: 'week', MONTH: 'month', YEAR: 'year' }

/** "6 months" — the cadence the server will roll the next-due date forward by. */
const intervalSummary = computed(() => {
  const n = props.equipment?.calibrationInterval
  if (!n) return null
  const unit = UNIT_LABELS[props.equipment?.calibrationIntervalUnit ?? 'MONTH'] ?? 'month'
  return `${n} ${unit}${n === 1 ? '' : 's'}`
})

// The server refuses a completion with no interval AND no explicit next-due
// ("Set a calibration interval or provide an explicit next-due date"). Say so
// before the POST rather than surfacing it as a failure afterwards.
const missingInterval = computed(() => !props.equipment?.calibrationInterval)

// One of the two vendor forms is required, not both and not either-or-neither:
// a registered supplier when the calibration house is one, a free-text name for
// an in-house metrology bench or a one-off contractor.
const hasVendor = computed(() => Boolean(vendorSupplierId.value || vendorName.value.trim()))
const canSubmit = computed(
  () => Boolean(certificateNumber.value.trim()) && hasVendor.value && !missingInterval.value,
)

watch(show, (open) => {
  if (!open) return
  certificateNumber.value = ''
  certificateUrl.value = ''
  vendorSupplierId.value = props.equipment?.supplierId ?? null
  vendorName.value = ''
  calibratedOn.value = DateTime.now().toFormat('yyyy-LL-dd')
  comments.value = ''
  saveError.value = ''
  saving.value = false
})

/**
 * The calibration date to SEND, or undefined for "now".
 *
 * `<input type="date">` yields a bare `yyyy-MM-dd`, which the server parses as
 * MIDNIGHT UTC. In a timezone ahead of UTC that instant is in the future for the
 * first hours of the local day, and `parseEventDate` refuses a future event with
 * only five minutes of skew tolerance — so picking "today" would be rejected
 * overnight in Asia and Australia. Sending nothing lets the server stamp its own
 * `new Date()`, which is what "today" means anyway; an explicitly BACKDATED
 * certificate still travels as a date, where midnight UTC is unambiguously past.
 */
function calibratedAtPayload() {
  const today = DateTime.now().toFormat('yyyy-LL-dd')
  if (!calibratedOn.value || calibratedOn.value === today) return undefined
  return calibratedOn.value
}

function onSubmit() {
  if (!canSubmit.value || saving.value) return
  saveError.value = ''
  esignOpen.value = true
}

async function onVerified(esign) {
  esignOpen.value = false
  if (saving.value) return
  saving.value = true
  saveError.value = ''
  try {
    const calibratedAt = calibratedAtPayload()
    await post(`/v1/services/equipment/${props.equipment.id}/record-calibration`, {
      certificateNumber: certificateNumber.value.trim(),
      certificateUrl: certificateUrl.value.trim() || null,
      calibrationVendorId: vendorSupplierId.value || null,
      calibrationVendorName: vendorName.value.trim() || null,
      ...(calibratedAt ? { calibratedAt } : {}),
      comments: comments.value.trim() || null,
      method: esign.method,
      token: esign.token,
      // OMITTED when absent, never sent as null. `schemas/equipment.js`'s
      // esignFields types `provider` as an optional STRING, and Zod refuses a
      // null for it — the whole request comes back 400
      // `{ fields: { provider: ['Invalid value'] } }` before any of the
      // calibration logic runs. The PIN dialog never sets a provider, so this
      // is the normal path, not an edge case.
      ...(esign.provider ? { provider: esign.provider } : {}),
    })
    toast.success(`Calibration recorded for ${props.equipment?.name ?? 'the instrument'}`)
    show.value = false
    emit('recorded')
  } catch (err) {
    // Left OPEN with the message. The evidence the user just typed is the
    // expensive part of this form; closing on failure would throw it away.
    saveError.value = err?.message || 'Failed to record calibration'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <BaseDialog v-model="show" maxWidth="lg" persistent>
    <div class="tw:flex tw:flex-col tw:gap-1 tw:mb-4">
      <div class="tw:text-xl tw:font-bold tw:text-on-main">Record Calibration</div>
      <div class="tw:text-xs tw:text-secondary">
        {{ equipment?.name }} <span v-if="equipment?.code">· {{ equipment.code }}</span>
      </div>
    </div>

    <div class="tw:flex tw:flex-col tw:gap-4">
      <p class="tw:text-sm tw:text-secondary">
        Recording a calibration returns this instrument to the QC capture path — inspection results
        measured with it are refused while it is out of calibration. The completion is e-signed and
        kept as the calibration evidence.
      </p>

      <div
        v-if="missingInterval"
        class="tw:rounded-lg tw:border tw:border-amber-200 tw:bg-amber-50 tw:px-3 tw:py-2 tw:text-sm tw:text-amber-900"
      >
        This instrument has no calibration interval, so there is nothing to roll the next-due date
        forward by. Set one on the instrument first.
      </div>
      <div v-else-if="intervalSummary" class="tw:text-caption tw:text-secondary">
        The next calibration will be scheduled {{ intervalSummary }} after the date below.
      </div>

      <BaseField v-slot="{ id: fieldId }" label="Certificate number" required>
        <BaseTextInput
          :id="fieldId"
          v-model="certificateNumber"
          placeholder="e.g. CAL-2026-00417"
        />
        <div class="tw:text-caption tw:text-secondary tw:mt-1">
          The reference on the calibration certificate. Required — a completion with no certificate
          reference is a date and nothing else.
        </div>
      </BaseField>

      <BaseField v-slot="{ id: fieldId }" label="Certificate link" optional>
        <BaseTextInput :id="fieldId" v-model="certificateUrl" placeholder="https://…" />
      </BaseField>

      <div class="tw:rounded-lg tw:border tw:border-divider tw:bg-main-hover/40 tw:p-3 tw:flex tw:flex-col tw:gap-3">
        <span class="tw:text-sm tw:font-medium tw:text-on-main">Who performed the calibration</span>
        <BaseField label="Calibration vendor (approved supplier)" optional>
          <SupplierSelectMenu v-model="vendorSupplierId" />
        </BaseField>
        <BaseField v-slot="{ id: fieldId }" label="…or name them" optional>
          <BaseTextInput
            :id="fieldId"
            v-model="vendorName"
            placeholder="e.g. In-house metrology bench"
          />
        </BaseField>
        <div v-if="!hasVendor" class="tw:text-caption tw:text-secondary">
          Pick a registered supplier, or type a name for an in-house bench or a one-off contractor.
          One of the two is required.
        </div>
      </div>

      <BaseField v-slot="{ id: fieldId }" label="Calibrated on">
        <input
          :id="fieldId"
          v-model="calibratedOn"
          type="date"
          class="tw:w-full tw:rounded tw:border tw:border-divider tw:bg-card tw:px-3 tw:py-1.5 tw:text-sm"
        />
        <div class="tw:text-caption tw:text-secondary tw:mt-1">
          Defaults to today. A future date is refused, and the next-due date is measured from here.
        </div>
      </BaseField>

      <BaseField v-slot="{ id: fieldId }" label="Comments" optional>
        <BaseTextarea
          :id="fieldId"
          v-model="comments"
          :rows="2"
          placeholder="Recorded on the signature — as-found condition, adjustments made, anything worth keeping"
        />
      </BaseField>
    </div>

    <template #footer="{ close }">
      <BaseDialogFooter
        submitLabel="Sign & Record Calibration"
        :loading="saving"
        :disabled="!canSubmit || saving"
        :error="saveError"
        @cancel="close"
        @submit="onSubmit"
      />
    </template>

    <workflowInstanceEsignAuthDialog v-model="esignOpen" @verified="onVerified" />
  </BaseDialog>
</template>
