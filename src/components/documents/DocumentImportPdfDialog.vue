<script setup>
import {
  IconFileUpload,
  IconSparkles,
  IconAlertTriangle,
  IconLoader2,
  IconRefresh,
  IconCheck,
  IconFile,
  IconPaperclip,
} from '@tabler/icons-vue'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { parsePdfAndExtractImages } from '@/composables/usePdfImport.js'
import { uploadFile } from '@/composables/useFileUpload.js'

/**
 * Import PDF dialog. Pipeline:
 *   1. User picks a PDF
 *   2. Browser parses it via pdfjs-dist (parses text per page + extracts
 *      embedded images, uploads each to our cloud storage)
 *   3. Browser POSTs the merged text to the AI task
 *      document.import_from_pdf which returns { title, description,
 *      sections: [{ title, content }] }
 *   4. Dialog shows a preview; on Apply, emits the structured result to
 *      the parent (mirrors the DocumentDraftDialog contract). Parent maps
 *      it onto the create-document form.
 *
 * Errors at any stage surface as a dismissable banner with the stage name.
 * Image upload failures inside the parser are silently skipped per-image —
 * one broken xobject must not abort a full SOP import.
 */

const emit = defineEmits(['apply'])

const show = defineModel({ type: Boolean, default: false })

const STRUCTURED_ENDPOINT = '/api/v1/services/ai/tasks/document.import_from_pdf/run'
const SUMMARIZE_ENDPOINT = '/api/v1/services/ai/tasks/document.summarize_pdf/run'

// PDFs whose extracted text exceeds this size auto-route through the
// summarise path: AI returns a single rich-text summary + the original
// PDF is attached as a separate section. Threshold sits comfortably
// below the 120K-char input cap on the structured importer so we route
// before the AI request would be rejected.
const SUMMARY_THRESHOLD_CHARS = 100_000

// Phases: pick → parsing → structuring | summarizing → result | summaryResult → error
const phase = ref('pick')
const error = ref(null)
const progress = ref({ current: 0, total: 0, message: '' })

const selectedFile = ref(null)
const extracted = ref(null) // { text, pageCount, imageCount, filename }
const result = ref(null) // structured: { title, description, sections: [...] }
                        // summary:    { title, description, summary: '<html>' }
const usage = ref(null)
// 'structured' (existing behaviour) | 'summary' (large-PDF path).
// Decided automatically after parsing based on extracted text size.
const mode = ref(null)

watch(show, (open) => {
  if (open) {
    phase.value = 'pick'
    error.value = null
    progress.value = { current: 0, total: 0, message: '' }
    selectedFile.value = null
    extracted.value = null
    result.value = null
    usage.value = null
    mode.value = null
  }
})

function pickFile() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'application/pdf,.pdf'
  input.onchange = (e) => {
    const file = e.target.files?.[0]
    if (file) selectedFile.value = file
  }
  input.click()
}

async function runImport() {
  if (!selectedFile.value) return
  error.value = null

  // ── Stage 1: parse + image upload ───────────────────────────────────
  phase.value = 'parsing'
  try {
    extracted.value = await parsePdfAndExtractImages(selectedFile.value, (stage) => {
      progress.value = {
        current: stage.current ?? 0,
        total: stage.total ?? 0,
        message: stage.message ?? '',
      }
    })
  } catch (e) {
    error.value = {
      stage: 'parsing',
      message: e?.message || 'Failed to parse PDF. The file may be corrupted or password-protected.',
    }
    phase.value = 'error'
    return
  }

  // Sanity: if extraction produced almost no text, it's likely a scanned
  // PDF without an OCR layer. Surface a clear error so the user knows
  // what's happening rather than letting the AI guess at empty input.
  if (!extracted.value?.text || extracted.value.text.length < 50) {
    error.value = {
      stage: 'parsing',
      message:
        'Extracted very little text from the PDF. This is usually a scanned document without an OCR text layer. Run it through an OCR tool first and try again.',
    }
    phase.value = 'error'
    return
  }

  // ── Stage 2: AI structuring OR summarising ─────────────────────────
  // Auto-route on extracted text size. Small/medium PDFs → structured
  // import (existing behaviour). Large PDFs → single summary + PDF
  // attached as a separate section; the AI never tries to invent
  // section boundaries that don't really exist in a 100+ page manual.
  mode.value = extracted.value.text.length > SUMMARY_THRESHOLD_CHARS ? 'summary' : 'structured'
  await runAiStage()
}

async function runAiStage() {
  if (!extracted.value) return
  const isSummary = mode.value === 'summary'
  phase.value = isSummary ? 'summarizing' : 'structuring'
  progress.value = {
    current: 0,
    total: 0,
    message: isSummary ? 'Summarising with AI…' : 'Structuring with AI…',
  }
  try {
    const res = await fetch(isSummary ? SUMMARIZE_ENDPOINT : STRUCTURED_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        extractedText: extracted.value.text,
        filenameHint: extracted.value.filename,
      }),
    })
    const json = await res.json().catch(() => null)
    if (!res.ok) {
      error.value = {
        stage: isSummary ? 'summarizing' : 'structuring',
        message: json?.error?.message ?? `Request failed (${res.status}).`,
        code: json?.error?.code ?? `HTTP_${res.status}`,
      }
      phase.value = 'error'
      return
    }
    result.value = json.result
    usage.value = json.usage
    phase.value = isSummary ? 'summaryResult' : 'result'
  } catch (e) {
    error.value = {
      stage: isSummary ? 'summarizing' : 'structuring',
      message: e?.message ?? 'Network error.',
    }
    phase.value = 'error'
  }
}

function regenerate() {
  if (!extracted.value) {
    // No parsed text — restart from scratch
    runImport()
    return
  }
  // Re-run only the AI stage; parse + image upload already done.
  result.value = null
  usage.value = null
  error.value = null
  runAiStage()
}

// Markdown → HTML for the editor + preview rendering. Same sanitizer
// config as the AI draft dialog so behavior matches across both flows.
function markdownToHtml(md) {
  if (!md) return ''
  const html = marked.parse(md, { breaks: false, gfm: true })
  return DOMPurify.sanitize(html, {
    ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'target', 'rel', 'class', 'colspan', 'rowspan', 'align'],
    FORBID_TAGS: ['style', 'script', 'iframe', 'object', 'embed', 'form'],
  })
}

const applying = ref(false)

async function applyDraft() {
  if (!result.value || applying.value) return
  applying.value = true
  try {
    if (mode.value === 'summary') {
      // Upload the original PDF as an ASSET so we can attach it to the
      // second section. The AI already saw the extracted text — what we
      // ship to the controlled record is the binary, exactly as the user
      // uploaded it.
      const upload = await uploadFile(selectedFile.value, 'ASSET')
      if (!upload.success || !upload.asset) {
        error.value = {
          stage: 'apply',
          message: upload.error ?? 'Failed to upload the original PDF.',
        }
        phase.value = 'error'
        return
      }
      emit('apply', {
        title: result.value.title,
        description: result.value.description,
        sections: [
          {
            title: 'Summary',
            content: sanitizeHtml(result.value.summary),
            sectionType: 'text',
            attachments: null,
            order: 1,
          },
          {
            title: 'Original PDF',
            content: null,
            sectionType: 'attachment',
            attachments: [upload.asset],
            order: 2,
          },
        ],
      })
      show.value = false
      return
    }

    // Structured (existing behaviour)
    emit('apply', {
      title: result.value.title,
      description: result.value.description,
      sections: result.value.sections.map((s, idx) => ({
        title: s.title,
        content: markdownToHtml(s.content),
        sectionType: 'text',
        order: idx + 1,
      })),
    })
    show.value = false
  } finally {
    applying.value = false
  }
}

// Sanitiser for the AI-generated summary HTML. Same allow-list as the
// markdown path, minus markdown parsing — the summary is already HTML.
function sanitizeHtml(html) {
  if (!html) return ''
  return DOMPurify.sanitize(html, {
    ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'target', 'rel', 'class'],
    FORBID_TAGS: ['style', 'script', 'iframe', 'object', 'embed', 'form'],
  })
}

function discard() {
  show.value = false
}

const fileSizeLabel = computed(() => {
  if (!selectedFile.value) return ''
  const kb = selectedFile.value.size / 1024
  if (kb < 1024) return `${kb.toFixed(0)} KB`
  return `${(kb / 1024).toFixed(1)} MB`
})

const parseProgressPct = computed(() => {
  if (!progress.value.total) return 0
  return Math.round((progress.value.current / progress.value.total) * 100)
})
</script>

<template>
  <BaseDialog v-model="show" maxWidth="3xl">
    <template #title>
      <div class="tw:flex tw:items-center tw:gap-3">
        <div
          class="tw:w-10 tw:h-10 tw:bg-primary/10 tw:text-primary tw:rounded-xl tw:flex tw:items-center tw:justify-center"
        >
          <IconFileUpload :size="24" />
        </div>
        <div>
          <div class="tw:text-lg tw:font-bold tw:text-on-main">
            {{ phase === 'result' ? 'PDF Import Ready' : 'Import Document from PDF' }}
          </div>
          <div v-if="extracted" class="tw:text-xs tw:text-secondary tw:mt-0.5">
            {{ extracted.filename }} · {{ extracted.pageCount }} page{{
              extracted.pageCount === 1 ? '' : 's'
            }}, {{ extracted.imageCount }} image{{ extracted.imageCount === 1 ? '' : 's' }}
            <span
              v-if="extracted.headerLinesStripped || extracted.recurringImagesSkipped"
              class="tw:ml-1 tw:text-amber-700"
            >
              · auto-stripped
              <template v-if="extracted.headerLinesStripped">
                {{ extracted.headerLinesStripped }} header line{{
                  extracted.headerLinesStripped === 1 ? '' : 's'
                }}
              </template>
              <template v-if="extracted.headerLinesStripped && extracted.recurringImagesSkipped">
                +
              </template>
              <template v-if="extracted.recurringImagesSkipped">
                {{ extracted.recurringImagesSkipped }} repeating image{{
                  extracted.recurringImagesSkipped === 1 ? '' : 's'
                }}
              </template>
            </span>
          </div>
        </div>
      </div>
    </template>

    <!-- Phase: file picker -->
    <template v-if="phase === 'pick'">
      <div class="tw:flex tw:flex-col tw:gap-4">
        <div class="tw:text-sm tw:text-secondary tw:leading-relaxed">
          Upload an SOP, work instruction, or policy PDF. We'll extract text + images, then use AI
          to structure it into editable sections. You'll review before saving — nothing is created
          automatically.
        </div>

        <div
          class="tw:rounded-xl tw:border-2 tw:border-dashed tw:border-divider tw:bg-sidebar tw:p-8 tw:flex tw:flex-col tw:items-center tw:justify-center tw:gap-3 tw:cursor-pointer tw:hover:border-primary/40 tw:transition-colors"
          @click="pickFile"
        >
          <IconFile :size="40" class="tw:text-secondary" />
          <div class="tw:text-center">
            <div class="tw:text-sm tw:font-semibold tw:text-on-main">
              {{ selectedFile ? selectedFile.name : 'Pick a PDF to import' }}
            </div>
            <div v-if="selectedFile" class="tw:text-xs tw:text-secondary tw:mt-0.5">
              {{ fileSizeLabel }}
            </div>
            <div v-else class="tw:text-xs tw:text-secondary tw:mt-0.5">
              Max 100 MB · text-based PDFs work best (scanned PDFs need OCR first)
            </div>
          </div>
        </div>

        <div
          v-if="error"
          class="tw:flex tw:items-start tw:gap-2 tw:p-3 tw:rounded-lg tw:bg-red-50 tw:border tw:border-red-200 tw:text-red-800 tw:text-sm"
        >
          <IconAlertTriangle :size="16" class="tw:mt-0.5 tw:flex-none" />
          <div>{{ error.message }}</div>
        </div>
      </div>
    </template>

    <!-- Phase: parsing PDF -->
    <template v-else-if="phase === 'parsing'">
      <div class="tw:flex tw:flex-col tw:items-center tw:gap-4 tw:py-10">
        <IconLoader2 :size="40" class="tw:text-primary tw:animate-spin" />
        <div class="tw:text-center">
          <div class="tw:text-sm tw:font-semibold tw:text-on-main">
            {{ progress.message || 'Parsing PDF…' }}
          </div>
          <div v-if="progress.total" class="tw:text-xs tw:text-secondary tw:mt-1">
            Page {{ progress.current }} of {{ progress.total }} · uploading images as found
          </div>
        </div>
        <div v-if="progress.total" class="tw:w-full tw:max-w-md tw:bg-main-hover tw:rounded-full tw:h-1.5 tw:overflow-hidden">
          <div
            class="tw:h-full tw:bg-primary tw:transition-all"
            :style="{ width: `${parseProgressPct}%` }"
          />
        </div>
      </div>
    </template>

    <!-- Phase: AI structuring -->
    <template v-else-if="phase === 'structuring'">
      <div class="tw:flex tw:flex-col tw:items-center tw:gap-4 tw:py-10">
        <IconSparkles :size="40" class="tw:text-primary tw:animate-pulse" />
        <div class="tw:text-center">
          <div class="tw:text-sm tw:font-semibold tw:text-on-main">Structuring with AI…</div>
          <div class="tw:text-xs tw:text-secondary tw:mt-1">
            Identifying the title and section boundaries. This usually takes 15–30 seconds.
          </div>
        </div>
      </div>
    </template>

    <!-- Phase: AI summarising (large-PDF path) -->
    <template v-else-if="phase === 'summarizing'">
      <div class="tw:flex tw:flex-col tw:items-center tw:gap-4 tw:py-10">
        <IconSparkles :size="40" class="tw:text-primary tw:animate-pulse" />
        <div class="tw:text-center">
          <div class="tw:text-sm tw:font-semibold tw:text-on-main">Summarising with AI…</div>
          <div class="tw:text-xs tw:text-secondary tw:mt-1">
            This PDF is too large to break into editable sections, so we'll generate a single
            summary and attach the original PDF.
          </div>
        </div>
      </div>
    </template>

    <!-- Phase: error -->
    <template v-else-if="phase === 'error'">
      <div class="tw:flex tw:flex-col tw:gap-4">
        <div
          class="tw:flex tw:items-start tw:gap-3 tw:p-4 tw:rounded-lg tw:bg-red-50 tw:border tw:border-red-200 tw:text-red-900"
        >
          <IconAlertTriangle :size="22" class="tw:mt-0.5 tw:flex-none" />
          <div class="tw:flex-1 tw:min-w-0">
            <div class="tw:text-sm tw:font-semibold">
              {{ error?.stage === 'parsing' ? 'Could not parse the PDF' : 'AI structuring failed' }}
            </div>
            <div class="tw:text-xs tw:mt-1 tw:break-words">
              {{ error?.message }}
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- Phase: result preview -->
    <template v-else-if="phase === 'result' && result">
      <div class="tw:flex tw:flex-col tw:gap-4">
        <div
          class="tw:p-3 tw:rounded-lg tw:bg-amber-50 tw:border tw:border-amber-200 tw:text-amber-900 tw:text-xs"
        >
          This is a draft import. Review every section before saving — the AI may have missed
          regulatory specifics, terminology, or steps. Embedded images were uploaded and are
          referenced inline.
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
          <div class="tw:flex tw:flex-col tw:gap-2 tw:max-h-[55vh] tw:overflow-y-auto">
            <div
              v-for="(section, i) in result.sections"
              :key="i"
              class="tw:border tw:border-divider tw:rounded-lg tw:p-3 tw:bg-sidebar"
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
                class="chat-md tw:text-xs tw:text-secondary tw:leading-relaxed tw:max-h-40 tw:overflow-y-auto"
                v-html="markdownToHtml(section.content)"
              />
            </div>
          </div>
        </div>

        <div v-if="usage" class="tw:text-xs tw:text-secondary">
          Source: {{ extracted?.pageCount }} pages, {{ extracted?.imageCount }} images extracted ·
          Tokens used: {{ usage.inputTokens }} in / {{ usage.outputTokens }} out
        </div>
      </div>
    </template>

    <!-- Phase: summary preview (large-PDF path) -->
    <template v-else-if="phase === 'summaryResult' && result">
      <div class="tw:flex tw:flex-col tw:gap-4">
        <div
          class="tw:p-3 tw:rounded-lg tw:bg-amber-50 tw:border tw:border-amber-200 tw:text-amber-900 tw:text-xs"
        >
          This PDF was too large to break into editable sections. The document will be created
          with a Summary section (rich text, editable) and an Original PDF section (attachment).
          Review the summary before saving.
        </div>

        <div class="tw:flex tw:flex-col tw:gap-1">
          <div class="tw:text-xs tw:text-secondary tw:font-semibold tw:uppercase tw:tracking-wide">
            Title
          </div>
          <div class="tw:text-lg tw:font-bold tw:text-on-main">{{ result.title }}</div>
        </div>

        <div class="tw:flex tw:flex-col tw:gap-1">
          <div class="tw:text-xs tw:text-secondary tw:font-semibold tw:uppercase tw:tracking-wide">
            Description
          </div>
          <div class="tw:text-sm tw:text-on-main tw:leading-relaxed">{{ result.description }}</div>
        </div>

        <div class="tw:flex tw:flex-col tw:gap-1">
          <div class="tw:text-xs tw:text-secondary tw:font-semibold tw:uppercase tw:tracking-wide">
            Summary
          </div>
          <div
            class="chat-md tw:text-sm tw:text-on-main tw:leading-relaxed tw:border tw:border-divider tw:rounded-lg tw:p-3 tw:bg-sidebar tw:max-h-[50vh] tw:overflow-y-auto"
            v-html="sanitizeHtml(result.summary)"
          />
        </div>

        <div
          class="tw:flex tw:items-center tw:gap-2 tw:text-xs tw:text-secondary tw:border tw:border-dashed tw:border-divider tw:rounded-lg tw:p-3"
        >
          <IconPaperclip :size="16" class="tw:flex-none" />
          <div>
            <strong class="tw:text-on-main">{{ selectedFile?.name }}</strong> will be attached as a
            separate "Original PDF" section on Apply.
          </div>
        </div>

        <div v-if="usage" class="tw:text-xs tw:text-secondary">
          Source: {{ extracted?.pageCount }} pages · Tokens used: {{ usage.inputTokens }} in /
          {{ usage.outputTokens }} out
        </div>
      </div>
    </template>

    <template #footer>
      <template v-if="phase === 'pick'">
        <BaseButton variant="outline" @click="discard">Cancel</BaseButton>
        <BaseButton :disabled="!selectedFile" @click="runImport">
          <IconSparkles :size="14" class="tw:mr-1" />
          Import
        </BaseButton>
      </template>
      <template
        v-else-if="phase === 'parsing' || phase === 'structuring' || phase === 'summarizing'"
      >
        <BaseButton variant="outline" disabled>Cancel</BaseButton>
        <BaseButton disabled>Working…</BaseButton>
      </template>
      <template v-else-if="phase === 'error'">
        <BaseButton variant="outline" @click="discard">Close</BaseButton>
        <BaseButton @click="phase = 'pick'">
          <IconRefresh :size="14" class="tw:mr-1" />
          Try again
        </BaseButton>
      </template>
      <template v-else-if="phase === 'result' || phase === 'summaryResult'">
        <BaseButton variant="outline" :disabled="applying" @click="regenerate">
          <IconRefresh :size="14" class="tw:mr-1" />
          {{ phase === 'summaryResult' ? 'Re-summarise' : 'Re-structure' }}
        </BaseButton>
        <BaseButton variant="outline" :disabled="applying" @click="discard">Discard</BaseButton>
        <BaseButton :disabled="applying" @click="applyDraft">
          <IconCheck :size="14" class="tw:mr-1" />
          {{ applying ? 'Uploading…' : 'Apply to Form' }}
        </BaseButton>
      </template>
    </template>
  </BaseDialog>
</template>
