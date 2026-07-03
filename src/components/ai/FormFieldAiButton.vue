<script setup>
/**
 * AI sidecar — on-demand evaluation of a single module form field. Two modes,
 * chosen by the field's scoring config:
 *   - narrative (field.scoring.aiEvaluation): "Score with AI" → 0–100 + rationale.
 *   - file (field.scoring.aiExtract): "Read document" → extracted fields + expiry.
 *
 * The result is written to the record payload companion key
 * `"<fieldName>__ai"` (via v-model:result), which the scoring engine folds into
 * the weighted total. Reviewable + overridable: the score / status can be
 * edited or cleared before the record is submitted. Gate the mount with
 * `canUseAi` at the call site so non-AI tenants never see it.
 */
import { IconSparkles, IconLoader2, IconX } from '@tabler/icons-vue'
// Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { post } from '@/api'

const props = defineProps({
  field: { type: Object, required: true },
  // The current answer for this field from the record payload.
  answer: { type: [String, Number, Array, Object], default: null },
})
const result = defineModel('result', { type: Object, default: null })

const toast = useToast()
const loading = ref(false)

const scoring = computed(() => props.field?.scoring || {})
const mode = computed(() => {
  if (scoring.value.aiEvaluation) return 'narrative'
  if (scoring.value.aiExtract) return 'file'
  return null
})
const prompt = computed(() => scoring.value.aiPrompt || '')

// First uploaded asset id (file fields store an array of asset objects).
const assetId = computed(() => {
  const a = props.answer
  if (Array.isArray(a)) return a[0]?.id || null
  if (a && typeof a === 'object') return a.id || null
  return null
})
const narrativeText = computed(() => {
  const a = props.answer
  return typeof a === 'string' ? a : a == null ? '' : String(a)
})

const canRun = computed(() => {
  if (!prompt.value) return false
  if (mode.value === 'narrative') return !!narrativeText.value.trim()
  if (mode.value === 'file') return !!assetId.value
  return false
})

const disabledReason = computed(() => {
  if (!prompt.value) return 'No AI prompt configured on this field.'
  if (mode.value === 'narrative' && !narrativeText.value.trim()) return 'Enter an answer first.'
  if (mode.value === 'file' && !assetId.value) return 'Upload a document first.'
  return ''
})

const STATUS_META = {
  VALID: { label: 'Valid', class: 'tw:bg-green-100 tw:text-green-700' },
  EXPIRING_SOON: { label: 'Expiring soon', class: 'tw:bg-amber-100 tw:text-amber-700' },
  EXPIRED: { label: 'Expired', class: 'tw:bg-red-100 tw:text-red-700' },
  UNDETERMINED: { label: 'Undetermined', class: 'tw:bg-gray-100 tw:text-gray-600' },
}

async function run() {
  if (!canRun.value || loading.value) return
  loading.value = true
  try {
    if (mode.value === 'narrative') {
      const data = await post('/v1/services/ai/form/score', {
        narrative: narrativeText.value,
        evaluationPrompt: prompt.value,
        fieldLabel: props.field.label || undefined,
      })
      result.value = { ...data.result, _source: 'ai' }
    } else {
      const data = await post('/v1/services/ai/form/extract', {
        assetId: assetId.value,
        extractPrompt: prompt.value,
        verifyExpiry: !!scoring.value.verifyExpiry,
      })
      result.value = { ...data.result, _source: 'ai' }
    }
  } catch (e) {
    toast.error(e?.message || 'AI evaluation failed.')
  } finally {
    loading.value = false
  }
}

function clearResult() {
  result.value = null
}

// Override the narrative score inline; mark it edited so it's clearly a human value.
function onScoreOverride(v) {
  const n = Math.max(0, Math.min(100, Number(v) || 0))
  result.value = { ...(result.value || {}), score: n, _source: 'override' }
}
function onStatusOverride(v) {
  result.value = { ...(result.value || {}), status: v, _source: 'override' }
}
</script>

<template>
  <div class="tw:rounded-lg tw:border tw:border-divider tw:bg-primary/5 tw:p-3 tw:flex tw:flex-col tw:gap-2">
    <div class="tw:flex tw:items-center tw:justify-between tw:gap-2">
      <span class="tw:text-sm tw:font-medium tw:text-on-main tw:truncate">
        {{ field.label || field.name }}
      </span>
      <div class="tw:flex tw:items-center tw:gap-1 tw:shrink-0">
        <BaseButton
          size="sm"
          variant="secondary"
          :loading="loading"
          :disabled="!canRun || loading"
          :title="disabledReason"
          @click="run"
        >
          <template #icon>
            <IconLoader2 v-if="loading" :size="14" class="tw:animate-spin" />
            <IconSparkles v-else :size="14" />
          </template>
          {{ mode === 'file' ? 'Read document' : 'Score with AI' }}
        </BaseButton>
        <button
          v-if="result"
          type="button"
          class="tw:p-1 tw:rounded tw:text-secondary tw:hover:bg-main-hover"
          aria-label="Clear AI result"
          @click="clearResult"
        >
          <IconX :size="14" />
        </button>
      </div>
    </div>

    <p v-if="!result && disabledReason" class="tw:text-xs tw:text-secondary">
      {{ disabledReason }}
    </p>

    <!-- Narrative result -->
    <div v-if="result && mode === 'narrative'" class="tw:flex tw:flex-col tw:gap-2">
      <div class="tw:flex tw:items-center tw:gap-2">
        <span class="tw:text-xs tw:text-secondary">Score</span>
        <BaseTextInput
          :modelValue="result.score"
          type="number"
          :min="0"
          :max="100"
          size="sm"
          class="tw:w-20"
          @update:modelValue="onScoreOverride"
        />
        <span
          v-if="result._source === 'override'"
          class="tw:text-xs tw:text-amber-600 tw:font-medium"
        >
          edited
        </span>
      </div>
      <p v-if="result.rationale" class="tw:text-xs tw:text-on-main">{{ result.rationale }}</p>
      <ul v-if="result.gaps?.length" class="tw:text-xs tw:text-secondary tw:list-disc tw:pl-4">
        <li v-for="(g, i) in result.gaps" :key="i">{{ g }}</li>
      </ul>
    </div>

    <!-- File extract result -->
    <div v-else-if="result && mode === 'file'" class="tw:flex tw:flex-col tw:gap-2">
      <div v-if="scoring.verifyExpiry" class="tw:flex tw:items-center tw:gap-2">
        <BaseSelect
          :modelValue="result.status"
          :options="Object.keys(STATUS_META).map((k) => ({ id: k, name: STATUS_META[k].label }))"
          optionLabel="name"
          optionValue="id"
          :required="true"
          class="tw:min-w-40"
          @update:modelValue="onStatusOverride"
        />
        <span v-if="result.expiryDate" class="tw:text-xs tw:text-secondary">
          exp {{ result.expiryDate }}
        </span>
        <span
          v-if="result._source === 'override'"
          class="tw:text-xs tw:text-amber-600 tw:font-medium"
        >
          edited
        </span>
      </div>
      <p v-if="result.summary" class="tw:text-xs tw:text-on-main">{{ result.summary }}</p>
      <div v-if="result.fields?.length" class="tw:flex tw:flex-col tw:gap-0.5">
        <div
          v-for="(f, i) in result.fields"
          :key="i"
          class="tw:flex tw:justify-between tw:gap-2 tw:text-xs"
        >
          <span class="tw:text-secondary tw:truncate">{{ f.label }}</span>
          <span class="tw:text-on-main tw:text-right tw:truncate">{{ f.value }}</span>
        </div>
      </div>
    </div>
  </div>
</template>
