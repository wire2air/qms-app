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
// PDF is attached as a separate section. 40K chars is roughly a
// 20-30 page text-heavy SOP — past that, the structured importer's
// 6000-token output cap leaves the model truncating mid-tool-use on
// dense documents (e.g. quality manuals, regulatory packs), which
// surfaces as a 120s timeout in the dialog.
const SUMMARY_THRESHOLD_CHARS = 40_000

// Hard cap on how long we wait for the AI service to come back before
// surfacing a clear error to the user. Real-world structured imports
// usually finish in 15-45s; anything past two minutes is almost always
// a stalled provider call rather than a slow one. Abort + render a
// "took too long" error so the dialog never spins indefinitely.
const AI_REQUEST_TIMEOUT_MS = 120_000

// Phases:
//   pick           — file picker + mode chooser (after file selected)
//   uploading      — uploading the original PDF as ASSET (attachment-only path)
//   parsing        — pdfjs extracting text + images (best-effort path)
//   structuring    — AI breaking small PDF into sections (best-effort path)
//   summarizing    — AI summarising large PDF (best-effort path)
//   result         — structured preview ready to apply
//   summaryResult  — summary preview ready to apply
//   error          — recoverable error; retry possible
const phase = ref('pick')
const error = ref(null)
const progress = ref({ current: 0, total: 0, message: '' })

const toast = useToast()

const selectedFile = ref(null)
const extracted = ref(null) // { text, pageCount, imageCount, filename }
const result = ref(null) // structured: { title, description, sections: [...] }
                        // summary:    { title, description, summary: '<html>' }
const usage = ref(null)
// 'attachment'  — user chose to attach the PDF without AI parsing
// 'structured'  — small PDF, AI structures into sections
// 'summary'     — large PDF, AI summarises and attaches PDF as a section
const mode = ref(null)
// Shared "we're writing somewhere right now" lock used by attach-only's
// upload step and applyDraft's PDF upload step. Declared up-front so
// runAttachOnly can read it without TDZ pitfalls.
const applying = ref(false)

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

// ──────────────────────────────────────────────────────────────────────
// Mode 1: attach-only. Skip pdfjs and AI entirely — upload the PDF as an
// ASSET and emit a single attachment-type section carrying it. Fast,
// reliable, never drops images, never times out on the AI. Recommended
// for documents where the binary IS the canonical record (regulatory
// packs, supplier specs, signed-and-scanned procedures).
// ──────────────────────────────────────────────────────────────────────
async function runAttachOnly() {
  if (!selectedFile.value || applying.value) return
  error.value = null
  mode.value = 'attachment'
  phase.value = 'uploading'
  applying.value = true
  try {
    const upload = await uploadFile(selectedFile.value, 'ASSET')
    if (!upload.success || !upload.asset) {
      error.value = {
        stage: 'uploading',
        message: upload.error ?? 'Failed to upload the PDF.',
      }
      phase.value = 'error'
      return
    }
    const titleGuess = selectedFile.value.name.replace(/\.pdf$/i, '')
    emit('apply', {
      title: titleGuess,
      description: '',
      sections: [
        {
          title: 'Original PDF',
          content: null,
          sectionType: 'attachment',
          attachments: [upload.asset],
          order: 1,
        },
      ],
    })
    show.value = false
  } finally {
    applying.value = false
  }
}

// ──────────────────────────────────────────────────────────────────────
// Mode 2: best-effort parsing. Try to break the doc into editable
// sections (or summarise if it's too big). If anything along that path
// fails — pdfjs error, AI timeout, validation failure — silently fall
// back to attach-only so the user still gets the PDF into the form.
// ──────────────────────────────────────────────────────────────────────
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
    await fallbackToAttach(
      `Couldn't parse the PDF (${e?.message ?? 'unknown error'}). Attaching as-is.`,
    )
    return
  }

  // Sanity: if extraction produced almost no text, it's likely a scanned
  // PDF without an OCR layer. Skip the AI step and degrade to attach-only
  // — the binary is still useful even if text extraction was empty.
  if (!extracted.value?.text || extracted.value.text.length < 50) {
    await fallbackToAttach(
      "PDF didn't have an OCR text layer (likely a scanned doc). Attaching as-is.",
    )
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

// Live AbortController for the active AI request so the user can
// cancel a slow / stalled stage from the dialog footer. Cleared once
// the request resolves (success or error) so a subsequent cancel is a
// no-op rather than a stale signal.
const aiAbortController = ref(null)
function cancelAiRequest() {
  if (aiAbortController.value) {
    aiAbortController.value.abort('user-cancelled')
  }
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

  const controller = new AbortController()
  aiAbortController.value = controller
  const timeoutId = setTimeout(
    () => controller.abort('timeout'),
    AI_REQUEST_TIMEOUT_MS,
  )

  try {
    const res = await fetch(isSummary ? SUMMARIZE_ENDPOINT : STRUCTURED_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      signal: controller.signal,
      body: JSON.stringify({
        extractedText: extracted.value.text,
        filenameHint: extracted.value.filename,
      }),
    })
    const json = await res.json().catch(() => null)
    if (!res.ok) {
      // Server told us the request failed (413, 400, 503, 5xx, etc.).
      // Degrade to attach-only — the user picked best-effort knowing it
      // might not finish; getting the binary into the form is the
      // baseline guarantee.
      const detail = json?.error?.message ?? `Request failed (${res.status}).`
      clearTimeout(timeoutId)
      aiAbortController.value = null
      await fallbackToAttach(`AI didn't accept the request (${detail}). Attaching as-is.`)
      return
    }
    result.value = json.result
    usage.value = json.usage
    phase.value = isSummary ? 'summaryResult' : 'result'
  } catch (e) {
    // When abort(reason) fires, modern browsers reject the fetch with the
    // reason value directly — so `e` may be a plain string, not an
    // AbortError-shaped DOMException. Trust signal.aborted as the
    // authoritative "was this an abort?" signal.
    const aborted = controller.signal.aborted || e?.name === 'AbortError'
    const reason = controller.signal.reason
    if (aborted && reason === 'user-cancelled') {
      // User explicitly bailed — show the error phase so they can choose
      // what to do next, don't silently restart with attach-only.
      error.value = { stage: isSummary ? 'summarizing' : 'structuring', message: 'Cancelled.' }
      phase.value = 'error'
    } else {
      const detail = aborted
        ? `AI didn't respond within ${Math.round(AI_REQUEST_TIMEOUT_MS / 1000)}s`
        : (e?.message ?? 'network error')
      clearTimeout(timeoutId)
      aiAbortController.value = null
      await fallbackToAttach(`${detail}. Attaching the PDF as-is instead.`)
      return
    }
  } finally {
    clearTimeout(timeoutId)
    aiAbortController.value = null
  }
}

// Shared fallback path — toast the reason, then run the attach-only
// upload + apply flow so the user still walks away with the PDF in
// the form. Re-uses runAttachOnly for the actual upload work.
async function fallbackToAttach(message) {
  toast.info(message)
  await runAttachOnly()
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

    // Structured path. Two safety nets compared to before:
    //   - Strip the dropped-image placeholder blockquotes from each
    //     section's body on the way to the form. They served their
    //     purpose in the preview ("this is what's missing"); the
    //     reviewer has already decided to accept the result, so leaving
    //     them in the controlled document would be ugly clutter.
    //   - Always append the original PDF as a final attachment-type
    //     section so the binary lands alongside the parsed sections.
    //     If the PDF upload itself fails we still apply the structured
    //     sections — surfacing a toast so the user knows the binary
    //     didn't make it.
    let originalAsset = null
    try {
      const upload = await uploadFile(selectedFile.value, 'ASSET')
      if (upload.success && upload.asset) originalAsset = upload.asset
      else toast.warning('Original PDF couldn\'t be attached — sections imported without it.')
    } catch (e) {
      toast.warning(`Original PDF couldn't be attached (${e?.message ?? 'upload failed'}).`)
    }

    const textSections = result.value.sections.map((s, idx) => ({
      title: s.title,
      content: stripDroppedImagePlaceholders(markdownToHtml(s.content)),
      sectionType: 'text',
      attachments: null,
      order: idx + 1,
    }))
    const sections = originalAsset
      ? [
          ...textSections,
          {
            title: 'Original PDF',
            content: null,
            sectionType: 'attachment',
            attachments: [originalAsset],
            order: textSections.length + 1,
          },
        ]
      : textSections

    emit('apply', {
      title: result.value.title,
      description: result.value.description,
      sections,
    })
    show.value = false
  } finally {
    applying.value = false
  }
}

// Pull out the <blockquote>… ⚠️ Image not extracted from PDF …
// </blockquote> markers the extractor inserted and the AI was told to
// preserve. Idempotent on content with no markers.
function stripDroppedImagePlaceholders(html) {
  if (!html) return html
  return html.replace(
    /<blockquote\b[^>]*>[\s\S]*?Image not extracted from PDF[\s\S]*?<\/blockquote>\s*/gi,
    '',
  )
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
            <span
              v-if="extracted.imagesDropped"
              class="tw:ml-2 tw:text-red-700 tw:font-semibold"
            >
              · {{ extracted.imagesDropped }} image{{
                extracted.imagesDropped === 1 ? '' : 's'
              }} couldn't be extracted
            </span>
          </div>
        </div>
      </div>
    </template>

    <!-- Phase: file picker + mode chooser -->
    <template v-if="phase === 'pick'">
      <div class="tw:flex tw:flex-col tw:gap-4">
        <div
          class="tw:rounded-xl tw:border-2 tw:border-dashed tw:border-divider tw:bg-sidebar tw:p-6 tw:flex tw:flex-col tw:items-center tw:justify-center tw:gap-3 tw:cursor-pointer tw:hover:border-primary/40 tw:transition-colors"
          @click="pickFile"
        >
          <IconFile :size="32" class="tw:text-secondary" />
          <div class="tw:text-center">
            <div class="tw:text-sm tw:font-semibold tw:text-on-main">
              {{ selectedFile ? selectedFile.name : 'Pick a PDF to import' }}
            </div>
            <div v-if="selectedFile" class="tw:text-xs tw:text-secondary tw:mt-0.5">
              {{ fileSizeLabel }} · click to change
            </div>
            <div v-else class="tw:text-xs tw:text-secondary tw:mt-0.5">
              Max 100 MB · text-based PDFs parse best (scanned PDFs need OCR first)
            </div>
          </div>
        </div>

        <!-- Mode chooser: only after a file is selected. Two big cards so
             the choice is explicit; attach-only is the recommended
             default because it's always reliable. -->
        <template v-if="selectedFile">
          <div
            class="tw:text-[11px] tw:text-secondary tw:font-semibold tw:uppercase tw:tracking-wide tw:mt-1"
          >
            How would you like to import it?
          </div>
          <div class="tw:grid tw:grid-cols-1 tw:md:grid-cols-2 tw:gap-3">
            <!-- Option 1 (recommended): Attach as-is -->
            <button
              class="tw:text-left tw:p-4 tw:rounded-xl tw:border-2 tw:border-primary tw:bg-primary/5 tw:hover:bg-primary/10 tw:transition-colors tw:flex tw:flex-col tw:gap-2 tw:cursor-pointer"
              @click="runAttachOnly"
            >
              <div class="tw:flex tw:items-center tw:gap-2">
                <IconPaperclip :size="18" class="tw:text-primary" />
                <div class="tw:text-sm tw:font-bold tw:text-on-main">
                  Import as attachment
                </div>
                <span
                  class="tw:text-[10px] tw:px-1.5 tw:py-0.5 tw:rounded tw:bg-primary tw:text-white tw:font-semibold"
                >
                  Recommended
                </span>
              </div>
              <div class="tw:text-xs tw:text-secondary tw:leading-relaxed">
                Upload the PDF and attach it to a single "Original PDF" section. Fast, always
                works, preserves every page and image exactly as in the source. Use when the
                PDF itself is the canonical record.
              </div>
            </button>

            <!-- Option 2: Best-effort parse -->
            <button
              class="tw:text-left tw:p-4 tw:rounded-xl tw:border tw:border-divider tw:hover:border-primary/40 tw:hover:bg-main-hover tw:transition-colors tw:flex tw:flex-col tw:gap-2 tw:cursor-pointer"
              @click="runImport"
            >
              <div class="tw:flex tw:items-center tw:gap-2">
                <IconSparkles :size="18" class="tw:text-primary" />
                <div class="tw:text-sm tw:font-bold tw:text-on-main">
                  Parse with AI (best effort)
                </div>
              </div>
              <div class="tw:text-xs tw:text-secondary tw:leading-relaxed">
                Extract text + images and use AI to structure the document into editable
                sections (or a summary for large docs).
                <span class="tw:text-amber-700">
                  May miss embedded images on complex layouts. If parsing fails or the PDF is
                  too large, we'll fall back to attaching it as-is.
                </span>
              </div>
            </button>
          </div>
        </template>

        <div
          v-if="error"
          class="tw:flex tw:items-start tw:gap-2 tw:p-3 tw:rounded-lg tw:bg-red-50 tw:border tw:border-red-200 tw:text-red-800 tw:text-sm"
        >
          <IconAlertTriangle :size="16" class="tw:mt-0.5 tw:flex-none" />
          <div>{{ error.message }}</div>
        </div>
      </div>
    </template>

    <!-- Phase: uploading (attach-only) -->
    <template v-else-if="phase === 'uploading'">
      <div class="tw:flex tw:flex-col tw:items-center tw:gap-4 tw:py-10">
        <IconLoader2 :size="40" class="tw:text-primary tw:animate-spin" />
        <div class="tw:text-center">
          <div class="tw:text-sm tw:font-semibold tw:text-on-main">Uploading PDF…</div>
          <div class="tw:text-xs tw:text-secondary tw:mt-1">
            {{ selectedFile?.name }} ({{ fileSizeLabel }})
          </div>
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

        <!-- Loud warning + bail-out CTA when pdfjs couldn't extract some
             of the source visuals. The structured output will show
             "[IMAGE: could not extract — see original PDF]" markers
             where they were lost, but if too many are gone the user
             may prefer to ditch the structured import and attach the
             original PDF instead. -->
        <div
          v-if="extracted?.imagesDropped"
          class="tw:p-3 tw:rounded-lg tw:bg-red-50 tw:border tw:border-red-200 tw:text-red-900 tw:flex tw:flex-col tw:gap-2"
        >
          <div class="tw:flex tw:items-start tw:gap-2">
            <IconAlertTriangle :size="16" class="tw:mt-0.5 tw:flex-none" />
            <div class="tw:text-xs">
              <strong>
                {{ extracted.imagesDropped }} image{{
                  extracted.imagesDropped === 1 ? '' : 's'
                }} couldn't be extracted
              </strong>
              from the PDF (look for
              <code class="tw:text-[10px] tw:bg-red-100 tw:px-1 tw:rounded">[IMAGE: …]</code>
              placeholders in the sections below). If the missing visuals matter, skip the
              structured import and attach the original PDF as-is.
            </div>
          </div>
          <BaseButton variant="outline" size="sm" :disabled="applying" @click="runAttachOnly">
            <template #icon><IconPaperclip :size="14" /></template>
            Import as attachment instead
          </BaseButton>
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
          <!-- Preview should read like the document form, not a chat
               transcript. Larger text, full on-main colour, generous
               max-height per section so the reviewer sees a faithful
               approximation of what TipTap will render after Apply. -->
          <div class="tw:flex tw:flex-col tw:gap-3 tw:max-h-[60vh] tw:overflow-y-auto">
            <div
              v-for="(section, i) in result.sections"
              :key="i"
              class="tw:border tw:border-divider tw:rounded-lg tw:p-4 tw:bg-white"
            >
              <div class="tw:flex tw:items-center tw:gap-2 tw:mb-3 tw:pb-2 tw:border-b tw:border-divider">
                <span
                  class="tw:text-xs tw:px-2 tw:py-0.5 tw:rounded tw:bg-primary/10 tw:text-primary tw:font-mono"
                >
                  {{ i + 1 }}
                </span>
                <div class="tw:text-base tw:font-semibold tw:text-on-main">
                  {{ section.title }}
                </div>
              </div>
              <div
                class="chat-md tw:text-sm tw:text-on-main tw:leading-relaxed"
                v-html="markdownToHtml(section.content)"
              />
            </div>
            <!-- Final attachment section preview — never persisted
                 separately, always added on Apply so the binary lands
                 alongside the parsed sections. Shown here so the
                 reviewer knows what they're getting. -->
            <div
              class="tw:border tw:border-divider tw:rounded-lg tw:p-4 tw:bg-white tw:flex tw:items-center tw:gap-3"
            >
              <span
                class="tw:text-xs tw:px-2 tw:py-0.5 tw:rounded tw:bg-primary/10 tw:text-primary tw:font-mono"
              >
                {{ result.sections.length + 1 }}
              </span>
              <IconPaperclip :size="18" class="tw:text-secondary tw:flex-none" />
              <div class="tw:flex tw:flex-col tw:gap-0.5 tw:min-w-0">
                <div class="tw:text-base tw:font-semibold tw:text-on-main">Original PDF</div>
                <div class="tw:text-xs tw:text-secondary tw:truncate">
                  {{ selectedFile?.name }} ({{ fileSizeLabel }}) — always attached so the binary
                  is never lost
                </div>
              </div>
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
        <!-- No primary action here — the two mode cards in the body
             are the action. Footer just provides an exit. -->
        <BaseButton variant="outline" @click="discard">Cancel</BaseButton>
      </template>
      <template v-else-if="phase === 'parsing' || phase === 'uploading'">
        <BaseButton variant="outline" disabled>Cancel</BaseButton>
        <BaseButton disabled>Working…</BaseButton>
      </template>
      <template v-else-if="phase === 'structuring' || phase === 'summarizing'">
        <BaseButton variant="outline" @click="cancelAiRequest">Cancel</BaseButton>
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
        <BaseButton variant="outline" :disabled="applying" @click="runAttachOnly">
          <IconPaperclip :size="14" class="tw:mr-1" />
          Attach PDF instead
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

<style>
/* v-html bypasses Vue's scoped CSS, so apply globally but namespaced to
   the preview's chat-md container (and the result-section blocks where
   the rendered markdown lands). Images come back from the AI as
   ![alt](url) markdown; without explicit constraints they render at
   their native resolution and either overflow or are completely
   invisible in the tight section-preview boxes. Blockquote styling
   makes the "Image not extracted" placeholder stand out. */
.chat-md img {
  max-width: 100%;
  max-height: 12rem;
  display: block;
  margin: 0.5rem 0;
  border: 1px solid var(--color-divider, #e5e7eb);
  border-radius: 0.375rem;
}
.chat-md blockquote {
  border-left: 3px solid #f59e0b;
  background: #fffbeb;
  color: #78350f;
  padding: 0.5rem 0.75rem;
  margin: 0.5rem 0;
  border-radius: 0 0.375rem 0.375rem 0;
}
.chat-md blockquote p {
  margin: 0;
}
</style>
