import { describe, it, expect } from 'vitest'
import { DateTime } from 'luxon'
import { PRESETS, resolvePreset } from './dateRanges.js'

const NOW = DateTime.fromISO('2026-06-22T15:30:00') // a Monday

describe('resolvePreset', () => {
  it('today spans the start and end of the current day', () => {
    const { start, end } = resolvePreset('today', NOW)
    expect(start.toISO()).toBe(NOW.startOf('day').toISO())
    expect(end.toISO()).toBe(NOW.endOf('day').toISO())
  })

  it('last_7_days covers 7 days inclusive ending today', () => {
    const { start, end } = resolvePreset('last_7_days', NOW)
    expect(start.toISODate()).toBe('2026-06-16')
    expect(end.toISODate()).toBe('2026-06-22')
  })

  it('this_month starts on the 1st', () => {
    const { start, end } = resolvePreset('this_month', NOW)
    expect(start.toISODate()).toBe('2026-06-01')
    expect(end.toISODate()).toBe('2026-06-30')
  })

  it('last_quarter is the previous calendar quarter', () => {
    const { start, end } = resolvePreset('last_quarter', NOW) // Q2 → Q1
    expect(start.toISODate()).toBe('2026-01-01')
    expect(end.toISODate()).toBe('2026-03-31')
  })

  it('exposes a Custom preset with a null range and returns null for unknown ids', () => {
    expect(PRESETS.find((p) => p.id === 'custom')).toBeTruthy()
    expect(resolvePreset('nope', NOW)).toBeNull()
  })
})
