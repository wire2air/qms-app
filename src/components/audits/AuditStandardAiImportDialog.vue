<script setup>
/**
 * AI Assist Import — PDF → AI-structured clauses → review → import.
 *
 * Deliberately separate from:
 *   - AuditStandardImportDialog (no-AI: paste / .txt / .csv / .json)
 *   - AuditStandardAiGenerateDialog (AI authors from a standard NAME,
 *     no source document)
 *
 * Both AI dialogs share the same Preview + Import pattern (code + name
 * + description + clauses[] from the AI task → POSTed to the existing
 * /v1/services/auditStandards/import endpoint), but the input shape is
 * different enough that one dialog with a mode switch felt cramped.
 *
 * Pipeline:
 *   1. User picks a PDF. We parse it client-side via pdfjs-dist
 *      (parsePdfAndExtractImages — same composable document.import_
 *      from_pdf uses), including the auto-detect + strip of repeating
 *      headers/footers/company logos.
 *   2. Extracted text + filename hint POSTed to the AI task
 *      audit_standard.import_from_pdf. Returns the same shape AI
 *      Generate returns.
 *   3. Preview pane shows the result. "Import N clauses" pipes the
 *      JSON into /v1/services/auditStandards/import.
 *
 * Licensing: the AI returns a contentLicense suggestion (typically
 * STRUCTURAL_SHELL for ISO/IEC sources). We honour it on import. The
 * user can flip to a different licence on the standard's detail page
 * afterwards if needed.
 */
import { IconSparkles, IconUpload, IconAlertTriangle, IconFileTypePdf } from '@tabler/icons-vue'
// Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { post } from '@/api'
import { parsePdfAndExtractImages, PdfImportLimitError } from '@/composables/usePdfImport.js'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue', 'created'])

const toast = useToast()

const pdfInputRef = ref(null)
const fileMeta = ref(null) // { name, sizeKb, pageCount }
const busy = ref(false)
const busyStage = ref('')
const importing = ref(false)
const preview = ref(null) // { code, name, description, contentLicense, clauses[] }
const error = ref(null)

// 5-minute timeout matching AI Generate. Full ISO 27001 PDFs (with
// Annex A) can take 1–3 minutes for the model to structure.
const AI_PDF_TIMEOUT_MS = 5 * 60_000

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

async function onPdfPicked(event) {
  const file = event.target.files?.[0]
  if (event.target) event.target.value = ''
  if (!file) return
  if (busy.value) return

  busy.value = true
  busyStage.value = 'Extracting text from PDF…'
  preview.value = null
  error.value = null

  try {
    // 1. Browser-side extraction.
    const extraction = await parsePdfAndExtractImages(file, (stage) => {
      if (stage?.message) busyStage.value = stage.message
    })
    if (!extraction?.text || extraction.text.trim().length < 50) {
      error.value =
        'PDF extraction returned almost no text. The file may be scanned (image-only) — try a text-based copy.'
      return
    }
    fileMeta.value = {
      name: file.name,
      sizeKb: (file.size / 1024).toFixed(1),
      pageCount: extraction.pageCount,
    }

    // 2. AI structuring.
    busyStage.value = `Structuring ${extraction.pageCount} page${
      extraction.pageCount === 1 ? '' : 's'
    } into clauses (15–60 s)…`
    const res = await post(
      '/v1/services/ai/tasks/audit_standard.import_from_pdf/run',
      {
        extractedText: extraction.text,
        filenameHint: file.name,
      },
      { timeout: AI_PDF_TIMEOUT_MS },
    )
    const out = res?.result
    if (!out?.clauses?.length) {
      error.value = 'The AI didn\'t return any clauses for this PDF.'
      return
    }
    preview.value = out
  } catch (err) {
    if (err instanceof PdfImportLimitError) {
      error.value = err.message
    } else {
      error.value = err?.message || 'PDF import failed'
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
    title="AI Assist Import — Parse a PDF into clauses"
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
          Upload a PDF of your licensed standard. The browser extracts
          the text, the AI reconstructs the clause structure + authors
          original audit guidance per row, you review, then import.
          Normative text is never reproduced — clause numbers + titles
          are read from the source; guidance is the model's own prose.
        </span>
      </div>

      <!-- File picker / busy stage -->
      <div v-if="!preview" class="tw:flex tw:flex-col tw:gap-3">
        <div>
          <p class="tw:text-xs tw:uppercase tw:font-bold tw:text-secondary tw:mb-1">
            PDF file
          </p>
          <BaseButton
            variant="outline"
            size="sm"
            :disabled="busy"
            @click="pdfInputRef?.click()"
          >
            <template #icon><IconFileTypePdf :size="16" /></template>
            {{ busy ? 'Processing…' : fileMeta ? 'Replace file' : 'Choose PDF' }}
          </BaseButton>
          <input
            ref="pdfInputRef"
            type="file"
            accept=".pdf,application/pdf"
            class="tw:hidden"
            @change="onPdfPicked"
          />
          <div
            v-if="fileMeta && !busy"
            class="tw:text-[11px] tw:text-secondary tw:mt-1 tw:font-mono"
          >
            {{ fileMeta.name }} · {{ fileMeta.sizeKb }} KB · {{ fileMeta.pageCount }} page{{ fileMeta.pageCount === 1 ? '' : 's' }}
          </div>
          <div class="tw:text-[11px] tw:text-secondary tw:mt-1">
            Limits: 20 MB / 300 pages. Scanned (image-only) PDFs won't
            extract — use a text-based copy.
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

        <!-- Inline replace-PDF affordance once a preview exists. -->
        <div class="tw:text-[11px] tw:text-secondary">
          Not quite right?
          <button
            type="button"
            class="tw:text-primary tw:underline tw:cursor-pointer"
            @click="pdfInputRef?.click()"
          >
            Try another PDF
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
