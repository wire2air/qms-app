import { describe, it, expect } from 'vitest'
import { DateTime } from 'luxon'
import { dateInRange } from './listFilters.js'

describe('dateInRange (compat)', () => {
  const d = DateTime.fromISO('2026-06-15T12:00')
  it('true when unbounded', () => expect(dateInRange(d, '', '')).toBe(true))
  it('respects from (inclusive day)', () => {
    expect(dateInRange(d, '2026-06-15', '')).toBe(true)
    expect(dateInRange(d, '2026-06-16', '')).toBe(false)
  })
  it('respects to (inclusive day)', () => {
    expect(dateInRange(d, '', '2026-06-15')).toBe(true)
    expect(dateInRange(d, '', '2026-06-14')).toBe(false)
  })
  it('accepts ISO string values', () => {
    expect(dateInRange('2026-06-15T12:00', '2026-06-10', '2026-06-20')).toBe(true)
  })
})
