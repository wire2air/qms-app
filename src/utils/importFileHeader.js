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
 *   .docx                     unzipped and read from word/document.xml —
 *                             paragraphs AND table cells, since a Word header
 *                             block is nearly always a 2-column table
 *   .doc                      NOT parsed — see below
 *
 * Plain text and CSV are deliberately NOT offered (user decision 2026-08-17):
 * controlled documents do not arrive as .txt, and accepting them invites a
 * folder of stray notes into a document register.
 *
 * .docx uses jszip + DOMParser, both already here, rather than adding mammoth.
 * Mammoth converts a whole document to HTML faithfully, which is a much bigger
 * job than this needs: we want the first few dozen lines of a header block, so
 * pulling <w:t> runs out of <w:p> paragraphs and <w:tr> rows is enough and
 * costs no new dependency.
 *
 * .doc (Word 97-2003) is the remaining gap — a binary compound-file format
 * with no sane browser parser. Those files still import, titled from the
 * filename with no extracted number, which is the same outcome as a PDF that
 * prints no header block.
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
const DOCX = new Set(['docx'])
// Binary Word. Accepted for upload, not parsed.
const LEGACY_WORD = new Set(['doc'])

/** Rows past this cannot be a header block, and a 50k-row sheet is not free. */
const SHEET_HEADER_ROWS = 60
// Same reasoning for Word — a header block is at the very top.
const DOCX_HEADER_LINES = 60
export function extensionOf(file) {
  const name = file?.name ?? ''
  const dot = name.lastIndexOf('.')
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : ''
}

export function isSupportedImportFile(file) {
  const ext = extensionOf(file)
  return PDF.has(ext) || SHEET.has(ext) || DOCX.has(ext) || LEGACY_WORD.has(ext)
}

/** Filename without its extension, tidied — the universal title fallback. */
export function titleFromFileName(name) {
  return String(name ?? '')
    .replace(/\.[^.]+$/, '')
    .replace(/[_]+/g, ' ')
    .trim()
}

/**
 * Text lines from a .docx.
 *
 * A docx is a zip; the body lives in word/document.xml as <w:p> paragraphs
 * whose text sits in <w:t> runs. Header blocks in Word are nearly always a
 * two-column table, so <w:tr> rows are read too and a 2-cell row is joined
 * with a colon — the same trick the spreadsheet path uses, so one parser
 * handles "Document Number: X", "Document Number | X" and the Word table form.
 */
async function docxLines(file, limit = DOCX_HEADER_LINES) {
  const JSZip = (await import('jszip')).default
  const zip = await JSZip.loadAsync(await file.arrayBuffer())
  const entry = zip.file('word/document.xml')
  if (!entry) return []

  const xml = new DOMParser().parseFromString(await entry.async('string'), 'application/xml')
  const textOf = (node) =>
    Array.from(node.getElementsByTagName('w:t'))
      .map((t) => t.textContent ?? '')
      .join('')
      .replace(/\s+/g, ' ')
      .trim()

  const lines = []
  // Rows first: a paragraph inside a table cell would otherwise be emitted on
  // its own and lose its pairing with the label beside it.
  const consumed = new Set()
  for (const row of Array.from(xml.getElementsByTagName('w:tr'))) {
    const cells = Array.from(row.getElementsByTagName('w:tc')).map(textOf).filter(Boolean)
    for (const p of Array.from(row.getElementsByTagName('w:p'))) consumed.add(p)
    if (!cells.length) continue
    lines.push(cells.length === 2 ? `${cells[0]}: ${cells[1]}` : cells.join(' '))
    if (lines.length >= limit) return lines
  }
  for (const p of Array.from(xml.getElementsByTagName('w:p'))) {
    if (consumed.has(p)) continue
    const text = textOf(p)
    if (text) lines.push(text)
    if (lines.length >= limit) break
  }
  return lines
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

    if (DOCX.has(ext)) {
      const lines = await docxLines(file)
      const fields = extractHeaderFields(lines)
      return {
        // Word carries a dc:title in docProps, but authoring tools fill it
        // with the template name far too often to trust — the same reason
        // cleanPdfTitle exists. The filename is the more reliable signal.
        title: fallback.title,
        documentNumber: fields.documentNumber,
        department: fields.department,
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

  // .doc, and anything else that slipped through.
  return fallback
}

/**
 * Full text of a .docx, for the single-document importer's AI structuring pass.
 *
 * The AI task takes `extractedText`, not a PDF, so a Word document can go
 * through the very same structuring path — it only ever needed a way to
 * produce text. Capped because that task's input schema caps too, and because
 * a 300-page manual is not worth restructuring.
 */
export const DOCX_MAX_LINES = 4000

export async function readDocxText(file) {
  const lines = await docxLines(file, DOCX_MAX_LINES)
  return lines.join('\n').trim()
}

/** True when readDocxText can handle it — the single importer branches on this. */
export function isDocx(file) {
  return DOCX.has(extensionOf(file))
}
