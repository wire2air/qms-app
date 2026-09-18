/**
 * Getting a document title out of a PDF WITHOUT AI.
 *
 * A model is not needed for a title: PDFs carry one in their metadata, and
 * where that's missing or junk the first substantial line of page 1 nearly
 * always is it. What AI buys is a SUMMARY — which is why the summary-only path
 * exists and the title path doesn't need it (user question 2026-08-16).
 *
 * The parsing itself needs pdfjs and a real file, so what's pinned here is the
 * part that decides WHICH candidate wins — the half that gets a wrong title
 * onto a document if it regresses.
 */
import { describe, it, expect } from 'vitest'

// Mirrors cleanPdfTitle / titleFromLines in usePdfImport.js.
function cleanPdfTitle(raw) {
  let t = (raw ?? '').trim()
  if (!t) return ''
  t = t.replace(/^Microsoft\s+(Word|PowerPoint|Excel)\s*-\s*/i, '')
  t = t.replace(/\.(docx?|pptx?|xlsx?|pdf)$/i, '').trim()
  if (!t || t.length < 3) return ''
  if (/^(untitled|document\s*\d*|presentation\s*\d*)$/i.test(t)) return ''
  return t
}

function titleFromLines(lines) {
  for (const raw of (lines ?? []).slice(0, 40)) {
    const line = raw.replace(/\s+/g, ' ').trim()
    if (line.length < 4 || line.length > 120) continue
    if (/^(page\s*)?\d+(\s*of\s*\d+)?$/i.test(line)) continue
    if (/^(rev(ision)?|version|effective|date|doc(ument)?\s*(no|#|id))\b/i.test(line)) continue
    if (!/[a-z]/i.test(line)) continue
    return line
  }
  return ''
}

describe('cleanPdfTitle', () => {
  it('keeps a real title', () => {
    expect(cleanPdfTitle('Cleanroom Gowning Procedure')).toBe('Cleanroom Gowning Procedure')
  })

  it('strips what authoring tools leave behind', () => {
    // By far the most common junk value in the wild.
    expect(cleanPdfTitle('Microsoft Word - SOP-014.docx')).toBe('SOP-014')
    expect(cleanPdfTitle('Gowning.pdf')).toBe('Gowning')
  })

  it('rejects placeholders that are worse than nothing', () => {
    for (const junk of ['', '   ', 'Untitled', 'Document1', 'document 2', 'ab']) {
      expect(cleanPdfTitle(junk), junk).toBe('')
    }
  })

  it('tolerates a missing value', () => {
    expect(cleanPdfTitle(undefined)).toBe('')
    expect(cleanPdfTitle(null)).toBe('')
  })
})

describe('titleFromLines', () => {
  it('takes the first substantial line', () => {
    expect(titleFromLines(['', 'Cleanroom Gowning Procedure', 'Section 1'])).toBe(
      'Cleanroom Gowning Procedure',
    )
  })

  it('skips document-control furniture above the title', () => {
    // Header/footer text usually precedes the real heading.
    const lines = ['Page 1 of 12', 'Rev 3', 'Effective 2026-01-01', 'Equipment Calibration SOP']
    expect(titleFromLines(lines)).toBe('Equipment Calibration SOP')
  })

  it('skips numbers-only and over-long lines', () => {
    expect(titleFromLines(['42', 'x'.repeat(200), 'Real Title Here'])).toBe('Real Title Here')
  })

  it('returns empty rather than guessing when nothing qualifies', () => {
    expect(titleFromLines(['1', '2', '3'])).toBe('')
    expect(titleFromLines([])).toBe('')
    expect(titleFromLines(undefined)).toBe('')
  })
})
