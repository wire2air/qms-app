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
const busy = ref(false)
const busyStage = ref('')
const importing = ref(false)
const preview = ref(null) // { code, name, description, contentLicense, clauses[] }
const error = ref(null)

// Skeleton-only import — model emits clauseNumber + title only, no
// per-clause guidance. Output budget stays well under 8K even for
// 250-row inputs, so total runtime is now ~20-90 s rather than
// minutes. 3-minute timeout covers slow provider days; richer
// guidance is filled in afterwards via the per-row + bulk Enrich
// buttons on the requirements editor.
const AI_TIMEOUT_MS = 3 * 60_000

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

async function onFilePicked(event) {
  const file = event.target.files?.[0]
  if (event.target) event.target.value = ''
  if (!file) return
  if (busy.value) return

  busy.value = true
  busyStage.value = 'Reading file…'
  preview.value = null
  error.value = null

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
    //    per row) so runtime stays bounded regardless of input size —
    //    even 250-row vendor checklists finish in under 90 s. Richer
    //    per-clause guidance lands afterwards via the Enrich buttons
    //    on the requirements editor.
    busyStage.value = `Structuring ${describeSource(fileMeta.value)} into a clause skeleton (20–90 s)…`
    const res = await post(
      '/v1/services/ai/tasks/audit_standard.import_from_pdf/run',
      {
        extractedText: extraction.text,
        filenameHint: file.name,
        sourceType: extraction.sourceType,
      },
      { timeout: AI_TIMEOUT_MS },
    )
    const out = res?.result
    if (!out?.clauses?.length) {
      error.value = 'The AI didn\'t return any clauses for this file.'
      return
    }
    preview.value = out
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

async function handleImport() {
  if (importing.value || !preview.value) return
  importing.value = true
  try {
    const payload = {
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
    }
    const res = await post('/v1/services/auditStandards/import', payload)
    toast.success(`Created ${res?.auditStandard?.name ?? preview.value.name}`)
    emit('created', res?.auditStandard ?? null)
    close()
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
          <strong>Two-step flow.</strong> This import lands the
          <em>structure</em> only — clause number + title per row —
          regardless of source size. Use the
          <strong>Enrich</strong> buttons on the requirements editor
          after import to author description, guidance, and expected
          evidence per clause (per-row or bulk; both run in the
          background). Splitting it this way keeps the import fast and
          reliable even on 200+ row vendor checklists.
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
              <span class="tw:font-semibold tw:text-on-main">{{ row.title }}</span>
              <span
                v-if="row.description"
                class="tw:text-secondary tw:line-clamp-2"
              >
                {{ row.description }}
              </span>
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
</template>
