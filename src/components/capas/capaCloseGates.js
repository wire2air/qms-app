/**
 * The two gates on closing a CAPA. Pure so they can be tested — the bug they
 * exist to prevent is not visible from either side on its own.
 *
 * Closing a CAPA is two steps: press "Close CAPA" in the header, which opens a
 * dialog; write the closure comments; press
 * "Sign & Close". Each step has its own precondition, and conflating them is
 * what broke it:
 *
 *   canOpenClose   — may this CAPA be closed at all? Only asks whether the
 *                    workflow is finished.
 *   canSubmitClose — is the dialog filled in? canOpenClose PLUS its own fields.
 *
 * The effectiveness-check date left this dialog on 2026-08-18. Closing no
 * longer schedules a check — the workflow's DELAY step owns that, and it must
 * be scheduled or skipped before the record can close, so the dialog was asking
 * a second time about something already settled. Closure comments remain: they
 * are the signed statement of what was done, and nothing else captures that.
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
 * @param {string} state.comments closure comments as typed
 * @returns {boolean}
 */
export function canSubmitClose({ incompleteStepCount = 0, comments = '' } = {}) {
  return canOpenClose({ incompleteStepCount }) && !!String(comments).trim()
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
export function closeSubmitBlockedReason({ incompleteStepCount = 0, comments = '' } = {}) {
  const blocked = closeBlockedReason({ incompleteStepCount })
  if (blocked) return blocked
  // Closure is a signed, regulated act — the record should say what was done,
  // not just that someone pressed the button.
  if (!String(comments).trim()) return 'Add closure comments.'
  return ''
}
