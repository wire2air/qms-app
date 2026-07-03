<script setup>
const props = defineProps({
  modelValue: { type: Object, default: null },
  field: { type: Object, required: true },
  readonly: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue'])

// Prefer embedded snapshot; fall back to FK lookup. See RcaField for
// the rationale.
const template = useLiveQueryWithDeps(
  [() => props.field.riskAssessmentTemplate, () => props.field.riskAssessmentTemplateId],

  async (db, [embedded, id]) => {
    if (embedded?.config) return embedded
    if (!id) return null
    return db.RiskAssessmentTemplate.findByPk(id)
  },
  { models: ['RiskAssessmentTemplate'] },
)

const likelihood = computed(() => template.value?.config?.likelihood ?? [])
const severity = computed(() => template.value?.config?.severity ?? [])
const riskLevels = computed(() => template.value?.config?.riskLevels ?? [])
const cells = computed(() => template.value?.config?.cells ?? {})
const detectability = computed(() => template.value?.config?.detectability ?? [])
const enableDetectability = computed(() => template.value?.config?.enableDetectability ?? false)
const selectedDetectabilityId = computed(() => props.modelValue?.detectabilityId ?? null)
const selectedDetectability = computed(
  () => detectability.value.find((d) => d.id === selectedDetectabilityId.value) ?? null,
)

function cellKey(likelihoodId, severityId) {
  return `${likelihoodId}:${severityId}`
}

function cellLevel(likelihoodId, severityId) {
  const key = cellKey(likelihoodId, severityId)
  const levelId = cells.value[key]
  return riskLevels.value.find((r) => r.id === levelId) ?? null
}

const selectedLikelihoodId = computed(() => props.modelValue?.likelihoodId ?? null)
const selectedSeverityId = computed(() => props.modelValue?.severityId ?? null)
const selectedRiskLevelId = computed(() => props.modelValue?.riskLevelId ?? null)

const selectedRiskLevel = computed(
  () => riskLevels.value.find((r) => r.id === selectedRiskLevelId.value) ?? null,
)

function computeRpn(likelihoodId, severityId, detectabilityId) {
  const l = likelihood.value.find((x) => x.id === likelihoodId)
  const s = severity.value.find((x) => x.id === severityId)
  const lScore = l?.score ?? l?.order ?? 1
  const sScore = s?.score ?? s?.order ?? 1
  if (enableDetectability.value && detectabilityId) {
    const d = detectability.value.find((x) => x.id === detectabilityId)
    const dScore = d?.score ?? d?.order ?? 1
    return lScore * sScore * dScore
  }
  return lScore * sScore
}

// Any input change after Finalize clears the finalizedAt stamp so the
// user has to re-finalize before submitting — keeps the frozen labels
// in sync with whatever the matrix says right now.
function clearFinalizedStamp(patch) {
  const next = { ...(props.modelValue ?? {}), ...patch }
  if (next.finalized?.finalizedAt) {
    next.finalized = { ...next.finalized, finalizedAt: null }
  }
  return next
}

function selectCell(likelihoodId, severityId) {
  if (props.readonly || props.disabled) return
  const key = cellKey(likelihoodId, severityId)
  const levelId = cells.value[key] ?? null
  const rpnScore = computeRpn(likelihoodId, severityId, selectedDetectabilityId.value)
  emit(
    'update:modelValue',
    clearFinalizedStamp({
      _templateId: template.value?.id ?? null,
      likelihoodId,
      severityId,
      riskLevelId: levelId,
      rpnScore,
    }),
  )
}

function selectDetectability(detectabilityId) {
  if (props.readonly || props.disabled) return
  const rpnScore = computeRpn(selectedLikelihoodId.value, selectedSeverityId.value, detectabilityId)
  emit('update:modelValue', clearFinalizedStamp({ detectabilityId, rpnScore }))
}

function isSelectedCell(likelihoodId, severityId) {
  return selectedLikelihoodId.value === likelihoodId && selectedSeverityId.value === severityId
}

function updateNotes(notes) {
  emit('update:modelValue', { ...(props.modelValue ?? {}), notes })
}

const notes = computed(() => props.modelValue?.notes ?? '')

// ─── Finalize: hazard category + INITIAL / RESIDUAL + frozen labels ──────────
//
// The matrix selection above tells you "what risk level" — the
// finalize step adds the categorisation ("what KIND of risk") +
// whether this is the pre-mitigation or post-mitigation assessment.
// Once finalized, every label + score is denormalized onto the
// payload so reports stay self-consistent across template edits and
// category renames. Same drift-protection pattern as
// freezeFormPayloadLabels.

const hazardCategories = useLiveQuery(
  (db) => db.HazardCategory.where().orderBy('displayOrder').exec(),

  { models: ['HazardCategory'], initial: [] },
)

const hazardCategoryId = computed(() => props.modelValue?.finalized?.hazardCategoryId ?? null)
const assessmentType = computed(() => props.modelValue?.finalized?.assessmentType ?? 'INITIAL')
const isFinalized = computed(() => !!props.modelValue?.finalized?.finalizedAt)

function patchFinalized(patch) {
  if (props.readonly || props.disabled) return
  emit('update:modelValue', {
    ...(props.modelValue ?? {}),
    finalized: {
      ...(props.modelValue?.finalized ?? {}),
      ...patch,
      // Any edit to finalize-time fields invalidates the prior stamp.
      finalizedAt: null,
    },
  })
}

function setHazardCategory(id) {
  patchFinalized({ hazardCategoryId: id })
}

function setAssessmentType(t) {
  patchFinalized({ assessmentType: t })
}

// Read enough off the template config to denormalize labels + scores
// onto the finalized payload at click time.
function findById(arr, id) {
  return arr.find((x) => x.id === id) ?? null
}

function onFinalizeAssessment() {
  if (props.readonly || props.disabled) return
  if (!selectedLikelihoodId.value || !selectedSeverityId.value) return // matrix not picked
  const l = findById(likelihood.value, selectedLikelihoodId.value)
  const s = findById(severity.value, selectedSeverityId.value)
  const r = selectedRiskLevel.value
  const d =
    enableDetectability.value && selectedDetectabilityId.value
      ? findById(detectability.value, selectedDetectabilityId.value)
      : null
  const cat = hazardCategoryId.value
    ? findById(hazardCategories.value, hazardCategoryId.value)
    : null

  emit('update:modelValue', {
    ...(props.modelValue ?? {}),
    finalized: {
      assessmentType: assessmentType.value,
      hazardCategoryId: cat?.id ?? null,
      hazardCategoryLabel: cat?.name ?? null,
      hazardCategoryColor: cat?.color ?? null,
      likelihoodId: l?.id ?? null,
      likelihoodLabel: l?.label ?? null,
      likelihoodScore: l?.score ?? l?.order ?? null,
      severityId: s?.id ?? null,
      severityLabel: s?.label ?? null,
      severityScore: s?.score ?? s?.order ?? null,
      detectabilityId: d?.id ?? null,
      detectabilityLabel: d?.label ?? null,
      detectabilityScore: d?.score ?? d?.order ?? null,
      computedRiskLevelId: r?.id ?? null,
      computedRiskLevelLabel: r?.label ?? null,
      computedScore: props.modelValue?.rpnScore ?? null,
      justification: props.modelValue?.notes ?? null,
      finalizedAt: new Date().toISOString(),
    },
  })
}

const canFinalize = computed(
  () =>
    !!selectedLikelihoodId.value &&
    !!selectedSeverityId.value &&
    !!hazardCategoryId.value &&
    !!assessmentType.value,
)

// Auto-finalize hook for the workflow step form. Mirrors RcaField's
// registration — saves the user a click on the per-field Finalize
// Assessment button when they hit Save Draft / Mark Complete on the
// step form. No-op when the matrix isn't fully picked yet, already
// finalized, or the field is read-only.
const formFinalizers = inject('formFinalizers', null)
function autoFinalize() {
  if (props.readonly || props.disabled) return
  if (isFinalized.value) return
  if (!canFinalize.value) return
  onFinalizeAssessment()
}
onMounted(() => {
  formFinalizers?.add(autoFinalize)
})
onBeforeUnmount(() => {
  formFinalizers?.delete(autoFinalize)
})
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-4">
    <!-- Loading -->
    <div v-if="template === undefined" class="tw:text-sm tw:text-secondary tw:animate-pulse">
      Loading...
    </div>

    <!-- No template -->
    <div
      v-else-if="!template"
      class="tw:text-sm tw:text-secondary tw:border tw:border-divider tw:rounded-lg tw:p-4 tw:text-center"
    >
      No risk assessment template linked to this field. Contact your administrator.
    </div>

    <template v-else>
      <!-- Hazard category + assessment type (INITIAL / RESIDUAL). These
           sit above the matrix because they affect interpretation of
           the selected risk band — "Quality risk, residual" reads
           differently than "Safety risk, initial". -->
      <div
        class="tw:flex tw:flex-col tw:gap-3 tw:border tw:border-divider tw:rounded-lg tw:p-3 tw:bg-main-hover/30"
      >
        <BaseField label="Hazard category" required size="sm">
          <HazardCategorySelectMenu
            :modelValue="hazardCategoryId"
            :required="true"
            @update:modelValue="setHazardCategory"
          />
        </BaseField>
        <BaseField label="Assessment type" required size="sm">
          <div class="tw:flex tw:gap-2">
            <button
              v-for="t in ['INITIAL', 'RESIDUAL']"
              :key="t"
              class="tw:flex-1 tw:text-xs tw:font-medium tw:rounded tw:px-3 tw:py-1.5 tw:border tw:transition-colors tw:cursor-pointer"
              :class="
                assessmentType === t
                  ? 'tw:border-primary tw:bg-primary tw:text-white'
                  : 'tw:border-divider tw:bg-white tw:text-secondary tw:hover:border-primary/50'
              "
              :disabled="readonly || disabled"
              @click="setAssessmentType(t)"
            >
              {{ t === 'INITIAL' ? 'Initial (before mitigation)' : 'Residual (after mitigation)' }}
            </button>
          </div>
        </BaseField>
      </div>

      <!-- Selected risk level display -->
      <div
        v-if="selectedRiskLevel"
        class="tw:flex tw:items-center tw:gap-3 tw:rounded-lg tw:p-3 tw:border tw:border-divider"
        :style="{ backgroundColor: selectedRiskLevel.bg + '33', borderColor: selectedRiskLevel.bg }"
      >
        <div
          class="tw:text-sm tw:font-bold tw:px-3 tw:py-1 tw:rounded-md tw:shrink-0"
          :style="{ backgroundColor: selectedRiskLevel.bg, color: selectedRiskLevel.text }"
        >
          {{ selectedRiskLevel.label }}
        </div>
        <div class="tw:flex tw:flex-col tw:flex-1 tw:min-w-0">
          <span class="tw:text-xs tw:font-medium tw:text-on-main">
            {{ likelihood.find((l) => l.id === selectedLikelihoodId)?.label ?? '' }}
            ×
            {{ severity.find((s) => s.id === selectedSeverityId)?.label ?? '' }}
            <template v-if="enableDetectability && selectedDetectability">
              × {{ selectedDetectability.label }}
            </template>
          </span>
          <span v-if="!readonly && !disabled" class="tw:text-caption tw:text-secondary">
            Click another cell to change selection
          </span>
        </div>
        <div
          v-if="modelValue?.rpnScore"
          class="tw:flex tw:flex-col tw:items-center tw:shrink-0 tw:bg-white/60 tw:rounded-lg tw:px-3 tw:py-1.5"
        >
          <span
            class="tw:text-caption tw:font-semibold tw:uppercase tw:tracking-wider tw:text-secondary"
            >RPN</span
          >
          <span class="tw:text-xl tw:font-bold tw:text-on-main tw:leading-none">{{
            modelValue.rpnScore
          }}</span>
        </div>
      </div>
      <div
        v-else-if="!readonly && !disabled"
        class="tw:text-sm tw:text-secondary tw:text-center tw:py-2"
      >
        Click a cell to select your risk level
      </div>

      <!-- Matrix -->
      <div class="tw:overflow-x-auto">
        <table class="tw:border-collapse">
          <thead>
            <tr>
              <th
                class="tw:w-28 tw:text-caption tw:text-secondary tw:font-semibold tw:uppercase tw:tracking-wider tw:text-right tw:pr-2 tw:pb-1"
              >
                Likelihood ↓ / Severity →
              </th>
              <th
                v-for="col in severity"
                :key="col.id"
                class="tw:text-caption tw:font-semibold tw:text-on-main tw:text-center tw:pb-1 tw:px-1 tw:min-w-[72px]"
              >
                {{ col.label }}
                <div class="tw:text-micro tw:font-normal tw:text-secondary">
                  ({{ col.score ?? col.order }})
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in likelihood" :key="row.id">
              <td
                class="tw:text-caption tw:font-semibold tw:text-on-main tw:text-right tw:pr-2 tw:py-0.5 tw:whitespace-nowrap"
              >
                {{ row.label }}
                <div class="tw:text-micro tw:font-normal tw:text-secondary">
                  ({{ row.score ?? row.order }})
                </div>
              </td>
              <td v-for="col in severity" :key="col.id" class="tw:p-0.5">
                <BaseClickableRow
                  :disabled="readonly || disabled"
                  class="tw:w-[72px] tw:h-10 tw:flex tw:items-center tw:justify-center tw:text-xs tw:font-semibold tw:rounded tw:transition-all tw:select-none"
                  :class="[
                    readonly || disabled ? 'tw:cursor-default' : 'tw:hover:opacity-80',
                    isSelectedCell(row.id, col.id)
                      ? 'tw:ring-2 tw:ring-offset-1 tw:ring-primary tw:shadow-md tw:scale-105'
                      : '',
                  ]"
                  :style="
                    cellLevel(row.id, col.id)
                      ? {
                          backgroundColor: cellLevel(row.id, col.id).bg,
                          color: cellLevel(row.id, col.id).text,
                        }
                      : { backgroundColor: '#f3f4f6', color: '#9ca3af' }
                  "
                  :aria-label="`Select risk: ${row.label} by ${col.label}`"
                  @click="selectCell(row.id, col.id)"
                >
                  {{ cellLevel(row.id, col.id)?.label ?? '—' }}
                </BaseClickableRow>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Detectability selector (FMEA 3-factor) -->
      <div v-if="enableDetectability" class="tw:flex tw:flex-col tw:gap-2">
        <div class="tw:flex tw:items-center tw:gap-2">
          <label class="tw:text-xs tw:font-medium tw:text-secondary">Detectability</label>
          <span
            class="tw:text-micro tw:text-secondary tw:bg-divider tw:rounded tw:px-1.5 tw:py-0.5"
            >FMEA</span
          >
        </div>
        <p class="tw:text-caption tw:text-secondary tw:-mt-1">
          How easily can this failure be detected? Lower score = easier to detect.
        </p>
        <div class="tw:flex tw:flex-wrap tw:gap-1.5">
          <button
            v-for="item in detectability"
            :key="item.id"
            class="tw:flex tw:items-center tw:gap-1.5 tw:rounded-lg tw:border tw:px-3 tw:py-1.5 tw:text-xs tw:font-medium tw:transition-colors tw:cursor-pointer"
            :class="
              selectedDetectabilityId === item.id
                ? 'tw:border-primary tw:bg-primary/10 tw:text-primary'
                : 'tw:border-divider tw:text-secondary tw:hover:border-primary/50'
            "
            :disabled="readonly || disabled"
            @click="selectDetectability(item.id)"
          >
            {{ item.label }}
            <span class="tw:text-micro tw:opacity-60">({{ item.score ?? item.order }})</span>
          </button>
        </div>
      </div>

      <!-- Justification (formerly "Notes" — same field name on the
           payload for backward compat; the label changed because the
           text now anchors the finalized assessment's rationale, not
           just freeform notes). -->
      <BaseField v-slot="{ id: fieldId }" label="Justification" size="sm">
        <BaseTextarea
          :id="fieldId"
          :modelValue="notes"
          placeholder="Explain the rationale for this risk assessment — controls in place, what would change between initial and residual, etc."
          :rows="2"
          :readonly="readonly || disabled"
          @update:modelValue="updateNotes"
        />
      </BaseField>

      <!-- Finalize. Mirrors RcaField's pattern — once clicked, the
           hazard / matrix / detectability / justification are frozen
           onto modelValue.finalized as denormalized labels + scores
           and the BE step-submit hook derives a risk_assessments row
           from that snapshot on next task approval. Changing any
           input after finalize clears the stamp and requires a
           re-finalize. -->
      <div
        v-if="!readonly && !disabled"
        class="tw:flex tw:items-center tw:justify-between tw:pt-3 tw:border-t tw:border-divider"
      >
        <span class="tw:text-xs tw:text-secondary">
          <template v-if="isFinalized">
            Finalized {{ new Date(modelValue.finalized.finalizedAt).toLocaleString() }}
          </template>
          <template v-else-if="!canFinalize">
            Pick a hazard category, assessment type, and a matrix cell to finalize.
          </template>
          <template v-else> Mark complete to lock the assessment into reports. </template>
        </span>
        <button
          v-if="!isFinalized"
          class="tw:text-xs tw:bg-primary tw:text-white tw:rounded tw:px-3 tw:py-1.5 tw:hover:bg-primary/90 tw:disabled:opacity-50 tw:disabled:cursor-not-allowed tw:transition-colors tw:border-0 tw:cursor-pointer"
          :disabled="!canFinalize"
          @click="onFinalizeAssessment"
        >
          Finalize Assessment
        </button>
      </div>
    </template>
  </div>
</template>
