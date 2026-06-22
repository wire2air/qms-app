import { describe, it, expect } from 'vitest'
import { DateTime } from 'luxon'
import '@/extensions/datetime.js' // installs DateTime.prototype.formatDate
import { toModel, fromModel, parseManual, formatField } from './useDateField.js'

const D = DateTime.fromISO('2026-06-22T09:05:00')

describe('toModel / fromModel round-trip', () => {
  it('default valueFormat keeps DateTime instances', () => {
    expect(toModel(D, 'date', 'datetime')).toBe(D)
    expect(fromModel(D, 'date', 'datetime')).toBe(D)
  })
  it('valueFormat iso emits ISO date for date mode', () => {
    expect(toModel(D, 'date', 'iso')).toBe('2026-06-22')
    expect(fromModel('2026-06-22', 'date', 'iso').toISODate()).toBe('2026-06-22')
  })
  it('valueFormat iso emits full ISO for datetime mode', () => {
    expect(toModel(D, 'datetime', 'iso')).toBe(D.toISO())
  })
  it('valueFormat iso emits HH:mm for time mode', () => {
    expect(toModel(D, 'time', 'iso')).toBe('09:05')
  })
  it('null passes through', () => {
    expect(toModel(null, 'date', 'datetime')).toBeNull()
    expect(fromModel(null, 'date', 'iso')).toBeNull()
  })
})

describe('parseManual', () => {
  it('parses ISO and US formats for date mode', () => {
    expect(parseManual('2026-06-22', 'date').toISODate()).toBe('2026-06-22')
    expect(parseManual('06/22/2026', 'date').toISODate()).toBe('2026-06-22')
  })
  it('parses HH:mm for time mode', () => {
    expect(parseManual('09:05', 'time').toFormat('HH:mm')).toBe('09:05')
  })
  it('returns null on garbage', () => {
    expect(parseManual('not a date', 'date')).toBeNull()
  })
})

describe('formatField', () => {
  it('uses dt.formatDate by default', () => {
    expect(formatField(D, 'date')).toBe(D.formatDate('date'))
    expect(formatField(D, 'datetime')).toBe(D.formatDate('datetime'))
  })
  it('honours an explicit displayFormat', () => {
    expect(formatField(D, 'date', 'yyyy/MM/dd')).toBe('2026/06/22')
  })
  it('returns empty string for null', () => {
    expect(formatField(null, 'date')).toBe('')
  })
})
