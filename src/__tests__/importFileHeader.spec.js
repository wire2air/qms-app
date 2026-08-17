/**
 * Format dispatch for bulk import.
 *
 * The header PARSING is covered by pdfHeaderFields.spec.js — this pins which
 * formats are accepted, and that an unreadable one still yields a usable
 * fallback rather than throwing, because in a migration tool refusing a file
 * is worse than importing it under its filename.
 */
import { describe, it, expect } from 'vitest'
import {
  IMPORT_ACCEPT,
  extensionOf,
  isSupportedImportFile,
  titleFromFileName,
  readImportHeader,
} from '../utils/importFileHeader.js'

const fileNamed = (name) => new File(['x'], name)

describe('IMPORT_ACCEPT', () => {
  it('offers PDF, Word and Excel — and deliberately not text', () => {
    expect(IMPORT_ACCEPT).toBe('.pdf,.doc,.docx,.xls,.xlsx')
    // Controlled documents do not arrive as .txt (user decision 2026-08-17).
    expect(IMPORT_ACCEPT).not.toMatch(/\.txt|\.csv|\.md/)
  })
})

describe('isSupportedImportFile', () => {
  it('accepts the document formats', () => {
    for (const n of ['a.pdf', 'a.PDF', 'b.doc', 'b.docx', 'c.xls', 'c.xlsx']) {
      expect(isSupportedImportFile(fileNamed(n)), n).toBe(true)
    }
  })

  it('rejects what a migration folder sweeps up', () => {
    // The reported case: images, and files with no extension at all.
    for (const n of ['Cleaning Checklist.avif', 'photo.png', 'notes.txt', 'data.csv', 'README']) {
      expect(isSupportedImportFile(fileNamed(n)), n).toBe(false)
    }
  })
})

describe('titleFromFileName', () => {
  it('strips the extension and tidies separators', () => {
    expect(titleFromFileName('SOP_Change_Control.pdf')).toBe('SOP Change Control')
    expect(titleFromFileName('Line Clearance.docx')).toBe('Line Clearance')
  })

  it('leaves a name with no extension alone', () => {
    expect(titleFromFileName('Quality Manual')).toBe('Quality Manual')
  })

  it('handles empty input', () => {
    expect(titleFromFileName('')).toBe('')
    expect(titleFromFileName(undefined)).toBe('')
  })
})

describe('extensionOf', () => {
  it('lowercases, and copes with dots in the name', () => {
    expect(extensionOf(fileNamed('a.b.PDF'))).toBe('pdf')
    expect(extensionOf(fileNamed('noext'))).toBe('')
  })
})

describe('readImportHeader', () => {
  it('falls back to the filename for Word, which we cannot parse', async () => {
    const out = await readImportHeader(fileNamed('SOP_Change_Control.docx'))
    expect(out).toEqual({
      title: 'SOP Change Control',
      documentNumber: null,
      department: null,
      // Explicitly false: we did not look, as opposed to looked and found
      // nothing. The caller may want to say so.
      parsed: false,
    })
  })

  it('never throws on a corrupt file — it still imports under its name', async () => {
    // Not a real PDF; pdfjs will reject it.
    const out = await readImportHeader(fileNamed('broken.pdf'))
    expect(out.title).toBe('broken')
    expect(out.documentNumber).toBeNull()
  })

  it('handles a missing file', async () => {
    const out = await readImportHeader(null)
    expect(out.documentNumber).toBeNull()
    expect(out.parsed).toBe(false)
  })
})
