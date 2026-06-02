<script setup>
import {
  IconSparkles,
  IconAlertTriangle,
  IconRefresh,
  IconCheck,
  IconLoader2,
  IconCircleCheck,
  IconCircleX,
} from '@tabler/icons-vue'

/**
 * AI quiz-question generator for a DocumentVersion's training assessment.
 *
 * POSTs to /api/v1/services/ai/tasks/document.generate_quiz_questions/run
 *
 * Workflow:
 *   1. User picks question count + optional emphasis hint
 *   2. AI returns N candidate questions
 *   3. User reviews; each question has a "Include" checkbox (default: on)
 *   4. On Apply → emits { questions: [...selected with fresh ids...] }
 *      The parent APPENDS them to trainingConfig.assessment — nothing is
 *      overwritten.
 *
 * Question shape matches DocumentsCreateTraining.vue exactly:
 *   { id, text, type: 'single'|'multiple', options: [{id, text, isCorrect}] }
 *
 * Fresh UUIDs are generated client-side on apply to guarantee no collision
 * with existing questions.
 */

const props = defineProps({
  versionId: { type: String, default: null },
  documentTitle: { type: String, default: '' },
})

const emit = defineEmits(['apply'])

const show = defineModel({ type: Boolean, default: false })

const ENDPOINT = '/api/v1/services/ai/tasks/document.generate_quiz_questions/run'

const input = ref({
  count: 5,
  emphasis: '',
})

const loading = ref(false)
const error = ref(null)
const result = ref(null) // { questions: [...] }
const usage = ref(null)
// Per-question include flags, indexed by question position in result.questions.
// Default: all selected.
const selectedFlags = ref([])

watch(show, (open) => {
  if (open) {
    // Don't reset count/emphasis — user may want to regenerate with the
    // same params. Reset just the result + selection state.
    result.value = null
    error.value = null
    usage.value = null
    selectedFlags.value = []
  }
})

async function generate() {
  if (loading.value || !props.versionId) return
  loading.value = true
  error.value = null
  try {
    const body = {
      versionId: props.versionId,
      count: input.value.count,
      emphasis: input.value.emphasis?.trim() || undefined,
    }
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body),
    })
    const json = await res.json().catch(() => null)
    if (!res.ok) {
      error.value = {
        code: json?.error?.code ?? `HTTP_${res.status}`,
        message: json?.error?.message ?? `Request failed (${res.status}).`,
        issues: json?.error?.issues,
      }
      return
    }
    result.value = json.result
    usage.value = json.usage
    selectedFlags.value = (json.result?.questions ?? []).map(() => true)
  } catch (e) {
    error.value = { code: 'NETWORK', message: e.message ?? 'Network error.' }
  } finally {
    loading.value = false
  }
}

function regenerate() {
  result.value = null
  error.value = null
  selectedFlags.value = []
  generate()
}

const selectedCount = computed(() => selectedFlags.value.filter(Boolean).length)

function selectAll() {
  selectedFlags.value = selectedFlags.value.map(() => true)
}
function selectNone() {
  selectedFlags.value = selectedFlags.value.map(() => false)
}

function toggleOne(idx) {
  selectedFlags.value = selectedFlags.value.map((v, i) => (i === idx ? !v : v))
}

// Stamp fresh UUIDs on apply. The AI returned id-less objects; we generate
// ids here so they're guaranteed-unique against any existing assessment.
function buildSelected() {
  if (!result.value?.questions) return []
  return result.value.questions
    .filter((_, i) => selectedFlags.value[i])
    .map((q) => ({
      id: crypto.randomUUID(),
      text: q.text,
      type: q.type,
      options: (q.options ?? []).map((o) => ({
        id: crypto.randomUUID(),
        text: o.text,
        isCorrect: !!o.isCorrect,
      })),
    }))
}

function applyDraft() {
  const questions = buildSelected()
  if (!questions.length) return
  emit('apply', { questions })
  closeAndReset()
}

function closeAndReset() {
  show.value = false
  setTimeout(() => {
    result.value = null
    error.value = null
    usage.value = null
    selectedFlags.value = []
  }, 200)
}

const TYPE_LABEL = {
  single: 'Single choice',
  multiple: 'Multiple choice',
}
</script>

<template>
  <BaseDialog v-model="show" maxWidth="3xl">
    <template #title>
      <div class="tw:flex tw:items-center tw:gap-3">
        <div
          class="tw:w-10 tw:h-10 tw:bg-primary/10 tw:text-primary tw:rounded-xl tw:flex tw:items-center tw:justify-center"
        >
          <IconSparkles :size="24" />
        </div>
        <div>
          <div class="tw:text-lg tw:font-bold tw:text-on-main">
            {{ result ? 'AI Quiz Questions Ready' : 'Generate Quiz Questions with AI' }}
          </div>
          <div v-if="documentTitle" class="tw:text-xs tw:text-secondary tw:mt-0.5">
            {{ documentTitle }}
          </div>
        </div>
      </div>
    </template>

    <!-- Input form -->
    <template v-if="!result && !loading">
      <div class="tw:flex tw:flex-col tw:gap-4">
        <div class="tw:text-sm tw:text-secondary tw:leading-relaxed">
          The AI will read the document and propose quiz questions anchored to its content. You'll
          review each one and pick which to add — nothing is appended until you confirm. Existing
          questions on the assessment are kept; new ones are appended after them.
        </div>

        <div class="tw:grid tw:grid-cols-2 tw:gap-4">
          <div class="tw:flex tw:flex-col tw:gap-1">
            <label class="tw:text-sm tw:font-medium tw:text-secondary"> How many questions? </label>
            <input
              v-model.number="input.count"
              type="number"
              min="1"
              max="10"
              class="tw:rounded-xl tw:border tw:border-divider tw:bg-sidebar tw:px-3 tw:py-2 tw:text-sm tw:text-on-main tw:focus:outline-none tw:focus:border-primary tw:focus:ring-1 tw:focus:ring-primary"
            />
            <p class="tw:text-xs tw:text-secondary">
              1–10. AI may generate a couple extra so you have choice.
            </p>
          </div>
        </div>

        <div class="tw:flex tw:flex-col tw:gap-1">
          <label class="tw:text-sm tw:font-medium tw:text-secondary"> Emphasis (optional) </label>
          <textarea
            v-model="input.emphasis"
            rows="2"
            placeholder="e.g. Focus on safety steps and accept/reject criteria. Skip the introductory scope section."
            class="tw:rounded-xl tw:border tw:border-divider tw:bg-sidebar tw:px-3 tw:py-2 tw:text-sm tw:text-on-main tw:placeholder-placeholder tw:focus:outline-none tw:focus:border-primary tw:focus:ring-1 tw:focus:ring-primary tw:leading-relaxed"
          />
          <p class="tw:text-xs tw:text-secondary">
            Leave blank and the AI picks the most important points.
          </p>
        </div>

        <div
          v-if="error"
          class="tw:flex tw:items-start tw:gap-2 tw:p-3 tw:rounded-lg tw:bg-red-50 tw:border tw:border-red-200 tw:text-red-800 tw:text-sm"
        >
          <IconAlertTriangle :size="16" class="tw:mt-0.5 tw:flex-none" />
          <div class="tw:flex-1 tw:min-w-0">
            <div class="tw:font-semibold">{{ error.code || 'Error' }}</div>
            <div class="tw:text-xs tw:mt-0.5 tw:break-words">{{ error.message }}</div>
          </div>
        </div>
      </div>
    </template>

    <!-- Loading state -->
    <template v-else-if="loading">
      <div class="tw:flex tw:flex-col tw:items-center tw:gap-4 tw:py-12">
        <IconLoader2 :size="48" class="tw:text-primary tw:animate-spin" />
        <div class="tw:text-center">
          <div class="tw:text-sm tw:font-semibold tw:text-on-main">Drafting your quiz…</div>
          <div class="tw:text-xs tw:text-secondary tw:mt-1">
            Reading the document and writing comprehension questions.
          </div>
        </div>
      </div>
    </template>

    <!-- Result preview -->
    <template v-else-if="result">
      <div class="tw:flex tw:flex-col tw:gap-4">
        <div
          class="tw:flex tw:items-center tw:justify-between tw:gap-3 tw:p-3 tw:rounded-lg tw:bg-amber-50 tw:border tw:border-amber-200"
        >
          <div class="tw:text-xs tw:text-amber-900">
            Review each question. <strong>{{ selectedCount }}</strong> of
            <strong>{{ result.questions.length }}</strong> selected will be appended to the
            assessment.
          </div>
          <div class="tw:flex tw:items-center tw:gap-2 tw:shrink-0">
            <button
              class="tw:text-xs tw:font-medium tw:text-primary tw:hover:underline"
              @click="selectAll"
            >
              Select all
            </button>
            <span class="tw:text-xs tw:text-amber-400">·</span>
            <button
              class="tw:text-xs tw:font-medium tw:text-secondary tw:hover:underline"
              @click="selectNone"
            >
              Select none
            </button>
          </div>
        </div>

        <div class="tw:flex tw:flex-col tw:gap-3 tw:max-h-[60vh] tw:overflow-y-auto tw:pr-1">
          <div
            v-for="(q, i) in result.questions"
            :key="i"
            class="tw:flex tw:items-start tw:gap-3 tw:p-3 tw:rounded-lg tw:border"
            :class="
              selectedFlags[i]
                ? 'tw:border-primary tw:bg-primary/5'
                : 'tw:border-divider tw:bg-sidebar tw:opacity-70'
            "
          >
            <input
              type="checkbox"
              :checked="selectedFlags[i]"
              class="tw:mt-1 tw:size-4 tw:accent-primary tw:cursor-pointer tw:flex-none"
              @change="toggleOne(i)"
            />
            <div class="tw:flex-1 tw:min-w-0 tw:flex tw:flex-col tw:gap-2">
              <div class="tw:flex tw:items-start tw:justify-between tw:gap-2">
                <div class="tw:text-sm tw:font-semibold tw:text-on-main">
                  {{ i + 1 }}. {{ q.text }}
                </div>
                <span
                  class="tw:text-[10px] tw:font-medium tw:text-secondary tw:bg-main-hover tw:rounded tw:px-1.5 tw:py-0.5 tw:shrink-0 tw:uppercase tw:tracking-wide"
                >
                  {{ TYPE_LABEL[q.type] ?? q.type }}
                </span>
              </div>
              <ul class="tw:flex tw:flex-col tw:gap-1">
                <li
                  v-for="(o, oi) in q.options"
                  :key="oi"
                  class="tw:flex tw:items-center tw:gap-1.5 tw:text-xs"
                >
                  <IconCircleCheck
                    v-if="o.isCorrect"
                    :size="14"
                    class="tw:text-emerald-600 tw:shrink-0"
                  />
                  <IconCircleX v-else :size="14" class="tw:text-secondary tw:shrink-0" />
                  <span
                    :class="o.isCorrect ? 'tw:text-on-main tw:font-medium' : 'tw:text-secondary'"
                  >
                    {{ o.text }}
                  </span>
                </li>
              </ul>
            </div>
          </div>
        </div>

        <div v-if="usage" class="tw:text-xs tw:text-secondary">
          Tokens used: {{ usage.inputTokens }} in / {{ usage.outputTokens }} out
        </div>
      </div>
    </template>

    <template #footer>
      <template v-if="!result && !loading">
        <BaseButton variant="outline" @click="closeAndReset">Cancel</BaseButton>
        <BaseButton :disabled="loading || !versionId" @click="generate">
          <IconSparkles :size="14" class="tw:mr-1" />
          Generate
        </BaseButton>
      </template>
      <template v-else-if="loading">
        <BaseButton variant="outline" disabled>Cancel</BaseButton>
        <BaseButton disabled>Generating…</BaseButton>
      </template>
      <template v-else-if="result">
        <BaseButton variant="outline" @click="regenerate">
          <IconRefresh :size="14" class="tw:mr-1" />
          Regenerate
        </BaseButton>
        <BaseButton variant="outline" @click="closeAndReset">Discard</BaseButton>
        <BaseButton :disabled="selectedCount === 0" @click="applyDraft">
          <IconCheck :size="14" class="tw:mr-1" />
          Append {{ selectedCount }} question{{ selectedCount === 1 ? '' : 's' }}
        </BaseButton>
      </template>
    </template>
  </BaseDialog>
</template>
