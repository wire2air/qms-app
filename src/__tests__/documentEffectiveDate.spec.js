/**
 * When a document create form asks for an effective date, and what it accepts.
 *
 * The rule only applies at CREATION. Nothing downstream re-checks it —
 * setEffective takes `version.effectiveDate || now` — which is deliberate: a
 * document approved later than planned still goes effective on the date it
 * carries. A guard there would strand it.
 */
import { describe, it, expect } from 'vitest'
import { DateTime } from 'luxon'
import {
  effectiveDateRequired,
  futureDateRule,
} from '../components/documents/documentEffectiveDate.js'

describe('effectiveDateRequired', () => {
  it('is asked for only on the manual release path', () => {
    // Auto-release decides the date at final approval, so a field there would
    // collect a value the system ignores.
    expect(effectiveDateRequired(true)).toBe(false)
    expect(effectiveDateRequired(false)).toBe(true)
  })
})

describe('futureDateRule', () => {
  const rule = futureDateRule()

  it('accepts a future date', () => {
    expect(rule(DateTime.now().plus({ days: 1 }))).toBe(true)
    expect(rule(DateTime.now().plus({ years: 1 }))).toBe(true)
  })

  it('accepts today — you can release the moment it is approved', () => {
    // Compared at end-of-day, so "today" is scheduling, not a typo.
    expect(rule(DateTime.now())).toBe(true)
  })

  it('rejects a past date', () => {
    expect(rule(DateTime.now().minus({ days: 1 }))).toBe('Pick a future date')
    expect(futureDateRule('Custom')(DateTime.now().minus({ years: 1 }))).toBe('Custom')
  })

  it('defers emptiness to the required rule', () => {
    // Both rules run; two messages for one empty field is noise.
    expect(rule(null)).toBe(true)
    expect(rule(undefined)).toBe(true)
    expect(rule('')).toBe(true)
  })

  it('accepts a JS Date as well as a DateTime', () => {
    const tomorrow = new Date(Date.now() + 86_400_000)
    expect(rule(tomorrow)).toBe(true)
  })

  it('reports an unparseable value rather than passing it through', () => {
    expect(rule('not-a-date')).toBe('Enter a valid date')
  })
})
