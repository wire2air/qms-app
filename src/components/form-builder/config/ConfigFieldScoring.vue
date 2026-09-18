<script setup>
/**
 * Per-field scoring authoring (generic scoring engine). Writes to
 * `field.scoring`; the schema is JSONB and DynamicForm ignores unknown props,
 * so this is purely additive. Rendered by FormFieldConfig for scorable input
 * types. The compute lives in `composables/useModuleScoring.js` (and its
 * backend mirror). Reused on any evaluation form — Supplier Qualification is
 * just this engine applied to a supplier-scoped module.
 */
import { IconSparkles } from '@tabler/icons-vue'

const field = defineModel('field', { type: Object, required: true })

const BOOLEAN_TYPES = new Set(['checkbox', 'toggle'])
const OPTION_TYPES = new Set(['select', 'radio', 'optionGroup'])
const NUMERIC_TYPES = new Set(['number', 'slider', 'rating'])
const NARRATIVE_TYPES = new Set(['textarea', 'textEditor'])

const kind = computed(() => {
  const t = field.value?.type
  if (BOOLEAN_TYPES.has(t)) return 'boolean'
  if (OPTION_TYPES.has(t)) return 'options'
  if (NUMERIC_TYPES.has(t)) return 'numeric'
  if (NARRATIVE_TYPES.has(t)) return 'narrative'
  if (t === 'file') return 'file'
  return 'other'
})

// Custom string options this field defines (per-option scoring only applies to
// custom options, not OptionSet-backed fields resolved at render time).
const customOptions = computed(() =>
  Array.isArray(field.value?.options) ? field.value.options.filter((o) => o !== '') : [],
)

function ensureScoring() {
  if (!field.value.scoring) field.value.scoring = {}
  return field.value.scoring
}

const enabled = computed({
  get: () => !!field.value?.scoring?.enabled,
  set: (v) => {
    const s = ensureScoring()
    s.enabled = v
    if (v) {
      if (s.weight == null) s.weight = 1
      if (kind.value === 'boolean') {
        if (s.yesScore == null) s.yesScore = 100
        if (s.noScore == null) s.noScore = 0
      }
      if (kind.value === 'options' && !s.optionScores) s.optionScores = {}
    }
  },
})

// Reactive accessors that lazily materialise field.scoring.* so v-model writes
// land on the field node.
function prop(name, fallback = null) {
  return computed({
    get: () => field.value?.scoring?.[name] ?? fallback,
    set: (v) => {
      ensureScoring()[name] = v
    },
  })
}
const weight = prop('weight', 1)
const yesScore = prop('yesScore', 100)
const noScore = prop('noScore', 0)
const scaleMin = prop('scaleMin', null)
const scaleMax = prop('scaleMax', null)
const riskFactor = prop('riskFactor', '')
const aiEvaluation = prop('aiEvaluation', false)
const aiExtract = prop('aiExtract', false)
const verifyExpiry = prop('verifyExpiry', false)
const aiPrompt = prop('aiPrompt', '')

function optionScore(opt) {
  return computed({
    get: () => field.value?.scoring?.optionScores?.[opt] ?? null,
    set: (v) => {
      const s = ensureScoring()
      if (!s.optionScores) s.optionScores = {}
      s.optionScores[opt] = v === '' || v == null ? null : Number(v)
    },
  })
}
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-3 tw:pt-3 tw:mt-3 tw:border-t tw:border-divider">
    <BaseCheckbox v-model="enabled"> Include this field in the score </BaseCheckbox>

    <template v-if="enabled">
      <BaseField
        label="Weight"
        hint="Relative importance in the weighted average. Higher = more impact on the total."
      >
        <BaseTextInput v-model.number="weight" type="number" :min="0" :step="0.5" size="sm" />
      </BaseField>

      <!-- Yes/No -->
      <div v-if="kind === 'boolean'" class="tw:grid tw:grid-cols-2 tw:gap-3">
        <BaseField label="Score when Yes">
          <BaseTextInput v-model.number="yesScore" type="number" :min="0" :max="100" size="sm" />
        </BaseField>
        <BaseField label="Score when No">
          <BaseTextInput v-model.number="noScore" type="number" :min="0" :max="100" size="sm" />
        </BaseField>
      </div>

      <!-- Per-option -->
      <template v-else-if="kind === 'options'">
        <div v-if="customOptions.length" class="tw:flex tw:flex-col tw:gap-2">
          <BaseText variant="caption" class="tw:text-secondary">
            Score for each option (0–100)
          </BaseText>
          <div
            v-for="opt in customOptions"
            :key="opt"
            class="tw:flex tw:items-center tw:gap-2 tw:bg-main-hover tw:rounded-lg tw:px-2 tw:py-1.5"
          >
            <span class="tw:flex-1 tw:text-sm tw:text-on-main tw:truncate">{{ opt }}</span>
            <BaseTextInput
              v-model.number="optionScore(opt).value"
              type="number"
              :min="0"
              :max="100"
              size="sm"
              class="tw:w-24"
            />
          </div>
        </div>
        <p v-else class="tw:text-xs tw:text-secondary">
          Add custom options to this field to score each one. Option-set-backed fields can't be
          per-option scored yet.
        </p>
      </template>

      <!-- Numeric scale -->
      <div v-else-if="kind === 'numeric'" class="tw:flex tw:flex-col tw:gap-2">
        <BaseText variant="caption" class="tw:text-secondary">
          Map the raw value onto 0–100 (linear). Leave blank to use the field's Min/Max.
        </BaseText>
        <div class="tw:grid tw:grid-cols-2 tw:gap-3">
          <BaseField label="Value → 0">
            <BaseTextInput v-model.number="scaleMin" type="number" size="sm" placeholder="min" />
          </BaseField>
          <BaseField label="Value → 100">
            <BaseTextInput v-model.number="scaleMax" type="number" size="sm" placeholder="max" />
          </BaseField>
        </div>
      </div>

      <!-- Narrative AI -->
      <div
        v-else-if="kind === 'narrative'"
        class="tw:flex tw:flex-col tw:gap-2 tw:rounded-lg tw:bg-primary/5 tw:p-3"
      >
        <BaseCheckbox v-model="aiEvaluation">
          <span class="tw:inline-flex tw:items-center tw:gap-1">
            <IconSparkles :size="14" class="tw:text-primary" /> Score this answer with AI
          </span>
        </BaseCheckbox>
        <BaseField
          v-if="aiEvaluation"
          label="Evaluation prompt"
          hint="What should the AI assess? e.g. 'Rate the completeness of the supplier's quality management response.'"
        >
          <BaseTextarea v-model="aiPrompt" :rows="3" size="sm" />
        </BaseField>
      </div>

      <!-- File AI extract / expiry -->
      <div
        v-else-if="kind === 'file'"
        class="tw:flex tw:flex-col tw:gap-2 tw:rounded-lg tw:bg-primary/5 tw:p-3"
      >
        <BaseCheckbox v-model="aiExtract">
          <span class="tw:inline-flex tw:items-center tw:gap-1">
            <IconSparkles :size="14" class="tw:text-primary" /> Read the uploaded document with AI
          </span>
        </BaseCheckbox>
        <BaseCheckbox v-if="aiExtract" v-model="verifyExpiry">
          Check certificate expiry date
        </BaseCheckbox>
        <BaseField
          v-if="aiExtract"
          label="Extraction prompt"
          hint="What to pull from the document, e.g. 'Extract the ISO certificate number and expiry date.'"
        >
          <BaseTextarea v-model="aiPrompt" :rows="3" size="sm" />
        </BaseField>
      </div>

      <BaseField
        label="Risk factor (optional)"
        hint="Free-text tag surfaced in the score breakdown, e.g. 'Critical supplier'."
      >
        <BaseTextInput v-model="riskFactor" size="sm" placeholder="—" />
      </BaseField>
    </template>
  </div>
</template>
