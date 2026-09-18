import { describe, it, expect } from 'vitest'
import { DateTime } from 'luxon'
import '@/extensions/datetime.js' // installs DateTime.prototype.formatDate
import {
  METRIC_PRECISION,
  SUPPRESSED_LABEL,
  SUPPRESSED_HELP,
  SCOPE_LABEL,
  SCOPE_HELP,
  TIER_LABEL,
  TIER_HELP,
  COMPARE_LABEL,
  moduleLabel,
  toNumber,
  formatMetricValue,
  isSuppressed,
  deltaTone,
  deltaDirection,
  formatDelta,
  significanceMarker,
  formatFreshness,
  periodFromDateToken,
  formatPeriod,
  isDrillable,
  drillLocation,
} from './analyticsFormat.js'

/**
 * These are the rules that decide whether a number shown to a regulator is
 * honest. Each block below pins one way the analytics layer could otherwise
 * lie: a withheld cell shown as zero, an untested change shown as "not
 * significant", a volume count coloured red because it went up, or a residual
 * "Other" bucket offered as a drillable segment.
 */

const NOW = DateTime.fromISO('2026-06-22T15:30:00') // a Monday

/**
 * A real BigFloat payload (82/91 as a percentage) exactly as PostGraphile sends
 * it. Kept as a STRING — it is not writable as a JS number literal without
 * losing digits, which is the whole reason the wire format is a string.
 */
const BIGFLOAT_PCT = '90.1098901098901099'

/* ------------------------------------------------------------------ toNumber */

describe('toNumber — GraphQL BigFloat arrives as a STRING', () => {
  it('coerces the BigFloat string PostGraphile actually returns', () => {
    // `numeric` is exposed as the BigFloat scalar, i.e. a JSON string.
    const n = toNumber(BIGFLOAT_PCT)
    expect(typeof n).toBe('number')
    expect(n).toBeCloseTo(90.1098901, 6)
  })

  it('passes a real number through unchanged', () => {
    expect(toNumber(42.5)).toBe(42.5)
  })

  it('keeps 0 as 0 — zero is a measurement, not a missing value', () => {
    expect(toNumber(0)).toBe(0)
    expect(toNumber('0')).toBe(0)
    expect(toNumber('0.00')).toBe(0)
  })

  it('returns null (never NaN) for absent or unparseable input', () => {
    expect(toNumber(null)).toBeNull()
    expect(toNumber(undefined)).toBeNull()
    expect(toNumber('')).toBeNull()
    expect(toNumber('not a number')).toBeNull()
    expect(toNumber(NaN)).toBeNull()
    expect(toNumber(Infinity)).toBeNull()
    expect(toNumber('Infinity')).toBeNull()
  })

  it('handles a negative BigFloat string', () => {
    expect(toNumber('-3.5')).toBe(-3.5)
  })
})

/* -------------------------------------------------------- formatMetricValue */

describe('formatMetricValue — units and precision', () => {
  it('percent renders 1 decimal place with a % suffix', () => {
    expect(formatMetricValue(Number(BIGFLOAT_PCT), 'percent')).toBe('90.1%')
  })

  it('formats the BigFloat STRING identically to the number — no string arithmetic', () => {
    expect(formatMetricValue(BIGFLOAT_PCT, 'percent')).toBe(
      formatMetricValue(Number(BIGFLOAT_PCT), 'percent'),
    )
    // and definitely not by slicing the string, which would give '90.1' from
    // '90.10…' by luck but '9.0' from '9.05'
    expect(formatMetricValue('9.05', 'percent')).toBe('9.1%')
  })

  it('days renders 1 decimal place with a " d" suffix', () => {
    expect(formatMetricValue(12, 'days')).toBe('12.0 d')
    expect(formatMetricValue('7.25', 'days')).toBe('7.3 d')
  })

  it('count renders whole numbers with no suffix', () => {
    expect(formatMetricValue(7, 'count')).toBe('7')
    expect(formatMetricValue('7', 'count')).toBe('7')
  })

  it('an UNKNOWN unit falls back to 0 decimals and no suffix — it never invents one', () => {
    expect(formatMetricValue(12.7, 'furlongs')).toBe('13')
    expect(formatMetricValue(12.7, undefined)).toBe('13')
    expect(METRIC_PRECISION.furlongs).toBeUndefined()
  })

  it('precision defaults match the documented per-unit table', () => {
    expect(METRIC_PRECISION).toEqual({ percent: 1, days: 1, count: 0 })
  })

  it('groups large counts for readability', () => {
    expect(formatMetricValue(1234567, 'count')).toBe((1234567).toLocaleString())
  })
})

describe('formatMetricValue — the three things a null may mean', () => {
  it('ZERO formats as 0, never as a dash — zero is itself information', () => {
    expect(formatMetricValue(0, 'count')).toBe('0')
    expect(formatMetricValue(0, 'percent')).toBe('0.0%')
    expect(formatMetricValue('0', 'count')).toBe('0')
  })

  it('NO DATA (a plain null, no rollup row) formats as an em dash', () => {
    expect(formatMetricValue(null, 'count')).toBe('—')
    expect(formatMetricValue(undefined, 'percent')).toBe('—')
    expect(formatMetricValue('', 'days')).toBe('—')
    expect(formatMetricValue('garbage', 'count')).toBe('—')
  })

  it('WITHHELD (null + suppressed) formats as "Withheld" — never 0, never blank', () => {
    expect(formatMetricValue(null, 'count', { suppressed: true })).toBe(SUPPRESSED_LABEL)
    expect(formatMetricValue(null, 'count', { suppressed: true })).not.toBe('0')
    expect(formatMetricValue(null, 'percent', { suppressed: true })).not.toBe('0.0%')
  })

  it('withheld is DISTINGUISHABLE from both no-data and zero', () => {
    const withheld = formatMetricValue(null, 'count', { suppressed: true })
    const noData = formatMetricValue(null, 'count')
    const zero = formatMetricValue(0, 'count')
    expect(new Set([withheld, noData, zero]).size).toBe(3)
  })

  it('suppression wins over any value that leaked through with it', () => {
    // Belt and braces: even if the server ever sent a number alongside
    // suppressed:true, the cell must not print it.
    expect(formatMetricValue(4, 'count', { suppressed: true })).toBe(SUPPRESSED_LABEL)
  })

  it('the withheld copy says in words that it is not zero', () => {
    expect(SUPPRESSED_LABEL).toBe('Withheld')
    expect(SUPPRESSED_HELP).toMatch(/not zero/i)
  })
})

/* ---------------------------------------------------------------- isSuppressed */

describe('isSuppressed', () => {
  it('is true only for an explicit suppressed flag', () => {
    expect(isSuppressed({ value: null, suppressed: true })).toBe(true)
  })

  it('a plain null row is NOT suppressed — it is "no data for this period"', () => {
    expect(isSuppressed({ value: null })).toBe(false)
    expect(isSuppressed({ value: null, suppressed: false })).toBe(false)
  })

  it('tolerates a missing row', () => {
    expect(isSuppressed(null)).toBe(false)
    expect(isSuppressed(undefined)).toBe(false)
    expect(isSuppressed({})).toBe(false)
  })
})

/* -------------------------------------------------------------------- deltaTone */

describe('deltaTone — direction is TRI-STATE, and unknown is not a fourth guess', () => {
  it('lower_is_better: a rise is bad, a fall is good', () => {
    expect(deltaTone(5, 'lower_is_better')).toBe('bad')
    expect(deltaTone(-5, 'lower_is_better')).toBe('good')
  })

  it('higher_is_better: a rise is good, a fall is bad', () => {
    expect(deltaTone(5, 'higher_is_better')).toBe('good')
    expect(deltaTone(-5, 'higher_is_better')).toBe('bad')
  })

  it('neutral is a REAL registry value — a raised-volume count has no good direction', () => {
    // live examples: capa.raised, change_control.raised, quality_events.raised
    expect(deltaTone(5, 'neutral')).toBe('neutral')
    expect(deltaTone(-5, 'neutral')).toBe('neutral')
  })

  it('an UNRECOGNISED direction is neutral — never guessed at', () => {
    expect(deltaTone(5, 'sideways_is_better')).toBe('neutral')
    expect(deltaTone(-5, 'sideways_is_better')).toBe('neutral')
    expect(deltaTone(5, '')).toBe('neutral')
    expect(deltaTone(5, null)).toBe('neutral')
    expect(deltaTone(5, undefined)).toBe('neutral')
    expect(deltaTone(5, 'lower_is_better ')).toBe('neutral') // no fuzzy matching
    expect(deltaTone(5, 'LOWER_IS_BETTER')).toBe('neutral') // no case folding
  })

  it('no movement is neutral whatever the direction', () => {
    expect(deltaTone(0, 'lower_is_better')).toBe('neutral')
    expect(deltaTone(0, 'higher_is_better')).toBe('neutral')
    expect(deltaTone('0', 'higher_is_better')).toBe('neutral')
  })

  it('a null delta (nothing to compare against) is neutral', () => {
    expect(deltaTone(null, 'lower_is_better')).toBe('neutral')
    expect(deltaTone(undefined, 'higher_is_better')).toBe('neutral')
    expect(deltaTone('', 'higher_is_better')).toBe('neutral')
  })

  it('accepts the BigFloat string form of the delta', () => {
    expect(deltaTone('-3.5', 'lower_is_better')).toBe('good')
    expect(deltaTone('3.5', 'lower_is_better')).toBe('bad')
  })

  it('only ever returns one of the three tones', () => {
    const inputs = [-1, 0, 1, null, '2']
    const directions = ['lower_is_better', 'higher_is_better', 'neutral', 'nonsense', null]
    for (const d of inputs) {
      for (const dir of directions) {
        expect(['good', 'bad', 'neutral']).toContain(deltaTone(d, dir))
      }
    }
  })
})

/* --------------------------------------------------------------- deltaDirection */

describe('deltaDirection — which way it moved, never whether that is good', () => {
  it('signs the movement', () => {
    expect(deltaDirection(3)).toBe('up')
    expect(deltaDirection(-3)).toBe('down')
    expect(deltaDirection('-0.1')).toBe('down')
  })

  it('draws no arrow for no movement or no comparison', () => {
    expect(deltaDirection(0)).toBeNull()
    expect(deltaDirection('0')).toBeNull()
    expect(deltaDirection(null)).toBeNull()
    expect(deltaDirection(undefined)).toBeNull()
  })

  it('is independent of direction — up on a lower_is_better metric is still up', () => {
    expect(deltaDirection(3)).toBe('up')
    expect(deltaTone(3, 'lower_is_better')).toBe('bad')
  })
})

/* ------------------------------------------------------------ significanceMarker */

describe('significanceMarker — null means NO TEST APPLIES, not "not significant"', () => {
  it('true earns a Significant marker', () => {
    expect(significanceMarker(true)).toEqual({
      label: 'Significant',
      help: expect.any(String),
    })
  })

  it('false earns a Not significant marker', () => {
    expect(significanceMarker(false)?.label).toBe('Not significant')
  })

  it('NULL renders NOTHING AT ALL — a count metric has no proportion to test', () => {
    expect(significanceMarker(null)).toBeNull()
  })

  it('UNDEFINED (field absent) renders nothing either', () => {
    expect(significanceMarker(undefined)).toBeNull()
  })

  it('never truthy-coerces — only a real boolean earns a marker', () => {
    for (const notABoolean of [0, 1, '', 'true', 'false', [], {}, NaN]) {
      expect(significanceMarker(notABoolean)).toBeNull()
    }
  })

  it('the three branches are the only three outcomes', () => {
    expect(significanceMarker(true)).not.toBeNull()
    expect(significanceMarker(false)).not.toBeNull()
    expect(significanceMarker(null)).toBeNull()
    expect(significanceMarker(true).label).not.toBe(significanceMarker(false).label)
  })
})

/* ------------------------------------------------------------------ formatDelta */

describe('formatDelta', () => {
  it('a percent metric compares in percentage POINTS (deltaAbs)', () => {
    const row = { unit: 'percent', deltaAbs: 12.34, deltaPct: 999 }
    expect(formatDelta(row)).toBe('+12.3 pts vs previous period')
  })

  it('a non-percent metric compares in percent (deltaPct)', () => {
    const row = { unit: 'count', deltaAbs: 999, deltaPct: -8.25 }
    expect(formatDelta(row)).toBe('-8.3% vs previous period')
  })

  it('honours the comparison basis label', () => {
    const row = { unit: 'count', deltaPct: 4 }
    expect(formatDelta(row, 'same_period_last_year')).toBe('+4.0% vs same period last year')
    expect(COMPARE_LABEL.previous_period).toBe('vs previous period')
  })

  it('an unknown comparison basis leaves no dangling label', () => {
    expect(formatDelta({ unit: 'count', deltaPct: 4 }, 'nonsense')).toBe('+4.0%')
  })

  it('returns null when there is NO COMPARISON (first period, or comparison suppressed)', () => {
    expect(formatDelta({ unit: 'count', deltaAbs: null, deltaPct: null })).toBeNull()
    expect(formatDelta({ unit: 'percent', deltaAbs: null, deltaPct: 12 })).toBeNull()
    expect(formatDelta(null)).toBeNull()
    expect(formatDelta(undefined)).toBeNull()
  })

  it('accepts BigFloat strings for the deltas', () => {
    expect(formatDelta({ unit: 'count', deltaPct: '-8.25' })).toBe('-8.3% vs previous period')
  })

  it('a zero delta is stated, not hidden', () => {
    expect(formatDelta({ unit: 'count', deltaPct: 0 })).toBe('0.0% vs previous period')
  })
})

/* --------------------------------------------------------------- formatFreshness */

describe('formatFreshness', () => {
  it('returns a relative label plus the exact stamp for a tooltip', () => {
    const out = formatFreshness(DateTime.now().minus({ minutes: 12 }))
    expect(out.relative).toMatch(/12 minutes ago/)
    expect(out.exact).toEqual(expect.any(String))
    expect(out.exact.length).toBeGreaterThan(0)
  })

  it('accepts the ISO string form the API returns', () => {
    const iso = '2026-06-22T09:05:00.000Z'
    const out = formatFreshness(iso)
    expect(out).not.toBeNull()
    expect(out.exact).toBe(DateTime.fromISO(iso).formatDate('datetime'))
  })

  it('returns null rather than a fake stamp when there is no computedAt', () => {
    expect(formatFreshness(null)).toBeNull()
    expect(formatFreshness(undefined)).toBeNull()
    expect(formatFreshness('')).toBeNull()
    expect(formatFreshness('not a date')).toBeNull()
    expect(formatFreshness(DateTime.invalid('nope'))).toBeNull()
  })
})

/* ---------------------------------------------------------- periodFromDateToken */

describe('periodFromDateToken — the saved filter re-resolves at run time', () => {
  it('resolves a relative token against the injected now (not the day it was saved)', () => {
    const token = { operator: 'relative', relative: { dir: 'past', unit: 'day', count: 30 } }
    expect(periodFromDateToken(token, NOW)).toEqual({
      periodStart: '2026-05-24',
      periodEnd: '2026-06-22',
    })
    // A year later the SAME token yields a different window — that is the point.
    expect(periodFromDateToken(token, NOW.plus({ years: 1 })).periodEnd).toBe('2027-06-22')
  })

  it('resolves an explicit between token to inclusive ISO dates', () => {
    const token = { operator: 'between', value: '2026-01-01', value2: '2026-03-31' }
    expect(periodFromDateToken(token, NOW)).toEqual({
      periodStart: '2026-01-01',
      periodEnd: '2026-03-31',
    })
  })

  it('leaves an unbounded side null', () => {
    expect(periodFromDateToken({ operator: 'onAfter', value: '2026-02-01' }, NOW)).toEqual({
      periodStart: '2026-02-01',
      periodEnd: null,
    })
    expect(periodFromDateToken({ operator: 'onBefore', value: '2026-02-01' }, NOW)).toEqual({
      periodStart: null,
      periodEnd: '2026-02-01',
    })
  })

  it('no token means no period arguments — the server picks its default window', () => {
    expect(periodFromDateToken(null, NOW)).toEqual({ periodStart: null, periodEnd: null })
    expect(periodFromDateToken(undefined, NOW)).toEqual({ periodStart: null, periodEnd: null })
    expect(periodFromDateToken({}, NOW)).toEqual({ periodStart: null, periodEnd: null })
  })

  it('a non-window operator yields no bounds rather than a wrong one', () => {
    expect(periodFromDateToken({ operator: 'empty' }, NOW)).toEqual({
      periodStart: null,
      periodEnd: null,
    })
  })

  it('emits date-only ISO strings, matching the Date arguments of metric_value', () => {
    const { periodStart, periodEnd } = periodFromDateToken(
      { operator: 'between', value: '2026-01-01', value2: '2026-03-31' },
      NOW,
    )
    expect(periodStart).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(periodEnd).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

/* ------------------------------------------------------------------ formatPeriod */

describe('formatPeriod', () => {
  it('renders a closed window as start – end', () => {
    const out = formatPeriod('2026-07-01', '2026-07-31')
    expect(out).toBe(
      `${DateTime.fromISO('2026-07-01').formatDate('date')} – ${DateTime.fromISO(
        '2026-07-31',
      ).formatDate('date')}`,
    )
    expect(out).toContain('–')
  })

  it('renders each half-open window with its own preposition', () => {
    expect(formatPeriod('2026-07-01', null)).toMatch(/^from /)
    expect(formatPeriod(null, '2026-07-31')).toMatch(/^until /)
  })

  it('says "Default period" when neither bound was supplied', () => {
    expect(formatPeriod(null, null)).toBe('Default period')
    expect(formatPeriod(undefined, undefined)).toBe('Default period')
  })

  it('treats an unparseable bound as absent rather than printing "Invalid DateTime"', () => {
    expect(formatPeriod('garbage', 'rubbish')).toBe('Default period')
    expect(formatPeriod('garbage', '2026-07-31')).toMatch(/^until /)
  })
})

/* ------------------------------------------------------- isDrillable / drillLocation */

describe('isDrillable — a residual bucket is a SUMMARY, never a segment', () => {
  it('an ordinary row with a drill target is drillable', () => {
    expect(isDrillable({ drillRoute: '/capas', isResidual: false })).toBe(true)
  })

  it('the residual row the API actually sends is NOT drillable', () => {
    // metric_breakdown residual: is_residual true, null dimension_value, null drill_route
    const residual = {
      isResidual: true,
      dimensionValue: null,
      label: 'Other (3, 1 below threshold)',
      drillRoute: null,
      drillFilters: null,
    }
    expect(isDrillable(residual)).toBe(false)
    expect(drillLocation(residual)).toBeNull()
  })

  it('isResidual wins even if a drill target ever leaked onto the residual row', () => {
    expect(isDrillable({ isResidual: true, drillRoute: '/capas' })).toBe(false)
    expect(drillLocation({ isResidual: true, drillRoute: '/capas' })).toBeNull()
  })

  it('a row with no drill target is not drillable', () => {
    expect(isDrillable({ drillRoute: null })).toBe(false)
    expect(isDrillable({ drillRoute: '' })).toBe(false)
    expect(isDrillable({})).toBe(false)
    expect(isDrillable(null)).toBe(false)
    expect(isDrillable(undefined)).toBe(false)
  })

  it('a suppressed row is still non-drillable when the server withheld its target', () => {
    expect(isDrillable({ suppressed: true, value: null, drillRoute: null })).toBe(false)
  })
})

describe('drillLocation — the filters that reproduce the number', () => {
  it('builds path + stringified query from the server-computed filters', () => {
    const row = {
      drillRoute: '/capas',
      drillFilters: { statusId: 'OPEN', siteId: 'site-1', overdue: true, rank: 3 },
    }
    expect(drillLocation(row)).toEqual({
      path: '/capas',
      query: { statusId: 'OPEN', siteId: 'site-1', overdue: 'true', rank: '3' },
    })
  })

  it('joins an array filter into a comma list the list page can parse', () => {
    const row = { drillRoute: '/capas', drillFilters: { statusId: ['OPEN', 'IN_PROGRESS'] } }
    expect(drillLocation(row).query.statusId).toBe('OPEN,IN_PROGRESS')
  })

  it('drops empty filter values instead of sending ?x=null', () => {
    const row = {
      drillRoute: '/capas',
      drillFilters: { a: null, b: undefined, c: '', keep: 'yes' },
    }
    expect(drillLocation(row).query).toEqual({ keep: 'yes' })
  })

  it('keeps a legitimate zero — 0 is a value, not an empty', () => {
    expect(drillLocation({ drillRoute: '/capas', drillFilters: { count: 0 } }).query).toEqual({
      count: '0',
    })
  })

  it('tolerates a missing drillFilters object', () => {
    expect(drillLocation({ drillRoute: '/capas' })).toEqual({ path: '/capas', query: {} })
    expect(drillLocation({ drillRoute: '/capas', drillFilters: null })).toEqual({
      path: '/capas',
      query: {},
    })
  })

  it('returns null for anything not drillable', () => {
    expect(drillLocation(null)).toBeNull()
    expect(drillLocation({})).toBeNull()
    expect(drillLocation({ drillFilters: { a: 1 } })).toBeNull()
  })
})

/* ------------------------------------------------------------ labels & catalogues */

describe('scope / tier / module labels', () => {
  it('every effective_scope tier has a label AND an explanation of why numbers differ', () => {
    for (const scope of ['own', 'department', 'site', 'tenant']) {
      expect(SCOPE_LABEL[scope]).toEqual(expect.any(String))
      expect(SCOPE_HELP[scope]).toEqual(expect.any(String))
    }
    // The narrower scopes must say out loud that another viewer sees a
    // different number — this is the scope-boundary disclosure.
    for (const scope of ['own', 'department', 'site']) {
      expect(SCOPE_HELP[scope]).toMatch(/different number/i)
    }
  })

  it('every read tier has a label and an honest freshness explanation', () => {
    expect(TIER_LABEL).toEqual({ T1: 'Live', T2: 'Rollup', T3: 'Snapshot' })
    for (const tier of ['T1', 'T2', 'T3']) {
      expect(TIER_HELP[tier]).toEqual(expect.any(String))
    }
  })

  it('moduleLabel titleises unknown ids and fixes the ones that read badly', () => {
    expect(moduleLabel('capa')).toBe('CAPA')
    expect(moduleLabel('ncr')).toBe('Nonconformances')
    expect(moduleLabel('change_control')).toBe('Change Control')
    expect(moduleLabel('log_books')).toBe('Log Books') // titleised, no override
    expect(moduleLabel(null)).toBe('All modules')
    expect(moduleLabel(undefined)).toBe('All modules')
  })
})
