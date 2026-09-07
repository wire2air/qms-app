import { describe, it, expect } from 'vitest'
import { DateTime } from 'luxon'
import {
  DUE_WINDOWS,
  resolveDueWindow,
  isDueWindowActive,
  matchesDueWindow,
  dueWindowLabel,
} from './taskDueWindows.js'

const NOW = DateTime.fromISO('2026-06-22T15:30:00') // a Monday

describe('DUE_WINDOWS', () => {
  it('offers the 7 / 15 / 30 / 60 day cutoffs plus overdue and custom', () => {
    expect(DUE_WINDOWS.map((w) => w.id)).toEqual(['overdue', 'd7', 'd15', 'd30', 'd60', 'custom'])
  })
})

describe('resolveDueWindow', () => {
  it('returns null when nothing is selected', () => {
    expect(resolveDueWindow(null, NOW)).toBeNull()
    expect(resolveDueWindow({ id: 'nope' }, NOW)).toBeNull()
  })

  it('overdue ends just before today — a task due today is not late', () => {
    const { start, end } = resolveDueWindow({ id: 'overdue' }, NOW)
    expect(start).toBeNull()
    expect(end.toISO()).toBe(NOW.startOf('day').minus({ milliseconds: 1 }).toISO())
  })

  it('a day preset is an open-ended cutoff at today + N', () => {
    const { start, end } = resolveDueWindow({ id: 'd30' }, NOW)
    expect(start).toBeNull()
    expect(end.toISODate()).toBe('2026-07-22')
  })

  it('custom uses whole inclusive days and tolerates one open bound', () => {
    const both = resolveDueWindow({ id: 'custom', from: '2026-07-01', to: '2026-07-10' }, NOW)
    expect(both.start.toISO()).toBe(DateTime.fromISO('2026-07-01').startOf('day').toISO())
    expect(both.end.toISO()).toBe(DateTime.fromISO('2026-07-10').endOf('day').toISO())

    const openStart = resolveDueWindow({ id: 'custom', to: '2026-07-10' }, NOW)
    expect(openStart.start).toBeNull()
    expect(resolveDueWindow({ id: 'custom' }, NOW)).toBeNull()
  })
})

describe('matchesDueWindow', () => {
  const due = (iso) => DateTime.fromISO(iso)

  it('passes everything when no window is active', () => {
    expect(matchesDueWindow(null, null, NOW)).toBe(true)
    expect(matchesDueWindow(due('2030-01-01'), null, NOW)).toBe(true)
  })

  it('keeps overdue rows inside a day cutoff — the urgent ones must not vanish', () => {
    expect(matchesDueWindow(due('2026-06-01'), { id: 'd7' }, NOW)).toBe(true)
    expect(matchesDueWindow(due('2026-06-29'), { id: 'd7' }, NOW)).toBe(true)
    expect(matchesDueWindow(due('2026-06-30'), { id: 'd7' }, NOW)).toBe(false)
  })

  it('overdue excludes today and anything later', () => {
    expect(matchesDueWindow(due('2026-06-21T23:00:00'), { id: 'overdue' }, NOW)).toBe(true)
    expect(matchesDueWindow(due('2026-06-22T08:00:00'), { id: 'overdue' }, NOW)).toBe(false)
  })

  it('rejects rows with no due date once a window is active', () => {
    expect(matchesDueWindow(null, { id: 'd60' }, NOW)).toBe(false)
  })

  it('honours both bounds of a custom range', () => {
    const w = { id: 'custom', from: '2026-07-01', to: '2026-07-10' }
    expect(matchesDueWindow(due('2026-06-30T23:00:00'), w, NOW)).toBe(false)
    expect(matchesDueWindow(due('2026-07-10T23:00:00'), w, NOW)).toBe(true)
    expect(matchesDueWindow(due('2026-07-11'), w, NOW)).toBe(false)
  })
})

describe('isDueWindowActive / dueWindowLabel', () => {
  it('an empty custom range is not an active filter', () => {
    expect(isDueWindowActive({ id: 'custom' }, NOW)).toBe(false)
    expect(isDueWindowActive({ id: 'custom', to: '2026-07-10' }, NOW)).toBe(true)
    expect(isDueWindowActive({ id: 'd15' }, NOW)).toBe(true)
  })

  it('labels presets by name and customs by their bounds', () => {
    expect(dueWindowLabel({ id: 'd15' })).toBe('Due in 15 days')
    expect(dueWindowLabel({ id: 'custom', from: '2026-07-01', to: '2026-07-10' })).toBe(
      'Due Jul 1 – Jul 10, 2026',
    )
    expect(dueWindowLabel(null)).toBe('')
  })
})
