/**
 * Chat attachments — browser-side text extraction.
 *
 * The Ask-AI chat accepts reference files (an existing paper form as PDF, a
 * spreadsheet of a current log sheet, plain text). The backend never sees
 * the raw file: everything is extracted to text HERE (same pattern as the
 * audit-standard / document PDF imports) and rides the chat request as
 * `attachments: [{ name, text }]`, size-capped to match the API schema.
 *
 *   - .pdf          → pdfjs text extraction (no image uploads — text only)
 *   - .xlsx / .xls  → every sheet flattened to CSV, labeled per sheet
 *   - .csv / .tsv / .txt / .md → read as-is
 */
import { parsePdfAndExtractImages } from '@/composables/usePdfImport.js'

// Mirrors the backend sendMessageSchema attachment cap (200k chars/file).
export const MAX_ATTACHMENT_TEXT_CHARS = 200_000
export const MAX_ATTACHMENT_FILE_BYTES = 15 * 1024 * 1024
export const MAX_CHAT_ATTACHMENTS = 5

export const CHAT_ATTACHMENT_ACCEPT = '.pdf,.csv,.tsv,.txt,.md,.xlsx,.xls'

const TEXT_EXTENSIONS = new Set(['csv', 'tsv', 'txt', 'md'])
const SHEET_EXTENSIONS = new Set(['xlsx', 'xls'])

function extensionOf(file) {
  const name = file?.name ?? ''
  const dot = name.lastIndexOf('.')
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : ''
}

async function extractSpreadsheet(file) {
  const XLSX = await import('xlsx')
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' })
  const parts = []
  for (const sheetName of workbook.SheetNames) {
    const csv = XLSX.utils.sheet_to_csv(workbook.Sheets[sheetName]).trim()
    if (!csv) continue
    parts.push(`## Sheet: ${sheetName}\n\n${csv}`)
  }
  return parts.join('\n\n')
}

async function extractPdf(file, onProgress) {
  const { text } = await parsePdfAndExtractImages(file, onProgress, { uploadImages: false })
  return text
}

/**
 * Extract a chat attachment to `{ name, text, truncated }`.
 * Throws Error with a user-presentable message on unsupported/oversized/empty
 * files.
 *
 * @param {File} file
 * @param {(stage: object) => void} [onProgress]  forwarded to the PDF parser
 */
export async function parseChatAttachment(file, onProgress = () => {}) {
  if (!file) throw new Error('No file provided')
  if (file.size > MAX_ATTACHMENT_FILE_BYTES) {
    throw new Error(
      `"${file.name}" is ${(file.size / (1024 * 1024)).toFixed(1)} MB; the limit is ${
        MAX_ATTACHMENT_FILE_BYTES / (1024 * 1024)
      } MB.`,
    )
  }

  const ext = extensionOf(file)
  let text
  if (ext === 'pdf') {
    text = await extractPdf(file, onProgress)
  } else if (SHEET_EXTENSIONS.has(ext)) {
    text = await extractSpreadsheet(file)
  } else if (TEXT_EXTENSIONS.has(ext)) {
    text = await file.text()
  } else {
    throw new Error(
      `"${file.name}" is not a supported attachment. Use PDF, Excel/CSV, or plain text.`,
    )
  }

  text = (text ?? '').trim()
  if (!text) {
    throw new Error(
      `Nothing readable was found in "${file.name}". Scanned/image-only PDFs are not supported yet.`,
    )
  }

  const truncated = text.length > MAX_ATTACHMENT_TEXT_CHARS
  if (truncated) text = text.slice(0, MAX_ATTACHMENT_TEXT_CHARS)

  return { name: file.name, text, truncated }
}
