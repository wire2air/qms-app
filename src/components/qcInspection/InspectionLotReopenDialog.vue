<script setup>
/**
 * Reopen a failed / under-review Inspection Lot for re-inspection (QA manager).
 * QA records a reason and (re)selects the specification + sampling plan, then
 * the lot returns to PENDING. The previously recorded results/defects are KEPT
 * (the re-inspection continues from them); the reopen is logged to the lot's
 * history. A re-inspection task is raised for the original inspector
 * (reassignable here).
 */
import { post } from '@/api' // Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { defaultCustomPlanTable } from '@/utils/aqlGuidance.js'

const props = defineProps({ lotId: { type: String, required: true } })
const emit = defineEmits(['reopened'])
const show = defineModel({ type: Boolean, default: false })
const toast = useToast()
const saving = ref(false)

const lot = useLiveQueryWithDeps([() => props.lotId], async (db, [id]) =>
  id ? db.InspectionLot.findByPk(id) : null,
)

const reason = ref('')
const specificationId = ref(null)
const samplingPlanId = ref(null)
const assignedTo = ref(null)
// Optional manual sample-size override (blank = use the computed value).
const sampleSizeOverride = ref(null)

// Sampling: pick an existing (approved) plan, set an ad-hoc AQL, or declare a
// fixed custom table — the same rows editor the sampling-plan dialog uses.
const SAMPLING_MODES = [
  { label: 'Existing plan', value: 'plan' },
  { label: 'Custom AQL', value: 'custom' },
  { label: 'Custom table', value: 'table' },
]
const samplingMode = ref('plan')
const aqlConfig = ref(defaultAqlConfig())
const customTable = ref(defaultCustomPlanTable())
function defaultAqlConfig() {
  return {
    standardCode: null,
    inspectionLevel: 'II',
    switchingState: 'NORMAL',
    severityAqls: [
      { severity: 'CRITICAL', aql: 0.4 },
      { severity: 'MAJOR', aql: 1.0 },
      { severity: 'MINOR', aql: 2.5 },
    ],
  }
}

// Prefill from the lot each time the dialog opens.
watch(show, (open) => {
  if (!open) return
  reason.value = ''
  specificationId.value = lot.value?.specificationId ?? null
  samplingPlanId.value = lot.value?.samplingPlanId ?? null
  assignedTo.value = lot.value?.assignedTo ?? lot.value?.createdBy ?? null
  sampleSizeOverride.value = null
  // Seed the custom-AQL / custom-table forms from the lot's current sampling
  // snapshot so "switching the level" or tweaking a row is a one-field change.
  const snap = lot.value?.samplingSnapshot
  samplingMode.value = snap?.adHoc ? (snap.planType === 'CUSTOM' ? 'table' : 'custom') : 'plan'
  aqlConfig.value =
    snap && snap.standardCode
      ? {
          standardCode: snap.standardCode,
          inspectionLevel: snap.inspectionLevel || 'II',
          switchingState: snap.switchingState || 'NORMAL',
          severityAqls: Array.isArray(snap.severityAqls) ? snap.severityAqls.map((r) => ({ ...r })) : defaultAqlConfig().severityAqls,
        }
      : defaultAqlConfig()
  customTable.value = Array.isArray(snap?.customPlanTable?.rows)
    ? {
        sampleSize: snap.customPlanTable.sampleSize ?? lot.value?.sampleSize ?? null,
        rows: snap.customPlanTable.rows.map((r) => ({ ...r })),
      }
    : defaultCustomPlanTable()
})

const customAqlValid = computed(
  () => !!aqlConfig.value.standardCode && !!aqlConfig.value.inspectionLevel,
)
const customTableValid = computed(
  () =>
    Number.isInteger(customTable.value.sampleSize) &&
    customTable.value.sampleSize >= 1 &&
    customTable.value.rows.length > 0 &&
    customTable.value.rows.every(
      (r) =>
        r.severityLabel &&
        Number.isInteger(r.accept) &&
        r.accept >= 0 &&
        Number.isInteger(r.reject) &&
        r.reject > r.accept,
    ),
)
const canSubmit = computed(
  () =>
    reason.value.trim().length > 0 &&
    !saving.value &&
    (samplingMode.value !== 'custom' || customAqlValid.value) &&
    (samplingMode.value !== 'table' || customTableValid.value),
)

// Ad-hoc override payload: STANDARD-shaped AQL config, or a CUSTOM table —
// same shapes resolveAdHocSampling accepts server-side.
function buildOverride() {
  if (samplingMode.value === 'custom') return { planType: 'STANDARD', ...aqlConfig.value }
  if (samplingMode.value === 'table') {
    return { planType: 'CUSTOM', customPlanTable: customTable.value }
  }
  return null
}

async function onSubmit() {
  if (!canSubmit.value) return
  saving.value = true
  try {
    await post(`/v1/services/qcInspection/lots/${props.lotId}/reopen`, {
      reason: reason.value.trim(),
      specificationId: specificationId.value || null,
      // An ad-hoc override wins server-side; send the plan id only in plan mode.
      samplingPlanId: samplingMode.value === 'plan' ? samplingPlanId.value || null : null,
      samplingOverride: buildOverride(),
      sampleSizeOverride: sampleSizeOverride.value || null,
      assignedTo: assignedTo.value || null,
    })
    toast.success('Lot reopened for re-inspection')
    show.value = false
    emit('reopened')
  } catch (err) {
    toast.error(err?.message || 'Reopen failed')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <BaseDialog v-model="show" title="Reopen for Re-inspection" :persistent="true">
    <div class="tw:p-5 tw:flex tw:flex-col tw:gap-4">
      <div
        class="tw:bg-amber-50 tw:border tw:border-amber-200 tw:rounded-lg tw:p-3 tw:text-sm tw:text-amber-800"
      >
        <p class="tw:font-medium">Reopening returns this lot to inspection.</p>
        <p class="tw:text-xs tw:mt-1">
          The previously recorded results are <strong>kept</strong> — the re-inspection continues
          from them. The current disposition is cleared and a re-inspection task is raised for the
          assigned inspector. This action is recorded in the lot's history.
        </p>
      </div>

      <BaseField label="Reason" required hint="Why is this lot being reopened? Kept in the audit trail.">
        <BaseTextarea
          v-model="reason"
          :rows="3"
          placeholder="e.g. Wrong sampling level applied; re-inspect at Level II against the revised spec."
          :required="true"
        />
      </BaseField>

      <BaseField label="Specification" hint="Pick the specification to re-inspect against.">
        <SpecificationSelectMenu
          v-model="specificationId"
          :productId="lot?.productId || null"
        />
      </BaseField>

      <BaseField
        label="Sampling"
        hint="Use an existing approved plan, set an ad-hoc AQL, or declare a fixed custom table for this re-inspection."
      >
        <SegmentedControl v-model="samplingMode" :options="SAMPLING_MODES" class="tw:mb-2" />
        <SamplingPlanSelectMenu
          v-if="samplingMode === 'plan'"
          v-model="samplingPlanId"
          :productId="lot?.productId || null"
          :inspectionPoint="lot?.inspectionPoint || null"
        />
        <div v-else-if="samplingMode === 'custom'" class="tw:rounded-lg tw:border tw:border-divider tw:p-3">
          <AqlConfigFields v-model="aqlConfig" />
          <p class="tw:mt-2 tw:text-xs tw:text-secondary">
            This AQL is applied to this lot only (not saved as a reusable plan). Sample size is
            recomputed on reopen.
          </p>
        </div>
        <div v-else class="tw:rounded-lg tw:border tw:border-divider tw:p-3">
          <!-- Same rows editor as the sampling-plan dialog's Custom table. -->
          <CustomPlanTableFields v-model="customTable" />
          <p class="tw:mt-2 tw:text-xs tw:text-secondary">
            These fixed numbers are applied to this lot only (not saved as a reusable plan).
          </p>
        </div>
      </BaseField>

      <BaseField
        label="Override sample size"
        hint="Optional — leave blank to use the size calculated from the plan / AQL. Set a value only to deviate; the reason above is recorded as the justification."
      >
        <BaseTextInput
          v-model.number="sampleSizeOverride"
          type="number"
          min="1"
          placeholder="Calculated automatically"
          class="tw:w-40"
        />
      </BaseField>

      <BaseField
        label="Re-inspection assigned to"
        hint="Defaults to the original inspector — change to reassign the re-inspection task."
      >
        <UserSelectMenu v-model="assignedTo" />
      </BaseField>
    </div>

    <template #footer>
      <BaseDialogFooter
        submitLabel="Reopen for Re-inspection"
        :loading="saving"
        :disabled="!canSubmit"
        @cancel="show = false"
        @submit="onSubmit"
      />
    </template>
  </BaseDialog>
</template>
