<script setup>
import {
  IconFileUpload,
  IconSparkles,
  IconAlertTriangle,
  IconLoader2,
  IconRefresh,
  IconCheck,
  IconFile,
} from '@tabler/icons-vue'
import { markdownToHtml } from '@/utils/markdown.js'
import {
  parsePdfAndExtractImages,
  extractPdfHeader,
  PdfImportLimitError,
} from '@/composables/usePdfImport.js'
import { uploadFile } from '@/composables/useFileUpload.js'
import { canUseAi } from '@/utils/currentSession.js'

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
 *
 * ATTACHMENT MODE (2026-08-16) is the second path, and the only one available
 * without AI. It skips parsing and structuring entirely: pick the PDF, pick a
 * document template, and the file is attached to a document built from that
 * template's sections. The template is asked for because it supplies the
 * structure the AI would otherwise have produced — typically a small
 * "imported document" template of a summary plus an attachment.
 *
 * Nothing marks such a template as import-only, deliberately: a flag on
 * document_templates would be a second source of truth for something the
 * author already expresses by choosing it here (user decision 2026-08-16 —
 * accepted as a training matter rather than a schema one).
 *
 * It doubles as the fallback when the AI path fails — a PDF too large to
 * parse, or one the model can't structure, is still worth filing as an
 * attachment rather than losing the upload.
 */

const emit = defineEmits(['apply'])

const show = defineModel({ type: Boolean, default: false })

const ENDPOINT = '/api/v1/services/ai/tasks/document.import_from_pdf/run'

// Phases: pick → parsing → structuring → result → error
//          pick → attachment (no AI, or chosen as a fallback)
const phase = ref('pick')
const error = ref(null)
const progress = ref({ current: 0, total: 0, message: '' })

const selectedFile = ref(null)
// Attachment mode
const attachmentTemplateId = ref(null)
const attaching = ref(false)
// Front matter read LOCALLY — title always, plus the first pages' text so the
// summary-only path has something small to send. No AI involved in reading it.
const header = ref(null)
const headerBusy = ref(false)
const summary = ref('')
const summarising = ref(false)
const extracted = ref(null) // { text, pageCount, imageCount, filename }
const result = ref(null) // { title, description, sections: [...] }
const usage = ref(null)

watch(show, (open) => {
  if (open) {
    phase.value = 'pick'
    error.value = null
    progress.value = { current: 0, total: 0, message: '' }
    selectedFile.value = null
    attachmentTemplateId.value = null
    attaching.value = false
    header.value = null
    headerBusy.value = false
    summary.value = ''
    summarising.value = false
    extracted.value = null
    result.value = null
    usage.value = null
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
    if (e instanceof PdfImportLimitError) {
      // Hard-cap rejection — surface the limit clearly. The composable's
      // message already contains the actual size / page count and the cap.
      error.value = {
        stage: 'parsing',
        code: e.code,
        message: e.message,
      }
    } else {
      error.value = {
        stage: 'parsing',
        message:
          e?.message || 'Failed to parse PDF. The file may be corrupted or password-protected.',
      }
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

  // ── Stage 2: AI structuring ─────────────────────────────────────────
  phase.value = 'structuring'
  progress.value = { current: 0, total: 0, message: 'Structuring with AI…' }
  try {
    const res = await fetch(ENDPOINT, {
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
        stage: 'structuring',
        message: json?.error?.message ?? `Request failed (${res.status}).`,
        code: json?.error?.code ?? `HTTP_${res.status}`,
      }
      phase.value = 'error'
      return
    }
    result.value = json.result
    usage.value = json.usage
    phase.value = 'result'
  } catch (e) {
    error.value = { stage: 'structuring', message: e?.message ?? 'Network error.' }
    phase.value = 'error'
  }
}

function regenerate() {
  if (!extracted.value) {
    // No parsed text — restart from scratch
    runImport()
    return
  }
  // Re-run only the structuring stage (parse + upload already done; don't
  // re-upload images).
  result.value = null
  usage.value = null
  error.value = null
  phase.value = 'structuring'
  ;(async () => {
    try {
      const res = await fetch(ENDPOINT, {
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
          stage: 'structuring',
          message: json?.error?.message ?? `Request failed (${res.status}).`,
        }
        phase.value = 'error'
        return
      }
      result.value = json.result
      usage.value = json.usage
      phase.value = 'result'
    } catch (e) {
      error.value = { stage: 'structuring', message: e?.message ?? 'Network error.' }
      phase.value = 'error'
    }
  })()
}

// PDF imports carry embedded images (uploaded as data:/cloud URLs in the
// previous step), so the section content sanitizer must allow img src/alt.
// Chat and the AI draft dialog use the same shared sanitizer with images
// disallowed.
function renderSectionMd(md) {
  return markdownToHtml(md, { allowImages: true })
}

function applyDraft() {
  if (!result.value) return
  emit('apply', {
    title: result.value.title,
    description: result.value.description,
    sections: result.value.sections.map((s, idx) => ({
      title: s.title,
      content: renderSectionMd(s.content),
      sectionType: 'text',
      order: idx + 1,
    })),
  })
  show.value = false
}

function discard() {
  show.value = false
}

// ── Attachment mode ─────────────────────────────────────────────────────────
// The whole path without AI, and the fallback when AI can't do it. Uploads the
// PDF and hands the parent a template id plus the stored asset; the parent
// seeds sections from that template and files the attachment into it.
async function goToAttachment() {
  error.value = null
  phase.value = 'attachment'
  await readHeader()
}

/**
 * Read the first pages locally for a title. Offline, cheap, and it works on
 * the very files the full importer rejects — it only opens the front of the
 * document, so it never meets the size or page caps.
 */
async function readHeader() {
  if (header.value || !selectedFile.value || headerBusy.value) return
  headerBusy.value = true
  try {
    header.value = await extractPdfHeader(selectedFile.value, { maxPages: 3 })
  } catch {
    // A title is a convenience; a PDF we can't crack still imports as an
    // attachment under its filename.
    header.value = { title: '', text: '', pageCount: 0 }
  } finally {
    headerBusy.value = false
  }
}

/**
 * Summary-only import: send just the first pages to the model instead of the
 * whole document. For a file that is too large, too long, or mostly scans, a
 * full structured import either fails outright or spends a lot to produce
 * sections nobody wants — while a title, a paragraph and the PDF attached is
 * genuinely useful (user request 2026-08-16).
 *
 * Reuses document.import_from_pdf with a smaller payload and keeps only the
 * title and description: the sections it would return for three pages are a
 * misleading fragment of the real document.
 */
async function summariseHeader() {
  await readHeader()
  if (!header.value?.text || summarising.value) return
  summarising.value = true
  error.value = null
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        extractedText: header.value.text,
        filenameHint: selectedFile.value?.name,
      }),
    })
    const json = await res.json().catch(() => null)
    if (!res.ok) {
      error.value = {
        stage: 'summarising',
        message: json?.error?.message ?? `Request failed (${res.status}).`,
      }
      return
    }
    const out = json?.result ?? {}
    // Title only if the model found a better one than the PDF gave us.
    if (out.title) header.value = { ...header.value, title: out.title }
    summary.value = out.description ?? ''
  } catch (e) {
    error.value = { stage: 'summarising', message: e?.message || 'Could not summarise the PDF' }
  } finally {
    summarising.value = false
  }
}

// Title from the filename: it is almost always the document's real name, and
// re-typing it is the kind of small tax that makes people avoid the importer.
// The PDF's own title beats the filename, and neither needs AI. Filename is
// the fallback — usually right, and re-typing it is the kind of small tax that
// makes people avoid the importer.
const suggestedTitle = computed(
  () =>
    header.value?.title ||
    (selectedFile.value?.name ?? '')
      .replace(/\.pdf$/i, '')
      .replace(/[_-]+/g, ' ')
      .trim(),
)

async function applyAttachment() {
  if (!selectedFile.value || !attachmentTemplateId.value || attaching.value) return
  attaching.value = true
  error.value = null
  try {
    const { success, asset, error: uploadError } = await uploadFile(selectedFile.value, 'ASSET')
    if (!success || !asset) throw new Error(uploadError || 'Upload failed')
    emit('apply', {
      title: suggestedTitle.value || selectedFile.value.name,
      documentTemplateId: attachmentTemplateId.value,
      attachment: asset,
      summary: summary.value || '',
    })
    show.value = false
  } catch (e) {
    error.value = { stage: 'upload', message: e?.message || 'Could not upload the file' }
  } finally {
    attaching.value = false
  }
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
              v-if="
                extracted.headerLinesStripped ||
                extracted.recurringImagesSkipped ||
                extracted.skippedDueToLimit
              "
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
              <template
                v-if="
                  (extracted.headerLinesStripped || extracted.recurringImagesSkipped) &&
                  extracted.skippedDueToLimit
                "
              >
                +
              </template>
              <template v-if="extracted.skippedDueToLimit">
                {{ extracted.skippedDueToLimit }} image{{
                  extracted.skippedDueToLimit === 1 ? '' : 's'
                }}
                skipped (over-cap)
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
          <template v-if="canUseAi">
            Upload an SOP, work instruction, or policy PDF. We'll extract text + images, then use AI
            to structure it into editable sections. You'll review before saving — nothing is created
            automatically.
          </template>
          <template v-else>
            Upload an SOP, work instruction, or policy PDF and pick a document template. The PDF is
            filed as an attachment against that template's sections — nothing is created
            automatically.
          </template>
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

    <!-- Phase: attachment (no AI, or chosen after AI failed) -->
    <template v-else-if="phase === 'attachment'">
      <div class="tw:flex tw:flex-col tw:gap-4">
        <div class="tw:flex tw:items-center tw:gap-2 tw:text-sm tw:text-on-main">
          <IconFile :size="18" class="tw:text-secondary tw:shrink-0" />
          <span class="tw:font-medium tw:truncate">{{ selectedFile?.name }}</span>
          <span class="tw:text-xs tw:text-secondary tw:shrink-0">{{ fileSizeLabel }}</span>
        </div>

        <div class="tw:text-xs tw:text-secondary">
          <template v-if="headerBusy">Reading the PDF…</template>
          <template v-else-if="header?.title">
            Title read from the PDF: <strong class="tw:text-on-main">{{ header.title }}</strong>
          </template>
          <template v-else>
            Title will be taken from the filename — the PDF doesn't carry one.
          </template>
        </div>

        <BaseField
          label="Document Template"
          required
          hint="Supplies the document's sections. The PDF is attached to it — most teams keep a small template for imported documents (a summary plus an attachment)."
        >
          <DocumentTemplateSelectMenu v-model="attachmentTemplateId" :required="true" />
        </BaseField>

        <!-- Optional, AI-only: a paragraph from the first pages. The full
             structured import is a different, far larger request; this is for
             files where that isn't worth it or won't work. -->
        <div v-if="canUseAi" class="tw:flex tw:flex-col tw:gap-2">
          <div class="tw:flex tw:items-center tw:gap-2">
            <BaseButton
              variant="outline"
              size="sm"
              :disabled="summarising || headerBusy || !header?.text"
              :isLoading="summarising"
              @click="summariseHeader"
            >
              <IconSparkles :size="14" class="tw:mr-1" />
              {{ summary ? 'Regenerate summary' : 'Summarise first pages' }}
            </BaseButton>
            <span class="tw:text-xs tw:text-secondary">
              Uses the first 3 pages only — optional
            </span>
          </div>
          <BaseTextarea
            v-if="summary"
            v-model="summary"
            :rows="4"
            label="Summary"
            hint="Goes into the template's first text section."
          />
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
        <div
          v-if="progress.total"
          class="tw:w-full tw:max-w-md tw:bg-main-hover tw:rounded-full tw:h-1.5 tw:overflow-hidden"
        >
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
          <BaseText variant="overline">Title</BaseText>
          <div class="tw:text-lg tw:font-bold tw:text-on-main">{{ result.title }}</div>
        </div>

        <div class="tw:flex tw:flex-col tw:gap-1">
          <BaseText variant="overline">Summary</BaseText>
          <div class="tw:text-sm tw:text-on-main tw:leading-relaxed">{{ result.description }}</div>
        </div>

        <div class="tw:flex tw:flex-col tw:gap-2">
          <BaseText variant="overline">Sections ({{ result.sections.length }})</BaseText>
          <div class="tw:flex tw:flex-col tw:gap-2 tw:max-h-[55vh] tw:overflow-y-auto">
            <div
              v-for="(section, i) in result.sections"
              :key="i"
              class="tw:border tw:border-divider tw:rounded-lg tw:p-3 tw:bg-sidebar"
            >
              <div class="tw:flex tw:items-center tw:gap-2 tw:mb-1">
                <span
                  class="tw:text-xs tw:px-2 tw:py-0.5 tw:rounded tw:bg-primary/10 tw:text-primary"
                >
                  {{ i + 1 }}
                </span>
                <div class="tw:text-sm tw:font-semibold tw:text-on-main">
                  {{ section.title }}
                </div>
              </div>
              <div
                class="chat-md tw:text-xs tw:text-secondary tw:leading-relaxed tw:max-h-40 tw:overflow-y-auto"
                v-html="renderSectionMd(section.content)"
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

    <template #footer>
      <template v-if="phase === 'pick'">
        <BaseButton variant="outline" @click="discard">Cancel</BaseButton>
        <!-- Without AI this is the only path, so it is the primary action. -->
        <BaseButton v-if="!canUseAi" :disabled="!selectedFile" @click="goToAttachment">
          Continue
        </BaseButton>
        <template v-else>
          <BaseButton variant="outline" :disabled="!selectedFile" @click="goToAttachment">
            Attach without AI
          </BaseButton>
          <BaseButton :disabled="!selectedFile" @click="runImport">
            <IconSparkles :size="14" class="tw:mr-1" />
            Import
          </BaseButton>
        </template>
      </template>
      <template v-else-if="phase === 'attachment'">
        <BaseButton variant="outline" :disabled="attaching" @click="phase = 'pick'"
          >Back</BaseButton
        >
        <BaseButton
          :disabled="!attachmentTemplateId || attaching"
          :isLoading="attaching"
          @click="applyAttachment"
        >
          <IconCheck :size="14" class="tw:mr-1" />
          Attach to Document
        </BaseButton>
      </template>
      <template v-else-if="phase === 'parsing' || phase === 'structuring'">
        <BaseButton variant="outline" disabled>Cancel</BaseButton>
        <BaseButton disabled>Working…</BaseButton>
      </template>
      <template v-else-if="phase === 'error'">
        <BaseButton variant="outline" @click="discard">Close</BaseButton>
        <!-- The reported regression: a PDF too large to parse, or one the
             model can't structure, is still worth filing rather than losing
             the upload. -->
        <BaseButton v-if="selectedFile" variant="outline" @click="goToAttachment">
          Import as attachment
        </BaseButton>
        <BaseButton @click="phase = 'pick'">
          <IconRefresh :size="14" class="tw:mr-1" />
          Try again
        </BaseButton>
      </template>
      <template v-else-if="phase === 'result'">
        <BaseButton variant="outline" @click="regenerate">
          <IconRefresh :size="14" class="tw:mr-1" />
          Re-structure
        </BaseButton>
        <BaseButton variant="outline" @click="discard">Discard</BaseButton>
        <BaseButton @click="applyDraft">
          <IconCheck :size="14" class="tw:mr-1" />
          Apply to Form
        </BaseButton>
      </template>
    </template>
  </BaseDialog>
</template>
