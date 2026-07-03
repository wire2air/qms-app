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
 * Section-aware AI drafting for an EXISTING draft version.
 *
 * POSTs to /api/v1/services/ai/tasks/document.draft_sections/run with the
 * versionId + the author's requirement. The backend loads the version's
 * template sections and drafts each body in place — filling empty sections and
 * improving non-empty ones. Sections the AI changed are flagged so the preview
 * can highlight them (yellow).
 *
 * On apply, emits { sections: [{ title, content(html), changed }] }. The parent
 * writes the changed sections back onto the matching DocumentSection rows.
 * Nothing is persisted from this dialog.
 */

const props = defineProps({
  versionId: { type: String, default: null },
})

const emit = defineEmits(['apply'])

const show = defineModel({ type: Boolean, default: false })

const ENDPOINT = '/api/v1/services/ai/tasks/document.draft_sections/run'

const input = ref({
  topic: '',
  additionalContext: '',
})

const loading = ref(false)
const error = ref(null)
const result = ref(null) // { sections: [{ title, content(markdown), changed }] }
const usage = ref(null)

async function generate() {
  if (loading.value) return
  if (!props.versionId) {
    error.value = { message: 'No document version selected.' }
    return
  }
  if (!input.value.topic.trim() || input.value.topic.trim().length < 5) {
    error.value = { message: 'Describe what the document should cover (5+ characters).' }
    return
  }
  loading.value = true
  error.value = null
  try {
    const body = {
      versionId: props.versionId,
      topic: input.value.topic.trim(),
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

const changedCount = computed(
  () => result.value?.sections?.filter((s) => s.changed).length ?? 0,
)

function applyDraft() {
  if (!result.value) return
  emit('apply', {
    sections: result.value.sections.map((s) => ({
      title: s.title,
      content: markdownToHtml(s.content),
      changed: !!s.changed,
    })),
  })
  closeAndReset()
}

function closeAndReset() {
  show.value = false
  // Reset after the close animation so content doesn't flash.
  setTimeout(() => {
    input.value = { topic: '', additionalContext: '' }
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
          {{ result ? 'AI Draft Ready' : 'Draft Sections with AI' }}
        </span>
      </div>
    </template>

    <!-- Input form -->
    <template v-if="!result && !loading">
      <div class="tw:flex tw:flex-col tw:gap-4">
        <div class="tw:text-sm tw:text-secondary tw:leading-relaxed">
          Describe what this document should cover. The AI drafts the body of each existing section —
          filling empty sections and improving ones that already have content. It won't add or remove
          sections. You review before anything is saved.
        </div>

        <BaseField
          v-slot="{ id: fieldId }"
          label="What should this document cover?"
          hint="Be specific about purpose, scope, and any constraints."
        >
          <textarea
            :id="fieldId"
            v-model="input.topic"
            rows="3"
            placeholder="e.g. Calibration procedure for analytical balances in the QC lab — daily zero checks, monthly reference-weight verification, and out-of-tolerance handling."
            class="tw:rounded-xl tw:border tw:border-divider tw:bg-sidebar tw:px-3 tw:py-2 tw:text-sm tw:text-on-main tw:placeholder-placeholder tw:focus:outline-none tw:focus:border-primary tw:focus:ring-1 tw:focus:ring-primary tw:transition-colors tw:leading-relaxed"
          />
        </BaseField>

        <BaseField v-slot="{ id: fieldId }" label="Additional context" optional>
          <textarea
            :id="fieldId"
            v-model="input.additionalContext"
            rows="3"
            placeholder="Specific equipment models, regulatory references, internal terminology…"
            class="tw:rounded-xl tw:border tw:border-divider tw:bg-sidebar tw:px-3 tw:py-2 tw:text-sm tw:text-on-main tw:placeholder-placeholder tw:focus:outline-none tw:focus:border-primary tw:focus:ring-1 tw:focus:ring-primary tw:transition-colors tw:leading-relaxed"
          />
        </BaseField>

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
          <div class="tw:text-sm tw:font-semibold tw:text-on-main">Drafting your sections…</div>
          <div class="tw:text-xs tw:text-secondary tw:mt-1">
            This usually takes 15–30 seconds. The AI is drafting each section from your brief.
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
          This is a draft. Sections the AI updated are
          <span class="tw:font-semibold">highlighted</span>. Review every section before applying —
          the AI may have missed regulatory specifics or internal terminology. Applying overwrites
          only the highlighted sections.
        </div>

        <div class="tw:flex tw:flex-col tw:gap-2">
          <BaseText variant="overline">
            Sections ({{ result.sections.length }}) · {{ changedCount }} updated
          </BaseText>
          <div class="tw:flex tw:flex-col tw:gap-2 tw:max-h-[28rem] tw:overflow-y-auto">
            <div
              v-for="(section, i) in result.sections"
              :key="i"
              class="tw:border tw:rounded-lg tw:p-3"
              :class="
                section.changed
                  ? 'tw:border-amber-300 tw:bg-amber-50 tw:dark:bg-amber-950/20'
                  : 'tw:border-divider tw:bg-sidebar'
              "
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
                <span
                  v-if="section.changed"
                  class="tw:ml-auto tw:text-[10px] tw:font-semibold tw:uppercase tw:tracking-wide tw:px-2 tw:py-0.5 tw:rounded tw:bg-amber-200 tw:text-amber-800"
                >
                  Updated
                </span>
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
        <BaseButton :disabled="changedCount === 0" @click="applyDraft">
          <IconCheck :size="14" class="tw:mr-1" />
          Apply {{ changedCount }} to Document
        </BaseButton>
      </template>
    </template>
  </BaseDialog>
</template>

<style lang="scss" scoped>
/* Mirror the TipTap editor's hierarchical numbering for the AI-draft preview.
 * The preview renders markdown→HTML directly (no editor instance), so the
 * editor's scoped CSS doesn't reach it. The parent v-for sets --section-number
 * on each card; counters turn that into "N.1" / "N.1.1" prefixes matching what
 * users see after applying. */
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
