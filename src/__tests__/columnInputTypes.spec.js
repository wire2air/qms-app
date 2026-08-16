/**
 * Table / checklist column types.
 *
 * Renamed to match the field-type dropdown — the same control shouldn't be
 * called two things depending on where you add it — and 'radio' was dropped
 * (user request 2026-08-16).
 *
 * Dropping it needed care. As a column, radio means "one exclusive choice
 * spread across several columns", so it exists in plenty of saved schemas —
 * including ones the AI matrix generator produces — and BaseChecklist treats
 * it as the DEFAULT when inputType is absent. It must therefore keep naming
 * and rendering itself; it just isn't offered for new columns.
 */
import { describe, it, expect } from 'vitest'
import {
  COLUMN_INPUT_TYPES,
  columnInputTypesFor,
  columnInputTypeLabel,
} from '../constants/formBuilderConfig.js'

describe('COLUMN_INPUT_TYPES', () => {
  it('no longer offers radio', () => {
    expect(COLUMN_INPUT_TYPES.map((o) => o.value)).not.toContain('radio')
  })

  it('names choice columns the way the field dropdown does', () => {
    const byValue = Object.fromEntries(COLUMN_INPUT_TYPES.map((o) => [o.value, o.label]))
    expect(byValue.optionGroup).toBe('Multiple choice')
    expect(byValue.checkbox).toBe('Single checkbox')
  })

  it('still offers the non-choice types', () => {
    const values = COLUMN_INPUT_TYPES.map((o) => o.value)
    for (const v of ['text', 'number', 'select', 'date', 'time']) {
      expect(values, v).toContain(v)
    }
  })
})

describe('legacy radio columns', () => {
  it('names itself rather than falling back to "Text"', () => {
    // The bug this guards: an unknown value used to render as "Text", which
    // told the author their choice column was a text box.
    expect(columnInputTypeLabel('radio')).toBe('Radio (legacy)')
  })

  it('is offered ONLY on a column already using it', () => {
    expect(columnInputTypesFor('radio').map((o) => o.value)).toContain('radio')
    expect(columnInputTypesFor('text').map((o) => o.value)).not.toContain('radio')
    expect(columnInputTypesFor(undefined).map((o) => o.value)).not.toContain('radio')
  })

  it('can still be changed away from — the current types remain listed', () => {
    const values = columnInputTypesFor('radio').map((o) => o.value)
    expect(values).toContain('optionGroup')
    expect(values.length).toBe(COLUMN_INPUT_TYPES.length + 1)
  })

  it('labels current types normally', () => {
    expect(columnInputTypeLabel('optionGroup')).toBe('Multiple choice')
    expect(columnInputTypeLabel('date')).toBe('Date')
  })
})
