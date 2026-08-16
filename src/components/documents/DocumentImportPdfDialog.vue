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

const props = defineProps({
  // The template already chosen on the create form, if any. Pre-selects the
  // attachment-mode picker so someone who has already said "this is an SOP"
  // is not asked again on the way out of a failed structured import.
  templateId: { type: String, default: null },
  // How many sections the create form is currently holding — normally the ones
  // the selected template seeded. Importing replaces them, so a non-zero count
  // is worth confirming before we throw the author's starting structure away.
  existingSectionCount: { type: Number, default: 0 },
})

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
 * THE TEMPLATE DOES NOT SUPPLY THE SHAPE (user decision 2026-08-16). An
 * imported document is structured from its OWN headings — that is the whole
 * point of reading it — and the selected template's job is the approval flow.
 * Forcing a real document into a template's section list produced worse
 * results than just reading the document, so the template is no longer
 * consulted for structure on either path. The original PDF is attached as a
 * "Source Document" section either way, which is what makes the conversion
 * auditable.
 *
 * Because the import REPLACES whatever sections the form is holding, Apply
 * confirms first when there are any (existingSectionCount).
 *
 * ATTACHMENT MODE is the second path, and the only one available without AI.
 * It skips parsing and structuring entirely, and is also the fallback when the
 * AI path fails — a PDF too large to parse, or one the model can't structure,
 * is still worth filing. It produces a Summary section plus the Source
 * Document, not the template's sections: an empty controlled shape nobody
 * filled in is worse than an honest record of what was imported.
 */

const emit = defineEmits(['apply'])

const show = defineModel({ type: Boolean, default: false })

const { confirm: confirmDialog } = useConfirm()

// Where the original PDF lands once the document has been restructured. Named,
// not "Attachment", so it reads as provenance rather than as content.
const SOURCE_SECTION_TITLE = 'Source Document'

const applyingDraft = ref(false)

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
// Why we ended up attaching rather than structuring. Shown as information on
// the attachment screen — it is an outcome, not a failure.
const fallbackNotice = ref('')
const extracted = ref(null) // { text, pageCount, imageCount, filename }
const result = ref(null) // { title, description, sections: [...] }
const usage = ref(null)

watch(show, (open) => {
  if (open) {
    phase.value = 'pick'
    error.value = null
    progress.value = { current: 0, total: 0, message: '' }
    selectedFile.value = null
    // Inherit the form's choice so the picker starts where the user left it.
    attachmentTemplateId.value = props.templateId ?? null
    attaching.value = false
    header.value = null
    headerBusy.value = false
    summary.value = ''
    summarising.value = false
    fallbackNotice.value = ''
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

// Beyond these, a full structured import is not worth attempting: the parse is
// slow, the model call is large and expensive, and the sections it returns for
// a 60-page manual are rarely what anyone keeps. Well under the parser's own
// hard caps (20 MB / 300 pages), which are about what it CAN do rather than
// what is worth doing.
// Raised 30 → 50 on 2026-08-16: 30 was below the size of an ordinary SOP. A
// 34-page procedure was being diverted to summarise-and-attach without the
// structured import ever being attempted, which read as "the AI didn't try".
const AI_FULL_IMPORT_MAX_PAGES = 50
const AI_FULL_IMPORT_MAX_BYTES = 8 * 1024 * 1024

/**
 * One button. The dialog picks the path (user request 2026-08-16 — "make that
 * decision ourselves, less clicks"):
 *
 *   no AI                        → attach, with a locally-read title
 *   large / long PDF             → summarise the first pages, then attach
 *   otherwise                    → full parse + structure
 *   anything above fails         → fall back to attach, no dead end
 *
 * A failure here is never terminal. The user picked a file they want in the
 * system; refusing it because the model couldn't structure it wastes the
 * upload and leaves them with an error and no next step.
 */
async function runImport() {
  if (!selectedFile.value) return
  error.value = null
  fallbackNotice.value = ''

  // Show the spinner BEFORE the first await, not after (bug 2026-08-16).
  // readHeader() opens the document with pdfjs, which on a large file takes
  // seconds — and every path below can await again before reaching a phase
  // that renders progress. Pressing Import used to grey the button and then
  // do nothing visible for the whole of that.
  phase.value = 'parsing'
  progress.value = { current: 0, total: 0, message: 'Reading PDF…' }

  // Cheap and local: gives a title and, crucially, the page count used to
  // decide the path — without parsing the whole document.
  await readHeader()

  if (!canUseAi.value) return goToAttachment()

  const tooBig =
    (header.value?.pageCount ?? 0) > AI_FULL_IMPORT_MAX_PAGES ||
    selectedFile.value.size > AI_FULL_IMPORT_MAX_BYTES
  if (tooBig) {
    fallbackNotice.value =
      `This PDF is ${header.value?.pageCount || 'many'} pages — summarising the first few ` +
      'and attaching the file, rather than restructuring the whole document.'
    progress.value = { current: 0, total: 0, message: 'Summarising the first pages…' }
    await summariseHeader()
    return goToAttachment()
  }

  await runFullImport()
}

/** Structured import. Any failure hands off to the attachment path. */
async function runFullImport() {
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
    // Not a dead end. A hard-cap rejection or a corrupt/protected file still
    // leaves a document worth filing, so summarise what we can read and attach.
    fallbackNotice.value =
      e instanceof PdfImportLimitError
        ? `${e.message} Attaching the file instead.`
        : "Couldn't read this PDF's contents — attaching the file instead."
    await summariseHeader()
    return goToAttachment()
  }

  // Sanity: if extraction produced almost no text, it's likely a scanned
  // PDF without an OCR layer. Surface a clear error so the user knows
  // what's happening rather than letting the AI guess at empty input.
  if (!extracted.value?.text || extracted.value.text.length < 50) {
    // Almost certainly a scan with no OCR layer. There is nothing to structure,
    // but the file itself is still the document — attach it.
    fallbackNotice.value =
      'This looks like a scanned PDF with no text layer, so there is nothing to structure. ' +
      'Attaching the file instead.'
    return goToAttachment()
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
      return structuringFailed(json?.error?.message)
    }
    result.value = json.result
    usage.value = json.usage
    phase.value = 'result'
  } catch (e) {
    return structuringFailed(e?.message)
  }
}

/**
 * The model couldn't structure it. Attaching is a genuinely useful outcome, so
 * we take it rather than showing an error with no way forward — the reason is
 * carried as a notice on the attachment screen, not as a failure.
 */
async function structuringFailed(reason) {
  // Deliberately NOT surfaced to the user: the reported failure returns a raw
  // zod validation blob ("expected array to have >=2 items"), which explains
  // nothing to the person importing and reads as a crash.
  if (reason) console.warn('[import] AI structuring failed:', reason)
  fallbackNotice.value =
    "We couldn't read this PDF into the shape your template defines, so it will be imported " +
    'as an attachment with a summary instead. Nothing is lost — the original file is kept, ' +
    'and you can fill the sections in yourself.'
  await summariseHeader()
  return goToAttachment()
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
        // Explicit retry from the preview — report it rather than switching
        // modes underneath someone who asked for this specific thing.
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

/**
 * Hand the parent the AI's structure, plus the original PDF.
 *
 * The imported document's own headings are the structure (user decision
 * 2026-08-16) — the selected template is NOT consulted for shape. Its job is
 * the approval flow. Trying to force a real document into a template's section
 * list produced worse results than just reading the document.
 *
 * The source PDF rides along as a final attachment section. A converted
 * document is a derived artifact; keeping the file it came from is what makes
 * the conversion auditable, and it costs one section.
 */
async function applyDraft() {
  if (!result.value || applyingDraft.value) return

  // The template's sections are already on the form; the import replaces them.
  // Ask first — this is the author's starting structure being discarded, and
  // it is not obvious from the preview that anything is being overwritten.
  if (props.existingSectionCount > 0) {
    const n = props.existingSectionCount
    const m = result.value.sections.length
    const ok = await confirmDialog({
      title: 'Replace the current sections?',
      message:
        `This document currently has ${n} section${n !== 1 ? 's' : ''} from the selected ` +
        `template. Importing replaces ${n !== 1 ? 'them' : 'it'} with the ${m} section${m !== 1 ? 's' : ''} ` +
        `read from the PDF, and attaches the original file for reference. ` +
        `The template still supplies the approval flow.`,
      okLabel: 'Yes, import',
    })
    if (!ok) return
  }

  applyingDraft.value = true
  error.value = null
  try {
    const sections = result.value.sections.map((s, idx) => ({
      title: s.title,
      content: renderSectionMd(s.content),
      sectionType: 'text',
      order: idx + 1,
    }))

    // Best-effort: a failed upload must not throw away a structure the user
    // has already reviewed and accepted. They keep the sections and can
    // attach the file by hand.
    let sourceAttachment = null
    if (selectedFile.value) {
      try {
        const { success, asset } = await uploadFile(selectedFile.value, 'ASSET')
        if (success && asset) sourceAttachment = asset
      } catch (e) {
        console.warn('[import] source PDF upload failed:', e?.message)
      }
    }

    if (sourceAttachment) {
      sections.push({
        title: SOURCE_SECTION_TITLE,
        content: null,
        sectionType: 'attachment',
        attachments: [sourceAttachment],
        order: sections.length + 1,
      })
    }

    emit('apply', {
      title: result.value.title,
      description: result.value.description,
      sections,
      sourceAttachmentFailed: !!selectedFile.value && !sourceAttachment,
    })
    show.value = false
  } finally {
    applyingDraft.value = false
  }
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
            Upload an SOP, work instruction, or policy PDF. We'll structure it into editable
            sections from the document's own headings, and attach the original for reference. Long,
            scanned or image-heavy files get a summary plus the attachment instead. You review
            before saving either way; nothing is created on its own.
          </template>
          <template v-else>
            Upload an SOP, work instruction, or policy PDF and pick a document template. The PDF is
            attached with a summary, and the template supplies the approval flow — nothing is
            created automatically.
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

        <div
          v-if="fallbackNotice"
          class="tw:flex tw:items-start tw:gap-2 tw:p-3 tw:rounded-lg tw:bg-main-hover tw:border tw:border-divider tw:text-sm tw:text-secondary"
        >
          <IconFileUpload :size="16" class="tw:mt-0.5 tw:flex-none tw:text-primary" />
          <div>{{ fallbackNotice }}</div>
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
          hint="Supplies the approval flow. The imported document's own content becomes its sections — the template's are not used."
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
        <!-- One action. runImport picks the path — structure it, summarise
             the first pages, or just attach — and falls back on its own. -->
        <BaseButton :disabled="!selectedFile || headerBusy" @click="runImport">
          <IconSparkles v-if="canUseAi" :size="14" class="tw:mr-1" />
          Import
        </BaseButton>
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
        <!-- Applying now uploads the source PDF, so it is no longer instant. -->
        <BaseButton :isLoading="applyingDraft" :disabled="applyingDraft" @click="applyDraft">
          <IconCheck :size="14" class="tw:mr-1" />
          Apply to Form
        </BaseButton>
      </template>
    </template>
  </BaseDialog>
</template>
