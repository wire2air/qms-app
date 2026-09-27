/**
 * Coherence of a numeric characteristic's target / LSL / USL.
 *
 * Reported 2026-09-27 from a live specification reading
 * "target 15, >= 16, <= 17": the target sat BELOW its own lower limit, and
 * nothing objected — not the create dialog, not the new-version editor, not
 * the API schema.
 *
 * It is not cosmetic. inspectionResultService judges a reading against lsl/usl,
 * so a characteristic like that can never pass: the operator is told to aim for
 * a value the spec forbids, and every lot inspected against it needs a
 * nonconformance to disposition. The error belongs at authoring time, where one
 * person can still fix it, rather than at inspection time where it has already
 * become everyone's problem.
 *
 * One-sided specs stay legal — "at least 16" with no upper bound is an ordinary
 * requirement — so each rule fires only when both ends of its comparison exist.
 *
 * The same rule is enforced server-side in schemas/qcInspection.js
 * (numericLimitsCoherent). Two copies is a real risk, and the alternative —
 * a round trip to learn the target is 1 below the minimum — is worse. They are
 * pinned by tests on both sides.
 */

/** null for a blank/non-numeric entry, so "absent" and "zero" stay distinct. */
function num(v) {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/**
 * @param {object} c a characteristic draft
 * @returns {string|null} the message to show, or null when coherent
 */
export function limitError(c) {
  if (!c || c.testType !== 'NUMERIC') return null

  const target = num(c.targetValue)
  const lsl = num(c.lsl)
  const usl = num(c.usl)

  // Checked first and returned on: an inverted window makes both target
  // comparisons fire too, and three messages bury the one that explains them.
  if (lsl !== null && usl !== null && lsl > usl) {
    return `Upper limit (${usl}) is below the lower limit (${lsl}).`
  }
  if (target !== null && lsl !== null && target < lsl) {
    return `Target (${target}) is below the lower limit (${lsl}) — nothing could pass.`
  }
  if (target !== null && usl !== null && target > usl) {
    return `Target (${target}) is above the upper limit (${usl}) — nothing could pass.`
  }
  return null
}

/**
 * Index-keyed messages for a list of characteristics, so a row can show its own
 * error and the form can refuse to submit while any remain.
 *
 * @param {Array<object>} characteristics
 * @returns {Record<number, string>}
 */
export function limitErrors(characteristics) {
  const out = {}
  ;(characteristics ?? []).forEach((c, i) => {
    const message = limitError(c)
    if (message) out[i] = message
  })
  return out
}
