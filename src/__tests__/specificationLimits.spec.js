/**
 * A numeric characteristic's target has to sit inside its own limits.
 *
 * ORIGINAL REPORT (2026-09-27), from a live specification:
 *
 *     Measurements | NUMERIC | target 15, >= 16, <= 17 CM
 *
 * The target is BELOW its own lower limit, and nothing objected — not the
 * create dialog, not the new-version editor, not the API schema.
 *
 * It is not cosmetic. inspectionResultService judges each reading against
 * lsl/usl, so this characteristic can never pass: the operator is told to aim
 * for a value the spec forbids, and every lot inspected against it needs a
 * nonconformance to disposition.
 *
 * The same rule runs server-side (numericLimitsCoherent in
 * schemas/qcInspection.js), enforced at create and again at approve. Two copies
 * is a real risk; the alternative — a round trip to learn the target is one
 * below the minimum — is worse, so both sides are pinned by tests.
 */
import { describe, it, expect } from 'vitest'
import { limitError, limitErrors } from '@/utils/specificationLimits.js'

const numeric = (c) => ({ testType: 'NUMERIC', ...c })

describe('limitError', () => {
  it('flags the reported spec: target 15 under an LSL of 16', () => {
    expect(limitError(numeric({ targetValue: 15, lsl: 16, usl: 17 }))).toMatch(
      /Target \(15\) is below the lower limit \(16\)/,
    )
  })

  it('flags a target above the upper limit', () => {
    expect(limitError(numeric({ targetValue: 20, lsl: 16, usl: 17 }))).toMatch(
      /above the upper limit \(17\)/,
    )
  })

  it('reports an inverted window ONCE, not three times', () => {
    // With lsl 20 / usl 10 both target comparisons also fire. Returning the
    // window error alone keeps the message that explains the other two from
    // being buried under them.
    expect(limitError(numeric({ targetValue: 15, lsl: 20, usl: 10 }))).toMatch(
      /Upper limit \(10\) is below the lower limit \(20\)/,
    )
  })

  it('COERCES before comparing — inputs can arrive as strings', () => {
    // Compared as strings, '9' < '10' is TRUE, so an uncoerced check would
    // wave through exactly the pair this exists to catch.
    expect(limitError(numeric({ targetValue: '9', lsl: '10', usl: '20' }))).toBeTruthy()
  })

  it('accepts a target inside its window, boundaries included', () => {
    expect(limitError(numeric({ targetValue: 16.5, lsl: 16, usl: 17 }))).toBeNull()
    expect(limitError(numeric({ targetValue: 16, lsl: 16, usl: 17 }))).toBeNull()
    expect(limitError(numeric({ targetValue: 17, lsl: 16, usl: 17 }))).toBeNull()
  })

  it('leaves one-sided specs alone — "at least 16" is an ordinary requirement', () => {
    expect(limitError(numeric({ lsl: 16 }))).toBeNull()
    expect(limitError(numeric({ targetValue: 20, lsl: 16 }))).toBeNull()
    expect(limitError(numeric({ targetValue: 5, usl: 17 }))).toBeNull()
    expect(limitError(numeric({ targetValue: 15 }))).toBeNull()
  })

  it('keeps zero distinct from absent', () => {
    // A blank field and a legitimate 0 must not be conflated: `!value` would
    // treat a target of 0 as "no target" and skip the check entirely.
    expect(limitError(numeric({ targetValue: 0, lsl: 1, usl: 5 }))).toBeTruthy()
    expect(limitError(numeric({ targetValue: 0, lsl: 0, usl: 5 }))).toBeNull()
    expect(limitError(numeric({ targetValue: 3, lsl: '', usl: null }))).toBeNull()
  })

  it('ignores non-numeric characteristics', () => {
    // PASS_FAIL rows carry no limits; stray numbers on one are not a spec
    // error and must not block the row.
    expect(limitError({ testType: 'PASS_FAIL', targetValue: 15, lsl: 16, usl: 17 })).toBeNull()
    expect(limitError(null)).toBeNull()
  })
})

describe('limitErrors', () => {
  it('keys messages by index so a row can show its own', () => {
    const errors = limitErrors([
      numeric({ targetValue: 16.5, lsl: 16, usl: 17 }),
      numeric({ targetValue: 15, lsl: 16, usl: 17 }),
      { testType: 'PASS_FAIL' },
    ])
    expect(Object.keys(errors)).toEqual(['1'])
  })

  it('is empty for a coherent set, and tolerates no characteristics', () => {
    expect(limitErrors([numeric({ lsl: 1, usl: 2 })])).toEqual({})
    expect(limitErrors(undefined)).toEqual({})
  })
})
