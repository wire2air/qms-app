import { describe, it, expect } from 'vitest'
import { DateTime } from 'luxon'
import {
  REMINDER_WINDOWS_DAYS,
  daysUntilExpiry,
  expiryBucket,
  expiryLabel,
  describeExpiry,
  notifiesToday,
  toExpiryIso,
  toDateTime,
} from './certificateExpiry.js'

// A fixed "now" mid-afternoon — the time of day is the whole point of the
// calendar-day tests below, so it must not be midnight.
const NOW = DateTime.fromISO('2026-09-07T15:30:00', { zone: 'utc' })

function inDays(n, hour = 9) {
  return NOW.startOf('day').plus({ days: n }).set({ hour })
}

describe('toDateTime', () => {
  it('returns null for empty input', () => {
    expect(toDateTime(null)).toBeNull()
    expect(toDateTime('')).toBeNull()
    expect(toDateTime(undefined)).toBeNull()
  })

  it('passes a valid DateTime through', () => {
    expect(toDateTime(NOW)).toBe(NOW)
  })

  it('parses ISO strings and Date objects', () => {
    expect(toDateTime('2026-09-07T00:00:00Z').toISODate()).toBe('2026-09-07')
    expect(toDateTime(new Date('2026-09-07T00:00:00Z')).isValid).toBe(true)
  })

  it('returns null for garbage rather than an invalid DateTime', () => {
    expect(toDateTime('not-a-date')).toBeNull()
  })
})

describe('daysUntilExpiry', () => {
  it('is null when there is no expiry', () => {
    expect(daysUntilExpiry(null, NOW)).toBeNull()
  })

  // The bug in the original pill: a float diff floored. Every one of these
  // cases came out a day short of the worker's (expires_at::date - CURRENT_DATE).
  it('counts calendar days, not elapsed time', () => {
    // 09:00 tomorrow is 0.73 days away from 15:30 today — but it is 1 day.
    expect(daysUntilExpiry(inDays(1, 9), NOW)).toBe(1)
    // 09:00 today already passed, but the cert expires TODAY, not yesterday.
    expect(daysUntilExpiry(inDays(0, 9), NOW)).toBe(0)
    expect(daysUntilExpiry(inDays(90, 1), NOW)).toBe(90)
    expect(daysUntilExpiry(inDays(30, 23), NOW)).toBe(30)
  })

  it('goes negative once lapsed', () => {
    expect(daysUntilExpiry(inDays(-1, 23), NOW)).toBe(-1)
    expect(daysUntilExpiry(inDays(-45), NOW)).toBe(-45)
  })

  it('is unaffected by the time of day on either side', () => {
    const early = NOW.startOf('day').set({ hour: 0, minute: 1 })
    const late = NOW.startOf('day').set({ hour: 23, minute: 59 })
    expect(daysUntilExpiry(inDays(30, 0), early)).toBe(30)
    expect(daysUntilExpiry(inDays(30, 23), late)).toBe(30)
  })

  it('survives a DST transition in the span (rounds, never floors down a tier)', () => {
    const zone = 'America/New_York'
    // 2026-11-01 is the US fall-back; spanning it makes luxon's day diff
    // 90.04, which a floor() would report as 90 but a truncating float diff
    // in the other direction would report as 89.
    const from = DateTime.fromISO('2026-09-07T15:30:00', { zone })
    const to = from.startOf('day').plus({ days: 90 }).set({ hour: 8 })
    expect(daysUntilExpiry(to, from)).toBe(90)
  })
})

describe('expiryBucket', () => {
  it('buckets by the reminder windows', () => {
    expect(expiryBucket(null)).toBe('none')
    expect(expiryBucket(-1)).toBe('expired')
    expect(expiryBucket(0)).toBe('due')
    expect(expiryBucket(1)).toBe('warning')
    expect(expiryBucket(30)).toBe('warning')
    expect(expiryBucket(31)).toBe('notice')
    expect(expiryBucket(90)).toBe('notice')
    expect(expiryBucket(91)).toBe('ok')
  })

  it('derives its tiers from the windows it is given, not from 30/90', () => {
    const windows = [7, 1]
    expect(expiryBucket(0, windows)).toBe('due')
    expect(expiryBucket(1, windows)).toBe('due')
    expect(expiryBucket(2, windows)).toBe('warning')
    expect(expiryBucket(7, windows)).toBe('warning')
    expect(expiryBucket(8, windows)).toBe('ok')
  })

  it('does not care what order the windows are declared in', () => {
    expect(expiryBucket(45, [0, 30, 90])).toBe(expiryBucket(45, [90, 30, 0]))
  })

  it('reuses the outermost tone rather than emitting an undefined tier', () => {
    // Four windows, three tone tiers — the extra outer band must still be a
    // real bucket the pill has a class for.
    expect(expiryBucket(180, [180, 90, 30, 0])).toBe('notice')
  })
})

describe('notifiesToday', () => {
  it('is true only on the exact window days', () => {
    expect(notifiesToday(90)).toBe(true)
    expect(notifiesToday(30)).toBe(true)
    expect(notifiesToday(0)).toBe(true)
    expect(notifiesToday(89)).toBe(false)
    expect(notifiesToday(31)).toBe(false)
    expect(notifiesToday(null)).toBe(false)
  })

  it('is false after expiry — the worker deliberately stops', () => {
    expect(notifiesToday(-1)).toBe(false)
  })
})

// The whole reason this module exists. If this ever fails, the UI is telling
// someone a certificate is fine on a day the system emails them about it.
describe('the pill never contradicts the reminder schedule', () => {
  it('is never the neutral "ok" bucket on a day the cron sends', () => {
    for (let d = -400; d <= 400; d += 1) {
      if (notifiesToday(d)) {
        expect(expiryBucket(d)).not.toBe('ok')
        expect(expiryBucket(d)).not.toBe('none')
      }
    }
  })

  it('holds for a hypothetical re-tuned schedule too', () => {
    const windows = [365, 60, 14, 0]
    for (let d = 0; d <= 400; d += 1) {
      if (notifiesToday(d, windows)) {
        expect(expiryBucket(d, windows)).not.toBe('ok')
      }
    }
  })

  it('escalates monotonically as the date approaches', () => {
    const rank = { ok: 0, notice: 1, warning: 2, due: 3, expired: 4 }
    let previous = 0
    for (let d = 400; d >= -10; d -= 1) {
      const current = rank[expiryBucket(d)]
      expect(current).toBeGreaterThanOrEqual(previous)
      previous = current
    }
  })

  it('covers every declared window with a non-ok bucket', () => {
    for (const w of REMINDER_WINDOWS_DAYS) {
      expect(['due', 'warning', 'notice']).toContain(expiryBucket(w))
    }
  })
})

describe('expiryLabel', () => {
  it('reads naturally at the boundaries', () => {
    expect(expiryLabel(null)).toBe('No expiry')
    expect(expiryLabel(0)).toBe('Expires today')
    expect(expiryLabel(1)).toBe('Expires tomorrow')
    expect(expiryLabel(45)).toBe('Expires in 45d')
    expect(expiryLabel(-3)).toBe('Expired 3d ago')
  })
})

describe('describeExpiry', () => {
  it('returns the whole picture in one pass', () => {
    expect(describeExpiry(inDays(30, 22), { now: NOW })).toEqual({
      days: 30,
      bucket: 'warning',
      label: 'Expires in 30d',
      notifiesToday: true,
    })
  })

  it('degrades to the empty state with no date', () => {
    expect(describeExpiry(null, { now: NOW })).toEqual({
      days: null,
      bucket: 'none',
      label: 'No expiry',
      notifiesToday: false,
    })
  })
})

describe('toExpiryIso', () => {
  it('returns null for an empty value so the caller can omit the field', () => {
    expect(toExpiryIso(null)).toBeNull()
    expect(toExpiryIso('')).toBeNull()
    expect(toExpiryIso('nonsense')).toBeNull()
  })

  it('produces a string zod .datetime({ offset: true }) accepts', () => {
    // Zod's datetime regex: date, T, time, optional fractional seconds, then
    // Z or ±HH:MM. Mirrored here so the contract is checked, not assumed.
    const ZOD_DATETIME_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})$/
    expect(toExpiryIso(DateTime.fromISO('2026-12-31T00:00:00+05:30'))).toMatch(ZOD_DATETIME_OFFSET)
    expect(toExpiryIso('2026-12-31')).toMatch(ZOD_DATETIME_OFFSET)
  })

  it("keeps the picked calendar date under the worker's ::date cast", () => {
    // Local midnight in a +05:30 zone is the PREVIOUS day in UTC. Sent raw,
    // expires_at::date would be 2026-12-30 and the reminders would fire a day
    // early; pinned to noon UTC it stays 2026-12-31.
    const pickedInIndia = DateTime.fromISO('2026-12-31T00:00:00', { zone: 'Asia/Kolkata' })
    expect(pickedInIndia.toUTC().toISODate()).toBe('2026-12-30') // the trap
    expect(toExpiryIso(pickedInIndia)).toBe('2026-12-31T12:00:00.000Z')
  })

  it('keeps the picked calendar date for western zones too', () => {
    const pickedInLA = DateTime.fromISO('2026-12-31T00:00:00', { zone: 'America/Los_Angeles' })
    expect(toExpiryIso(pickedInLA)).toBe('2026-12-31T12:00:00.000Z')
  })

  it('round-trips: what we send is what the pill later reads back', () => {
    const picked = DateTime.fromISO('2026-10-07T00:00:00', { zone: 'Asia/Kolkata' })
    const sent = toExpiryIso(picked)
    expect(daysUntilExpiry(sent, NOW)).toBe(30)
  })
})
