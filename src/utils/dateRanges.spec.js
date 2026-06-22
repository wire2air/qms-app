import { describe, it, expect } from 'vitest'
import { DateTime } from 'luxon'
import { PRESETS, resolvePreset, resolveRelative, resolveDateFilter, matchesDateFilter, OPERATORS } from './dateRanges.js'

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

  it('last_month from January wraps to prior December', () => {
    const JAN = DateTime.fromISO('2026-01-15')
    const { start, end } = resolvePreset('last_month', JAN)
    expect(start.toISODate()).toBe('2025-12-01')
    expect(end.toISODate()).toBe('2025-12-31')
  })

  it('last_year from NOW gives prior full year', () => {
    const { start, end } = resolvePreset('last_year', NOW)
    expect(start.toISODate()).toBe('2025-01-01')
    expect(end.toISODate()).toBe('2025-12-31')
  })

  it('yesterday from NOW gives prior day', () => {
    const { start, end } = resolvePreset('yesterday', NOW)
    expect(start.toISODate()).toBe('2026-06-21')
    expect(end.toISODate()).toBe('2026-06-21')
  })
})

describe('resolveRelative', () => {
  it('past 7 days ends today, starts 6 days earlier', () => {
    const { start, end } = resolveRelative({ dir: 'past', unit: 'day', count: 7 }, NOW)
    expect(start.toISODate()).toBe('2026-06-16')
    expect(end.toISODate()).toBe('2026-06-22')
  })
  it('next 3 days starts today, ends 2 days later', () => {
    const { start, end } = resolveRelative({ dir: 'next', unit: 'day', count: 3 }, NOW)
    expect(start.toISODate()).toBe('2026-06-22')
    expect(end.toISODate()).toBe('2026-06-24')
  })
  it('this month maps to the calendar month', () => {
    const { start, end } = resolveRelative({ dir: 'this', unit: 'month' }, NOW)
    expect(start.toISODate()).toBe('2026-06-01')
    expect(end.toISODate()).toBe('2026-06-30')
  })
})

describe('matchesDateFilter', () => {
  const at = (iso) => DateTime.fromISO(iso)
  it('before is exclusive of the boundary day', () => {
    const token = { operator: 'before', value: '2026-06-22' }
    expect(matchesDateFilter(at('2026-06-21T23:00'), token, NOW)).toBe(true)
    expect(matchesDateFilter(at('2026-06-22T01:00'), token, NOW)).toBe(false)
  })
  it('onOrAfter includes the boundary day', () => {
    const token = { operator: 'onAfter', value: '2026-06-22' }
    expect(matchesDateFilter(at('2026-06-22T00:00'), token, NOW)).toBe(true)
    expect(matchesDateFilter(at('2026-06-21T23:00'), token, NOW)).toBe(false)
  })
  it('between is inclusive on both ends', () => {
    const token = { operator: 'between', value: '2026-06-10', value2: '2026-06-20' }
    expect(matchesDateFilter(at('2026-06-10T00:00'), token, NOW)).toBe(true)
    expect(matchesDateFilter(at('2026-06-20T23:00'), token, NOW)).toBe(true)
    expect(matchesDateFilter(at('2026-06-21T00:00'), token, NOW)).toBe(false)
  })
  it('empty / notEmpty test presence', () => {
    expect(matchesDateFilter(null, { operator: 'empty' }, NOW)).toBe(true)
    expect(matchesDateFilter(at('2026-06-10'), { operator: 'empty' }, NOW)).toBe(false)
    expect(matchesDateFilter(at('2026-06-10'), { operator: 'notEmpty' }, NOW)).toBe(true)
  })
  it('relative re-evaluates against now', () => {
    const token = { operator: 'relative', relative: { dir: 'past', unit: 'day', count: 7 } }
    expect(matchesDateFilter(at('2026-06-18'), token, NOW)).toBe(true)
    expect(matchesDateFilter(at('2026-06-01'), token, NOW)).toBe(false)
  })
  it('no operator matches everything (acts as no-op)', () => {
    expect(matchesDateFilter(at('2026-06-10'), null, NOW)).toBe(true)
    expect(matchesDateFilter(at('2026-06-10'), {}, NOW)).toBe(true)
  })
  it('unknown operator fails closed', () => {
    expect(matchesDateFilter(at('2026-06-10'), { operator: 'typo' }, NOW)).toBe(false)
  })
})

describe('resolveDateFilter', () => {
  it('before: exclusive lower boundary', () => {
    const token = { operator: 'before', value: '2026-06-22' }
    const { start, end } = resolveDateFilter(token, NOW)
    expect(start).toBeNull()
    expect(end.toISO()).toBe(DateTime.fromISO('2026-06-22').startOf('day').minus({ milliseconds: 1 }).toISO())
  })
  it('onAfter: inclusive lower boundary', () => {
    const token = { operator: 'onAfter', value: '2026-06-22' }
    const { start, end } = resolveDateFilter(token, NOW)
    expect(start.toISO()).toBe(DateTime.fromISO('2026-06-22').startOf('day').toISO())
    expect(end).toBeNull()
  })
  it('unknown operator returns null window', () => {
    const token = { operator: 'typo' }
    const { start, end } = resolveDateFilter(token, NOW)
    expect(start).toBeNull()
    expect(end).toBeNull()
  })
})

describe('OPERATORS', () => {
  it('lists the full operator set', () => {
    expect(OPERATORS.map((o) => o.id)).toEqual([
      'eq', 'neq', 'before', 'after', 'onBefore', 'onAfter',
      'between', 'notBetween', 'empty', 'notEmpty', 'relative',
    ])
  })
})
