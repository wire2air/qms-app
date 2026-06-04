<script setup>
/**
 * AI Assist Import — accept a source document (PDF, CSV, Excel, plain
 * text) → AI-structured clauses → review → import.
 *
 * Deliberately separate from:
 *   - AuditStandardImportDialog (no-AI: paste / .txt / .csv / .json
 *     where the data already matches the expected column shape)
 *   - AuditStandardAiGenerateDialog (AI authors from a standard NAME,
 *     no source document)
 *
 * Three input source paths converge on the same AI task:
 *   1. PDF — pdfjs-dist text extraction (parsePdfAndExtractImages).
 *      Same composable document.import_from_pdf uses, with the
 *      auto-detect + strip of repeating headers/footers/company logos.
 *   2. CSV / plain text — File.text() inline. The AI handles messy
 *      multi-row headers + non-standard columns (e.g. supplier audit
 *      checklists with a Reference column for clause numbers + an
 *      Audit Item column for titles + scoring/observation columns to
 *      ignore).
 *   3. Excel (.xlsx / .xls) — xlsx (SheetJS) browser-side. Sheets are
 *      flattened to CSV text, all sheets concatenated with sheet-name
 *      separator rows. AI figures out the structure.
 *
 * The audit_standard.import_from_pdf BE task is named for its first
 * use case but its inputSchema already accepts arbitrary extractedText;
 * we pass sourceType so the model can apply the right parsing heuristic.
 *
 * Licensing: the AI returns a contentLicense suggestion (typically
 * STRUCTURAL_SHELL for ISO/IEC sources). We honour it on import. The
 * user can flip to a different licence on the standard's detail page
 * afterwards if needed.
 */
import { IconSparkles, IconUpload, IconAlertTriangle, IconUpload as IconFileUpload } from '@tabler/icons-vue'
// Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { post } from '@/api'
import { parsePdfAndExtractImages, PdfImportLimitError } from '@/composables/usePdfImport.js'
import * as XLSX from 'xlsx'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue', 'created'])

const toast = useToast()

const fileInputRef = ref(null)
const fileMeta = ref(null) // { name, sizeKb, sourceType, pageCount?, rowCount? }
// Cached File handle so we can re-upload the same bytes as a source
// attachment after the structural import succeeds. Kept ref-shallow on
// purpose — Files aren't deeply reactive and Vue would warn.
const pickedFile = ref(null)
const busy = ref(false)
const busyStage = ref('')
const importing = ref(false)
const preview = ref(null) // { code, name, description, contentLicense, clauses[] }
const error = ref(null)

// Skeleton-only import — model emits clauseNumber + title only, no
// per-clause guidance. Each call is bounded by the model's 8K output
// ceiling: even when titles are short, ~80 vendor-checklist rows fill
// it. Above that we chunk client-side so each AI call stays well under
// budget and the wall-clock stays interactive. 3 min per chunk covers
// slow provider days; richer guidance is filled in afterwards via the
// per-row + bulk Enrich buttons on the requirements editor.
const PER_CALL_TIMEOUT_MS = 3 * 60_000

// Row thresholds for client-side chunking of spreadsheet sources. The
// 8K output budget comfortably fits ~60 rows of pure clauseNumber +
// title even when titles run long (vendor-checklist audit questions
// can be 200+ chars). We chunk above CHUNK_THRESHOLD_ROWS so the
// math always works; smaller files go through in a single call.
//
// Header rows (the multi-row top header + the column-name row) are
// detected once and prepended to every chunk so the model has the
// same parsing context — without them, chunks 2+ would see anonymous
// columns and bail.
const CHUNK_THRESHOLD_ROWS = 80
const CHUNK_SIZE_ROWS = 50

// Char cap matches the BE task's extractedText z.max(200_000) — soft-
// check on the FE so we error early with a clearer message instead of
// burning a 4xx round-trip.
const MAX_EXTRACTED_CHARS = 200_000

const ACCEPTED_FILE_TYPES =
  '.pdf,.csv,.txt,.tsv,.xlsx,.xls,application/pdf,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel'

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return
    fileMeta.value = null
    pickedFile.value = null
    preview.value = null
    busy.value = false
    busyStage.value = ''
    error.value = null
  },
)

function close() {
  emit('update:modelValue', false)
}

function fileSourceType(file) {
  const lowerName = (file.name || '').toLowerCase()
  const lowerType = (file.type || '').toLowerCase()
  if (lowerName.endsWith('.pdf') || lowerType === 'application/pdf') return 'pdf'
  if (lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls') || /spreadsheet|excel/.test(lowerType)) {
    return 'spreadsheet'
  }
  if (lowerName.endsWith('.csv') || lowerName.endsWith('.tsv') || lowerType === 'text/csv') {
    return 'spreadsheet'
  }
  return 'text'
}

/**
 * Flatten an Excel workbook into a CSV-flavoured text stream the AI
 * task can read. Each sheet becomes a block with a "=== Sheet: <name>"
 * separator so the model can tell where one sheet ends and the next
 * begins (rare for audit checklists but worth supporting). xlsx is
 * already in the FE deps from the spreadsheet preview surfaces.
 */
function extractExcelText(arrayBuffer) {
  const workbook = XLSX.read(arrayBuffer, { type: 'array' })
  const parts = []
  let totalRows = 0
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName]
    if (!sheet) continue
    const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false })
    if (!csv?.trim()) continue
    parts.push(`=== Sheet: ${sheetName} ===\n${csv}`)
    totalRows += csv.split('\n').length
  }
  return { text: parts.join('\n\n'), rowCount: totalRows }
}

/**
 * Extract raw text from PDF / CSV / Excel / TXT into a single string
 * the audit_standard.import_from_pdf task can structure. Returns
 * { text, meta } where meta has sourceType + filename + size + the
 * per-source-type stats (pageCount for PDFs, rowCount for spreadsheets).
 */
async function extractFromFile(file, onProgress) {
  const sourceType = fileSourceType(file)
  if (sourceType === 'pdf') {
    const extraction = await parsePdfAndExtractImages(file, onProgress)
    return {
      text: extraction.text,
      sourceType: 'pdf',
      pageCount: extraction.pageCount,
    }
  }
  if (sourceType === 'spreadsheet') {
    // CSV / TSV: read text directly. xlsx-likely paths: SheetJS read.
    const lowerName = (file.name || '').toLowerCase()
    const isExcel =
      lowerName.endsWith('.xlsx') ||
      lowerName.endsWith('.xls') ||
      /spreadsheet|excel/.test(file.type || '')
    if (isExcel) {
      onProgress?.({ message: 'Reading Excel workbook…' })
      const buffer = await file.arrayBuffer()
      const { text, rowCount } = extractExcelText(buffer)
      return { text, sourceType: 'spreadsheet', rowCount }
    }
    onProgress?.({ message: 'Reading spreadsheet text…' })
    const text = await file.text()
    return { text, sourceType: 'spreadsheet', rowCount: text.split('\n').length }
  }
  // Plain text.
  onProgress?.({ message: 'Reading file…' })
  const text = await file.text()
  return { text, sourceType: 'text' }
}

function describeSource(meta) {
  if (meta.sourceType === 'pdf') {
    return `${meta.pageCount} page${meta.pageCount === 1 ? '' : 's'}`
  }
  if (meta.sourceType === 'spreadsheet') {
    return `${meta.rowCount} row${meta.rowCount === 1 ? '' : 's'}`
  }
  return 'plain text'
}

/**
 * Locate the column-header row inside a spreadsheet-flattened text.
 * Vendor audit checklists nearly always have a row whose cells include
 * "Reference" / "Clause" / "Code" / "Section" AND a question-style cell
 * like "Audit Item" / "Requirement" / "Question" / "Description". Once
 * we find it, everything from the top of the file through that row is
 * the header block (multi-row title + column names) and everything
 * after is data.
 *
 * Returns -1 if no header row matches in the first 12 lines — in that
 * case we treat the whole file as data with no preserved header block.
 */
function detectHeaderEndIndex(lines) {
  const scanWindow = Math.min(lines.length, 12)
  for (let i = 0; i < scanWindow; i++) {
    const lower = (lines[i] || '').toLowerCase()
    const hasNumberCol =
      lower.includes('reference') ||
      lower.includes('clause') ||
      lower.includes('section') ||
      /\bcode\b/.test(lower)
    const hasTitleCol =
      lower.includes('audit item') ||
      lower.includes('requirement') ||
      lower.includes('question') ||
      lower.includes('description') ||
      lower.includes('subject') ||
      lower.includes('topic')
    if (hasNumberCol && hasTitleCol) return i
  }
  return -1
}

/**
 * Split a spreadsheet-flattened text into per-chunk text strings each
 * containing the header block plus a slice of data rows. Blank rows
 * are filtered. The last chunk may be smaller than CHUNK_SIZE_ROWS; if
 * it would be smaller than 5 rows we merge it into the previous chunk
 * so each chunk satisfies the BE's clauses.min(5) outputSchema.
 */
function chunkSpreadsheetText(text, { rowsPerChunk = CHUNK_SIZE_ROWS } = {}) {
  const lines = text.split('\n')
  const headerEndIdx = detectHeaderEndIndex(lines)
  const headerBlock =
    headerEndIdx >= 0 ? lines.slice(0, headerEndIdx + 1).join('\n') : ''
  const dataRows = (headerEndIdx >= 0 ? lines.slice(headerEndIdx + 1) : lines).filter(
    (l) => l.trim().length > 0,
  )
  if (!dataRows.length) return [text]

  const chunks = []
  for (let i = 0; i < dataRows.length; i += rowsPerChunk) {
    chunks.push(dataRows.slice(i, i + rowsPerChunk))
  }
  // Avoid a final chunk < 5 rows (would fail BE clauses.min(5)) by
  // merging it into the previous chunk.
  if (chunks.length >= 2 && chunks[chunks.length - 1].length < 5) {
    const tail = chunks.pop()
    chunks[chunks.length - 1].push(...tail)
  }
  return chunks.map((rows) =>
    headerBlock ? `${headerBlock}\n${rows.join('\n')}` : rows.join('\n'),
  )
}

/**
 * Run the AI structuring task. Returns { result, error }. Per-chunk
 * timeout is 3 min — at skeleton density with 50 rows in, an 8K-cap
 * output finishes in 30-60 s, so 3 min is the slow-provider buffer.
 */
async function runStructuringTask({ extractedText, filenameHint, sourceType }) {
  return await post(
    '/v1/services/ai/tasks/audit_standard.import_from_pdf/run',
    { extractedText, filenameHint, sourceType },
    { timeout: PER_CALL_TIMEOUT_MS },
  )
}

async function onFilePicked(event) {
  const file = event.target.files?.[0]
  if (event.target) event.target.value = ''
  if (!file) return
  if (busy.value) return

  busy.value = true
  busyStage.value = 'Reading file…'
  preview.value = null
  error.value = null
  // Remember the picked file so handleImport() can re-upload it as the
  // source-document attachment after the structural import succeeds.
  pickedFile.value = file

  try {
    // 1. Browser-side extraction (per source type).
    const extraction = await extractFromFile(file, (stage) => {
      if (stage?.message) busyStage.value = stage.message
    })
    const trimmed = (extraction.text || '').trim()
    if (trimmed.length < 50) {
      if (extraction.sourceType === 'pdf') {
        error.value =
          'PDF extraction returned almost no text. The file may be scanned (image-only) — try a text-based copy.'
      } else {
        error.value =
          'The file appears empty or unparseable. Re-export the audit checklist and try again.'
      }
      return
    }
    if (trimmed.length > MAX_EXTRACTED_CHARS) {
      error.value = `File too large after extraction (${(trimmed.length / 1024).toFixed(0)} KB > ${MAX_EXTRACTED_CHARS / 1024} KB cap). Split into multiple files and import each.`
      return
    }
    fileMeta.value = {
      name: file.name,
      sizeKb: (file.size / 1024).toFixed(1),
      sourceType: extraction.sourceType,
      pageCount: extraction.pageCount,
      rowCount: extraction.rowCount,
    }

    // 2. AI structuring. Skeleton-only output (clauseNumber + title
    //    per row) keeps each call bounded by the 8K model output
    //    ceiling. For spreadsheets above CHUNK_THRESHOLD_ROWS we
    //    split into per-CHUNK_SIZE_ROWS blocks (with the detected
    //    header rows prepended to each) and call the AI sequentially —
    //    each chunk finishes well within the per-call timeout, and
    //    failures isolate to a single chunk. The first chunk's
    //    standard-level metadata (code/name/description/contentLicense)
    //    is what we keep; subsequent chunks only contribute clauses.
    const shouldChunk =
      extraction.sourceType === 'spreadsheet' &&
      (extraction.rowCount || 0) > CHUNK_THRESHOLD_ROWS

    if (!shouldChunk) {
      busyStage.value = `Extracting clauses verbatim from ${describeSource(fileMeta.value)} (20–90 s)…`
      const res = await runStructuringTask({
        extractedText: extraction.text,
        filenameHint: file.name,
        sourceType: extraction.sourceType,
      })
      const out = res?.result
      if (!out?.clauses?.length) {
        error.value = 'The AI didn\'t return any clauses for this file.'
        return
      }
      preview.value = out
    } else {
      const chunks = chunkSpreadsheetText(extraction.text, {
        rowsPerChunk: CHUNK_SIZE_ROWS,
      })
      let merged = null
      const allClauses = []
      // Local dedup — chunk overlap is unlikely but the header block
      // we prepend to every chunk could in theory tempt the model to
      // emit a header-row clause. Track clauseNumber to drop dupes
      // before the BE import sees them.
      const seenNumbers = new Set()
      for (let i = 0; i < chunks.length; i++) {
        busyStage.value = `Chunk ${i + 1} of ${chunks.length}: extracting rows ${i * CHUNK_SIZE_ROWS + 1}–${i * CHUNK_SIZE_ROWS + CHUNK_SIZE_ROWS}…`
        const res = await runStructuringTask({
          extractedText: chunks[i],
          filenameHint: file.name,
          sourceType: 'spreadsheet',
        })
        const out = res?.result
        if (!out?.clauses?.length) {
          error.value = `Chunk ${i + 1} of ${chunks.length} returned no clauses. Try splitting the file manually and importing each half.`
          return
        }
        if (!merged) merged = out
        for (const clause of out.clauses) {
          if (seenNumbers.has(clause.clauseNumber)) continue
          seenNumbers.add(clause.clauseNumber)
          allClauses.push(clause)
        }
      }
      preview.value = { ...merged, clauses: allClauses }
    }
  } catch (err) {
    if (err instanceof PdfImportLimitError) {
      error.value = err.message
    } else {
      error.value = err?.message || 'Import failed'
    }
  } finally {
    busy.value = false
    busyStage.value = ''
  }
}

// Replace-existing confirm state. See AuditStandardAiGenerateDialog
// for the parallel implementation — BE returns 409 STANDARD_CODE_EXISTS
// when the per-tenant code clashes, the FE surfaces this dialog, and
// confirm re-posts the same payload with replaceExistingId set so the
// BE soft-deletes the old standard inside the create transaction.
const replaceConfirm = ref(null) // { existingId, existingName, existingCode }

function buildImportPayload(replaceExistingId = null) {
  return {
    code: preview.value.code,
    name: preview.value.name,
    description: preview.value.description || null,
    contentLicense: preview.value.contentLicense || 'STRUCTURAL_SHELL',
    format: 'json',
    clauses: preview.value.clauses,
    // The PDF-derived path is BYOL territory (the user uploaded their
    // own licensed copy) but the AI-restructured result is shipped
    // under the licence the model picked, mirroring AI Generate. If
    // the user wants CUSTOMER_LICENSED + attestation they can use the
    // regular Import dialog after exporting clauses[] there.
    licenseAttested: false,
    ...(replaceExistingId ? { replaceExistingId } : {}),
  }
}

async function attachSourceFile(standard) {
  if (!standard?.id || !pickedFile.value) return
  // Best-effort — if the upload fails the standard is still created
  // and the user gets a non-blocking warning. Keeps the import
  // success path unconditional.
  try {
    const form = new FormData()
    form.append('file', pickedFile.value, pickedFile.value.name)
    await post(
      `/v1/services/auditStandards/${standard.id}/sourceFile`,
      form,
      // axios picks the multipart boundary itself when given FormData;
      // we just bump the timeout — large PDFs over slow links can
      // take 30-60 s.
      { timeout: 2 * 60_000 },
    )
  } catch (uploadErr) {
    toast.warning(
      `Standard created but the source file couldn't be attached: ${uploadErr?.message || 'upload failed'}. You can attach it later from the standard's detail page.`,
    )
  }
}

async function submitImport(payload) {
  const res = await post('/v1/services/auditStandards/import', payload)
  const standard = res?.standard ?? null
  toast.success(`Created ${standard?.name ?? preview.value.name}`)
  await attachSourceFile(standard)
  emit('created', standard)
  close()
}

async function handleImport() {
  if (importing.value || !preview.value) return
  importing.value = true
  try {
    await submitImport(buildImportPayload())
  } catch (err) {
    if (err?.code === 'STANDARD_CODE_EXISTS' && err?.details?.existingStandardId) {
      replaceConfirm.value = {
        existingId: err.details.existingStandardId,
        existingName: err.details.existingStandardName,
        existingCode: err.details.existingStandardCode,
      }
      return
    }
    toast.error(err?.message || 'Import failed')
  } finally {
    importing.value = false
  }
}

async function confirmReplace() {
  if (!replaceConfirm.value || importing.value) return
  importing.value = true
  const existingId = replaceConfirm.value.existingId
  replaceConfirm.value = null
  try {
    await submitImport(buildImportPayload(existingId))
  } catch (err) {
    toast.error(err?.message || 'Import failed')
  } finally {
    importing.value = false
  }
}

const previewRows = computed(() => preview.value?.clauses?.slice(0, 6) ?? [])
const remainingCount = computed(() =>
  Math.max(0, (preview.value?.clauses?.length ?? 0) - previewRows.value.length),
)
</script>

<template>
  <BaseDialog
    :modelValue="modelValue"
    title="AI Assist Import — Parse a document into clauses"
    maxWidth="xl"
    @update:modelValue="close"
  >
    <div class="tw:flex tw:flex-col tw:gap-4 tw:p-1">
      <!-- Context strip -->
      <div
        class="tw:rounded-lg tw:bg-purple-50 tw:border tw:border-purple-200 tw:p-3 tw:text-xs tw:text-purple-900 tw:leading-relaxed tw:flex tw:items-start tw:gap-2"
      >
        <IconSparkles :size="16" class="tw:shrink-0 tw:mt-0.5" />
        <span>
          <strong>Pure structural import.</strong> The AI extracts
          <em>clause number + requirement text verbatim from the
          source</em>, nothing else. No paraphrasing, no per-clause
          guidance authored at this step. Files larger than
          {{ CHUNK_THRESHOLD_ROWS }} rows are processed in
          {{ CHUNK_SIZE_ROWS }}-row chunks so the AI call stays within
          its output budget — expect ~1 minute per chunk. Use the
          <strong>Enrich</strong> buttons on the requirements editor
          afterwards to author description, guidance, and expected
          evidence per clause (per-row or bulk; both run in the
          background).
        </span>
      </div>

      <!-- File picker / busy stage -->
      <div v-if="!preview" class="tw:flex tw:flex-col tw:gap-3">
        <div>
          <p class="tw:text-xs tw:uppercase tw:font-bold tw:text-secondary tw:mb-1">
            Source file
          </p>
          <BaseButton
            variant="outline"
            size="sm"
            :disabled="busy"
            @click="fileInputRef?.click()"
          >
            <template #icon><IconFileUpload :size="16" /></template>
            {{ busy ? 'Processing…' : fileMeta ? 'Replace file' : 'Choose file' }}
          </BaseButton>
          <input
            ref="fileInputRef"
            type="file"
            :accept="ACCEPTED_FILE_TYPES"
            class="tw:hidden"
            @change="onFilePicked"
          />
          <div
            v-if="fileMeta && !busy"
            class="tw:text-[11px] tw:text-secondary tw:mt-1 tw:font-mono"
          >
            {{ fileMeta.name }} · {{ fileMeta.sizeKb }} KB · {{ describeSource(fileMeta) }}
          </div>
          <div class="tw:text-[11px] tw:text-secondary tw:mt-1">
            Accepts <strong>PDF, Excel (.xlsx/.xls), CSV, TSV, plain text</strong>.
            PDF limit 20 MB / 300 pages. After extraction the text is
            capped at 200 KB — split larger documents into multiple files.
            Scanned (image-only) PDFs won't extract.
          </div>
        </div>

        <div
          v-if="busy"
          class="tw:rounded tw:bg-purple-50 tw:border tw:border-purple-200 tw:p-2 tw:text-[11px] tw:text-purple-900 tw:flex tw:items-center tw:gap-2"
        >
          <span
            class="tw:inline-block tw:size-3 tw:border-2 tw:border-purple-400 tw:border-t-transparent tw:rounded-full tw:animate-spin"
          />
          {{ busyStage || 'Working…' }}
        </div>
      </div>

      <!-- Error -->
      <div
        v-if="error"
        class="tw:rounded-lg tw:border tw:border-red-300 tw:bg-red-50 tw:p-3 tw:text-xs tw:text-red-800 tw:flex tw:items-start tw:gap-2"
      >
        <IconAlertTriangle :size="16" class="tw:shrink-0 tw:mt-0.5" />
        <span>{{ error }}</span>
      </div>

      <!-- Preview -->
      <div v-if="preview" class="tw:flex tw:flex-col tw:gap-2">
        <div
          class="tw:rounded-lg tw:border tw:border-divider tw:bg-main-hover/30 tw:p-3 tw:text-xs tw:flex tw:flex-col tw:gap-1"
        >
          <div class="tw:flex tw:items-center tw:gap-2 tw:flex-wrap">
            <code class="tw:text-[11px] tw:font-mono tw:text-primary">
              {{ preview.code }}
            </code>
            <span class="tw:text-secondary">·</span>
            <span class="tw:font-semibold tw:text-on-main">{{ preview.name }}</span>
            <span class="tw:text-secondary">·</span>
            <span
              class="tw:text-[10px] tw:uppercase tw:tracking-wide tw:bg-gray-200 tw:text-gray-700 tw:px-1.5 tw:py-0.5 tw:rounded"
            >
              {{ preview.contentLicense }}
            </span>
          </div>
          <div class="tw:text-secondary">{{ preview.description }}</div>
          <div class="tw:text-[11px] tw:text-secondary tw:mt-1">
            {{ preview.clauses.length }} clause{{ preview.clauses.length === 1 ? '' : 's' }} structured from
            <span class="tw:font-mono">{{ fileMeta?.name }}</span>
          </div>
        </div>

        <div
          class="tw:rounded-lg tw:border tw:border-divider tw:overflow-hidden tw:divide-y tw:divide-divider"
        >
          <div
            v-for="row in previewRows"
            :key="row.clauseNumber"
            class="tw:flex tw:gap-3 tw:px-3 tw:py-2 tw:text-xs"
          >
            <code class="tw:font-mono tw:text-secondary tw:shrink-0 tw:w-20">
              {{ row.clauseNumber }}
            </code>
            <div class="tw:flex tw:flex-col tw:gap-0.5 tw:flex-1 tw:min-w-0">
              <span class="tw:text-on-main tw:line-clamp-3">{{ row.title }}</span>
            </div>
          </div>
          <div
            v-if="remainingCount > 0"
            class="tw:px-3 tw:py-2 tw:text-[11px] tw:text-secondary tw:italic"
          >
            … and {{ remainingCount }} more.
          </div>
        </div>

        <!-- Inline replace-source affordance once a preview exists. -->
        <div class="tw:text-[11px] tw:text-secondary">
          Not quite right?
          <button
            type="button"
            class="tw:text-primary tw:underline tw:cursor-pointer"
            @click="fileInputRef?.click()"
          >
            Try another file
          </button>
          or
          <button
            type="button"
            class="tw:text-primary tw:underline tw:cursor-pointer"
            @click="preview = null"
          >
            start over
          </button>.
        </div>
      </div>
    </div>

    <template #footer>
      <BaseButton variant="outline" :disabled="importing || busy" @click="close">Cancel</BaseButton>
      <BaseButton
        v-if="preview"
        variant="primary"
        :loading="importing"
        :disabled="importing"
        @click="handleImport"
      >
        <template #icon><IconUpload :size="16" /></template>
        Import {{ preview.clauses.length }} clauses
      </BaseButton>
    </template>
  </BaseDialog>

  <!-- Replace-existing confirm. Shown when /import returns
       409 STANDARD_CODE_EXISTS. Confirm → re-post with
       replaceExistingId so the BE soft-deletes the old standard in
       the same transaction. -->
  <BaseDialog
    :modelValue="!!replaceConfirm"
    title="Standard already exists"
    maxWidth="md"
    @update:modelValue="replaceConfirm = null"
  >
    <div v-if="replaceConfirm" class="tw:flex tw:flex-col tw:gap-3 tw:p-1 tw:text-sm">
      <p class="tw:text-on-main">
        A standard with code
        <code class="tw:font-mono tw:bg-main-hover tw:px-1.5 tw:py-0.5 tw:rounded">
          {{ replaceConfirm.existingCode }}
        </code>
        already exists for this company:
        <strong>{{ replaceConfirm.existingName }}</strong>.
      </p>
      <p class="tw:text-secondary tw:text-xs">
        Archiving the existing standard will remove it from the standards list
        and free the code for the new import. Any historical audit instances
        that referenced it keep their snapshotted requirements (audits do not
        re-resolve against the live standard).
      </p>
    </div>
    <template #footer>
      <BaseButton variant="outline" :disabled="importing" @click="replaceConfirm = null">
        Cancel
      </BaseButton>
      <BaseButton
        variant="danger"
        :loading="importing"
        :disabled="importing"
        @click="confirmReplace"
      >
        Archive existing &amp; replace
      </BaseButton>
    </template>
  </BaseDialog>
</template>
