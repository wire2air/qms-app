/**
 * Local extraction of a controlled document's own identity from its page-one
 * header block. No AI: these lines are already read on every import path, so
 * the number and department are free and deterministic.
 *
 * The fixture is the real reported document — a 34-page SOP whose number was
 * being missed because it exceeded the structured-import page cap.
 */
import { describe, it, expect } from 'vitest'
import { extractHeaderFields } from '../composables/usePdfImport.js'

const REPORTED_HEADER = [
  'STANDARD OPERATING PROCEDURE',
  'Document Title: Change Control',
  'Document Number: SOP-QA-006',
  'Revision: 00',
  'Effective Date: [DD-MMM-YYYY]',
  'Supersedes: New',
  'Department: Quality Assurance',
  'Document Owner: Quality Assurance',
  'Approved By: Quality Head',
  'Review Period: Every 2 years or as required',
]

describe('extractHeaderFields', () => {
  it('reads the reported document', () => {
    expect(extractHeaderFields(REPORTED_HEADER)).toEqual({
      documentNumber: 'SOP-QA-006',
      department: 'Quality Assurance',
    })
  })

  it('accepts the label spellings companies actually use', () => {
    const forms = [
      ['Doc No: QMS-WI-14', 'QMS-WI-14'],
      ['Doc No.: F-024', 'F-024'],
      ['Document ID: SOP.QA.006', 'SOP.QA.006'],
      ['Document #: ABC-1', 'ABC-1'],
      ['Reference: QMS/WI/14', 'QMS/WI/14'],
      ['SOP Number: SOP-001', 'SOP-001'],
      ['Number: F024', 'F024'],
    ]
    for (const [line, expected] of forms) {
      expect(extractHeaderFields([line]).documentNumber, line).toBe(expected)
    }
  })

  it('accepts en/em dash separators, not just colons', () => {
    expect(extractHeaderFields(['Document Number – SOP-QA-006']).documentNumber).toBe('SOP-QA-006')
    expect(extractHeaderFields(['Doc No - F-024']).documentNumber).toBe('F-024')
  })

  it('does not mistake prose for an identifier', () => {
    // The trap: "Reference" is a real label, but this value is a sentence.
    expect(
      extractHeaderFields(['Reference: see the applicable procedure']).documentNumber,
    ).toBeNull()
    expect(extractHeaderFields(['Document Number: to be assigned']).documentNumber).toBeNull()
  })

  it('ignores labels that merely resemble the target', () => {
    const out = extractHeaderFields([
      'Document Title: Change Control',
      'Document Owner: Quality Assurance',
      'Approved By: Quality Head',
    ])
    expect(out.documentNumber).toBeNull()
    // "Document Owner" is not "Department" — an owner is a person or function,
    // and filing by it would put the document in the wrong place.
    expect(out.department).toBeNull()
  })

  it('takes the FIRST match — the header block, not a later mention', () => {
    expect(
      extractHeaderFields(['Document Number: SOP-QA-006', 'Document Number: SOP-QA-999'])
        .documentNumber,
    ).toBe('SOP-QA-006')
  })

  it('stops before body prose', () => {
    const lines = [...Array(45).fill('filler line of body text'), 'Document Number: SOP-QA-006']
    expect(extractHeaderFields(lines).documentNumber).toBeNull()
  })

  it('handles department spellings', () => {
    expect(extractHeaderFields(['Dept: Production']).department).toBe('Production')
    expect(extractHeaderFields(['Dept.: Production']).department).toBe('Production')
    expect(extractHeaderFields(['Function: Engineering']).department).toBe('Engineering')
    expect(extractHeaderFields(['Owning Department: QA']).department).toBe('QA')
  })

  it('returns nulls rather than guessing', () => {
    expect(extractHeaderFields(['STANDARD OPERATING PROCEDURE', 'Some prose.'])).toEqual({
      documentNumber: null,
      department: null,
    })
    expect(extractHeaderFields([])).toEqual({ documentNumber: null, department: null })
    expect(extractHeaderFields(undefined)).toEqual({ documentNumber: null, department: null })
  })

  it('tolerates whitespace noise from the PDF extractor', () => {
    expect(extractHeaderFields(['  Document   Number  :   SOP-QA-006  ']).documentNumber).toBe(
      'SOP-QA-006',
    )
  })
})
