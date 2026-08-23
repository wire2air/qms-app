<script setup>
// Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { post } from '@/api'
import { canUseAi } from '@/utils/currentSession.js'
const props = defineProps({
  modelValue: { type: Object, default: null },
  field: { type: Object, required: true },
  readonly: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  /** All values on the form, so the field can read its problem source. */
  formValues: { type: Object, default: () => ({}) },
})



const emit = defineEmits(['update:modelValue'])

/**
 * What is being assessed, carried in from the parent record.
 *
 * The matrix asked for a likelihood and a severity with no statement of what
 * they applied to, so the assessor had to leave the step to find out — the same
 * gap the RCA field closed with problemField. Read-only here: it belongs to the
 * record, and an assessment is not the place to restate the problem.
 */
const problemText = computed(() => {
  // Defaulted: schemas seeded before 2026-08-20 carry no problemField, and
  // '_parent_problem' is what every module publishes.
  const src = props.field?.problemField ?? '_parent_problem'
  if (!src) return ''
  return props.formValues?.[src] ?? ''
})

// Prefer embedded snapshot; fall back to FK lookup. See RcaField for
// the rationale.
// Every template the tenant has, so a field the author never bound can still
// resolve one (user report 2026-08-16: adding the field said "no template
// linked" even with exactly one template configured).
const availableTemplates = useLiveQuery((db) => db.RiskAssessmentTemplate.where().exec(), {
  models: ['RiskAssessmentTemplate'],
  initial: [],
})

// Resolution order, most specific first:
//   1. the id on THIS answer — the responder's own pick, see setTemplate
//   2. the id the form author bound to the field
//   3. the only template there is
// With several templates and no binding we resolve nothing on purpose:
// picking one arbitrarily would silently score the risk on the wrong matrix.
const effectiveTemplateId = computed(() => {
  const chosen = props.modelValue?._templateId
  if (chosen) return chosen
  if (props.field.riskAssessmentTemplateId) return props.field.riskAssessmentTemplateId
  return availableTemplates.value.length === 1 ? availableTemplates.value[0].id : null
})

const template = useLiveQueryWithDeps(
  [() => props.field.riskAssessmentTemplate, () => effectiveTemplateId.value],

  async (db, [embedded, id]) => {
    if (embedded?.config) return embedded
    if (!id) return null
    return db.RiskAssessmentTemplate.findByPk(id)
  },
  { models: ['RiskAssessmentTemplate'] },
)

// Switching matrix invalidates any score already picked — likelihood/severity
// ids belong to the template they came from — so the whole answer is reset
// rather than left half-mapped onto the new one.
function setTemplate(id) {
  if (props.readonly || props.disabled || !id) return
  emit('update:modelValue', { _templateId: id })
}

const canPickTemplate = computed(
  () => !props.readonly && !props.disabled && availableTemplates.value.length > 1,
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

// ── AI: suggest an assessment ───────────────────────────────────────────────
// Proposes a likelihood and a severity ON THIS TEMPLATE'S OWN SCALES, with the
// reasoning for each — the assessor argues with a proposal instead of staring
// at a grid. Applied through the same selectCell path a human click takes.
const aiBusy = ref(false)
const aiPanel = ref(null)

function levelFor(rows) {
  return rows.map((l) => ({
    id: l.id,
    label: l.label,
    score: l.score ?? l.order ?? undefined,
    description: l.description ?? undefined,
  }))
}

async function suggestWithAi() {
  aiBusy.value = true
  aiPanel.value = null
  try {
    const data = await post(
      '/v1/services/ai/risk/suggest',
      {
        problem: String(problemText.value)
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim(),
        likelihoodLevels: levelFor(likelihood.value),
        severityLevels: levelFor(severity.value),
      },
      { showError: true },
    )
    const r = data.result
    if (r?.likelihoodId && r?.severityId) {
      selectCell(r.likelihoodId, r.severityId)
      aiPanel.value = {
        likelihoodRationale: r.likelihoodRationale,
        severityRationale: r.severityRationale,
        unknowns: r.unknowns ?? [],
      }
    }
  } finally {
    aiBusy.value = false
  }
}

function applyAiRationale() {
  const r = aiPanel.value
  if (!r) return
  // APPENDED, not replaced: the assessor may already have context written, and
  // the rationale is an argument alongside it, not a substitute for it.
  const block =
    `<p><strong>Likelihood:</strong> ${r.likelihoodRationale}</p>` +
    `<p><strong>Severity:</strong> ${r.severityRationale}</p>`
  updateNotes(notes.value ? `${notes.value}${block}` : block)
  aiPanel.value = { ...r, applied: true }
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

// Kept for the commented-out Hazard category field — prefixed so lint accepts
// an intentionally-unused setter rather than us deleting the pair and having
// to rewrite both to restore the field.
function _setHazardCategory(id) {
  patchFinalized({ hazardCategoryId: id })
}
void _setHazardCategory

// Kept alongside the hidden Assessment type control, same as
// _setHazardCategory above — the void keeps lint quiet without deleting the
// setter the commented-out field needs if it is restored.
function _setAssessmentType(t) {
  patchFinalized({ assessmentType: t })
}
void _setAssessmentType

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

// Hazard category is HIDDEN (user request 2026-08-15) and therefore no longer
// gates finalisation — leaving it in canFinalize with no field to satisfy it
// would make the Finalize button permanently dead. The value is still written
// to `finalized` when present so historical assessments keep theirs, and
// rcaRaDerivationService keeps denormalising the label/colour it already
// stored. Restore the field block below to bring it back.
const canFinalize = computed(
  () => !!selectedLikelihoodId.value && !!selectedSeverityId.value && !!assessmentType.value,
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

    <!-- What is being assessed. Read-only — it belongs to the record, and an
         assessment is not the place to restate the problem. -->
    <div v-if="problemText" class="tw:flex tw:flex-col tw:gap-1">
      <div class="tw:flex tw:items-center tw:justify-between tw:gap-2">
        <label
          class="tw:text-caption tw:font-semibold tw:text-secondary tw:uppercase tw:tracking-wider"
        >
          Assessing
        </label>
        <!-- A starting point on the tenant's own scales, not a verdict — the
             proposal lands via the same selectCell path a human click takes,
             and the rationale shows so the assessor judges the argument. -->
        <BaseButton
          v-if="canUseAi && template && !isFinalized && !readonly && !disabled"
          variant="outline"
          size="sm"
          :isLoading="aiBusy"
          @click="suggestWithAi"
        >
          ✨ Suggest with AI
        </BaseButton>
      </div>
      <div
        class="tw:text-sm tw:text-on-main tw:leading-relaxed tw:bg-main-hover/30 tw:border tw:border-divider tw:rounded-lg tw:p-3"
        v-html="problemText"
      />
      <div
        v-if="aiPanel"
        class="tw:rounded-md tw:border tw:border-primary/30 tw:bg-primary/5 tw:p-3 tw:flex tw:flex-col tw:gap-1.5"
      >
        <div class="tw:flex tw:items-center tw:justify-between">
          <BaseText class="tw:text-xs tw:font-semibold">AI rationale</BaseText>
          <button
            class="tw:text-xs tw:text-secondary tw:hover:text-on-main tw:bg-transparent tw:border-0 tw:cursor-pointer"
            @click="aiPanel = null"
          >
            ✕
          </button>
        </div>
        <BaseText class="tw:text-xs"
          ><strong>Likelihood:</strong> {{ aiPanel.likelihoodRationale }}</BaseText
        >
        <BaseText class="tw:text-xs"
          ><strong>Severity:</strong> {{ aiPanel.severityRationale }}</BaseText
        >
        <ul v-if="aiPanel.unknowns?.length" class="tw:m-0 tw:pl-4 tw:text-xs tw:text-amber-700">
          <li v-for="(u, i) in aiPanel.unknowns" :key="i">{{ u }}</li>
        </ul>
        <div class="tw:flex tw:items-center tw:gap-2 tw:pt-1">
          <BaseButton size="sm" :disabled="aiPanel.applied" @click="applyAiRationale">
            {{ aiPanel.applied ? 'Applied' : 'Apply to Justification' }}
          </BaseButton>
          <BaseText v-if="aiPanel.applied" color="secondary" class="tw:text-xs">
            Appended below — edit it freely.
          </BaseText>
        </div>
      </div>
    </div>

    <!-- Change the matrix. Only when there is a choice to make. -->
    <div v-if="canPickTemplate && template" class="tw:mt-3 tw:flex tw:items-center tw:gap-2">
      <span class="tw:text-xs tw:text-secondary tw:shrink-0">Matrix</span>
      <RiskAssessmentTemplateSelectMenu
        :modelValue="template.id"
        :required="true"
        class="tw:min-w-56"
        @update:modelValue="setTemplate"
      />
    </div>

    <!-- No template -->
    <div
      v-else-if="!template"
      class="tw:text-sm tw:text-secondary tw:border tw:border-divider tw:rounded-lg tw:p-4 tw:text-center"
    >
      <template v-if="availableTemplates.length">
        Pick the risk matrix to assess against.
        <RiskAssessmentTemplateSelectMenu
          v-if="!readonly && !disabled"
          :modelValue="null"
          :required="true"
          class="tw:mt-2 tw:min-w-56"
          @update:modelValue="setTemplate"
        />
      </template>
      <template v-else>
        No risk assessment template exists yet. Ask an administrator to create one.
      </template>
    </div>

    <template v-else>
      <!-- Assessment type (INITIAL / RESIDUAL). Sits above the matrix
           because it affects interpretation of the selected risk band —
           a residual score reads differently from an initial one.
           (Hazard category used to sit here too; see below.) -->
      <div
        class="tw:flex tw:flex-col tw:gap-3 tw:border tw:border-divider tw:rounded-lg tw:p-3 tw:bg-main-hover/30"
      >
        <!-- HIDDEN (user request 2026-08-15) — not deleted. Existing
             assessments keep their hazardCategoryId/Label/Color, the
             hazard_categories lookup is untouched, and setHazardCategory /
             the finalize payload still carry the value. Un-comment to
             restore, and put hazardCategoryId back in canFinalize above. -->
        <!--
        <BaseField label="Hazard category" required size="sm">
          <HazardCategorySelectMenu
            :modelValue="hazardCategoryId"
            :required="true"
            @update:modelValue="setHazardCategory"
          />
        </BaseField>
        -->
        <!-- HIDDEN (user request 2026-08-20), same treatment as hazard
             category above — hidden, not deleted.

             Initial-vs-residual is a risk-management distinction: you score a
             hazard before mitigation, mitigate it, then score again. An NC is
             assessed once, so the toggle asked a question with no meaning in
             this context and no obvious right answer.

             The value still exists and still defaults to INITIAL, so
             `finalized.assessmentType` keeps its shape, historical assessments
             keep whatever they were scored as, and canFinalize is unaffected
             (it tests assessmentType, which is never empty). Un-comment to
             restore. -->
        <!--
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
              @click="_setAssessmentType(t)"
            >
              {{ t === 'INITIAL' ? 'Initial (before mitigation)' : 'Residual (after mitigation)' }}
            </button>
          </div>
        </BaseField>
        -->
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
          <span class="tw:text-micro tw:text-secondary tw:bg-divider tw:rounded tw:px-1.5 tw:py-0.5"
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
      <BaseField label="Justification" size="sm">
        <!-- Rich text since 2026-08-24 (user request). Readonly renders the
             HTML directly; the payload key stays `notes`. -->
        <!-- eslint-disable-next-line vue/no-v-html -->
        <div
          v-if="readonly || disabled"
          class="tw:text-sm tw:text-on-main"
          v-html="notes"
        />
        <BaseRichTextEditor
          v-else
          :modelValue="notes"
          placeholder="Explain the rationale for this risk assessment — controls in place, what would change between initial and residual, etc."
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
            Pick a likelihood and severity on the matrix to finalize.
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
