<script setup>
import {
  IconSparkles,
  IconAlertTriangle,
  IconRefresh,
  IconCheck,
  IconLoader2,
} from '@tabler/icons-vue'
import { markdownToHtml } from '@/utils/markdown.js'

/**
 * AI-driven document draft generator (Phase 4 of the AI plan).
 *
 * POSTs to /api/v1/services/ai/tasks/document.draft_from_topic/run.
 * On apply, emits { title, description, sections: [{title, content, order, sectionType}] }
 * which the parent (DocumentsCreate.vue) maps onto its form ref.
 *
 * The result is always a *draft* — user reviews/edits in the form before saving.
 * Nothing is persisted from this dialog.
 */

const props = defineProps({
  // Optional initial values used to bias the prompt. Read from the parent
  // form when the user has already chosen them.
  initialDocumentTypeId: { type: String, default: null },
  initialDepartmentName: { type: String, default: null },
})

const emit = defineEmits(['apply'])

const show = defineModel({ type: Boolean, default: false })

const ENDPOINT = '/api/v1/services/ai/tasks/document.draft_from_topic/run'

const input = ref({
  topic: '',
  documentTypeId: props.initialDocumentTypeId,
  departmentName: props.initialDepartmentName,
  additionalContext: '',
})

watch(
  () => [props.initialDocumentTypeId, props.initialDepartmentName],
  ([typeId, deptName]) => {
    input.value.documentTypeId = typeId
    input.value.departmentName = deptName
  },
)

const loading = ref(false)
const error = ref(null)
const result = ref(null) // { title, description, sections: [...] }
const usage = ref(null)

async function generate() {
  if (loading.value) return
  if (!input.value.topic.trim() || input.value.topic.trim().length < 5) {
    error.value = { message: 'Please enter at least a short topic (5+ characters).' }
    return
  }
  loading.value = true
  error.value = null
  try {
    const body = {
      topic: input.value.topic.trim(),
      documentTypeId: input.value.documentTypeId || undefined,
      departmentName: input.value.departmentName || undefined,
      additionalContext: input.value.additionalContext?.trim() || undefined,
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
  } catch (e) {
    error.value = { code: 'NETWORK', message: e.message ?? 'Network error.' }
  } finally {
    loading.value = false
  }
}

function applyDraft() {
  if (!result.value) return
  emit('apply', {
    title: result.value.title,
    description: result.value.description,
    documentTypeId: result.value.documentTypeId ?? null,
    sections: result.value.sections.map((s, idx) => ({
      title: s.title,
      content: markdownToHtml(s.content),
      sectionType: 'text',
      order: idx + 1,
    })),
  })
  closeAndReset()
}

function closeAndReset() {
  show.value = false
  // Reset after the dialog close animation so the user doesn't see content flash
  setTimeout(() => {
    input.value = {
      topic: '',
      documentTypeId: props.initialDocumentTypeId,
      departmentName: props.initialDepartmentName,
      additionalContext: '',
    }
    result.value = null
    error.value = null
    usage.value = null
  }, 200)
}

function regenerate() {
  result.value = null
  error.value = null
  generate()
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
        <span class="tw:text-2xl tw:font-bold tw:text-on-main">
          {{ result ? 'AI Draft Ready' : 'Draft Document with AI' }}
        </span>
      </div>
    </template>

    <!-- Input form -->
    <template v-if="!result && !loading">
      <div class="tw:flex tw:flex-col tw:gap-4">
        <div class="tw:text-sm tw:text-secondary tw:leading-relaxed">
          Describe what the document should cover. The AI will draft a title, summary, and an
          ordered set of sections (Purpose, Scope, Procedure, etc.). You'll review and edit before
          saving — nothing is persisted automatically.
        </div>

        <div class="tw:flex tw:flex-col tw:gap-1">
          <label class="tw:text-sm tw:font-medium tw:text-secondary">Topic</label>
          <textarea
            v-model="input.topic"
            rows="3"
            placeholder="e.g. Equipment calibration procedure for analytical balances used in QC labs."
            class="tw:rounded-xl tw:border tw:border-divider tw:bg-sidebar tw:px-3 tw:py-2 tw:text-sm tw:text-on-main tw:placeholder-placeholder tw:focus:outline-none tw:focus:border-primary tw:focus:ring-1 tw:focus:ring-primary tw:transition-colors tw:leading-relaxed"
          />
          <p class="tw:text-xs tw:text-secondary">
            Be specific. A focused topic produces a focused draft.
          </p>
        </div>

        <div class="tw:flex tw:flex-col tw:gap-1">
          <label class="tw:text-sm tw:font-medium tw:text-secondary">
            Additional context (optional)
          </label>
          <textarea
            v-model="input.additionalContext"
            rows="3"
            placeholder="Specific equipment models, regulatory references, internal terminology…"
            class="tw:rounded-xl tw:border tw:border-divider tw:bg-sidebar tw:px-3 tw:py-2 tw:text-sm tw:text-on-main tw:placeholder-placeholder tw:focus:outline-none tw:focus:border-primary tw:focus:ring-1 tw:focus:ring-primary tw:transition-colors tw:leading-relaxed"
          />
        </div>

        <div
          v-if="input.documentTypeId || input.departmentName"
          class="tw:flex tw:flex-wrap tw:gap-2 tw:text-xs tw:text-secondary"
        >
          <span v-if="input.documentTypeId" class="tw:px-2 tw:py-1 tw:rounded tw:bg-main-hover">
            Type: <span class="tw:font-mono">{{ input.documentTypeId }}</span>
          </span>
          <span v-if="input.departmentName" class="tw:px-2 tw:py-1 tw:rounded tw:bg-main-hover">
            Dept: <span class="tw:font-mono">{{ input.departmentName }}</span>
          </span>
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
          <div class="tw:text-sm tw:font-semibold tw:text-on-main">Drafting your document…</div>
          <div class="tw:text-xs tw:text-secondary tw:mt-1">
            This usually takes 15–30 seconds. The AI is reading your topic and shaping sections.
          </div>
        </div>
      </div>
    </template>

    <!-- Result preview -->
    <template v-else-if="result">
      <div class="tw:flex tw:flex-col tw:gap-4">
        <div
          class="tw:p-3 tw:rounded-lg tw:bg-amber-50 tw:border tw:border-amber-200 tw:text-amber-900 tw:text-xs"
        >
          This is a draft. Review every section before saving — the AI may have missed regulatory
          specifics, internal terminology, or important steps. You can edit each section in the
          document form after applying.
        </div>

        <div class="tw:flex tw:flex-col tw:gap-1">
          <div class="tw:text-xs tw:text-secondary tw:font-semibold tw:uppercase tw:tracking-wide">
            Title
          </div>
          <div class="tw:text-lg tw:font-bold tw:text-on-main">{{ result.title }}</div>
        </div>

        <div class="tw:flex tw:flex-col tw:gap-1">
          <div class="tw:text-xs tw:text-secondary tw:font-semibold tw:uppercase tw:tracking-wide">
            Summary
          </div>
          <div class="tw:text-sm tw:text-on-main tw:leading-relaxed">{{ result.description }}</div>
        </div>

        <div class="tw:flex tw:flex-col tw:gap-2">
          <div class="tw:text-xs tw:text-secondary tw:font-semibold tw:uppercase tw:tracking-wide">
            Sections ({{ result.sections.length }})
          </div>
          <div class="tw:flex tw:flex-col tw:gap-2 tw:max-h-96 tw:overflow-y-auto">
            <div
              v-for="(section, i) in result.sections"
              :key="i"
              class="tw:border tw:border-divider tw:rounded-lg tw:p-3 tw:bg-sidebar"
              :style="{ '--section-number': i + 1 }"
            >
              <div class="tw:flex tw:items-center tw:gap-2 tw:mb-1">
                <span
                  class="tw:text-xs tw:px-2 tw:py-0.5 tw:rounded tw:bg-primary/10 tw:text-primary tw:font-mono"
                >
                  {{ i + 1 }}
                </span>
                <div class="tw:text-sm tw:font-semibold tw:text-on-main">
                  {{ section.title }}
                </div>
              </div>
              <div
                class="chat-md numbered-headings-preview tw:text-xs tw:text-secondary tw:leading-relaxed tw:max-h-40 tw:overflow-y-auto"
                v-html="markdownToHtml(section.content)"
              />
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
        <BaseButton :disabled="loading || !input.topic.trim()" @click="generate">
          <IconSparkles :size="14" class="tw:mr-1" />
          Generate Draft
        </BaseButton>
      </template>
      <template v-else-if="loading">
        <BaseButton variant="outline" disabled>Cancel</BaseButton>
        <BaseButton disabled>Drafting…</BaseButton>
      </template>
      <template v-else-if="result">
        <BaseButton variant="outline" @click="regenerate">
          <IconRefresh :size="14" class="tw:mr-1" />
          Regenerate
        </BaseButton>
        <BaseButton variant="outline" @click="closeAndReset">Discard</BaseButton>
        <BaseButton @click="applyDraft">
          <IconCheck :size="14" class="tw:mr-1" />
          Apply to Form
        </BaseButton>
      </template>
    </template>
  </BaseDialog>
</template>

<style lang="scss" scoped>
/* Mirror the TipTap editor's hierarchical numbering for the AI-draft preview.
 * The preview renders markdown→HTML directly (no editor instance), so the
 * editor's scoped CSS doesn't reach it. The parent v-for sets
 * --section-number on each section card; counters here turn that into
 * "N.1" / "N.1.1" prefixes that match what users see after applying. */
.numbered-headings-preview {
  counter-reset: section-num var(--section-number, 0) subsection 0;

  :deep(h3) {
    counter-increment: subsection;
    counter-reset: subsubsection 0;
    font-weight: 600;
  }

  :deep(h3::before) {
    content: counter(section-num) '.' counter(subsection) '   ';
    white-space: pre;
  }

  :deep(h4) {
    counter-increment: subsubsection;
    font-weight: 600;
  }

  :deep(h4::before) {
    content: counter(section-num) '.' counter(subsection) '.' counter(subsubsection) '   ';
    white-space: pre;
  }
}
</style>
