import { describe, expect, it } from 'vitest'
import {
  BAND_WINDOW_OPTIONS,
  COMPARATORS,
  MAX_BANDS,
  SEVERITIES,
  bandProblems,
  blankBand,
  canNameOtherRecipients,
  canUpdateAlert,
  clampRecipients,
  effectiveRecipients,
  normaliseBands,
} from './analyticsAlerts.js'
import { PERIOD_TOKENS } from './analyticsPeriods.js'

/**
 * These assert the MIRROR, not the behaviour of a component.
 *
 * `analytics_alert_bands_valid()` fails closed and returns false rather than
 * raising, so anything this file lets through that the function would refuse
 * surfaces to a user as `violates check constraint
 * "analytics_alerts_bands_chk"` — no field, no band, no explanation. The
 * vocabularies below were read off the live database
 * (`SELECT prosrc FROM pg_proc WHERE proname = 'analytics_alert_bands_valid'`)
 * and this suite is what stops them drifting.
 */

const VALID_BAND = {
  key: 'b1',
  comparator: 'gt',
  threshold: 20,
  window: 'last_30_days',
  severity: 'warning',
  recipients: ['11111111-1111-1111-1111-111111111111'],
}

describe('the CHECK vocabularies', () => {
  it('offers exactly the comparators the constraint admits', () => {
    expect(COMPARATORS.map((c) => c.value).sort()).toEqual(['gt', 'gte', 'lt', 'lte'])
  })

  it('offers no negating comparator', () => {
    // Removed from the vocabulary on purpose: `!=` against an unresolved metric
    // is TRUE (NaN !== NaN), so "alert me when closure rate is not 100%" fired
    // every tick on a metric that failed to resolve.
    const values = COMPARATORS.map((c) => c.value)
    for (const banned of ['neq', 'ne', '!=', 'not_equals', 'is_not']) {
      expect(values).not.toContain(banned)
    }
  })

  it('offers exactly the severities the constraint admits', () => {
    expect(SEVERITIES.map((s) => s.value)).toEqual(['info', 'warning', 'critical'])
  })

  it('offers the period tokens and nothing of its own', () => {
    // The window vocabulary is the layer's period tokens, NOT a private alert
    // dialect: an unrecognised token resolves to (NULL, NULL) downstream, so a
    // typo would not error — it would quietly widen the alert.
    expect(BAND_WINDOW_OPTIONS.map((o) => o.value)).toEqual(PERIOD_TOKENS.map((t) => t.id))
  })
})

describe('bandProblems', () => {
  it('accepts a well-formed ladder', () => {
    expect(bandProblems([VALID_BAND])).toEqual([])
  })

  it('rejects an empty ladder', () => {
    expect(bandProblems([])).not.toEqual([])
  })

  it('rejects more than ten bands', () => {
    const bands = Array.from({ length: MAX_BANDS + 1 }, (_, i) => ({ ...VALID_BAND, key: `b${i}` }))
    expect(bandProblems(bands)).not.toEqual([])
  })

  it('rejects a duplicate key', () => {
    // Two bands sharing a key share one suppression window, so one of them
    // silently stops firing.
    expect(bandProblems([VALID_BAND, { ...VALID_BAND }])).not.toEqual([])
  })

  it.each(['neq', 'contains', '', null])('rejects the comparator %p', (comparator) => {
    expect(bandProblems([{ ...VALID_BAND, comparator }])).not.toEqual([])
  })

  it.each(['urgent', 'INFO', '', null])('rejects the severity %p', (severity) => {
    expect(bandProblems([{ ...VALID_BAND, severity }])).not.toEqual([])
  })

  it.each(['last_45_days', 'this_week', '', null])('rejects the window %p', (window) => {
    expect(bandProblems([{ ...VALID_BAND, window }])).not.toEqual([])
  })

  it.each(['20', null, undefined, Number.NaN])('rejects the threshold %p', (threshold) => {
    expect(bandProblems([{ ...VALID_BAND, threshold }])).not.toEqual([])
  })

  it.each([0, 43201, 1.5])('rejects the suppression window %p', (suppressWindowMinutes) => {
    // 0 produces an EMPTY tstzrange, an empty range overlaps nothing, and the
    // exclusion constraint would then accept every insert.
    expect(bandProblems([{ ...VALID_BAND, suppressWindowMinutes }])).not.toEqual([])
  })

  it('accepts a suppression window at both ends of the range', () => {
    expect(bandProblems([{ ...VALID_BAND, suppressWindowMinutes: 1 }])).toEqual([])
    expect(bandProblems([{ ...VALID_BAND, suppressWindowMinutes: 43200 }])).toEqual([])
  })

  it('rejects an email address as a recipient', () => {
    // An address is a permission decision frozen on the day it was typed; the
    // CHECK requires a uuid-shaped string so it is unrepresentable.
    expect(bandProblems([{ ...VALID_BAND, recipients: ['qa@example.com'] }])).not.toEqual([])
  })

  it('rejects a { type, id } recipient object', () => {
    // Teams and roles are not addressable here: the runner iterates the array
    // setting app.current_user_id to each entry, so anything that is not a user
    // id is a recipient who never resolves and never fires.
    expect(
      bandProblems([
        { ...VALID_BAND, recipients: [{ type: 'team', id: VALID_BAND.recipients[0] }] },
      ]),
    ).not.toEqual([])
  })
})

describe('normaliseBands', () => {
  it('coerces the editor drafts to the shape the column stores', () => {
    const [band] = normaliseBands([
      { ...blankBand({ key: 'b1' }), threshold: '50', suppressWindowMinutes: '120' },
    ])
    expect(band.threshold).toBe(50)
    expect(band.suppressWindowMinutes).toBe(120)
    expect(bandProblems([band])).toEqual([])
  })

  it('omits suppressWindowMinutes entirely when it is blank', () => {
    // The CHECK tests jsonb_exists() and then demands a number, so a null would
    // fail the whole ladder rather than meaning "use the default".
    const [band] = normaliseBands([{ ...blankBand({ key: 'b1' }), threshold: '5' }])
    expect(Object.prototype.hasOwnProperty.call(band, 'suppressWindowMinutes')).toBe(false)
  })
})

describe('effectiveRecipients', () => {
  const A = '11111111-1111-1111-1111-111111111111'
  const B = '22222222-2222-2222-2222-222222222222'

  it('unions the base list with every band, without duplicates', () => {
    // Escalation ADDS people; it never drops whoever has been watching.
    expect(
      effectiveRecipients({
        recipients: [A],
        bands: [{ recipients: [A, B] }, { recipients: [] }],
      }).sort(),
    ).toEqual([A, B])
  })
})

describe('the write-policy mirrors', () => {
  const ME = '11111111-1111-1111-1111-111111111111'
  const THEM = '22222222-2222-2222-2222-222222222222'

  it('lets anybody edit an alert that mails only them', () => {
    const alert = { ownerId: ME, recipients: [ME], bands: [{ recipients: [] }] }
    expect(canUpdateAlert(alert, { userId: ME, canManage: false })).toBe(true)
  })

  it('withholds edit from an owner without manage once it mails somebody else', () => {
    const alert = { ownerId: ME, recipients: [ME], bands: [{ recipients: [THEM] }] }
    expect(canUpdateAlert(alert, { userId: ME, canManage: false })).toBe(false)
    expect(canUpdateAlert(alert, { userId: ME, canManage: true })).toBe(true)
  })

  it('pins the payload to the author when they cannot name anyone else', () => {
    expect(canNameOtherRecipients({ canManage: false })).toBe(false)
    expect(clampRecipients([THEM], { userId: ME, canManage: false })).toEqual([ME])
    expect(clampRecipients([THEM], { userId: ME, canManage: true })).toEqual([THEM])
  })
})
