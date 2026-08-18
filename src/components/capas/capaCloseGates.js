/**
 * The two gates on closing a CAPA. Pure so they can be tested — the bug they
 * exist to prevent is not visible from either side on its own.
 *
 * Closing a CAPA is two steps: press "Close CAPA" in the header, which opens a
 * dialog; fill in the effectiveness-check date and closure comments; press
 * "Sign & Close". Each step has its own precondition, and conflating them is
 * what broke it:
 *
 *   canOpenClose   — may this CAPA be closed at all? Only asks whether the
 *                    workflow is finished.
 *   canSubmitClose — is the dialog filled in? canOpenClose PLUS its own fields.
 *
 * On 2026-08-18 a CAPA with all three steps approved showed a permanently
 * greyed-out Close button. One `canClose` served both buttons and included
 * "closure comments are non-empty" — but comments are typed INSIDE the dialog
 * the header button opens, so the gate could never be satisfied before the
 * thing that satisfies it was reachable. Introduced by e16960dd, which made
 * closure comments required and reasonably assumed one gate was enough.
 *
 * The rule these encode: a control that OPENS a form must never be gated on
 * that form's contents.
 */

/**
 * May the CAPA be closed at all?
 *
 * @param {object} state
 * @param {number} state.incompleteStepCount steps still blocking (see
 *   countStepsBlockingClose — deferred delay steps are already excluded)
 * @returns {boolean}
 */
export function canOpenClose({ incompleteStepCount = 0 } = {}) {
  return incompleteStepCount === 0
}

/**
 * Is the close dialog complete enough to sign?
 *
 * @param {object} state
 * @param {number} state.incompleteStepCount
 * @param {object|null} state.effectivenessDate resolved EC date (DateTime|null)
 * @param {string} state.comments closure comments as typed
 * @returns {boolean}
 */
export function canSubmitClose({
  incompleteStepCount = 0,
  effectivenessDate = null,
  comments = '',
} = {}) {
  return (
    canOpenClose({ incompleteStepCount }) && !!effectivenessDate && !!String(comments).trim()
  )
}

/**
 * Why the header "Close CAPA" button is blocked. Only ever the workflow — the
 * dialog's own fields are not this button's business, and naming them here is
 * how the two gates drifted back together last time.
 *
 * @returns {string} empty when not blocked
 */
export function closeBlockedReason({ incompleteStepCount = 0 } = {}) {
  if (incompleteStepCount > 0) {
    return `${incompleteStepCount} workflow step${
      incompleteStepCount === 1 ? '' : 's'
    } still open. Complete or skip them first.`
  }
  return ''
}

/**
 * Why "Sign & Close" is blocked — the header's reason, then the dialog's fields.
 *
 * @returns {string} empty when not blocked
 */
export function closeSubmitBlockedReason({
  incompleteStepCount = 0,
  effectivenessDate = null,
  comments = '',
} = {}) {
  const blocked = closeBlockedReason({ incompleteStepCount })
  if (blocked) return blocked
  if (!effectivenessDate) return 'Pick an effectiveness check date.'
  // Closure is a signed, regulated act — the record should say what was done,
  // not just that someone pressed the button.
  if (!String(comments).trim()) return 'Add closure comments.'
  return ''
}
