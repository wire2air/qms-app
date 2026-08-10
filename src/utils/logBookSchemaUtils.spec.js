import { describe, it, expect } from 'vitest'
import {
  flattenScalarFields,
  formatCellValue,
  defaultVisibleColumnKeys,
  fieldRecordStatusLabel,
} from './logBookSchemaUtils.js'

describe('flattenScalarFields', () => {
  // Regression guard: the type identifiers MUST match what the Form Builder /
  // DynamicForm actually emit (text/date/radio/…), not generic aliases. A
  // mismatch silently drops every column (the "Columns (0)" bug).
  it('keeps the real scalar field types the builder emits', () => {
    const schema = [
      { name: 'a', type: 'text', label: 'A' },
      { name: 'b', type: 'radio', label: 'B' },
      { name: 'c', type: 'date', label: 'C' },
      { name: 'd', type: 'number', label: 'D' },
      { name: 'e', type: 'select', label: 'E' },
      { name: 'f', type: 'checkbox', label: 'F' },
      { name: 'g', type: 'toggle', label: 'G' },
      { name: 'h', type: 'textEditor', label: 'H' },
    ]
    expect(flattenScalarFields(schema).map((f) => f.name)).toEqual([
      'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h',
    ])
  })

  it('drops complex + layout types (they stay in the detail view)', () => {
    const schema = [
      { name: 'ok', type: 'text', label: 'OK' },
      { name: 'doc', type: 'file', label: 'Doc' },
      { name: 'pic', type: 'photo', label: 'Pic' },
      { name: 'sig', type: 'signature', label: 'Sig' },
      { name: 'rows', type: 'repeater', label: 'Rows', children: [{ name: 'x', type: 'text' }] },
      { name: 'grid', type: 'table', label: 'Grid' },
      { name: 'ref', type: 'lookup', label: 'Ref' },
      { type: 'separator' },
      { type: 'header', label: 'H' },
    ]
    expect(flattenScalarFields(schema).map((f) => f.name)).toEqual(['ok'])
  })

  it('recurses section/row/column containers in order', () => {
    const schema = [
      { type: 'section', children: [{ name: 'a', type: 'text' }, { type: 'row', children: [{ name: 'b', type: 'number' }] }] },
      { name: 'c', type: 'radio' },
    ]
    expect(flattenScalarFields(schema).map((f) => f.name)).toEqual(['a', 'b', 'c'])
  })

  it('the real Calibration Log schema yields every field except the file', () => {
    const schema = [
      { name: 'instrumentTag', type: 'text' },
      { name: 'calibrationType', type: 'radio' },
      { name: 'standardUsed', type: 'text' },
      { name: 'asFound', type: 'textEditor' },
      { name: 'asLeft', type: 'textEditor' },
      { name: 'result', type: 'radio' },
      { name: 'performedBy', type: 'text' },
      { name: 'certificate', type: 'file' },
    ]
    expect(flattenScalarFields(schema).map((f) => f.name)).toEqual([
      'instrumentTag', 'calibrationType', 'standardUsed', 'asFound', 'asLeft', 'result', 'performedBy',
    ])
  })

  it('non-array schema → empty', () => {
    expect(flattenScalarFields(null)).toEqual([])
    expect(flattenScalarFields(undefined)).toEqual([])
  })
})

describe('formatCellValue', () => {
  it('strips HTML from a textEditor into a plain-line preview', () => {
    expect(formatCellValue({ type: 'textEditor' }, '<p>Ran <b>calibration</b>&nbsp;OK</p>')).toBe(
      'Ran calibration OK',
    )
    expect(formatCellValue({ type: 'textEditor' }, '<p></p>')).toBe('—')
  })

  it('resolves choice option ids to labels (select/radio/optionGroup/optionSet)', () => {
    const field = { type: 'radio', options: [{ id: 'pass', label: 'Pass' }, { id: 'fail', label: 'Fail' }] }
    expect(formatCellValue(field, 'pass')).toBe('Pass')
    const multi = { type: 'select', options: [{ id: 'a', label: 'Apple' }, { id: 'b', label: 'Banana' }] }
    expect(formatCellValue(multi, ['a', 'b'])).toBe('Apple, Banana')
  })

  it('formats date vs datetime distinctly', () => {
    const iso = '2026-08-08T14:30:00.000Z'
    expect(formatCellValue({ type: 'date' }, iso)).not.toMatch(/:/) // no time part
    expect(formatCellValue({ type: 'datetime' }, iso)).toMatch(/\d/)
  })

  it('booleans, primitive arrays, empties', () => {
    expect(formatCellValue({ type: 'toggle' }, true)).toBe('Yes')
    expect(formatCellValue({ type: 'checklist' }, ['x', 'y'])).toBe('x, y')
    expect(formatCellValue({ type: 'text' }, '')).toBe('—')
    expect(formatCellValue({ type: 'text' }, null)).toBe('—')
  })

  it('truncates long text with an ellipsis', () => {
    expect(formatCellValue({ type: 'text' }, 'x'.repeat(200), { maxLength: 10 })).toHaveLength(10)
  })
})

describe('defaultVisibleColumnKeys', () => {
  it('takes the first N, skipping colorPicker', () => {
    const fields = [
      { name: 'a', type: 'text' },
      { name: 'c', type: 'colorPicker' },
      { name: 'b', type: 'text' },
      { name: 'd', type: 'text' },
      { name: 'e', type: 'text' },
      { name: 'f', type: 'text' },
    ]
    expect(defaultVisibleColumnKeys(fields, 4)).toEqual(['a', 'b', 'd', 'e'])
  })
})

describe('fieldRecordStatusLabel', () => {
  it('maps LOCKED → Completed and normalises the rest', () => {
    expect(fieldRecordStatusLabel('LOCKED')).toBe('Completed')
    expect(fieldRecordStatusLabel('UNDER_REVIEW')).toBe('Under review')
    expect(fieldRecordStatusLabel(null)).toBe('—')
  })
})
