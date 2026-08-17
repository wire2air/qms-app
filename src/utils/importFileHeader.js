/**
 * Read a document's own identity from whatever format it arrives in.
 *
 * A client migrating onto the QMS has PDFs, Word files and spreadsheets. All
 * of them should import; what differs is how much we can read off them before
 * they land.
 *
 *   .pdf                      full local parse — title from metadata/first
 *                             lines, plus the page-one header block
 *   .xlsx .xls                first sheets flattened to rows; header blocks in
 *                             a cover sheet are usually "Label | Value" pairs,
 *                             which read the same as "Label: Value"
 *   .doc .docx                NOT parsed — see below
 *
 * Plain text and CSV are deliberately NOT offered (user decision 2026-08-17):
 * controlled documents do not arrive as .txt, and accepting them invites a
 * folder of stray notes into a document register.
 *
 * Word is the honest gap. Extracting .docx needs a library we do not ship
 * (mammoth or similar), and .doc is a binary format nothing sensible reads in
 * a browser. Those files still import: they get a title from the filename and
 * no extracted number, which is the same outcome as a PDF with no header
 * block. Getting the file into the QMS is the point; the extraction is a bonus
 * that happens to be very good for PDFs.
 *
 * Everything routes through extractHeaderFields, which is format-agnostic —
 * it takes lines of text — so the label vocabulary and the refusal to guess
 * are identical no matter what the file was.
 */
import { extractPdfHeader, extractHeaderFields } from '@/composables/usePdfImport.js'

/** Formats the picker offers. Order groups by family for the OS dialog. */
export const IMPORT_ACCEPT = '.pdf,.doc,.docx,.xls,.xlsx'

const PDF = new Set(['pdf'])
const SHEET = new Set(['xlsx', 'xls'])
const WORD = new Set(['doc', 'docx'])

/** Rows past this cannot be a header block, and a 50k-row sheet is not free. */
const SHEET_HEADER_ROWS = 60
export function extensionOf(file) {
  const name = file?.name ?? ''
  const dot = name.lastIndexOf('.')
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : ''
}

export function isSupportedImportFile(file) {
  const ext = extensionOf(file)
  return PDF.has(ext) || SHEET.has(ext) || WORD.has(ext)
}

/** Filename without its extension, tidied — the universal title fallback. */
export function titleFromFileName(name) {
  return String(name ?? '')
    .replace(/\.[^.]+$/, '')
    .replace(/[_]+/g, ' ')
    .trim()
}

async function sheetLines(file) {
  const XLSX = await import('xlsx')
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' })
  const lines = []
  for (const sheetName of workbook.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 })
    for (const row of rows.slice(0, SHEET_HEADER_ROWS)) {
      const cells = (row ?? []).map((c) => String(c ?? '').trim()).filter(Boolean)
      if (!cells.length) continue
      // "Document Number | SOP-QA-006" in two cells is the spreadsheet form of
      // "Document Number: SOP-QA-006"; joining with a colon lets the one
      // parser handle both. Rows with more cells join on space and simply
      // fail to match, which is correct — they are data, not a header.
      lines.push(cells.length === 2 ? `${cells[0]}: ${cells[1]}` : cells.join(' '))
    }
    if (lines.length >= SHEET_HEADER_ROWS) break
  }
  return lines
}

/**
 * @returns {Promise<{title: string, documentNumber: string|null,
 *                    department: string|null, parsed: boolean}>}
 *   `parsed` is false when the format carries no reader — the caller may want
 *   to say so rather than imply we looked and found nothing.
 */
export async function readImportHeader(file) {
  const fallback = {
    title: titleFromFileName(file?.name),
    documentNumber: null,
    department: null,
    parsed: false,
  }
  if (!file) return fallback

  const ext = extensionOf(file)

  try {
    if (PDF.has(ext)) {
      const head = await extractPdfHeader(file, { maxPages: 3 })
      return {
        title: head.title || fallback.title,
        documentNumber: head.documentNumber ?? null,
        department: head.department ?? null,
        parsed: true,
      }
    }

    if (SHEET.has(ext)) {
      const fields = extractHeaderFields(await sheetLines(file))
      return {
        // A workbook has no metadata title worth trusting, so the filename
        // stands. Deliberately not "first non-empty row" — that is a column
        // header, which would title every import "Date, Batch, Result".
        title: fallback.title,
        documentNumber: fields.documentNumber,
        department: fields.department,
        parsed: true,
      }
    }
  } catch {
    // A file we cannot read still imports under its filename. Refusing it
    // because the header was unreadable would be the wrong trade in a
    // migration tool.
    return fallback
  }

  // Word, and anything else that slipped through.
  return fallback
}
